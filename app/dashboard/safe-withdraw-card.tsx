"use client";

/**
 * SafeWithdrawCard — the dashboard's premium fintech KPI section.
 *
 * The card has TWO display modes, driven by the `mode` prop. Both modes
 * render a hero number; what differs is the LABEL and the framing:
 *
 * - "period"   → live or archived URSSAF period.
 *                Hero label: "Montant retirable" (it's actionable money).
 *                The OverdrawAlert can fire only here AND only when the
 *                parent flags `isCurrentPeriod` — archived periods are
 *                read-only history, telling the user to stop withdrawing
 *                from a past period would make no sense.
 *
 * - "all-time" → informational global view ("Depuis le début").
 *                Hero label: "Bilan global estimé" — deliberately
 *                different so users do NOT confuse this number with the
 *                amount they can withdraw right now. A small helper line
 *                under the hero spells the warning out in French.
 *
 * Layout (both modes):
 *   1. HeroCard — same Revolut-style dark card, just with mode-aware
 *      label and helper text.
 *   2. OverdrawAlert — only in "period" mode AND when the period is
 *      flagged as current.
 *   3. BreakdownGrid — 4 (or 5 in advanced mode) floating glass tiles.
 *      Tile labels switch to "totals" wording in all-time mode.
 *
 * Color system (global rule):
 *   - Positive amounts (CA, safe) ............ emerald-400
 *   - Negative amounts (URSSAF, réserve
 *     recommandée, withdrawals, expenses) .... rose-400 (muted, not bright)
 *
 * All math comes from `useSafeWithdraw` / `computeSafeWithdraw`.
 * This file is purely presentational — no formula, no arithmetic.
 */

import { useMemo, useState } from "react";
import { AnimatedCurrency } from "@/lib/animated-currency";
import type { CashflowResult } from "@/lib/cashflow";
import type { PeriodType } from "@/lib/database.types";
import { useAnimatedNumber } from "@/lib/use-animated-number";
import { useSafeWithdraw, type PeriodRange } from "@/lib/use-safe-withdraw";

/** 700 ms — matches AnimatedCurrency default and the spec window 500–800 ms. */
const HERO_ANIM_DURATION_MS = 700;

export type SafeWithdrawMode = "period" | "all-time";

type Props = {
  userId: string | null;
  /**
   * Whether the advanced-mode expenses feature is on. When `undefined` (the
   * parent is still resolving the user preference), the card stays in its
   * skeleton state to avoid flashing the wrong KPI.
   */
  advancedMode?: boolean;
  /**
   * "period"   → hero + period-scoped breakdown (current OR archived periods).
   * "all-time" → "Bilan global estimé" hero + cumulative totals breakdown.
   */
  mode: SafeWithdrawMode;
  /**
   * Period range to scope the KPI by. Required when `mode === "period"`:
   *   - `undefined` → period not yet resolved; hold the hook in skeleton mode
   *     to prevent flashing stale data before the period is known.
   *   - `PeriodRange` → filter transactions to
   *     `created_at >= period.start` and (optionally) `< period.end`.
   * Ignored when `mode === "all-time"` — the card always uses every transaction.
   */
  period?: PeriodRange;
  /**
   * Only meaningful when `mode === "period"`. When `true`, the period being
   * displayed is the live current one and the OverdrawAlert is allowed to
   * surface. When `false` (archived period view), the alert is suppressed
   * so the user isn't told to stop withdrawing from a closed period.
   * Defaults to `true` for backwards-compat with simple callers.
   */
  isCurrentPeriod?: boolean;
  /**
   * Short period label shown under the hero title, e.g. "Mois de Mai 2026"
   * or "Trimestre avr. → juin 2026". Only meaningful in period mode.
   */
  periodSubtitle?: string;
  /**
   * Frequency of the current period. Required to compute the projection
   * end-date (end of month vs end of quarter). Only needed when
   * `isCurrentPeriod` is true.
   */
  periodType?: PeriodType;
};

