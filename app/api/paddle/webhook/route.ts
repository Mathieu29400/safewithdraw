import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";
import { dispatchPaddleWebhook } from "@/lib/paddle-webhook-handlers";
import { verifyPaddleWebhookSignature } from "@/lib/paddle-webhook-verify";

export const runtime = "nodejs";

/**
 * Paddle Billing webhook — verifies `Paddle-Signature`, then syncs
 * `profiles.paddle_customer_id` and `profiles.subscription_status`.
 *
 * Env: PADDLE_WEBHOOK_SECRET, SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL
 * Optional: PADDLE_API_KEY + PADDLE_API_URL (to resolve customer email when not in payload)
 */
export async function POST(req: NextRequest) {
  const secret = process.env.PADDLE_WEBHOOK_SECRET;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!secret) {
    console.error("[paddle/webhook] PADDLE_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }
  if (!serviceKey || !supabaseUrl) {
    console.error("[paddle/webhook] Supabase service env missing");
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const rawBuffer = Buffer.from(await req.arrayBuffer());
  const sig = req.headers.get("paddle-signature");

  if (!verifyPaddleWebhookSignature(rawBuffer, sig, secret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBuffer.toString("utf8")) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const supabase = createClient<Database>(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    await dispatchPaddleWebhook(supabase, payload);
  } catch (err) {
    console.error("[paddle/webhook] handler error:", err);
    return NextResponse.json({ error: "Handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
