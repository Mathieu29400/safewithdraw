"use client";

/**
 * VatThresholdCard — dashboard widget surfacing the year-to-date VAT
 * seuil de franchise progress.
 *
 * Single surface, four visual states:
 *
 *   - "safe"       discreet emerald card, progress bar fills calmly.
 *                  Reads "tout va bien, voici où tu en es".
 *   - "warning"    amber accent ring + sub-message "tu approches".
 *                  Stops the user from missing the trend, doesn't
 *                  scream. (User's "alerte douce" request.)
 *   - "danger"     strong amber accent + a clearer status line "tu
 *                  vas bientôt devoir facturer la TVA". (User's
 *                  "alerte forte" — kept on the amber/orange palette
 *                  per their feedback, NOT red.)
 *   - "exceeded"   rose accent + "tu dépasses le seuil, facture la
 *                  TVA dès aujourd'hui". The only red state.
 *
 * Always renders a clickable "En savoir plus" affordance that opens
 * the shared `VatExplainerDialog` with a personalised example.
 *
 * Hidden entirely when:
 *   - the user is `registered` (no alert to show — they already
 *     invoice VAT and we promised not to spam them);
 *   - the hook is still loading or has no profile (lets the dashboard
 *     pick the right state for them on next render).
 *
 * Independent of the period dropdown: VAT thresholds are always
 * computed on the current calendar year, see `useVatStatus`.
 */

import { useMemo, useState } from "react";
import { InfoCircle } from "react-bootstrap-icons";

import { useVatStatus } from "@/lib/use-vat-status";
import type { VatStatus, VatStatusLevel } from "@/lib/vat";

import { VatExplainerDialog } from "./vat-explainer-dialog";

type ToneStyles = {
  /** Outer card border + ring colour (also paints the soft glow). */
  shell: string;
  /** Fill colour for the filled section of the progress bar. */
  progressFill: string;
  /** Background of the unfilled rail behind the progress bar. */
  progressTrack: string;
  /** Accent applied to the headline number and the percentage chip. */
  headline: string;
  /** Background + ring for the small percentage chip on the right. */
  chip: string;
  /** Optional banner-style strip above the progress bar (warning+). */
  banner: string | null;
};

/**
 * Visual palette per status level. Centralised so the four states stay
 * coherent and a future palette change (e.g. swapping emerald for
 * teal) only touches this constant.
 */
const TONE_BY_LEVEL: Record<VatStatusLevel, ToneStyles> = {
  // The hook hides the widget in this state — defaults are unreachable
  // but defined so the lookup is total.
  registered: {
    shell: "bg-slate-900/50 ring-white/10",
    progressFill: "bg-sky-500",
    progressTrack: "bg-white/[0.06]",
    headline: "text-slate-100",
    chip: "bg-sky-500/10 text-sky-300 ring-sky-400/25",
    banner: null,
  },
  safe: {
    shell: "bg-slate-900/50 ring-white/10",
    progressFill: "bg-emerald-500",
    progressTrack: "bg-white/[0.06]",
    headline: "text-slate-100",
    chip: "bg-emerald-500/10 text-emerald-300 ring-emerald-400/25",
    banner: null,
  },
  warning: {
    shell: "bg-amber-950/[0.18] ring-amber-400/40",
    progressFill: "bg-amber-400",
    progressTrack: "bg-amber-950/40",
    headline: "text-amber-100",
    chip: "bg-amber-500/15 text-amber-200 ring-amber-400/35",
    banner:
      "Tu approches du seuil de TVA — on te prévient en avance pour anticiper sereinement.",
  },
  danger: {
    shell: "bg-amber-950/[0.30] ring-amber-400/60",
    progressFill: "bg-amber-500",
    progressTrack: "bg-amber-950/50",
    headline: "text-amber-100",
    chip: "bg-amber-500/20 text-amber-100 ring-amber-400/50",
    banner:
      "Tu es très proche du seuil de TVA. Prépare ta bascule pour ne pas être pris au dépourvu.",
  },
  exceeded: {
    shell: "bg-rose-950/[0.30] ring-rose-400/60",
    progressFill: "bg-rose-500",
    progressTrack: "bg-rose-950/40",
    headline: "text-rose-100",
    chip: "bg-rose-500/20 text-rose-100 ring-rose-400/50",
    banner:
      "Tu as dépassé le seuil de TVA. Tu dois facturer la TVA dès la prochaine vente.",
  },
};