export function SafeWithdrawCard({
  userId,
  advancedMode,
  mode,
  period,
  isCurrentPeriod = true,
  periodSubtitle,
  periodType,
}: Props) {
  // In "period" mode, hold the hook in loading until the period resolves so
  // we never flash all-time data inside the period KPI. In "all-time" mode
  // we intentionally pass NO period — the hook then sums every transaction.
  const isPeriod = mode === "period";
  const effectiveUserId = isPeriod && period === undefined ? null : userId;
  const effectivePeriod = isPeriod ? period : undefined;
  const state = useSafeWithdraw(effectiveUserId, effectivePeriod, {
    advancedMode,
  });

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
      <HeroCard data={data} isOverdrawn={isOverdrawn} mode={mode} periodSubtitle={periodSubtitle} />
      {isPeriod && isCurrentPeriod && isOverdrawn && <OverdrawAlert />}
      <BreakdownGrid data={data} showExpenses={showExpenses} mode={mode} />
      {isPeriod && isCurrentPeriod && period && periodType && (
        <ProjectionBanner data={data} period={period} periodType={periodType} />
      )}
      {isPeriod && (
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] tracking-wide text-slate-600">
          <span aria-hidden>🔒</span>
          Calcul automatique incluant URSSAF et réserve de sécurité
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Projection banner — end-of-period estimate based on current pace           */
/* -------------------------------------------------------------------------- */

const EURO = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

function periodEndUTC(start: string, type: PeriodType): Date {
  const d = new Date(start);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  return type === "quarterly"
    ? new Date(Date.UTC(y, m + 3, 1))
    : new Date(Date.UTC(y, m + 1, 1));
}

function ProjectionBanner({
  data,
  period,
  periodType,
}: {
  data: CashflowResult;
  period: PeriodRange;
  periodType: PeriodType;
}) {
  // Capture the current timestamp once at mount. Using a state initializer
  // is the React-idiomatic way to read an impure value (Date.now) exactly
  // once without violating the hooks-purity rule.
  const [now] = useState<number>(() => Date.now());
  const { elapsedDays, remainingDays } = useMemo(() => {
    const startMs = new Date(period.start).getTime();
    const endMs = periodEndUTC(period.start, periodType).getTime();
    const totalDays = (endMs - startMs) / 86_400_000;
    const elapsed = Math.max((now - startMs) / 86_400_000, 0);
    const remaining = Math.max(totalDays - elapsed, 0);
    return { elapsedDays: elapsed, remainingDays: remaining };
  }, [now, period.start, periodType]);

  // Need at least 1 day of data and at least 1 remaining day to project.
  if (elapsedDays < 1 || remainingDays < 1 || data.ca <= 0) return null;

  // Derive rates from actuals to stay consistent with existing logic.
  const urssafRate = data.urssafDue / data.ca;
  const reserveRate = data.reserve / data.ca;
  const netRate = 1 - urssafRate - reserveRate;

  const dailyCA = data.ca / elapsedDays;
  const additionalCA = dailyCA * remainingDays;
  const projectedSafe = data.safe + additionalCA * netRate;

  // Only show positive or useful projections.
  if (projectedSafe <= 0) return null;

  const label =
    periodType === "quarterly"
      ? "d\u2019ici la fin du trimestre"
      : "d\u2019ici la fin du mois";

  return (
    <div className="rounded-2xl border border-dashed border-slate-700/60 bg-slate-900/30 px-5 py-4 backdrop-blur">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.16em] text-slate-500">
        Projection fin de période
      </p>
      <p className="text-sm text-slate-300">
        Si tu continues à ce rythme, tu pourrais te verser environ{" "}
        <span className="font-semibold text-emerald-300">
          {EURO.format(projectedSafe)}
        </span>{" "}
        {label}.
      </p>
      <p className="mt-1.5 text-[11px] text-slate-600">
        Estimation — si ton activité reste stable sur la période.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Advisory hint under the hero number                                         */
/* -------------------------------------------------------------------------- */

const CLOSE_THRESHOLD = 50; // €

function HeroAdvisory({ safe }: { safe: number }) {
  if (safe > CLOSE_THRESHOLD) {
    return (
      <p className="relative mt-4 text-center text-sm font-medium text-slate-300">
        Tu peux te verser{" "}
        <span className="text-emerald-300">{formatEuro(safe)}</span> sans
        risque.
      </p>
    );
  }

  if (safe >= 0) {
    return (
      <p className="relative mt-4 text-center text-sm font-medium text-amber-400/80">
        Tu es proche de ta limite.
      </p>
    );
  }

  return (
    <p className="relative mt-4 text-center text-sm font-medium text-rose-400/80">
      Tu as dépassé ta limite recommandée.
    </p>
  );
}

function HeroHabitNudge() {
  return (
    <p className="relative mt-2 text-center text-[11px] tracking-wide text-slate-600">
      Vérifie toujours avant de te verser.
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Hero — dark premium banking card, just the headline & the number           */
/* -------------------------------------------------------------------------- */

function HeroCard({
  data,
  isOverdrawn,
  mode,
  periodSubtitle,
}: {
  data: CashflowResult;
  isOverdrawn: boolean;
  mode: SafeWithdrawMode;
  periodSubtitle?: string;
}) {
  // Three visual tones: positive (green) / warning (amber) / negative (red).
  const isWarning = !isOverdrawn && data.safe <= CLOSE_THRESHOLD;

  const ambientGlow = isOverdrawn
    ? "bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(244,63,94,0.30),transparent_70%)]"
    : isWarning
      ? "bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(251,191,36,0.25),transparent_70%)]"
      : "bg-[radial-gradient(ellipse_70%_60%_at_50%_50%,rgba(16,185,129,0.35),transparent_70%)]";

  const numberGlow = isOverdrawn
    ? "bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(244,63,94,0.45),transparent_70%)]"
    : isWarning
      ? "bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(251,191,36,0.35),transparent_70%)]"
      : "bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(16,185,129,0.50),transparent_70%)]";

  const cardSurface = isOverdrawn
    ? "bg-gradient-to-br from-rose-950/80 via-slate-950 to-black"
    : isWarning
      ? "bg-gradient-to-br from-amber-950/60 via-slate-950 to-black"
      : "bg-gradient-to-br from-emerald-950/80 via-slate-950 to-black";

  const topSheen = isOverdrawn
    ? "bg-gradient-to-r from-transparent via-rose-400/50 to-transparent"
    : isWarning
      ? "bg-gradient-to-r from-transparent via-amber-400/40 to-transparent"
      : "bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent";

  const labelTone = isOverdrawn
    ? "text-rose-400/80"
    : isWarning
      ? "text-amber-400/80"
      : "text-emerald-400/80";

  // Spec rule: never call the all-time number "Montant retirable" — that
  // would mislead users into thinking they can withdraw the global
  // historical balance. Use a deliberately different label and a helper
  // line that explicitly disclaims the actionable interpretation.
  const heroLabel =
    mode === "all-time" ? "Bilan global estimé" : "Montant retirable";

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
          {heroLabel}
        </p>
        {periodSubtitle && (
          <p className="mt-1 text-[11px] tracking-wide text-slate-500">
            {periodSubtitle}
          </p>
        )}

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
            warnThreshold={CLOSE_THRESHOLD}
            warningColor="text-amber-200"
            className="text-6xl font-semibold tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.4)] sm:text-8xl lg:text-9xl"
          />
        </div>

        {mode === "period" && (
          <>
            <HeroAdvisory safe={data.safe} />
            <HeroHabitNudge />
          </>
        )}
        {mode === "all-time" && (
          <p className="relative mt-5 max-w-xl text-sm leading-relaxed text-slate-400">
            Cette vue est informative et ne correspond pas au montant
            retirable de la période actuelle.
          </p>
        )}
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
          Tes retraits dépassent la marge affichée après URSSAF et réserve
          recommandée
        </p>
        <p className="mt-0.5 text-rose-300">
          Ce n&apos;est pas une interdiction : c&apos;est un signal que de
          nouvelles entrées t&apos;aideront à retrouver une marge confortable.
          À toi de juger si un retrait supplémentaire reste raisonnable dans
          ton contexte.
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
  mode,
}: {
  data: CashflowResult;
  showExpenses: boolean;
  mode: SafeWithdrawMode;
}) {
  // All-time labels emphasise that the figures are cumulative; period
  // labels stay terse so the hero stays the headline. Same numbers, just
  // a clearer framing per-mode.
  const labels =
    mode === "all-time"
      ? {
          ca: "CA total",
          urssaf: "URSSAF estimée totale",
          reserve: "Réserve de sécurité recommandée (totale)",
          withdrawals: "Retraits totaux",
          expenses: "Dépenses totales",
        }
      : {
          ca: "Chiffre d'affaires",
          urssaf: "URSSAF estimée",
          reserve: "Réserve de sécurité recommandée",
          withdrawals: "Déjà retiré",
          expenses: "Dépenses pro",
        };

  const reserveHintText =
    "Cette somme est mise de côté pour garder une marge en cas d'imprévu.";

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <BreakdownTile
          label={labels.ca}
          amount={data.ca}
          tone="positive"
          large
        />
        <BreakdownTile
          label={labels.urssaf}
          amount={data.urssafDue}
          tone="negative"
          large
        />
        <BreakdownTile
          label={labels.reserve}
          amount={data.reserve}
          tone="negative"
          hint="10 %"
          helperText={reserveHintText}
        />
      </div>
      <div
        className={`grid gap-3 sm:gap-4 ${showExpenses ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-2"}`}
      >
        <BreakdownTile
          label={labels.withdrawals}
          amount={data.withdrawals}
          tone="negative"
        />
        {showExpenses && (
          <BreakdownTile
            label={labels.expenses}
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
  helperText,
  large = false,
}: {
  label: string;
  amount: number;
  tone: Tone;
  hint?: string;
  /** Optional explainer under the amount (e.g. recommended reserve). */
  helperText?: string;
  /** When true, renders the amount in a larger size (tiles without helper text). */
  large?: boolean;
}) {
  const animated = useAnimatedNumber(amount);
  const valueColor =
    tone === "positive" ? "text-emerald-400" : "text-rose-400";
  // Sign prefix is muted slate so the value colour stays the focus.
  const signSymbol = tone === "positive" ? "" : "−";

  const valueSize = large
    ? "text-2xl sm:text-3xl"
    : "text-xl sm:text-2xl";

  return (
    <div className="card-soft card-interactive relative overflow-hidden rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/5 backdrop-blur-xl sm:p-5">
      {/* Top-edge inner highlight — same micro-detail as the hero, scaled
          down. Gives the tile its "physical card" feel. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent"
      />

      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[10px] font-medium uppercase leading-snug tracking-[0.14em] text-slate-500 sm:tracking-[0.16em]">
          {label}
        </p>
        {hint && (
          <span className="shrink-0 text-[10px] tabular-nums text-slate-600">
            {hint}
          </span>
        )}
      </div>

      <p
        className={`mt-3 font-mono font-semibold tabular-nums tracking-tight transition-colors duration-300 ${valueSize} ${valueColor}`}
      >
        {signSymbol && (
          <span className="mr-0.5 font-sans text-slate-500">{signSymbol}</span>
        )}
        {formatEuro(animated)}
      </p>
      {helperText !== undefined && helperText !== "" && (
        <p className="mt-2.5 border-t border-white/5 pt-2.5 text-[11px] leading-snug text-slate-500">
          {helperText}
        </p>
      )}
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
