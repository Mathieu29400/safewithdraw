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
 * activity id — Bootstrap icon component + a shorter label tuned for
 * the picker grid. Bootstrap Icons keep the visual language sober and
 * consistent across the app, instead of OS-rendered emojis that vary
 * by platform and read as "AI-flavored" to users.
 */

import type { ComponentType, SVGProps } from "react";
import {
  Bag,
  CalendarRange,
  Calendar3,
  CheckCircle,
  HouseDoor,
  InfoCircle,
  Laptop,
  Mortarboard,
  PatchQuestion,
  Receipt,
  ShieldCheck,
  Sliders,
  Tools,
} from "react-bootstrap-icons";

import type { PeriodType } from "@/lib/database.types";
import {
  CUSTOM_ACTIVITY_ID,
  URSSAF_ACTIVITIES,
  type UrssafActivity,
  type VatCategory,
} from "@/lib/urssaf-activities";
import { VAT_THRESHOLDS } from "@/lib/vat";

type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string }>;

export const ACTIVITY_VISUALS: Record<
  string,
  { Icon: IconComponent; title: string; subtitle: string }
> = {
  commerce: {
    Icon: Bag,
    title: "Commerce",
    subtitle: "Achat et revente de biens",
  },
  "services-commerciaux-artisanaux": {
    Icon: Tools,
    title: "Services commerciaux / artisanaux",
    subtitle: "Activité de service ou artisanat",
  },
  "freelance-prestations": {
    Icon: Laptop,
    title: "Freelance / prestations de services",
    subtitle: "Activité digitale, conseil, freelance",
  },
  "professions-liberales-cipav": {
    Icon: Mortarboard,
    title: "Professions libérales (CIPAV)",
    subtitle: "Professions réglementées",
  },
  "location-meublee-tourisme-classee": {
    Icon: HouseDoor,
    title: "Location meublée de tourisme classée",
    subtitle: "Location courte durée",
  },
};

export const FREQUENCY_ICONS = {
  monthly: Calendar3,
  quarterly: CalendarRange,
} as const satisfies Record<PeriodType, IconComponent>;

