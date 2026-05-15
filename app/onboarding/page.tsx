"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ActivityCard,
  CustomActivityCard,
  FrequencyCard,
  parseRatePercent,
} from "@/app/_components/urssaf-picker";
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

    // Create the first period immediately so the dashboard starts on the
    // correct current month/quarter — avoids any timezone edge-case in the
    // hook's auto-create path (e.g. midnight UTC vs local time).
    const now = new Date();
    const periodStart =
      declarationFrequency === "quarterly"
        ? new Date(
            Date.UTC(
              now.getUTCFullYear(),
              Math.floor(now.getUTCMonth() / 3) * 3,
              1,
            ),
          ).toISOString()
        : new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
          ).toISOString();

    // Ignore errors here: if the insert races with the hook's auto-create
    // (e.g. the user opens a second tab), the hook will still find the row.
    await supabase.from("periods").insert({
      user_id: userId,
      type: declarationFrequency,
      start_date: periodStart,
      current_ca: 0,
    });

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
                    selected={declarationFrequency === "monthly"}
                    onSelect={() => setDeclarationFrequency("monthly")}
                  />
                  <FrequencyCard
                    value="quarterly"
                    label="Trimestriel"
                    description="Déclaration et cotisations par trimestre"
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

