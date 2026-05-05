/**
 * Sends the "Bienvenue sur SafeWithdraw Pro" email when a user's
 * subscription transitions from any non-active state to "active".
 *
 * Called from the Paddle webhook dispatcher (`paddle-webhook-handlers.ts`)
 * — server-side, so the Resend API key is read directly from the
 * environment instead of round-tripping through an internal HTTP route
 * (which the welcome email used at signup time).
 *
 * Idempotency: Resend deduplicates by `idempotencyKey`. We hash the
 * recipient's email so multiple `subscription.updated` events with
 * status="active" — which Paddle can fire several times for billing
 * date changes, plan upgrades, etc. — never produce duplicate emails
 * during the key's TTL window.
 */
import { render } from "react-email";
import { Resend } from "resend";

import SubscriptionActivatedEmail from "../emails/subscription-activated";

export async function sendSubscriptionActivatedEmail(
  email: string,
): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[send-sub-activated] RESEND_API_KEY is not set");
    return;
  }
  if (!email || !email.includes("@")) {
    console.error("[send-sub-activated] invalid email:", email);
    return;
  }

  const resend = new Resend(apiKey);
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://safewithdraw.app"}/dashboard`;

  const [html, text] = await Promise.all([
    render(<SubscriptionActivatedEmail dashboardUrl={dashboardUrl} />),
    render(<SubscriptionActivatedEmail dashboardUrl={dashboardUrl} />, {
      plainText: true,
    }),
  ]);

  console.log("[send-sub-activated] sending to:", email);

  const { data, error } = await resend.emails.send(
    {
      from: "SafeWithdraw <hello@safewithdraw.app>",
      replyTo: "safewithdraw.contact@gmail.com",
      to: email,
      subject: "Bienvenue sur SafeWithdraw Pro 🚀",
      html,
      text,
    },
    { idempotencyKey: `subscription-activated/${email}` },
  );

  if (error) {
    console.error("[send-sub-activated] Resend returned an error:", error);
    return;
  }

  console.log("[send-sub-activated] email sent. id:", data?.id);
}
