"use client";

/**
 * PaddleCheckoutButton — the ONLY place in the app that opens Paddle.Checkout.
 *
 * Renders a single CTA that boots Paddle.js on mount and opens an overlay
 * checkout when clicked. Email and Supabase user id are forwarded:
 *
 *   - `customer.email`         — pre-fills the Paddle form
 *   - `customData.user_id`     — echoed back on every webhook event so the
 *                                handler can match the row by email or
 *                                fall back to the Supabase id if needed
 *
 * Env config (all NEXT_PUBLIC because they ship to the browser):
 *
 *   NEXT_PUBLIC_PADDLE_CLIENT_TOKEN  — `live_…` or `test_…` token from the
 *                                      Paddle dashboard (Developer tools →
 *                                      Authentication → Client-side tokens)
 *   NEXT_PUBLIC_PADDLE_PRICE_ID      — `pri_…` id of the SafeWithdraw Pro
 *                                      monthly price
 *   NEXT_PUBLIC_PADDLE_ENVIRONMENT   — "production" (default) or "sandbox"
 *
 * If either token or price is missing, the button stays disabled and shows
 * a configuration hint instead of attempting a checkout that would fail
 * with an unhelpful Paddle error.
 *
 * On `checkout.completed` we hand control back to the parent via
 * `onCheckoutCompleted` so the /billing page can show a polling state
 * while it waits for the webhook to flip subscription_status to "active".
 */

import { useCallback, useEffect, useRef, useState } from "react";
import {
  initializePaddle,
  type Paddle,
  type PaddleEventData,
} from "@paddle/paddle-js";

type Props = {
  email: string;
  userId: string;
  onCheckoutCompleted?: () => void;
};

const PADDLE_TOKEN = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN;
const PADDLE_PRICE_ID = process.env.NEXT_PUBLIC_PADDLE_PRICE_ID;
const PADDLE_ENV =
  process.env.NEXT_PUBLIC_PADDLE_ENVIRONMENT === "sandbox"
    ? "sandbox"
    : "production";

export function PaddleCheckoutButton({
  email,
  userId,
  onCheckoutCompleted,
}: Props) {
  const [paddle, setPaddle] = useState<Paddle | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const completedHandlerRef = useRef(onCheckoutCompleted);
  completedHandlerRef.current = onCheckoutCompleted;

  const configMissing = !PADDLE_TOKEN || !PADDLE_PRICE_ID;

  useEffect(() => {
    if (configMissing) return;
    let cancelled = false;

    initializePaddle({
      environment: PADDLE_ENV,
      token: PADDLE_TOKEN!,
      eventCallback: (event: PaddleEventData) => {
        if (event.name === "checkout.completed") {
          completedHandlerRef.current?.();
        }
      },
    })
      .then((instance) => {
        if (cancelled) return;
        if (!instance) {
          setLoadError("Impossible de charger Paddle.");
          return;
        }
        setPaddle(instance);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("[paddle-checkout] initializePaddle failed:", err);
        setLoadError("Impossible de charger Paddle.");
      });

    return () => {
      cancelled = true;
    };
  }, [configMissing]);

  const handleClick = useCallback(() => {
    if (!paddle || configMissing) return;
    setOpening(true);
    try {
      paddle.Checkout.open({
        items: [{ priceId: PADDLE_PRICE_ID!, quantity: 1 }],
        customer: { email },
        customData: { user_id: userId, email },
        settings: {
          displayMode: "overlay",
          theme: "dark",
          locale: "fr",
        },
      });
    } catch (err) {
      console.error("[paddle-checkout] open failed:", err);
    } finally {
      setOpening(false);
    }
  }, [paddle, configMissing, email, userId]);

  if (configMissing) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">
        Paddle n’est pas encore configuré. Définis{" "}
        <code className="font-mono text-xs text-amber-100">
          NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
        </code>{" "}
        et{" "}
        <code className="font-mono text-xs text-amber-100">
          NEXT_PUBLIC_PADDLE_PRICE_ID
        </code>{" "}
        pour activer le paiement.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={handleClick}
        disabled={!paddle || opening}
        className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(16,185,129,0.8)] transition hover:scale-[1.01] hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
      >
        {paddle ? "S’abonner à SafeWithdraw Pro" : "Chargement…"}
      </button>
      {loadError && (
        <p className="text-center text-xs text-rose-300">{loadError}</p>
      )}
    </div>
  );
}
