import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, SubscriptionStatus } from "./database.types";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Update"];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function extractEmailFromEntity(data: Record<string, unknown>): string | null {
  const custom = data.custom_data;
  if (isRecord(custom)) {
    const e = custom.email ?? custom.user_email;
    if (typeof e === "string" && e.includes("@")) return normalizeEmail(e);
  }
  const billing = data.billing_details;
  if (isRecord(billing) && typeof billing.email === "string") {
    return normalizeEmail(billing.email);
  }
  return null;
}

function extractCustomerId(data: Record<string, unknown>): string | null {
  const id = data.customer_id;
  return typeof id === "string" && id.startsWith("ctm_") ? id : null;
}

function mapPaddleSubscriptionStatus(status: string): SubscriptionStatus {
  switch (status) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "past_due":
      return "past_due";
    case "canceled":
      return "canceled";
    case "paused":
      return "active";
    default:
      return "incomplete";
  }
}

async function paddleApiGet<T>(path: string): Promise<T | null> {
  const key = process.env.PADDLE_API_KEY;
  const base = process.env.PADDLE_API_URL ?? "https://api.paddle.com";
  if (!key) return null;
  const res = await fetch(`${base.replace(/\/$/, "")}${path}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function resolveCustomerEmail(
  customerId: string,
  data: Record<string, unknown>,
): Promise<string | null> {
  const direct = extractEmailFromEntity(data);
  if (direct) return direct;

  const json = await paddleApiGet<{ data?: { email?: string } }>(
    `/customers/${encodeURIComponent(customerId)}`,
  );
  const email = json?.data?.email;
  return typeof email === "string" && email.includes("@")
    ? normalizeEmail(email)
    : null;
}

async function updateProfileByEmail(
  supabase: SupabaseClient<Database>,
  emailRaw: string,
  patch: ProfileRow,
): Promise<boolean> {
  const candidates = [
    ...new Set([emailRaw.trim(), normalizeEmail(emailRaw)]),
  ].filter(Boolean);

  for (const em of candidates) {
    const { data, error } = await supabase
      .from("profiles")
      .update(patch)
      .eq("email", em)
      .select("id");
    if (error) {
      console.error("[paddle/webhook] profile update error:", error.message);
      return false;
    }
    if (data && data.length > 0) return true;
  }

  console.warn(
    "[paddle/webhook] no profile row matched email:",
    normalizeEmail(emailRaw),
  );
  return false;
}

async function handleSubscriptionLike(
  supabase: SupabaseClient<Database>,
  data: Record<string, unknown>,
): Promise<void> {
  const customerId = extractCustomerId(data);
  const statusRaw = data.status;
  if (!customerId || typeof statusRaw !== "string") {
    console.warn("[paddle/webhook] subscription event missing customer_id/status");
    return;
  }

  const email = await resolveCustomerEmail(customerId, data);
  if (!email) {
    console.warn("[paddle/webhook] could not resolve email for customer", customerId);
    return;
  }

  await updateProfileByEmail(supabase, email, {
    paddle_customer_id: customerId,
    subscription_status: mapPaddleSubscriptionStatus(statusRaw),
  });
}

async function handleTransactionCompleted(
  supabase: SupabaseClient<Database>,
  data: Record<string, unknown>,
): Promise<void> {
  const customerId = extractCustomerId(data);
  if (!customerId) {
    console.warn("[paddle/webhook] transaction.completed missing customer_id");
    return;
  }

  const email = await resolveCustomerEmail(customerId, data);
  if (!email) {
    console.warn(
      "[paddle/webhook] could not resolve email for transaction customer",
      customerId,
    );
    return;
  }

  const patch: ProfileRow = { paddle_customer_id: customerId };

  const subId = data.subscription_id;
  if (typeof subId === "string" && subId.startsWith("sub_")) {
    const subJson = await paddleApiGet<{ data?: { status?: string } }>(
      `/subscriptions/${encodeURIComponent(subId)}`,
    );
    const st = subJson?.data?.status;
    if (typeof st === "string") {
      patch.subscription_status = mapPaddleSubscriptionStatus(st);
    }
  }

  await updateProfileByEmail(supabase, email, patch);
}

/**
 * Dispatches a verified Paddle Billing webhook payload.
 */
export async function dispatchPaddleWebhook(
  supabase: SupabaseClient<Database>,
  payload: unknown,
): Promise<void> {
  if (!isRecord(payload)) return;

  const eventType = payload.event_type;
  const data = payload.data;
  if (typeof eventType !== "string" || !isRecord(data)) {
    console.warn("[paddle/webhook] invalid payload shape");
    return;
  }

  switch (eventType) {
    case "transaction.completed":
      await handleTransactionCompleted(supabase, data);
      break;
    case "subscription.created":
    case "subscription.updated":
    case "subscription.canceled":
      await handleSubscriptionLike(supabase, data);
      break;
    default:
      break;
  }
}
