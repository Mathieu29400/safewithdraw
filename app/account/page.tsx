"use client";

/**
 * Mon compte — change activité / taux URSSAF / fréquence de déclaration.
 *
 * Why this page exists
 *   A user may discover, weeks or months in, that they picked the wrong
 *   activity at signup (for example a "freelance" who actually fits the
 *   "services artisanaux" rate, or someone moving to a different
 *   specialty entirely). Without this page they'd be locked into the
 *   wrong rate forever, and every KPI on the dashboard would be silently
 *   wrong.
 *
 * Reset semantics — the destructive part
 *   Past dashboards were computed against the OLD rate / cadence. Keeping
 *   them after the user switches activities would mean mixing two
 *   different rate regimes in the same account, which is meaningless.
 *   When the user confirms a switch that materially changes their
 *   computation (rate OR declaration frequency), we therefore wipe:
 *     - every transaction
 *     - every expense (manual + recurring-template-derived)
 *     - every recurring expense template
 *     - every URSSAF period (current + archived)
 *   The `urssaf_profile` row is then UPDATED in place (we do not delete
 *   it: it still belongs to the same user), and a fresh first period
 *   is inserted so the dashboard re-opens on a clean slate.
 *
 *   Pure label changes (e.g. picking a custom activity with the SAME rate
 *   and SAME frequency, just a different name) skip the wipe entirely —
 *   the historical KPIs stay valid.
 *
 * Confirmation step
 *   We show an explicit "tous tes dashboards seront remis à zéro"
 *   warning AND require the user to type the word `RESET` before the
 *   destructive submit unlocks. Belt-and-suspenders against an
 *   accidental tap.
 */

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  ActivityCard,
  CustomActivityCard,
  FrequencyCard,
  formatPercent,
  parseRatePercent,
} from "@/app/_components/urssaf-picker";
import type { PeriodType } from "@/lib/database.types";
import { supabase } from "@/lib/supabase";
import {
  CUSTOM_ACTIVITY_ID,
  URSSAF_ACTIVITIES,
  type UrssafActivity,
} from "@/lib/urssaf-activities";

type SelectedActivityId = UrssafActivity["id"] | typeof CUSTOM_ACTIVITY_ID;

type CurrentProfile = {
  activityType: string;
  urssafRate: number;
  declarationFrequency: PeriodType;
};

const RESET_KEYWORD = "RESET";