export function ActivityCard({
  activity,
  selected,
  onSelect,
}: {
  activity: UrssafActivity;
  selected: boolean;
  onSelect: () => void;
}) {
  const visuals = ACTIVITY_VISUALS[activity.id];
  const Icon = visuals?.Icon;
  const title = visuals?.title ?? activity.name;
  const subtitle = visuals?.subtitle ?? activity.description;

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
      <span
        aria-hidden
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${
          selected
            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
            : "bg-white/5 text-slate-300 ring-white/10"
        }`}
      >
        {Icon ? <Icon size={20} aria-hidden /> : <span className="text-base">•</span>}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium text-slate-100">{title}</span>
          <span className="font-mono text-sm font-semibold text-emerald-300">
            {formatPercent(activity.rate)}
          </span>
        </div>
        <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
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
      <span
        aria-hidden
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${
          selected
            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
            : "bg-white/5 text-slate-300 ring-white/10"
        }`}
      >
        <Sliders size={20} aria-hidden />
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
  selected,
  onSelect,
}: {
  value: PeriodType;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const Icon = FREQUENCY_ICONS[value];
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
      <span
        aria-hidden
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${
          selected
            ? "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
            : "bg-white/5 text-slate-300 ring-white/10"
        }`}
      >
        <Icon size={20} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        <p className="mt-1 text-xs text-slate-400">{description}</p>
      </div>
    </label>
  );
}

/* -------------------------------------------------------------------------- */
/* VAT registration picker                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Tri-state UI value for the "Tu factures actuellement la TVA ?" question.
 *
 *   - "no"   → user is in franchise en base de TVA (default, the right
 *              answer for the vast majority of fresh micro-entrepreneurs).
 *   - "yes"  → user already invoices VAT (volontaire ou par dépassement
 *              antérieur). We silence the dashboard threshold alert.
 *   - "idk"  → user doesn't know. We treat as "no" in DB but show a
 *              reassuring explanation so they aren't blocked here.
 *
 * The DB column `urssaf_profile.is_vat_registered` is a boolean: both
 * "no" and "idk" persist as `false`. The distinction only lives in the
 * picker's local state so we can render the explanation on "idk".
 */
export type VatRegistrationChoice = "no" | "yes" | "idk";

/** Persists a tri-state UI choice into the boolean column. */
export function vatChoiceToBoolean(choice: VatRegistrationChoice): boolean {
  return choice === "yes";
}

/** Hydrates the picker from the boolean column (after profile load). */
export function vatChoiceFromBoolean(value: boolean): VatRegistrationChoice {
  return value ? "yes" : "no";
}

const VAT_CHOICES: ReadonlyArray<{
  id: VatRegistrationChoice;
  Icon: IconComponent;
  title: string;
  subtitle: string;
  accent: "emerald" | "sky" | "slate";
}> = [
  {
    id: "no",
    Icon: ShieldCheck,
    title: "Non, j’en suis exonéré",
    subtitle: "Cas par défaut pour la plupart des micro-entrepreneurs.",
    accent: "emerald",
  },
  {
    id: "yes",
    Icon: Receipt,
    title: "Oui, je facture déjà la TVA",
    subtitle: "Volontairement ou suite à un dépassement de seuil.",
    accent: "sky",
  },
  {
    id: "idk",
    Icon: PatchQuestion,
    title: "Je ne sais pas",
    subtitle: "Pas de panique — on t’explique juste en dessous.",
    accent: "slate",
  },
];

/**
 * Visual styles per accent. Centralized so the three cards stay
 * coherent and a future palette change (e.g. swapping emerald for
 * teal) only touches one place.
 */
const ACCENT_STYLES = {
  emerald: {
    selectedRing: "ring-emerald-400/55",
    selectedBg: "bg-emerald-500/[0.10]",
    selectedShadow: "shadow-[0_14px_36px_-12px_rgba(16,185,129,0.65)]",
    iconBg: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  },
  sky: {
    selectedRing: "ring-sky-400/55",
    selectedBg: "bg-sky-500/[0.10]",
    selectedShadow: "shadow-[0_14px_36px_-12px_rgba(56,189,248,0.55)]",
    iconBg: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
  },
  slate: {
    selectedRing: "ring-slate-300/40",
    selectedBg: "bg-white/[0.05]",
    selectedShadow: "shadow-[0_14px_36px_-12px_rgba(148,163,184,0.4)]",
    iconBg: "bg-white/10 text-slate-200 ring-white/15",
  },
} as const;

/**
 * Three-option picker for the VAT registration status. Used in both
 * onboarding (Étape 3) and the account page (Profil URSSAF section).
 *
 * Renders an information panel below the cards explaining the seuil
 * de franchise en base de TVA. The panel adapts:
 *   - to the user's choice (pedagogical for "idk", validation for "yes")
 *   - to the user's activity (`category` and `activityLabel`) so the
 *     example shows their actual seuil (41 250 € or 93 500 €), not a
 *     generic both-options blob. Pass `null` to fall back to the
 *     generic copy (e.g. before the user picks an activity).
 *
 * Mandatory by the user request: must be voyant et important.
 */
export function VatRegistrationPicker({
  value,
  onChange,
  category = null,
  activityLabel = null,
}: {
  value: VatRegistrationChoice;
  onChange: (next: VatRegistrationChoice) => void;
  /**
   * VAT category derived from the user's URSSAF activity. When
   * non-null, the explainer panel personalizes the example
   * ("Dans ton cas, ton seuil est 41 250 € HT").
   */
  category?: VatCategory | null;
  /**
   * Human-readable activity label to mention by name inside the
   * personalized explainer ("Dans ton cas (Freelance / prestations
   * de services)..."). Optional — falls back to a generic phrasing
   * when missing.
   */
  activityLabel?: string | null;
}) {
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-4">
        {VAT_CHOICES.map(({ id, Icon, title, subtitle, accent }) => {
          const selected = value === id;
          const accentStyle = ACCENT_STYLES[accent];
          return (
            <label
              key={id}
              className={`relative flex h-full cursor-pointer items-start gap-3 rounded-2xl p-5 transition-all duration-200 ease-out motion-safe:active:scale-[0.98] ${
                selected
                  ? `${accentStyle.selectedBg} ring-2 ${accentStyle.selectedRing} ${accentStyle.selectedShadow} motion-safe:scale-[1.02]`
                  : "bg-slate-900/55 ring-1 ring-white/10 shadow-[0_8px_28px_-18px_rgba(2,6,23,0.8)] hover:bg-slate-900/70 hover:ring-white/20 motion-safe:hover:scale-[1.01]"
              }`}
            >
              <input
                type="radio"
                name="is_vat_registered"
                value={id}
                checked={selected}
                onChange={() => onChange(id)}
                className="sr-only"
              />
              <span
                aria-hidden
                className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 transition-colors ${
                  selected
                    ? accentStyle.iconBg
                    : "bg-white/5 text-slate-300 ring-white/10"
                }`}
              >
                <Icon size={20} aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-medium text-slate-100">
                  {title}
                </span>
                <p className="mt-1 text-xs text-slate-400">{subtitle}</p>
              </div>
            </label>
          );
        })}
      </div>

      <VatExplainerPanel
        choice={value}
        category={category}
        activityLabel={activityLabel}
      />
    </div>
  );
}

/**
 * The "voyant et important" explainer the user asked for. Renders an
 * always-visible info card below the choice grid that:
 *   1. Defines what the seuil de TVA is, in plain French.
 *   2. Shows a concrete numerical example (HT vs TTC math).
 *   3. Confirms what SafeWithdraw will do for them (auto threshold alert).
 *
 * Personalizes itself when `category` is provided:
 *   - shows the single applicable threshold (41 250 € OR 93 500 €)
 *   - mentions the user's activity label by name
 *   - falls back to a generic "ou" copy when category is unknown
 *
 * Also morphs based on the user's choice:
 *   - "no" / "idk" → emphasis on the alert + reassurance.
 *   - "yes"        → emphasis on the silenced alert (no spam).
 */
