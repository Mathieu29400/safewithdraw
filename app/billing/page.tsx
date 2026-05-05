"use client";

/**
 * /billing — the SINGLE entry point for paid actions.
 *
 * This is the only page that may surface a Paddle checkout button. Per
 * spec, no other route (landing, signup, dashboard, onboarding) is
 * allowed to open Paddle.Checkout — the goal is to keep signup
 * friction zero and only ask for payment after the trial expires.
 *
 * Page states (selected from `getBillingStatus(profile)`):
 *
 *   - "active"        — user already pays. Show "Tu es abonné" and a
 *                       "Gérer mon abonnement" link to the Paddle
 *                       customer portal (handled by the existing
 *                       /api/paddle/customer-portal route).
 *
 *   - "trialing"      — free trial in progress. Surface the day count
 *                       and let the user upgrade early via the checkout
 *                       button.
 *
 *   - "trial-expired" — trial window is over and no subscription has
 *                       been activated yet. Block dashboard access has
 *                       already redirected the user here; the page
 *                       focuses on getting them to subscribe.
 *
 *   - "inactive"      — past_due / canceled / incomplete. Same UX as
 *                       expired: invite to subscribe, hide trial copy.
 *
 * Post-checkout flow:
 *   On `checkout.completed` from Paddle.js we don't redirect
 *   immediately — the webhook needs a moment to flip
 *   `subscription_status` to "active". We poll the profile every
 *   1.5s for up to 30s and then bounce to /dashboard. If the webhook
 *   never lands the user gets a clear error + a manual reload
 *   button instead of a silent dead-end.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  formatDaysLeft,
  getBillingStatus,
  type BillingStatus,
} from "@/lib/billing";
import { supabase } from "@/lib/supabase";

import { PaddleCheckoutButton } from "./paddle-checkout-button";

type AuthState =
  | { kind: "loading" }
  | { kind: "anonymous" }
  | {
      kind: "authenticated";
      userId: string;
      email: string;
      status: BillingStatus;
      hasPaddleCustomer: boolean;
    };

type CheckoutPhase =
  | { kind: "idle" }
  | { kind: "polling" }
  | { kind: "timeout" };

const POLL_INTERVAL_MS = 1500;
const POLL_TIMEOUT_MS = 30_000;

export default function BillingPage() {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthState>({ kind: "loading" });
  const [checkout, setCheckout] = useState<CheckoutPhase>({ kind: "idle" });
  const [portalLoading, setPortalLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  // Auth + profile load. Anyone hitting /billing while signed out is
  // bounced to /login — billing UX always assumes a known user.
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        setAuth({ kind: "anonymous" });
        return;
      }

      const { data: profile, error } = await supabase
        .from("profiles")
        .select("trial_end, subscription_status, paddle_customer_id")
        .eq("id", session.user.id)
        .maybeSingle();
      if (cancelled) return;

      if (error || !profile) {
        console.error("[billing] profile load failed:", error?.message);
        setAuth({
          kind: "authenticated",
          userId: session.user.id,
          email: session.user.email ?? "",
          status: { kind: "inactive" },
          hasPaddleCustomer: false,
        });
        return;
      }

      setAuth({
        kind: "authenticated",
        userId: session.user.id,
        email: session.user.email ?? "",
        status: getBillingStatus(profile),
        hasPaddleCustomer: Boolean(profile.paddle_customer_id),
      });
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Post-checkout poll — webhooks land out-of-band so we wait for the
  // profile to flip to "active" before redirecting to /dashboard.
  // 30 s ceiling so a misconfigured webhook never strands the user
  // on this screen forever.
  const pollStartedAt = useRef<number | null>(null);

  const handleCheckoutCompleted = useCallback(() => {
    if (auth.kind !== "authenticated") return;
    pollStartedAt.current = Date.now();
    setCheckout({ kind: "polling" });
  }, [auth]);

  useEffect(() => {
    if (checkout.kind !== "polling") return;
    if (auth.kind !== "authenticated") return;

    const userId = auth.userId;
    let cancelled = false;
    let timer: number | null = null;

    const tick = async () => {
      if (cancelled) return;
      const startedAt = pollStartedAt.current ?? Date.now();
      const { data: profile } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", userId)
        .maybeSingle();

      if (cancelled) return;
      if (profile?.subscription_status === "active") {
        router.replace("/dashboard");
        return;
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setCheckout({ kind: "timeout" });
        return;
      }
      timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    };

    timer = window.setTimeout(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [checkout.kind, auth, router]);

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut();
    router.replace("/login");
  }, [router]);

  const handleOpenPortal = useCallback(async () => {
    setPortalError(null);
    setPortalLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        setPortalError("Veuillez vous reconnecter.");
        return;
      }
      const res = await fetch("/api/paddle/customer-portal", {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        setPortalError(json.error ?? "Impossible d’ouvrir le portail.");
        return;
      }
      window.location.href = json.url;
    } catch (err) {
      console.error("[billing] portal failed:", err);
      setPortalError("Erreur réseau, réessayez.");
    } finally {
      setPortalLoading(false);
    }
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/"
            className="text-base font-semibold tracking-tight text-slate-100"
          >
            SafeWithdraw
          </Link>
          {auth.kind === "authenticated" && (
            <button
              type="button"
              onClick={handleSignOut}
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              Se déconnecter
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
          Abonnement
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Gère ton accès à SafeWithdraw Pro depuis cette page.
        </p>

        <div className="mt-8">
          {auth.kind === "loading" && (
            <div className="card-soft rounded-2xl bg-slate-900/50 p-6 text-sm text-slate-400 ring-1 ring-white/10 backdrop-blur-xl">
              Chargement…
            </div>
          )}

          {auth.kind === "authenticated" && checkout.kind === "polling" && (
            <PollingCard />
          )}

          {auth.kind === "authenticated" && checkout.kind === "timeout" && (
            <TimeoutCard />
          )}

          {auth.kind === "authenticated" && checkout.kind === "idle" && (
            <BillingCard
              status={auth.status}
              email={auth.email}
              userId={auth.userId}
              hasPaddleCustomer={auth.hasPaddleCustomer}
              onCheckoutCompleted={handleCheckoutCompleted}
              onOpenPortal={handleOpenPortal}
              portalLoading={portalLoading}
              portalError={portalError}
            />
          )}
        </div>

        {auth.kind === "authenticated" &&
          (auth.status.kind === "trialing" ||
            auth.status.kind === "active") &&
          checkout.kind === "idle" && (
            <p className="mt-6 text-center text-sm text-slate-400">
              <Link
                href="/dashboard"
                className="font-medium text-emerald-300 hover:text-emerald-200 hover:underline"
              >
                ← Retour au dashboard
              </Link>
            </p>
          )}
      </main>
    </div>
  );
}

function BillingCard({
  status,
  email,
  userId,
  hasPaddleCustomer,
  onCheckoutCompleted,
  onOpenPortal,
  portalLoading,
  portalError,
}: {
  status: BillingStatus;
  email: string;
  userId: string;
  hasPaddleCustomer: boolean;
  onCheckoutCompleted: () => void;
  onOpenPortal: () => void;
  portalLoading: boolean;
  portalError: string | null;
}) {
  if (status.kind === "active") {
    return (
      <div className="card-soft space-y-5 rounded-2xl bg-slate-900/50 p-6 ring-1 ring-emerald-500/20 backdrop-blur-xl sm:p-8">
        <div>
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-400/30">
            Abonnement actif
          </span>
          <h2 className="mt-4 text-2xl font-semibold text-slate-50">
            Tu es abonné à SafeWithdraw Pro
          </h2>
          <p className="mt-2 text-sm text-slate-400">
            Merci pour ton soutien ! Tu peux gérer ton moyen de paiement,
            voir tes factures et résilier depuis le portail Paddle.
          </p>
        </div>

        <div>
          <button
            type="button"
            onClick={onOpenPortal}
            disabled={portalLoading || !hasPaddleCustomer}
            className="inline-flex w-full items-center justify-center rounded-xl bg-white/[0.06] px-5 py-3 text-sm font-medium text-slate-100 ring-1 ring-white/10 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {portalLoading ? "Ouverture…" : "Gérer mon abonnement"}
          </button>
          {portalError && (
            <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
              {portalError}
            </p>
          )}
        </div>
      </div>
    );
  }

  // For "trialing", "trial-expired" and "inactive" we render the same
  // pricing card with a state-specific header copy.
  return (
    <div className="card-soft rounded-2xl bg-slate-900/50 p-6 ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
      <BillingCardHeader status={status} />

      <div className="mt-8 rounded-xl bg-slate-950/60 p-5 ring-1 ring-white/10 sm:p-6">
        <p className="text-xs uppercase tracking-[0.16em] text-emerald-300/80">
          SafeWithdraw Pro
        </p>
        <p className="mt-2 text-5xl font-semibold tracking-tight text-emerald-300 sm:text-6xl">
          19€
          <span className="text-base font-normal text-slate-400">/mois</span>
        </p>
        <p className="mt-2 text-sm text-slate-200">
          Moins chère qu’une seule erreur de retrait
        </p>
        <p className="mt-3 text-sm text-slate-400">
          Paiement sécurisé via Paddle • Annulable à tout moment
        </p>

        <ul className="mt-6 space-y-2 text-sm text-slate-300">
          <li>✓&nbsp; Montant retirable en temps réel</li>
          <li>✓&nbsp; Calcul URSSAF automatique</li>
          <li>✓&nbsp; Réserve de sécurité recommandée</li>
          <li>✓&nbsp; Suivi de tes retraits du mois</li>
        </ul>

        <div className="mt-7">
          <PaddleCheckoutButton
            email={email}
            userId={userId}
            onCheckoutCompleted={onCheckoutCompleted}
          />
        </div>
      </div>

      {status.kind === "trialing" && (
        <p className="mt-4 text-center text-xs text-slate-500">
          Pas pressé ? Tu peux continuer à utiliser SafeWithdraw gratuitement
          pendant encore {status.daysLeft}{" "}
          {status.daysLeft > 1 ? "jours" : "jour"}.
        </p>
      )}
    </div>
  );
}

function BillingCardHeader({ status }: { status: BillingStatus }) {
  if (status.kind === "trialing") {
    return (
      <div>
        <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-400/30">
          Essai gratuit en cours
        </span>
        <h2 className="mt-4 text-2xl font-semibold text-slate-50">
          {formatDaysLeft(status.daysLeft).charAt(0).toUpperCase() +
            formatDaysLeft(status.daysLeft).slice(1)}
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Continue d’utiliser SafeWithdraw gratuitement, ou abonne-toi dès
          maintenant pour ne pas perdre l’accès quand l’essai se termine.
        </p>
      </div>
    );
  }

  if (status.kind === "trial-expired") {
    return (
      <div>
        <span className="inline-flex items-center rounded-full bg-amber-500/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-amber-300 ring-1 ring-amber-400/30">
          Essai expiré
        </span>
        <h2 className="mt-4 text-2xl font-semibold text-slate-50">
          Ton essai gratuit est terminé
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          Pour continuer à voir ton montant retirable et ton suivi URSSAF,
          souscris à SafeWithdraw Pro.
        </p>
      </div>
    );
  }

  return (
    <div>
      <span className="inline-flex items-center rounded-full bg-rose-500/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-rose-300 ring-1 ring-rose-400/30">
        Abonnement inactif
      </span>
      <h2 className="mt-4 text-2xl font-semibold text-slate-50">
        Réactive ton accès à SafeWithdraw Pro
      </h2>
      <p className="mt-2 text-sm text-slate-400">
        Souscris à nouveau pour retrouver tous tes calculs et ton historique
        URSSAF.
      </p>
    </div>
  );
}

function PollingCard() {
  return (
    <div className="card-soft space-y-3 rounded-2xl bg-slate-900/50 p-6 text-center ring-1 ring-emerald-500/30 backdrop-blur-xl sm:p-8">
      <h2 className="text-xl font-semibold text-slate-50">
        Activation en cours…
      </h2>
      <p className="text-sm text-slate-400">
        Ton paiement est confirmé. On finalise l’activation de ton compte —
        tu seras redirigé vers le dashboard automatiquement.
      </p>
      <div className="mx-auto mt-2 h-1 w-32 overflow-hidden rounded-full bg-white/10">
        <div className="h-full w-1/3 animate-pulse bg-emerald-400" />
      </div>
    </div>
  );
}

function TimeoutCard() {
  return (
    <div className="card-soft space-y-4 rounded-2xl bg-slate-900/50 p-6 ring-1 ring-amber-500/30 backdrop-blur-xl sm:p-8">
      <h2 className="text-xl font-semibold text-slate-50">
        L’activation prend plus de temps que prévu
      </h2>
      <p className="text-sm text-slate-400">
        Pas d’inquiétude : ton paiement est bien enregistré côté Paddle. Si
        ton compte n’est pas activé d’ici quelques minutes, recharge la page
        ou contacte le support.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="inline-flex w-full items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      >
        Recharger la page
      </button>
    </div>
  );
}