export function VatThresholdCard({ userId }: { userId: string | null }) {
  const state = useVatStatus(userId);
  const [dialogOpen, setDialogOpen] = useState(false);

  if (state.status === "loading") {
    // Skeleton — kept extremely minimal so it doesn't dominate the
    // page during the brief loading window. The full card layout is
    // similar enough that the transition isn't jarring.
    return (
      <section
        aria-label="Seuil de TVA"
        className="card-soft rounded-2xl bg-slate-900/50 p-5 ring-1 ring-white/10 backdrop-blur-xl sm:p-6"
      >
        <p className="text-sm text-slate-500">Calcul du seuil de TVA…</p>
      </section>
    );
  }

  if (state.status === "error") {
    return (
      <section
        aria-label="Seuil de TVA"
        className="rounded-2xl bg-rose-950/40 p-5 text-sm text-rose-300 ring-1 ring-rose-500/30 backdrop-blur"
      >
        Impossible de charger ton suivi du seuil de TVA : {state.error}
      </section>
    );
  }

  if (state.status === "no-urssaf-profile") {
    return null;
  }

  if (state.vat.level === "registered") {
    // User declared they already invoice VAT — silence per spec.
    return null;
  }

  return (
    <>
      <VatThresholdBody
        vat={state.vat}
        activityLabel={state.activityLabel}
        onExplain={() => setDialogOpen(true)}
      />
      <VatExplainerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        vat={state.vat}
        activityLabel={state.activityLabel}
      />
    </>
  );
}

function VatThresholdBody({
  vat,
  activityLabel,
  onExplain,
}: {
  vat: VatStatus;
  activityLabel: string;
  onExplain: () => void;
}) {
  const tone = TONE_BY_LEVEL[vat.level];
  const year = new Date().getUTCFullYear();

  const revenueFmt = useMemo(() => formatEuro(vat.revenueYTD), [vat.revenueYTD]);
  const thresholdFmt = useMemo(
    () => formatEuro(vat.threshold),
    [vat.threshold],
  );
  const remainingAbs = Math.abs(vat.remaining);
  const remainingFmt = useMemo(() => formatEuro(remainingAbs), [remainingAbs]);
  const percentFmt = useMemo(
    () => `${Math.round(vat.ratio * 100)} %`,
    [vat.ratio],
  );

  const projectedLabel = useMemo(() => {
    if (!vat.projectedExceedDate) return null;
    return vat.projectedExceedDate.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }, [vat.projectedExceedDate]);

  // 1.5 % wide minimum so a tiny first revenue line is still visible
  // — without this the bar reads as "empty" until ~700 € of CA.
  const widthPct = Math.max(1.5, Math.round(vat.ratioClamped * 100));

  return (
    <section
      aria-label="Seuil de TVA"
      className={`card-soft rounded-2xl p-5 ring-1 backdrop-blur-xl sm:p-6 ${tone.shell}`}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Seuil de TVA · {year}
          </h2>
          <p className="mt-1.5 text-sm text-slate-300">
            Dans ton cas (
            <span className="font-medium text-slate-100">
              {activityLabel}
            </span>
            ), ton seuil de franchise est de{" "}
            <span className="font-mono font-semibold text-slate-100">
              {thresholdFmt} HT
            </span>
            .
          </p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ${tone.chip}`}
        >
          {percentFmt}
        </span>
      </header>

      {tone.banner && (
        <p
          className={`mt-4 rounded-xl border border-current/15 bg-current/[0.05] px-3 py-2 text-sm leading-snug ${tone.headline}`}
        >
          {tone.banner}
        </p>
      )}

      <div className="mt-5">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`font-mono text-base font-semibold tabular-nums sm:text-lg ${tone.headline}`}>
            {revenueFmt} HT
          </span>
          <span className="font-mono text-xs tabular-nums text-slate-400">
            / {thresholdFmt} HT
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(vat.ratio * 100)}
          aria-label={`Progression du seuil de TVA : ${percentFmt}`}
          className={`mt-2 h-2 w-full overflow-hidden rounded-full ${tone.progressTrack}`}
        >
          <div
            className={`h-full rounded-full transition-all duration-500 ease-out ${tone.progressFill}`}
            style={{ width: `${widthPct}%` }}
          />
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {vat.level === "exceeded" ? "Dépassement" : "Il te reste"}
          </dt>
          <dd
            className={`mt-0.5 font-mono text-sm font-medium tabular-nums ${
              vat.level === "exceeded" ? "text-rose-300" : "text-slate-100"
            }`}
          >
            {vat.level === "exceeded" ? "+ " : ""}
            {remainingFmt} HT
          </dd>
        </div>
        {projectedLabel && (
          <div>
            <dt className="text-[11px] uppercase tracking-[0.16em] text-slate-500">
              À ce rythme, seuil atteint vers
            </dt>
            <dd className="mt-0.5 text-sm font-medium text-slate-100">
              {projectedLabel}
            </dd>
          </div>
        )}
      </dl>

      <button
        type="button"
        onClick={onExplain}
        className="mt-5 inline-flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/[0.08] hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
      >
        <InfoCircle size={14} aria-hidden />
        Comprendre le seuil de TVA
      </button>
    </section>
  );
}

function formatEuro(amount: number): string {
  return amount.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  });
}
