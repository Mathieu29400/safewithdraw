"use client";

/**
 * URSSAF activity / frequency picker — the visual cards used by both
 * the first-time onboarding flow (`/onboarding`) AND the change-activity
 * flow on the account page (`/account`).
 *
 * Pure presentation: every card is a controlled radio. The parent
 * decides what `selected` means and what to do `onSelect`. Keeps
 * SQL / business decisions out of this file so it can be safely
 * shared.
 *
 * The activity catalog itself lives in `lib/urssaf-activities.ts`.
 * `ACTIVITY_VISUALS` is a UI-only enrichment map keyed on the stable
 * activity id — emoji + a shorter label tuned for the picker grid.
 */

import type { PeriodType } from "@/lib/database.types";
import {
  CUSTOM_ACTIVITY_ID,
  type UrssafActivity,
} from "@/lib/urssaf-activities";

export const ACTIVITY_VISUALS: Record<
  string,
  { emoji: string; title: string; subtitle: string }
> = {
  commerce: {
    emoji: "🛍",
    title: "Commerce",
    subtitle: "Achat et revente de biens",
  },
  "services-commerciaux-artisanaux": {
    emoji: "🛠",
    title: "Services commerciaux / artisanaux",
    subtitle: "Activité de service ou artisanat",
  },
  "freelance-prestations": {
    emoji: "🧑‍💻",
    title: "Freelance / prestations de services",
    subtitle: "Activité digitale, conseil, freelance",
  },
  "professions-liberales-cipav": {
    emoji: "🧾",
    title: "Professions libérales (CIPAV)",
    subtitle: "Professions réglementées",
  },
  "location-meublee-tourisme-classee": {
    emoji: "🏠",
    title: "Location meublée de tourisme classée",
    subtitle: "Location courte durée",
  },
};

export function ActivityCard({
  activity,
  selected,
  onSelect,
}: {
  activity: UrssafActivity;
  selected: boolean;
  onSelect: () => void;
}) {
  const visuals = ACTIVITY_VISUALS[activity.id] ?? {
    emoji: "•",
    title: activity.name,
    subtitle: activity.description,
  };

  return (
    <label
      className={`relative flex h-full cursor-pointer items-start gap-3 rounded-2xl p-5 transition-all duration-200 ease-out motion-safe:active:scale-[0.98] ${
        selected
          ? "bg-emerald-500/[0.10] ring-2 ring-emerald-400/55 shadow-[0_14px_36px_-12px_rgba(16,185,129,0.65)] motion-safe:scale-[1.02]"
          : "bg-slate-900/55 ring-1 ring-white/10 shadow-[0_8px_28px_-18px_rgba(2,6,23,0.8)] hover:bg-slate-900/70 hover:ring-white/20 motion-safe:hover:scale-[1.01]"
      }`}
    >
      <input
        type="radio"
        name="activity"
        value={activity.id}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span aria-hidden className="text-2xl leading-none">
        {visuals.emoji}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-slate-100">
            {visuals.title}
          </span>
          <span className="font-mono text-sm font-semibold text-emerald-300">
            {formatPercent(activity.rate)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">{visuals.subtitle}</p>
      </div>
    </label>
  );
}

export function CustomActivityCard({
  selected,
  onSelect,
  name,
  onNameChange,
  ratePercent,
  onRatePercentChange,
}: {
  selected: boolean;
  onSelect: () => void;
  name: string;
  onNameChange: (v: string) => void;
  ratePercent: string;
  onRatePercentChange: (v: string) => void;
}) {
  return (
    <label
      className={`relative flex cursor-pointer items-start gap-3 rounded-2xl p-5 transition-all duration-200 ease-out motion-safe:active:scale-[0.98] ${
        selected
          ? "bg-emerald-500/[0.10] ring-2 ring-emerald-400/55 shadow-[0_14px_36px_-12px_rgba(16,185,129,0.65)] motion-safe:scale-[1.02]"
          : "bg-slate-900/55 ring-1 ring-white/10 shadow-[0_8px_28px_-18px_rgba(2,6,23,0.8)] hover:bg-slate-900/70 hover:ring-white/20 motion-safe:hover:scale-[1.01]"
      }`}
    >
      <input
        type="radio"
        name="activity"
        value={CUSTOM_ACTIVITY_ID}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span aria-hidden className="text-2xl leading-none">
        ⚙️
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-slate-100">
          Taux personnalisé
        </span>
        <p className="mt-1 text-xs text-slate-400">
          Pour ACRE, exonérations, ou un cas spécifique non listé.
        </p>

        {selected && (
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <div>
              <label
                htmlFor="custom-name"
                className="block text-xs font-medium text-slate-300"
              >
                Nom de l&apos;activité
              </label>
              <input
                id="custom-name"
                type="text"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                placeholder="Ex : Conseil — ACRE 1ère année"
                className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
            <div>
              <label
                htmlFor="custom-rate"
                className="block text-xs font-medium text-slate-300"
              >
                Taux (%)
              </label>
              <input
                id="custom-rate"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="100"
                value={ratePercent}
                onChange={(e) => onRatePercentChange(e.target.value)}
                placeholder="21.20"
                className="mt-1 block w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>
    </label>
  );
}

export function FrequencyCard({
  value,
  label,
  description,
  emoji,
  selected,
  onSelect,
}: {
  value: PeriodType;
  label: string;
  description: string;
  emoji: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <label
      className={`relative flex h-full cursor-pointer items-start gap-3 rounded-2xl p-5 transition-all duration-200 ease-out motion-safe:active:scale-[0.98] ${
        selected
          ? "bg-emerald-500/[0.10] ring-2 ring-emerald-400/55 shadow-[0_14px_36px_-12px_rgba(16,185,129,0.65)] motion-safe:scale-[1.02]"
          : "bg-slate-900/55 ring-1 ring-white/10 shadow-[0_8px_28px_-18px_rgba(2,6,23,0.8)] hover:bg-slate-900/70 hover:ring-white/20 motion-safe:hover:scale-[1.01]"
      }`}
    >
      <input
        type="radio"
        name="declaration_frequency"
        value={value}
        checked={selected}
        onChange={onSelect}
        className="sr-only"
      />
      <span aria-hidden className="text-2xl leading-none">
        {emoji}
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
    </label>
  );
}

export function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

/**
 * Parses a "21.20" or "21,20" percent string into a decimal rate
 * (0.212). Returns null on invalid input or out-of-range value.
 */
export function parseRatePercent(input: string): number | null {
  const cleaned = input.trim().replace(",", ".");
  if (!cleaned) return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  const rate = pct / 100;
  return Math.round(rate * 10000) / 10000;
}
