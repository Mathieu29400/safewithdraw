import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/database.types";

/**
 * Generates a Paddle Customer Portal session for the calling user and returns
 * the URL to redirect to. The portal lets the user manage payment methods,
 * view invoices, change plans and cancel — all hosted by Paddle.
 *
 * Auth: relies on the Supabase access token forwarded by the client in the
 * `Authorization: Bearer <token>` header. We re-validate it server-side.
 *
 * Required env vars:
 *   - NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   - PADDLE_API_KEY                  (server-only, never exposed to browser)
 *   - PADDLE_API_URL                  (defaults to https://api.paddle.com — set
 *                                      to https://sandbox-api.paddle.com for sandbox)
 */
export async function POST(req: NextRequest) {
  const paddleApiKey = process.env.PADDLE_API_KEY;
  const paddleApiUrl = process.env.PADDLE_API_URL ?? "https://api.paddle.com";
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!paddleApiKey) {
    console.error("[paddle/customer-portal] PADDLE_API_KEY is not set");
    return NextResponse.json(
      { error: "Paddle non configuré" },
      { status: 500 },
    );
  }
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: "Supabase non configuré" },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const accessToken = authHeader?.toLowerCase().startsWith("bearer ")
    ? authHeader.slice(7).trim()
    : null;
  if (!accessToken) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData.user) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("paddle_customer_id")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profileErr) {
    console.error("[paddle/customer-portal] profile read failed:", profileErr);
    return NextResponse.json(
      { error: "Impossible de récupérer le profil" },
      { status: 500 },
    );
  }

  if (!profile?.paddle_customer_id) {
    return NextResponse.json(
      {
        error:
          "Aucun abonnement actif trouvé. Souscrivez d'abord un abonnement pour accéder au portail.",
      },
      { status: 404 },
    );
  }

  const paddleRes = await fetch(
    `${paddleApiUrl}/customers/${encodeURIComponent(profile.paddle_customer_id)}/portal-sessions`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${paddleApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    },
  );

  if (!paddleRes.ok) {
    const errText = await paddleRes.text();
    console.error("[paddle/customer-portal] Paddle API error:", paddleRes.status, errText);
    return NextResponse.json(
      { error: "Paddle a retourné une erreur" },
      { status: 502 },
    );
  }

  const paddleJson = (await paddleRes.json()) as {
    data?: { urls?: { general?: { overview?: string } } };
  };

  const url = paddleJson.data?.urls?.general?.overview;
  if (!url) {
    console.error("[paddle/customer-portal] missing url in Paddle response:", paddleJson);
    return NextResponse.json(
      { error: "Réponse Paddle invalide" },
      { status: 502 },
    );
  }

  return NextResponse.json({ url });
}
