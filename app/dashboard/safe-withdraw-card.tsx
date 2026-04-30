"use client";

/**
 * SafeWithdrawCard — the dashboard's premium fintech KPI section.
 *
 * Layout (top to bottom):
 *   1. HeroCard — a Revolut-style dark card whose ONLY job is to display the
 *      "Montant retirable" label and the large balance number. No breakdown,
 *      no formula, no clutter — pure focal point.
 *   2. OverdrawAlert — only when `safe < 0`.
 *   3. BreakdownGrid — 4 (or 5 in advanced mode) floating glass tiles
 *      showing the components of the math: CA, URSSAF, Réserve, Retraits,
 *      and optionally Dépenses pro. Two columns on mobile, four (or five)
 *      on large screens. No hard borders — translucent slate over the
 *      dark page bg + 1 px white inner highlight on the top edge for the
 *      "premium card" feel.
 *
 * Color system (global rule):
 *   - Positive amounts (CA, safe) ............ emerald-400
 *   - Negative amounts (URSSAF, reserve,
 *     withdrawals, expenses) .................. rose-400 (muted, not bright)
 *
 * All math comes from `useSafeWithdraw` / `computeSafeWithdraw`.
 * This file is purely presentational — no formula, no arithmetic.
 */

import { AnimatedCurrency } from "@/lib/animated-currency";
import type { CashflowResult } from "@/lib/cashflow";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { useSafeWithdraw } from "@/lib/use-safe-withdraw";
import type { PeriodRange } from "@/lib/use-safe-withdraw";

/** 700 ms — matches AnimatedCurrency default and the spec window 500–800 ms. */
const HERO_ANIM_DURATION_MS = 700;

type Props = {
  userId: string | null;
  /**
   * Whether the advanced-mode expenses feature is on. When `undefined` (the
   * parent is still resolving the user preference), the card stays in its
   * skeleton state to avoid flashing the wrong KPI.
   */
  advancedMode?: boolean;
  /**
   * Start of the current URSSAF period (ISO timestamp).
   * - `undefined` → period not yet resolved; hold the hook in skeleton mode
   *   to prevent flashing all-time data before the period is known.
   * - `null` → no period row; compute KPI against all-time transactions
   *   (backwards-compatible for users who have never reset their period).
   * - `string` → filter transactions to `created_at >= periodStart`.
   */
  periodStart?: string | null;
};

export function SafeWithdrawCard({ userId, advancedMode, periodStart }: Props) {
  // When `periodStart` is undefined the period hasn't been fetched yet —
  // pass null as userId to keep the hook in its loading state and avoid
  // briefly showing stale all-time figures before the period resolves.
  const effectiveUserId = periodStart !== undefined ? userId : null;
  const period: PeriodRange | undefined = periodStart
    ? { start: periodStart }
    : undefined;
  const state = useSafeWithdraw(effectiveUserId, period, { advancedMode });

  if (state.status === "loading" || state.status === "no-urssaf-profile") {
    return <SkeletonSection showExpensesSlot={advancedMode === true} />;
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl bg-rose-950/40 p-5 text-sm text-rose-300 ring-1 ring-rose-500/30 backdrop-blur">
        Impossible de calculer votre montant retirable : {state.error}
      </div>
    );
  }

  const { data } = state;
  const isOverdrawn = data.safe < 0;
  const showExpenses = advancedMode === true;

  return (
    <section className="space-y-6">
      <HeroCard data={data} isOverdrawn={isOverdrawn} />
      {isOverdrawn && <OverdrawAlert />}
      <BreakdownGrid data={data} showExpenses={showExpenses} />
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero — dark premium banking card, just the headline & the number           */
/* -------------------------------------------------------------------------- */

function HeroCard({
  data,
  isOverdrawn,
}: {
  data: CashflowResult;
  isOverdrawn: boolean;
}) {
  const ambientGlow = isOverdrawn
    ? "bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(244,63,94,0.30),transparent_70%)]"
    : "bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(16,185,129,0.35),transparent_70%)]";

  const numberGlow = isOverdrawn
    ? "bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(244,63,94,0.45),transparent_70%)]"
    : "bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(16,185,129,0.50),transparent_70%)]";

  const cardSurface = isOverdrawn
    ? "bg-gradient-to-br from-rose-950/80 via-slate-950 to-black"
    : "bg-gradient-to-br from-emerald-950/80 via-slate-950 to-black";

  const topSheen = isOverdrawn
    ? "bg-gradient-to-r from-transparent via-rose-400/50 to-transparent"
    : "bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent";

  const labelTone = isOverdrawn ? "text-rose-400/80" : "text-emerald-400/80";

  return (
    <div className="relative isolate">
      <div
        aria-hidden
        className={`pointer-events-none absolute -inset-8 -z-10 rounded-[3rem] blur-3xl transition-colors duration-700 sm:-inset-12 ${ambientGlow}`}
      />

      <div
        className={`card-elevated relative overflow-hidden rounded-3xl p-8 transition-[background] duration-700 sm:p-12 ${cardSurface}`}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_30%,rgba(255,255,255,0.05)_50%,transparent_70%)]"
        />
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-0 top-0 h-px transition-colors duration-700 ${topSheen}`}
        />

        <p
          className={`text-[11px] font-medium uppercase tracking-[0.18em] transition-colors duration-700 ${labelTone}`}
        >
          Montant retirable
        </p>

        <div className="relative mt-6">
          <div
            aria-hidden
            className={`pointer-events-none absolute -inset-x-4 -inset-y-2 -z-10 blur-2xl transition-colors duration-700 sm:-inset-x-8 sm:-inset-y-4 ${numberGlow}`}
          />
          {/*
           * AnimatedCurrency handles everything in one place:
           *   - count-up/down via requestAnimationFrame + easeOutExpo
           *   - French locale formatting ("1 500,00 €")
           *   - smooth color transition (emerald-50 ↔ rose-100) over 700 ms
           *   - tabular-nums
           *   - aria-label with stable final value for screen-readers
           */}
          <AnimatedCurrency
            value={data.safe}
            duration={HERO_ANIM_DURATION_MS}
            className="text-6xl font-semibold tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)] sm:text-8xl lg:text-9xl"
          />
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Alert                                                                       */
/* -------------------------------------------------------------------------- */

function OverdrawAlert() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl bg-rose-950/50 p-4 text-sm text-rose-200 ring-1 ring-rose-500/30 backdrop-blur"
    >
      <span aria-hidden className="text-base leading-none">
        ⚠️
      </span>
      <div>
        <p className="font-medium text-rose-100">
          Tu as dépassé ton niveau de retrait sécurisé
        </p>
        <p className="mt-0.5 text-rose-300">
          Évite tout nouveau retrait jusqu’à de nouvelles entrées suffisantes
          pour rééquilibrer ton solde.
        </p>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Breakdown — hybrid floating tiles                                           */
/* -------------------------------------------------------------------------- */

function BreakdownGrid({
  data,
  showExpenses,
}: {
  data: CashflowResult;
  showExpenses: boolean;
}) {
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <BreakdownTile
          label="Chiffre d’affaires"
          amount={data.ca}
          tone="positive"
        />
        <BreakdownTile
          label="URSSAF estimée"
          amount={data.urssafDue}
          tone="negative"
        />
        <BreakdownTile
          label="Réserve de sécurité"
          amount={data.reserve}
          tone="negative"
          hint="10 %"
        />
      </div>
      <div
        className={`grid gap-3 sm:gap-4 ${showExpenses ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        <BreakdownTile
          label="Déjà retiré"
          amount={data.withdrawals}
          tone="negative"
        />
        {showExpenses && (
          <BreakdownTile
            label="Dépenses pro"
            amount={data.expenses}
            tone="negative"
          />
        )}
      </div>
    </div>
  );
}