export default function AccountPage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [current, setCurrent] = useState<CurrentProfile | null>(null);

  const [selectedId, setSelectedId] = useState<SelectedActivityId | null>(null);
  const [customName, setCustomName] = useState("");
  const [customRatePercent, setCustomRatePercent] = useState("");
  const [declarationFrequency, setDeclarationFrequency] =
    useState<PeriodType>("monthly");
  const [resetTyped, setResetTyped] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Resolve session + load the existing urssaf_profile so the form
  // pre-selects the user's current choice. Anyone without a profile is
  // bounced to /onboarding (they should never reach /account before
  // completing the first-time setup).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!sessionData.session) {
        router.replace("/login");
        return;
      }
      const uid = sessionData.session.user.id;
      const userEmail = sessionData.session.user.email ?? null;

      const { data, error: fetchError } = await supabase
        .from("urssaf_profile")
        .select("activity_type, urssaf_rate, declaration_frequency")
        .eq("user_id", uid)
        .maybeSingle();
      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setChecking(false);
        return;
      }
      if (!data) {
        router.replace("/onboarding");
        return;
      }

      setUserId(uid);
      setEmail(userEmail);
      const cur: CurrentProfile = {
        activityType: data.activity_type,
        urssafRate: Number(data.urssaf_rate),
        declarationFrequency: data.declaration_frequency as PeriodType,
      };
      setCurrent(cur);

      // Pre-select whichever preset matches today's rate AND name. If
      // none match (= the user is on a custom rate), pre-select the
      // custom card with the existing values pre-filled so they can
      // tweak just one field.
      const matchingPreset = URSSAF_ACTIVITIES.find(
        (a) =>
          a.name === cur.activityType &&
          Math.abs(a.rate - cur.urssafRate) < 1e-6,
      );
      if (matchingPreset) {
        setSelectedId(matchingPreset.id);
      } else {
        setSelectedId(CUSTOM_ACTIVITY_ID);
        setCustomName(cur.activityType);
        setCustomRatePercent((cur.urssafRate * 100).toFixed(2));
      }
      setDeclarationFrequency(cur.declarationFrequency);
      setChecking(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // Resolve the form into the exact (activity_type, urssaf_rate) pair
  // we'd persist if the user clicked "Enregistrer" right now. Returns
  // `null` if the form is incomplete or invalid.
  const pendingChoice = useMemo<{
    activityType: string;
    urssafRate: number;
  } | null>(() => {
    if (selectedId === null) return null;
    if (selectedId === CUSTOM_ACTIVITY_ID) {
      const trimmedName = customName.trim();
      if (!trimmedName) return null;
      const rate = parseRatePercent(customRatePercent);
      if (rate === null) return null;
      return { activityType: trimmedName, urssafRate: rate };
    }
    const preset = URSSAF_ACTIVITIES.find((a) => a.id === selectedId);
    if (!preset) return null;
    return { activityType: preset.name, urssafRate: preset.rate };
  }, [selectedId, customName, customRatePercent]);

  // "Material change" = anything that affects KPI math: rate or
  // declaration frequency. A pure label change (same rate, same
  // frequency, different `activity_type` text) is non-destructive
  // and skips the wipe entirely.
  const willResetData =
    !!pendingChoice &&
    !!current &&
    (Math.abs(pendingChoice.urssafRate - current.urssafRate) > 1e-6 ||
      declarationFrequency !== current.declarationFrequency);

  // Has the user actually changed something at all? If not, the
  // submit button stays disabled (no point in a no-op write).
  const hasAnyChange =
    !!pendingChoice &&
    !!current &&
    (pendingChoice.activityType !== current.activityType ||
      Math.abs(pendingChoice.urssafRate - current.urssafRate) > 1e-6 ||
      declarationFrequency !== current.declarationFrequency);

  const resetUnlocked =
    !willResetData || resetTyped.trim().toUpperCase() === RESET_KEYWORD;

  const canSubmit =
    !!userId && !!pendingChoice && hasAnyChange && resetUnlocked && !submitting;

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    if (!userId || !pendingChoice) {
      setError("Choisis une activité et un taux valides.");
      return;
    }
    if (!hasAnyChange) {
      setError("Rien n’a changé.");
      return;
    }
    if (!resetUnlocked) {
      setError(`Tape ${RESET_KEYWORD} pour confirmer la remise à zéro.`);
      return;
    }

    setSubmitting(true);

    if (willResetData) {
      // Order matters because of FK cascades:
      //   1. recurring_expenses → cascades dependent expenses
      //   2. expenses           → catches the manually-added ones
      //   3. transactions       → independent
      //   4. periods            → independent
      // Anything fails → bail out and show the error so the user
      // can retry; we don't want to half-wipe and update the rate.
      const wipes = [
        await supabase
          .from("recurring_expenses")
          .delete()
          .eq("user_id", userId),
        await supabase.from("expenses").delete().eq("user_id", userId),
        await supabase.from("transactions").delete().eq("user_id", userId),
        await supabase.from("periods").delete().eq("user_id", userId),
      ];
      const wipeError = wipes.find((r) => r.error)?.error;
      if (wipeError) {
        setSubmitting(false);
        setError(`Erreur lors de la remise à zéro : ${wipeError.message}`);
        return;
      }
    }

    const { error: updateError } = await supabase
      .from("urssaf_profile")
      .update({
        activity_type: pendingChoice.activityType,
        urssaf_rate: pendingChoice.urssafRate,
        declaration_frequency: declarationFrequency,
      })
      .eq("user_id", userId);

    if (updateError) {
      setSubmitting(false);
      setError(updateError.message);
      return;
    }

    if (willResetData) {
      // Open a brand-new first period so the dashboard re-opens on
      // the current calendar bucket of the freshly-chosen frequency.
      // Errors are tolerated: the dashboard's auto-create path will
      // recover on next load.
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
      await supabase.from("periods").insert({
        user_id: userId,
        type: declarationFrequency,
        start_date: periodStart,
        current_ca: 0,
      });
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
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4 sm:px-6">
          <Link
            href="/dashboard"
            className="text-base font-semibold tracking-tight text-slate-100 transition hover:text-white"
          >
            SafeWithdraw
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            ← Retour au dashboard
          </Link>
        </div>
      </header>

      <main className="relative flex flex-1 items-start justify-center px-4 py-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-48 bg-[radial-gradient(ellipse_55%_65%_at_50%_0%,rgba(16,185,129,0.18),transparent_70%)]"
        />
        <div className="w-full max-w-2xl">
          <div className="mb-6">
            <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
              Mon compte
            </h1>
            {email && (
              <p className="mt-1 text-sm text-slate-400">{email}</p>
            )}
          </div>

          {current && (
            <div className="mb-6 rounded-2xl bg-slate-900/55 p-5 ring-1 ring-white/10 backdrop-blur-xl">
              <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Activité actuelle
              </span>
              <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <span className="text-base font-medium text-slate-100">
                  {current.activityType}
                </span>
                <span className="font-mono text-sm font-semibold text-emerald-300">
                  {formatPercent(current.urssafRate)} ·{" "}
                  {current.declarationFrequency === "quarterly"
                    ? "trimestriel"
                    : "mensuel"}
                </span>
              </div>
            </div>
          )}

          <div className="card-soft animate-row-in relative rounded-2xl bg-slate-900/55 p-6 ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"
            />
            <h2 className="text-xl font-semibold tracking-tight text-slate-50 sm:text-2xl">
              Changer d&apos;activité ou de taux
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-400">
              Choisis ta nouvelle activité ci-dessous. Si le taux ou la
              fréquence change, ton historique sera{" "}
              <span className="font-medium text-amber-300">
                remis à zéro
              </span>{" "}
              pour repartir sur des KPI cohérents.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-8" noValidate>
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

              <fieldset className="border-t border-white/10 pt-6">
                <legend className="text-sm font-medium text-slate-200">
                  Fréquence de déclaration URSSAF
                </legend>
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5">
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

              {willResetData && (
                <div
                  role="alert"
                  className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-950/40 p-4 text-sm text-amber-100"
                >
                  <p className="flex items-start gap-2 font-medium leading-relaxed">
                    <span aria-hidden className="text-base leading-none">
                      ⚠️
                    </span>
                    <span>
                      Vigilance : changer de{" "}
                      <span className="font-semibold">taux</span> ou de{" "}
                      <span className="font-semibold">fréquence</span> remet
                      à zéro l&apos;ensemble de tes dashboards
                      (transactions, dépenses pro, dépenses récurrentes et
                      historique des périodes URSSAF).
                    </span>
                  </p>
                  <p className="text-xs leading-relaxed text-amber-200/90">
                    C&apos;est volontaire : tes anciens calculs étaient
                    basés sur l&apos;ancien taux, les mélanger fausserait
                    les KPI. Tape <code className="rounded bg-black/30 px-1 py-0.5 font-mono text-amber-200">{RESET_KEYWORD}</code>{" "}
                    ci-dessous pour confirmer.
                  </p>
                  <input
                    type="text"
                    value={resetTyped}
                    onChange={(e) => setResetTyped(e.target.value)}
                    placeholder={RESET_KEYWORD}
                    autoComplete="off"
                    spellCheck={false}
                    className="block w-full rounded-lg border border-amber-500/40 bg-amber-950/60 px-3 py-2 text-sm font-mono text-amber-100 placeholder:text-amber-200/30 shadow-sm focus:border-amber-400/60 focus:outline-none focus:ring-2 focus:ring-amber-400/30"
                  />
                </div>
              )}

              {error && (
                <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
                  {error}
                </div>
              )}

              <div className="flex flex-col-reverse items-stretch gap-3 pt-2 sm:flex-row sm:items-center sm:justify-end">
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-300 transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
                >
                  Annuler
                </Link>
                <button
                  type="submit"
                  disabled={!canSubmit}
                  className={`inline-flex items-center justify-center rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50 ${
                    willResetData
                      ? "bg-amber-500 shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] hover:bg-amber-400 focus:ring-amber-500/40"
                      : "bg-emerald-500 shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] hover:bg-emerald-400 focus:ring-emerald-500/40"
                  }`}
                >
                  {submitting
                    ? "Enregistrement…"
                    : willResetData
                      ? "Confirmer & remettre à zéro"
                      : "Enregistrer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