function VatExplainerPanel({
  choice,
  category,
  activityLabel,
}: {
  choice: VatRegistrationChoice;
  category: VatCategory | null;
  activityLabel: string | null;
}) {
  const isYes = choice === "yes";
  const personalizedThreshold = category ? VAT_THRESHOLDS[category] : null;
  const formattedThreshold =
    personalizedThreshold !== null
      ? personalizedThreshold.toLocaleString("fr-FR")
      : null;
  return (
    <div
      className={`mt-5 rounded-2xl border p-5 ring-1 sm:p-6 ${
        isYes
          ? "border-sky-500/30 bg-sky-950/30 ring-sky-400/20"
          : "border-emerald-500/30 bg-emerald-950/[0.18] ring-emerald-400/20"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ring-1 ${
            isYes
              ? "bg-sky-500/15 text-sky-300 ring-sky-400/30"
              : "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30"
          }`}
        >
          {isYes ? (
            <CheckCircle size={20} aria-hidden />
          ) : (
            <InfoCircle size={20} aria-hidden />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <h3
            className={`text-base font-semibold ${
              isYes ? "text-sky-100" : "text-emerald-100"
            }`}
          >
            {isYes
              ? "Tu es déjà à la TVA"
              : "C’est quoi, le seuil de TVA ?"}
          </h3>

          {isYes ? (
            <p className="mt-2 text-sm leading-relaxed text-sky-100/90">
              Pas de souci — on n’affichera pas d’alerte de seuil sur ton
              dashboard. Tu peux changer ce réglage à tout moment depuis ta
              page <span className="font-medium">Mon compte</span>.
            </p>
          ) : (
            <>
              {formattedThreshold ? (
                <p className="mt-2 text-sm leading-relaxed text-emerald-50/95">
                  En micro-entreprise, tu es{" "}
                  <strong>exonéré de TVA</strong> jusqu’à un certain
                  chiffre d’affaires annuel.{" "}
                  {activityLabel ? (
                    <>
                      Dans ton cas (
                      <span className="font-medium text-emerald-100">
                        {activityLabel}
                      </span>
                      ),
                    </>
                  ) : (
                    <>Pour ton activité,</>
                  )}{" "}
                  ton seuil est de{" "}
                  <span className="font-mono font-semibold text-emerald-100">
                    {formattedThreshold} € HT
                  </span>{" "}
                  par an. Dès que tu le dépasses,{" "}
                  <strong>
                    tu dois facturer la TVA à tes clients dès le jour
                    suivant
                  </strong>
                  .
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed text-emerald-50/95">
                  En micro-entreprise, tu es <strong>exonéré de TVA</strong>{" "}
                  jusqu’à un certain chiffre d’affaires annuel
                  (<span className="font-mono">41 250 €</span> ou{" "}
                  <span className="font-mono">93 500 €</span> HT selon ton
                  activité). Dès que tu dépasses ce seuil,{" "}
                  <strong>
                    tu dois facturer la TVA à tes clients dès le jour
                    suivant
                  </strong>
                  .
                </p>
              )}

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-slate-950/40 p-4 ring-1 ring-white/10">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                    Avant le seuil
                  </p>
                  <p className="mt-1.5 text-sm text-slate-100">
                    Tu factures{" "}
                    <span className="font-mono font-semibold">1 000 €</span>{" "}
                    → ton client paie{" "}
                    <span className="font-mono font-semibold">1 000 €</span>
                    .
                  </p>
                </div>
                <div className="rounded-xl bg-slate-950/40 p-4 ring-1 ring-amber-400/20">
                  <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-amber-300">
                    Après le seuil
                  </p>
                  <p className="mt-1.5 text-sm text-slate-100">
                    Tu factures{" "}
                    <span className="font-mono font-semibold">1 000 €</span>{" "}
                    HT → ton client paie{" "}
                    <span className="font-mono font-semibold">1 200 €</span>{" "}
                    (TVA 20 %), tu reverses{" "}
                    <span className="font-mono font-semibold">200 €</span> à
                    l’État.
                  </p>
                </div>
              </div>

              <p className="mt-4 text-sm leading-relaxed text-emerald-50/95">
                <strong>SafeWithdraw surveille ton seuil pour toi</strong>{" "}
                et te prévient bien en amont — pas de mauvaise surprise.
              </p>

              {choice === "idk" && (
                <div className="mt-4 rounded-xl bg-slate-950/40 p-4 text-sm text-slate-200 ring-1 ring-white/10">
                  <span className="font-medium text-slate-100">
                    Comment savoir si tu es exonéré ?
                  </span>{" "}
                  Si tu n’as <em>jamais explicitement demandé</em> à passer
                  à la TVA et que tes factures n’affichent pas de numéro de
                  TVA intracommunautaire (FRxx…), alors tu es exonéré par
                  défaut. Tu peux cocher <strong>« Non, j’en suis
                  exonéré »</strong> au-dessus en toute confiance.
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
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
