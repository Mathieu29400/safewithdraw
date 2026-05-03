import { NextRequest, NextResponse } from "next/server";
import { render } from "react-email";
import { Resend } from "resend";
import WelcomeEmail from "../../../emails/welcome";

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY;
  const { email } = await req.json();

  console.log("[send-welcome] called with email:", email);
  console.log("[send-welcome] RESEND_API_KEY present:", !!apiKey);

  if (!email || typeof email !== "string") {
    console.error("[send-welcome] Missing or invalid email");
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  if (!apiKey) {
    console.error("[send-welcome] RESEND_API_KEY is not set");
    return NextResponse.json(
      { error: "RESEND_API_KEY missing" },
      { status: 500 },
    );
  }

  const resend = new Resend(apiKey);
  const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://safewithdraw.com"}/dashboard`;

  const [html, text] = await Promise.all([
    render(<WelcomeEmail dashboardUrl={dashboardUrl} />),
    render(<WelcomeEmail dashboardUrl={dashboardUrl} />, { plainText: true }),
  ]);

  console.log("[send-welcome] Sending email to:", email);

  const { data, error } = await resend.emails.send(
    {
      from: "SafeWithdraw <hello@safewithdraw.app>",
      to: email,
      subject: "Bienvenue sur SafeWithdraw 🚀",
      html,
      text,
    },
    { idempotencyKey: `welcome-email/${email}` },
  );

  if (error) {
    console.error("[send-welcome] Resend returned an error:", error);
    return NextResponse.json({ error }, { status: 500 });
  }

  console.log("[send-welcome] Email sent. id:", data?.id);
  return NextResponse.json({ ok: true, id: data?.id });
}
