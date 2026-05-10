import { createHash } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

export const runtime = "nodejs";

/**
 * Self-service account deletion (RGPD article 17 — droit à l'effacement).
 *
 * Flow:
 *   1. Validate the caller's JWT (Authorization: Bearer …) by calling
 *      `auth.getUser()` on an anon-key client. This guarantees the token
 *      is signed by Supabase and resolves the canonical user id —
 *      we never trust a body-supplied id.
 *   2. Best-effort cancel any active Paddle subscription so the user
 *      stops being invoiced after the row disappears. Failures here
 *      are logged but never block the deletion: a deletion that's
 *      half-done leaves stale data behind, which is worse than a stale
 *      Paddle subscription that the webhook will eventually mark as
 *      `canceled` once the customer gets billed and disputes.
 *   3. Hard-delete the user via the service-role admin API. The schema
 *      cascades from `auth.users.id` → `public.profiles.id` →
 *      `transactions`, `expenses`, `recurring_expenses`, `periods`,
 *      `urssaf_profile`, so a single call wipes every personal row.
 */
export async function POST(req: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[account/delete] Supabase env missing");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const auth = req.headers.get("authorization") ?? "";
  const accessToken = auth.toLowerCase().startsWith("bearer ")
    ? auth.slice(7).trim()
    : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 1. Resolve the caller from the JWT. We pin the bearer token on the
  // anon-key client and then call `auth.getUser()` — Supabase verifies
  // the signature and rejects expired / forged tokens for us.
  const userClient = createClient<Database>(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = userData.user.id;

  // 2. Service-role client for the privileged operations. RLS does not
  // apply with this key, which is precisely why we re-derive `userId`
  // from the validated JWT and never read it from the request body.
  const admin = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // 3. Best-effort Paddle cancellation. Paddle's webhook will eventually
  // flip `subscription_status` to `canceled`, but the row is about to
  // disappear; we just want to make sure no future invoice gets
  // generated. Errors are logged and swallowed — see top-of-file note.
  try {
    const { data: profile } = await admin
      .from("profiles")
      .select("paddle_customer_id, subscription_status")
      .eq("id", userId)
      .maybeSingle();
    if (
      profile?.paddle_customer_id &&
      (profile.subscription_status === "active" ||
        profile.subscription_status === "past_due" ||
        profile.subscription_status === "trialing")
    ) {
      await cancelPaddleSubscriptionsForCustomer(profile.paddle_customer_id);
    }
  } catch (err) {
    console.error("[account/delete] Paddle cancel failed (continuing):", err);
  }

  // 4. Record the trial-history pseudonym BEFORE deletion so the next
  // signup with the same email starts already-expired. The hash is
  // SHA-256(lower(trim(email))) — identical to the Postgres helper
  // `compute_email_hash()` so server-side and client-side agree.
  // Errors are logged but never block deletion: a missed ledger insert
  // is preferable to a stuck account-removal request.
  if (userData.user.email) {
    try {
      const emailHash = computeEmailHash(userData.user.email);
      const { error: historyError } = await admin
        .from("trial_history")
        .upsert(
          {
            email_hash: emailHash,
            last_trial_at: new Date().toISOString(),
          },
          { onConflict: "email_hash", ignoreDuplicates: true },
        );
      if (historyError) {
        console.error(
          "[account/delete] trial_history upsert failed (continuing):",
          historyError,
        );
      }
    } catch (err) {
      console.error(
        "[account/delete] trial_history hash failed (continuing):",
        err,
      );
    }
  }

  // 5. Hard delete. ON DELETE CASCADE in `schema.sql` wipes the rest.
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) {
    console.error("[account/delete] deleteUser error:", deleteError);
    return NextResponse.json(
      { error: deleteError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

function computeEmailHash(email: string): string {
  return createHash("sha256")
    .update(email.toLowerCase().trim())
    .digest("hex");
}

/**
 * Lists every still-billable subscription for the customer and asks
 * Paddle to cancel each one immediately. We loop because a customer
 * may have multiple subscription rows (e.g. after a plan change with
 * a brief overlap). Best-effort: failures are surfaced via console,
 * never thrown to the caller.
 */
async function cancelPaddleSubscriptionsForCustomer(
  customerId: string,
): Promise<void> {
  const apiKey = process.env.PADDLE_API_KEY;
  const base = process.env.PADDLE_API_URL ?? "https://api.paddle.com";
  if (!apiKey) return;

  const baseUrl = base.replace(/\/$/, "");
  const listRes = await fetch(
    `${baseUrl}/subscriptions?customer_id=${encodeURIComponent(customerId)}&status=active,past_due,trialing&per_page=20`,
    { headers: { Authorization: `Bearer ${apiKey}` } },
  );
  if (!listRes.ok) {
    console.error(
      "[account/delete] Paddle list subs failed:",
      listRes.status,
      await listRes.text().catch(() => ""),
    );
    return;
  }
  const json = (await listRes.json()) as {
    data?: { id?: string; status?: string }[];
  };

  for (const sub of json.data ?? []) {
    if (typeof sub.id !== "string") continue;
    const cancelRes = await fetch(
      `${baseUrl}/subscriptions/${encodeURIComponent(sub.id)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ effective_from: "immediately" }),
      },
    );
    if (!cancelRes.ok) {
      console.error(
        "[account/delete] Paddle cancel sub failed:",
        sub.id,
        cancelRes.status,
        await cancelRes.text().catch(() => ""),
      );
    }
  }
}
