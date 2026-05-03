import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: NextRequest) {
  const { email } = await req.json();

  console.log("[send-welcome] called with email:", email);
  console.log("[send-welcome] RESEND_API_KEY present:", !!process.env.RESEND_API_KEY);

  if (!email || typeof email !== "string") {
    console.error("[send-welcome] Missing or invalid email");
    return NextResponse.json({ error: "Missing email" }, { status: 400 });
  }

  console.log("[send-welcome] Sending email to:", email);

  try {
    const result = await resend.emails.send({
      from: "SafeWithdraw <safewithdraw.contact@gmail.com>",
      to: email,
      subject: "Bienvenue sur SafeWithdraw 🚀",
      text: `Bienvenue sur SafeWithdraw 👋

Ton compte est prêt.

Tu peux maintenant savoir exactement combien tu peux te verser sans risque.

À très vite,
L'équipe SafeWithdraw`,
    });

    console.log("[send-welcome] Email sent. Result:", JSON.stringify(result));

    if (result.error) {
      console.error("[send-welcome] Resend returned an error:", result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: result.data?.id });
  } catch (err) {
    console.error("[send-welcome] Exception thrown by Resend:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