type Tone = "positive" | "negative";

function BreakdownTile({
  label,
  amount,
  tone,
  hint,
}: {
  label: string;
  amount: number;
  tone: Tone;
  hint?: string;
}) {
  const animated = useAnimatedNumber(amount);
  const valueColor =
    tone === "positive" ? "text-emerald-400" : "text-rose-400";
  // Sign prefix is muted slate so the value colour stays the focus.
  const signSymbol = tone === "positive" ? "" : "−";

  return (
    <div className="card-soft card-interactive relative overflow-hidden rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/5 backdrop-blur-xl sm:p-5">
      {/* Top-edge inner highlight — same micro-detail as the hero, scaled
          down. Gives the tile its "physical card" feel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
      />

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
          {label}
        </p>
        {hint && (
          <span className="text-[10px] tabular-nums text-slate-600">
            {hint}
          </span>
        )}
      </div>

      <p
        className={`mt-3 font-mono text-xl font-semibold tabular-nums tracking-tight transition-colors duration-300 sm:text-2xl ${valueColor}`}
      >
        {signSymbol && (
          <span className="mr-0.5 font-sans text-slate-500">{signSymbol}</span>
        )}
        {formatEuro(animated)}
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Skeletons                                                                   */
/* -------------------------------------------------------------------------- */

function SkeletonSection({
  showExpensesSlot,
}: {
  showExpensesSlot: boolean;
}) {
  const tilesCount = showExpensesSlot ? 5 : 4;
  const cols = showExpensesSlot ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <section className="space-y-6">
      <div className="card-elevated rounded-3xl bg-gradient-to-br from-emerald-950/60 via-slate-950 to-black p-8 sm:p-12">
        <div className="h-3 w-32 animate-pulse rounded bg-white/10" />
        <div className="mt-6 h-16 w-72 animate-pulse rounded bg-white/10 sm:h-24 sm:w-[28rem]" />
      </div>
      <div className={`grid grid-cols-2 gap-3 sm:gap-4 ${cols}`}>
        {Array.from({ length: tilesCount }).map((_, i) => (
          <div
            key={i}
            className="card-soft rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/5 backdrop-blur-xl sm:p-5"
          >
            <div className="h-2.5 w-20 animate-pulse rounded bg-white/10" />
            <div className="mt-4 h-6 w-24 animate-pulse rounded bg-white/10" />
          </div>
        ))}
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

function formatEuro(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}
