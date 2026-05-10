"use client";

import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
} from "@/lib/urssaf-activities";

type SelectedActivityId = string;

/**
 * /account — single-page hub for everything that the user owns about
 * their own account. Mounted under the same dark canvas as the
 * dashboard, but with a tighter container (max-w-3xl) so the form
 * sections breathe.
 *
 * Sections (top → bottom, in order of frequency of use):
 *   1. Compte         — email (read-only for now, see comment below)
 *   2. Mot de passe   — change password (no current-pw prompt; Supabase
 *                       requires a live session to call updateUser)
 *   3. Profil URSSAF  — activity + frequency + custom rate. Reuses the
 *                       same picker components as /onboarding.
 *   4. Mes données    — JSON export (RGPD article 20 — portabilité)
 *   5. Zone danger    — account deletion (RGPD article 17 — effacement)
 *
 * Email change is intentionally NOT exposed yet: Supabase's flow sends
 * a confirmation link to the new address, and we'd then need to keep
 * `profiles.email` in sync (used by the Paddle webhook for matching).
 * Doing that cleanly requires a DB trigger or a USER_UPDATED listener;
 * out of scope for this iteration. Until then the section displays the
 * current email and points to a contact mailbox.
 */
export default function AccountPage() {
  const router = useRouter();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      if (!data.session) {
        router.replace("/login");
        return;
      }
      setUserId(data.session.user.id);
      setEmail(data.session.user.email ?? null);
      setAccessToken(data.session.access_token);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading || !userId) {
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
            className="text-base font-semibold tracking-tight text-slate-100"
          >
            SafeWithdraw
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
          >
            ← Tableau de bord
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-10 px-4 py-12 sm:space-y-14 sm:px-6 sm:py-16">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
            Mon compte
          </h1>
          <p className="mt-2 text-sm text-slate-400">
            Gère ton compte, tes paramètres URSSAF et tes données personnelles.
          </p>
        </div>

        <AccountInfoSection email={email} />
        <PasswordSection />
        <UrssafSection userId={userId} />
        <ExportSection userId={userId} email={email} />
        <DangerZoneSection accessToken={accessToken} />
      </main>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Section shell                                                               */
/* -------------------------------------------------------------------------- */

function Section({
  title,
  description,
  children,
  tone = "default",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  tone?: "default" | "danger";
}) {
  const ring =
    tone === "danger"
      ? "ring-rose-500/30 bg-rose-950/[0.18]"
      : "ring-white/10 bg-slate-900/50";
  return (
    <section
      className={`card-soft rounded-2xl p-6 ring-1 backdrop-blur-xl sm:p-7 ${ring}`}
    >
      <h2
        className={`text-lg font-semibold tracking-tight ${
          tone === "danger" ? "text-rose-200" : "text-slate-100"
        }`}
      >
        {title}
      </h2>
      {description && (
        <p
          className={`mt-1.5 text-sm ${
            tone === "danger" ? "text-rose-300/80" : "text-slate-400"
          }`}
        >
          {description}
        </p>
      )}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* 1. Compte                                                                   */
/* -------------------------------------------------------------------------- */

function AccountInfoSection({ email }: { email: string | null }) {
  return (
    <Section title="Compte" description="Tes informations de connexion.">
      <div>
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
          Email
        </span>
        <p className="mt-1.5 break-all font-mono text-base text-slate-100">
          {email ?? "—"}
        </p>
        <p className="mt-3 text-xs text-slate-500">
          Pour modifier votre adresse email, écrivez-nous à{" "}
          <a
            href="mailto:hello@safewithdraw.app"
            className="text-emerald-400 hover:underline"
          >
            hello@safewithdraw.app
          </a>
          .
        </p>
      </div>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 2. Mot de passe                                                             */
/* -------------------------------------------------------------------------- */

function PasswordSection() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setDone(false);

    const validationError = validatePassword(password);
    if (validationError) {
      setError(validationError);
      return;
    }
    if (password !== confirm) {
      setError("Les mots de passe ne correspondent pas.");
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setPassword("");
    setConfirm("");
    setDone(true);
  };

  return (
    <Section
      title="Mot de passe"
      description="Choisissez un nouveau mot de passe pour votre compte."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div>
          <label
            htmlFor="account-new-password"
            className="block text-sm font-medium text-slate-300"
          >
            Nouveau mot de passe
          </label>
          <input
            id="account-new-password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            placeholder="••••••••"
          />
          <p className="mt-1.5 text-xs text-slate-500">
            Au moins 8 caractères, incluant une majuscule, une minuscule et un
            chiffre.
          </p>
        </div>

        <div>
          <label
            htmlFor="account-confirm-password"
            className="block text-sm font-medium text-slate-300"
          >
            Confirmer le mot de passe
          </label>
          <input
            id="account-confirm-password"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={`mt-1.5 block w-full rounded-lg border bg-white/5 px-3.5 py-2.5 text-slate-100 placeholder:text-slate-500 shadow-sm transition focus:outline-none focus:ring-2 ${
              confirm.length > 0 && password !== confirm
                ? "border-rose-500/50 focus:border-rose-500/50 focus:ring-rose-500/20"
                : confirm.length > 0 && password === confirm
                  ? "border-emerald-500/40 focus:border-emerald-500/50 focus:ring-emerald-500/30"
                  : "border-white/10 focus:border-emerald-500/50 focus:ring-emerald-500/30"
            }`}
            placeholder="Confirme ton mot de passe"
          />
          {confirm.length > 0 && password === confirm && (
            <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-500">
              <span aria-hidden>✓</span> Les mots de passe correspondent.
            </p>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        {done && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
            Mot de passe mis à jour.
          </div>
        )}

        <button
          type="submit"
          disabled={loading || password.length === 0}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Mise à jour…" : "Mettre à jour le mot de passe"}
        </button>
      </form>
    </Section>
  );
}

function validatePassword(password: string): string | null {
  if (password.length < 8)
    return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[a-z]/.test(password))
    return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[A-Z]/.test(password))
    return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/[0-9]/.test(password))
    return "Le mot de passe doit contenir au moins un chiffre.";
  return null;
}

/* -------------------------------------------------------------------------- */
/* 3. Profil URSSAF                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a stored urssaf_profile row to the activity-id used by the
 * picker UI. We match by `name` against the catalog: a saved value
 * that no longer matches any preset (because the user picked a custom
 * rate, or because the catalog evolved) automatically falls back to
 * the "Taux personnalisé" branch with the saved name + rate prefilled.
 */
function resolveSelectedActivityId(activityType: string): SelectedActivityId {
  const preset = URSSAF_ACTIVITIES.find((a) => a.name === activityType);
  return preset ? preset.id : CUSTOM_ACTIVITY_ID;
}

const RESET_CONFIRM_WORD = "RESET";

/**
 * Snapshot of every URSSAF field that can be edited. We freeze the
 * initial values right after the profile is loaded so we can:
 *   1. detect whether the user actually changed anything (avoid asking
 *      for confirmation on a no-op submit), and
 *   2. compare the saved state to the current form state in plain JS,
 *      without re-querying the DB on every keystroke.
 */
type UrssafFormSnapshot = {
  selectedId: SelectedActivityId;
  customName: string;
  customRatePercent: string;
  declarationFrequency: PeriodType;
};

function UrssafSection({ userId }: { userId: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [selectedId, setSelectedId] =
    useState<SelectedActivityId>(CUSTOM_ACTIVITY_ID);
  const [customName, setCustomName] = useState("");
  const [customRatePercent, setCustomRatePercent] = useState("");
  const [declarationFrequency, setDeclarationFrequency] =
    useState<PeriodType>("monthly");

  // Initial values captured after hydration. `null` while the
  // profile is loading; non-null once we know what's persisted.
  // Re-set after every successful save so subsequent edits compare
  // against the new baseline.
  const [initial, setInitial] = useState<UrssafFormSnapshot | null>(null);

  // Two-step submission: first click on "Enregistrer" toggles the
  // RESET-confirmation panel. Second click (with "RESET" typed) does
  // the destructive save. Cancelling closes the panel without saving.
  const [confirming, setConfirming] = useState(false);
  const [resetInput, setResetInput] = useState("");

  // Hydrate the form from the saved urssaf_profile row. `selectedId`
  // and `customName/Rate` are populated together so that switching
  // away from a custom row and coming back doesn't lose the values.
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("urssaf_profile")
      .select("activity_type, urssaf_rate, declaration_frequency")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          setError(fetchError.message);
          setLoaded(true);
          return;
        }
        if (!data) {
          // No row yet: capture the form's defaults as the baseline so
          // a fresh user doesn't get a destructive RESET prompt for
          // typing their first activity.
          setInitial({
            selectedId: CUSTOM_ACTIVITY_ID,
            customName: "",
            customRatePercent: "",
            declarationFrequency: "monthly",
          });
          setLoaded(true);
          return;
        }
        const id = resolveSelectedActivityId(data.activity_type);
        const freq = data.declaration_frequency;
        const isCustom = id === CUSTOM_ACTIVITY_ID;
        const customNameLoaded = isCustom ? data.activity_type : "";
        const customRateLoaded = isCustom
          ? (data.urssaf_rate * 100).toLocaleString("fr-FR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })
          : "";
        setSelectedId(id);
        setDeclarationFrequency(freq);
        setCustomName(customNameLoaded);
        setCustomRatePercent(customRateLoaded);
        setInitial({
          selectedId: id,
          customName: customNameLoaded,
          customRatePercent: customRateLoaded,
          declarationFrequency: freq,
        });
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const currentPresetRate = useMemo<number | null>(() => {
    if (selectedId === CUSTOM_ACTIVITY_ID) return null;
    return URSSAF_ACTIVITIES.find((a) => a.id === selectedId)?.rate ?? null;
  }, [selectedId]);

  /**
   * True only when the user changed at least one field. Compared
   * loosely on string keys so a custom rate that round-trips through
   * "21,20" / "21.20" / "21.2" doesn't read as a change.
   */
  const hasChanges = useMemo(() => {
    if (!initial) return false;
    if (initial.declarationFrequency !== declarationFrequency) return true;
    if (initial.selectedId !== selectedId) return true;
    if (selectedId === CUSTOM_ACTIVITY_ID) {
      if (initial.customName.trim() !== customName.trim()) return true;
      const a = parseRatePercent(initial.customRatePercent);
      const b = parseRatePercent(customRatePercent);
      if (a !== b) return true;
    }
    return false;
  }, [
    initial,
    selectedId,
    customName,
    customRatePercent,
    declarationFrequency,
  ]);

  /**
   * Validates the form and returns the values to persist, or an
   * error message. Pure — does not mutate state. Run before showing
   * the confirmation panel so an invalid form never gets a
   * destructive RESET prompt.
   */
  const validate = (): { activityType: string; urssafRate: number } | string => {
    if (selectedId === CUSTOM_ACTIVITY_ID) {
      const trimmedName = customName.trim();
      if (!trimmedName) {
        return "Précisez le nom de votre activité.";
      }
      const parsed = parseRatePercent(customRatePercent);
      if (parsed === null) {
        return "Saisissez un taux entre 0 et 100 (ex : 21.20).";
      }
      return { activityType: trimmedName, urssafRate: parsed };
    }
    const preset = URSSAF_ACTIVITIES.find((a) => a.id === selectedId);
    if (!preset) {
      return "Activité inconnue.";
    }
    return { activityType: preset.name, urssafRate: preset.rate };
  };

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setDone(false);

    if (!hasChanges) {
      setError("Aucun changement à enregistrer.");
      return;
    }

    const result = validate();
    if (typeof result === "string") {
      setError(result);
      return;
    }

    setConfirming(true);
    setResetInput("");
  };

  const handleCancelReset = () => {
    setConfirming(false);
    setResetInput("");
  };

  /**
   * Destructive save:
   *   1. Wipe transactions, expenses, recurring_expenses, periods —
   *      every per-period row that was tied to the OLD URSSAF setup.
   *   2. Upsert the new urssaf_profile.
   *   3. Insert a fresh "current" period so the dashboard lands on
   *      a clean slate (mois ou trimestre courant).
   *
   * Steps run sequentially because step 3 depends on step 2's
   * declaration_frequency. Steps 1's deletes are done in parallel:
   * RLS scopes them to the caller, so they can't bleed into another
   * user's data even if userId is wrong.
   */
  const handleConfirmReset = async () => {
    if (resetInput.trim() !== RESET_CONFIRM_WORD) return;
    const result = validate();
    if (typeof result === "string") {
      setError(result);
      return;
    }

    setSubmitting(true);
    setError(null);

    const wipes = await Promise.all([
      supabase.from("transactions").delete().eq("user_id", userId),
      supabase.from("expenses").delete().eq("user_id", userId),
      supabase.from("recurring_expenses").delete().eq("user_id", userId),
      supabase.from("periods").delete().eq("user_id", userId),
    ]);
    const wipeError = wipes.find((w) => w.error)?.error;
    if (wipeError) {
      setSubmitting(false);
      setError(wipeError.message);
      return;
    }

    const { error: upsertError } = await supabase
      .from("urssaf_profile")
      .upsert(
        {
          user_id: userId,
          activity_type: result.activityType,
          urssaf_rate: result.urssafRate,
          declaration_frequency: declarationFrequency,
        },
        { onConflict: "user_id" },
      );
    if (upsertError) {
      setSubmitting(false);
      setError(upsertError.message);
      return;
    }

    // Fresh starter period for the current month or quarter, mirroring
    // the logic in /onboarding so a "reset" account looks exactly like
    // a brand-new account from the dashboard's perspective.
    const now = new Date();
    const periodStartIso =
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
    const { error: periodError } = await supabase.from("periods").insert({
      user_id: userId,
      type: declarationFrequency,
      start_date: periodStartIso,
      current_ca: 0,
    });
    if (periodError) {
      setSubmitting(false);
      setError(periodError.message);
      return;
    }

    // Successful save — capture the new baseline so subsequent edits
    // re-trigger the confirmation flow only when they introduce real
    // changes.
    setInitial({
      selectedId,
      customName,
      customRatePercent,
      declarationFrequency,
    });
    setSubmitting(false);
    setConfirming(false);
    setResetInput("");
    setDone(true);
  };

  return (
    <Section
      title="Profil URSSAF"
      description="Modifie ton activité, ton taux URSSAF et ta fréquence de déclaration."
    >
      {!loaded ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-7" noValidate>
          <div>
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Activité
            </span>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
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

            {currentPresetRate !== null && (
              <p className="mt-3 text-xs text-slate-500">
                Taux URSSAF appliqué :{" "}
                <span className="font-mono font-semibold text-emerald-300">
                  {formatPercent(currentPresetRate)}
                </span>
              </p>
            )}
          </div>

          <div>
            <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Fréquence de déclaration
            </span>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
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
          </div>

          {error && (
            <div className="rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
              {error}
            </div>
          )}

          {done && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-950/50 px-3 py-2 text-sm text-emerald-200">
              Profil URSSAF mis à jour. Ton dashboard a été réinitialisé.
            </div>
          )}

          {/* Confirmation panel — replaces the save button while the
              user is in the "RESET" decision step. We render BOTH
              states behind the same form so submitting (Enter on the
              custom-rate input) routes through `handleSubmit`, which
              flips to the confirmation state. The panel itself uses
              type="button" buttons to avoid double-submitting. */}
          {confirming ? (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-950/30 p-5 ring-1 ring-amber-400/30">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-500/20 ring-1 ring-amber-400/40"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-amber-300"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold text-amber-100">
                    Réinitialisation du dashboard
                  </h3>
                  <p className="mt-1.5 text-sm text-amber-100/90">
                    Modifier ton profil URSSAF remet ton dashboard à zéro
                    pour repartir sur une base saine. Cela supprime
                    définitivement&nbsp;:
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-100/80">
                    <li>• Toutes tes entrées de chiffre d’affaires</li>
                    <li>• Tous tes retraits</li>
                    <li>• Toutes tes dépenses (ponctuelles et récurrentes)</li>
                    <li>• Toutes tes périodes URSSAF archivées</li>
                  </ul>
                  <p className="mt-3 text-xs text-amber-200/70">
                    Une nouvelle période sera créée pour le {""}
                    {declarationFrequency === "quarterly"
                      ? "trimestre"
                      : "mois"}{" "}
                    en cours.
                  </p>
                </div>
              </div>

              <div className="mt-5">
                <label
                  htmlFor="urssaf-reset-confirm"
                  className="block text-sm font-medium text-amber-100"
                >
                  Pour confirmer, tape{" "}
                  <span className="font-mono font-semibold">
                    {RESET_CONFIRM_WORD}
                  </span>{" "}
                  dans le champ ci-dessous.
                </label>
                <input
                  id="urssaf-reset-confirm"
                  type="text"
                  value={resetInput}
                  onChange={(e) => setResetInput(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 block w-full rounded-lg border border-amber-500/30 bg-amber-950/40 px-3.5 py-2.5 font-mono text-slate-100 placeholder:text-amber-300/40 shadow-sm transition focus:border-amber-500/50 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                  placeholder={RESET_CONFIRM_WORD}
                />
              </div>

              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-3">
                <button
                  type="button"
                  onClick={handleCancelReset}
                  disabled={submitting}
                  className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReset}
                  disabled={
                    submitting ||
                    resetInput.trim() !== RESET_CONFIRM_WORD
                  }
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting
                    ? "Réinitialisation…"
                    : "Confirmer et réinitialiser"}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="submit"
              disabled={submitting || !hasChanges}
              className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Enregistrer les modifications
            </button>
          )}
        </form>
      )}
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 4. Mes données — export RGPD                                                */
/* -------------------------------------------------------------------------- */

function ExportSection({
  userId,
  email,
}: {
  userId: string;
  email: string | null;
}) {
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = useCallback(async () => {
    setError(null);
    setExporting(true);
    try {
      // Pull every personal table in parallel. RLS keeps each query
      // scoped to the current user, so a bug here can never leak
      // someone else's data even if `userId` was wrong.
      const [
        { data: profile, error: profileErr },
        { data: urssaf, error: urssafErr },
        { data: transactions, error: transactionsErr },
        { data: expenses, error: expensesErr },
        { data: recurring, error: recurringErr },
        { data: periods, error: periodsErr },
      ] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase
          .from("urssaf_profile")
          .select("*")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("transactions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("expenses")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("recurring_expenses")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: true }),
        supabase
          .from("periods")
          .select("*")
          .eq("user_id", userId)
          .order("start_date", { ascending: true }),
      ]);

      const firstError =
        profileErr ||
        urssafErr ||
        transactionsErr ||
        expensesErr ||
        recurringErr ||
        periodsErr;
      if (firstError) {
        throw new Error(firstError.message);
      }

      const exportPayload = {
        exported_at: new Date().toISOString(),
        user: { id: userId, email },
        profile,
        urssaf_profile: urssaf,
        transactions: transactions ?? [],
        expenses: expenses ?? [],
        recurring_expenses: recurring ?? [],
        periods: periods ?? [],
      };

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `safewithdraw-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("[account/export] failed:", err);
      setError(err instanceof Error ? err.message : "Échec de l’export.");
    } finally {
      setExporting(false);
    }
  }, [userId, email]);

  return (
    <Section
      title="Mes données"
      description="Téléchargez une copie complète de vos données personnelles (RGPD)."
    >
      <p className="text-sm text-slate-300">
        L’export contient ton profil, ton paramétrage URSSAF, l’ensemble de
        tes transactions, dépenses, dépenses récurrentes et périodes
        archivées — au format JSON, lisible et portable.
      </p>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/30 bg-rose-950/50 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleExport}
        disabled={exporting}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-white/[0.06] px-5 py-2.5 text-sm font-medium text-slate-100 ring-1 ring-white/10 backdrop-blur transition hover:bg-white/10 hover:ring-white/20 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {exporting ? "Préparation…" : "Télécharger mes données (JSON)"}
      </button>
    </Section>
  );
}

/* -------------------------------------------------------------------------- */
/* 5. Zone danger — suppression de compte                                      */
/* -------------------------------------------------------------------------- */

const DELETE_CONFIRM_WORD = "SUPPRIMER";

function DangerZoneSection({ accessToken }: { accessToken: string | null }) {
  const router = useRouter();
  const [confirmInput, setConfirmInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const matches = confirmInput.trim() === DELETE_CONFIRM_WORD;

  const handleDelete = async () => {
    if (!matches) return;
    if (!accessToken) {
      setError("Session expirée. Reconnecte-toi.");
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        throw new Error(json.error || `Échec (${res.status})`);
      }
      // Drop the now-orphaned local session and bounce home.
      await supabase.auth.signOut().catch(() => undefined);
      router.replace("/");
    } catch (err) {
      console.error("[account/delete] client error:", err);
      setError(err instanceof Error ? err.message : "Échec de la suppression.");
      setSubmitting(false);
    }
  };

  return (
    <Section
      title="Supprimer mon compte"
      description="Cette action est irréversible. Toutes tes données seront effacées et l’abonnement Paddle (s’il existe) sera annulé."
      tone="danger"
    >
      <ul className="space-y-1.5 text-sm text-rose-100/90">
        <li>• Profil, transactions, dépenses, périodes — tout est supprimé.</li>
        <li>
          • Si tu as un abonnement Paddle actif, il est annulé immédiatement.
        </li>
        <li>• Tu ne pourras pas annuler la suppression après confirmation.</li>
      </ul>

      <div className="mt-6">
        <label
          htmlFor="account-delete-confirm"
          className="block text-sm font-medium text-rose-200"
        >
          Pour confirmer, tape{" "}
          <span className="font-mono font-semibold">{DELETE_CONFIRM_WORD}</span>
          {" "}dans le champ ci-dessous.
        </label>
        <input
          id="account-delete-confirm"
          type="text"
          value={confirmInput}
          onChange={(e) => setConfirmInput(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          className={`mt-2 block w-full rounded-lg border bg-rose-950/40 px-3.5 py-2.5 font-mono text-slate-100 placeholder:text-rose-300/40 shadow-sm transition focus:outline-none focus:ring-2 ${
            confirmInput.length > 0 && !matches
              ? "border-rose-500/60 focus:border-rose-500/60 focus:ring-rose-500/30"
              : "border-rose-500/30 focus:border-rose-500/50 focus:ring-rose-500/30"
          }`}
          placeholder={DELETE_CONFIRM_WORD}
        />
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-950/60 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handleDelete}
        disabled={!matches || submitting}
        className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-rose-500/90 px-5 py-2.5 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.6)] transition hover:bg-rose-500 focus:outline-none focus:ring-2 focus:ring-rose-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          <path d="M10 11v6" />
          <path d="M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
        {submitting ? "Suppression en cours…" : "Supprimer définitivement mon compte"}
      </button>
    </Section>
  );
}
