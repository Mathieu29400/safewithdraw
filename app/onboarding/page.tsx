"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { PeriodType } from "@/lib/database.types";
import { ensureProfile } from "@/lib/ensure-profile";
import { supabase } from "@/lib/supabase";
import {
  CUSTOM_ACTIVITY_ID,
  URSSAF_ACTIVITIES,
  type UrssafActivity,
} from "@/lib/urssaf-activities";

type SelectedActivityId = UrssafActivity["id"] | typeof CUSTOM_ACTIVITY_ID;

export default function OnboardingPage() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  // Start with NO selection so the user makes a deliberate choice. The
  // primary CTA is disabled while `selectedId === null`, then enables as
  // soon as any card is picked.
  const [selectedId, setSelectedId] = useState<SelectedActivityId | null>(null);
  const [customName, setCustomName] = useState("");
  const [customRatePercent, setCustomRatePercent] = useState("");
  const [declarationFrequency, setDeclarationFrequency] =
    useState<PeriodType>("monthly");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const guard = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }

      const uid = sessionData.session.user.id;

      const { data: existing, error: fetchError } = await supabase
        .from("urssaf_profile")
        .select("user_id")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setChecking(false);
        return;
      }

      if (existing) {
        router.replace("/dashboard");
        return;
      }

      setUserId(uid);
      setUserEmail(sessionData.session.user.email ?? null);
      setChecking(false);
    };

    void guard();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!userId || !userEmail) {
      setError("Session expirée. Reconnectez-vous.");
      return;
    }

    let activityType: string;
    let urssafRate: number;

    if (selectedId === CUSTOM_ACTIVITY_ID) {
      const trimmedName = customName.trim();
      if (!trimmedName) {
        setError("Précisez le nom de votre activité.");
        return;
      }
      const parsed = parseRatePercent(customRatePercent);
      if (parsed === null) {
        setError("Saisissez un taux entre 0 et 100 (ex : 21.20).");
        return;
      }
      activityType = trimmedName;
      urssafRate = parsed;
    } else {
      const preset = URSSAF_ACTIVITIES.find((a) => a.id === selectedId);
      if (!preset) {
        setError("Activité inconnue.");
        return;
      }
      activityType = preset.name;
      urssafRate = preset.rate;
    }

    setSubmitting(true);

    // Make sure the profiles row exists before we insert into urssaf_profile.
    // The signup trigger usually handles this, but we don't trust it blindly:
    // older accounts and trigger races would otherwise fail the FK constraint.
    const ensured = await ensureProfile({ id: userId, email: userEmail });
    if (!ensured.ok) {
      setSubmitting(false);
      setError(ensured.error);
      return;
    }

    const { error: insertError } = await supabase.from("urssaf_profile").insert({
      user_id: userId,
      activity_type: activityType,
      urssaf_rate: urssafRate,
      declaration_frequency: declarationFrequency,
    });

    if (insertError) {
      setSubmitting(false);
      setError(insertError.message);
      return;
    }

    router.replace("/dashboard");
  };

  if (checking) {
    return (
      <main className="flex flex-1 items-center justify-center text-sm text-slate-500">
        Chargement…
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 items-center justify-center px-4 py-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_55%_65%_at_50%_0%,rgba(16,185,129,0.18),transparent_70%)]"
      />
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <span className="inline-block text-2xl font-semibold tracking-tight text-slate-100">
            SafeWithdraw
          </span>
        </div>

        <div className="card-soft animate-row-in relative rounded-2xl bg-slate-900/55 p-8 ring-1 ring-white/10 backdrop-blur-xl sm:p-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
          />
          <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-400/20">
            Étape 1
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            Quelle est ton activité&nbsp;?
          </h1>
          <p className="mt-3 text-base leading-relaxed text-slate-300">
            SafeWithdraw utilise ton activité pour calculer automatiquement ton
            taux URSSAF.
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            Ce choix permet de calculer ton montant retirable avec ton taux
            URSSAF.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-8" noValidate>
            <fieldset>
              <legend className="sr-only">Type d&apos;activité</legend>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                {URSSAF_ACTIVITIES.map((activity) => (
                  <ActivityCard
                    key={activity.id}
                    activity={activity}
                    selected={selectedId === activity.id}
                    onSelect={() => setSelectedId(activity.id)}
                  />
                ))}

                <div className="sm:col-span-2">
                  <CustomActivityCard
                    selected={selectedId === CUSTOM_ACTIVITY_ID}
                    onSelect={() => setSelectedId(CUSTOM_ACTIVITY_ID)}
                    name={customName}
                    onNameChange={setCustomName}
                    ratePercent={customRatePercent}
                    onRatePercentChange={setCustomRatePercent}
                  />
                </div>
              </div>
            </fieldset>

            <div className="border-t border-white/10 pt-8">
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-400/20">
                Étape 2
              </span>
              <h2 className="mt-4 text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
                À quelle fréquence déclares-tu ton URSSAF&nbsp;?
              </h2>
              <fieldset className="mt-6">
                <legend className="sr-only">Fréquence de déclaration URSSAF</legend>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
                  <FrequencyCard
                    value="monthly"
                    label="Mensuel"
                    description="Déclaration et cotisations chaque mois"
                    emoji="📅"
                    selected={declarationFrequency === "monthly"}
                    onSelect={() => setDeclarationFrequency("monthly")}
                  />
                  <FrequencyCard
                    value="quarterly"
                    label="Trimestriel"
                    description="Déclaration et cotisations par trimestre"
                    emoji="📆"
                    selected={declarationFrequency === "quarterly"}
                    onSelect={() => setDeclarationFrequency("quarterly")}
                  />
                </div>
              </fieldset>
            </div>

            <p className="text-xs text-slate-500">
              Les taux indiqués sont ceux du régime micro-entrepreneur. Si vous
              bénéficiez de l&apos;ACRE ou d&apos;une exonération, choisissez
              &laquo;&nbsp;Taux personnalisé&nbsp;&raquo; pour saisir votre
              propre taux.
            </p>

            {error && (
              <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                {error}
              </div>
            )}

            <div className="flex flex-col items-center pt-2">
              <button
                type="submit"
                disabled={submitting || !selectedId}
                className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-8 py-3 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(16,185,129,0.8)] transition-all duration-200 ease-out hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 motion-safe:hover:scale-[1.01] motion-safe:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none disabled:hover:scale-100"
              >
                {submitting ? "Enregistrement…" : "Continuer"}
              </button>
              <p className="mt-3 text-xs text-slate-500">
                Tu pourras modifier ce choix plus tard.
              </p>
            </div>
          </form>
        </div>
      </div>
    </main>
  );
}

/**
 * UI-only display map. Keys are the stable URSSAF activity IDs from the
 * source-of-truth catalog. We never alter the underlying `activity.name` or
 * `activity.rate` — only how they look in the picker.
 */
const ACTIVITY_VISUALS: Record<
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

function ActivityCard({
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

function CustomActivityCard({
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

function FrequencyCard({
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

function formatPercent(rate: number): string {
  return `${(rate * 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} %`;
}

/**
 * Parses a "21.20" or "21,20" percent string into a decimal rate (0.212).
 * Returns null on invalid input or out-of-range value.
 */
function parseRatePercent(input: string): number | null {
  const cleaned = input.trim().replace(",", ".");
  if (!cleaned) return null;
  const pct = Number(cleaned);
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  const rate = pct / 100;
  return Math.round(rate * 10000) / 10000;
}
