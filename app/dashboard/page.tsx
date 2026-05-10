"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  formatDaysLeft,
  getBillingStatus,
  hasDashboardAccess,
  type BillingStatus,
} from "@/lib/billing";
import { supabase } from "@/lib/supabase";
import type {
  Expense,
  PeriodType,
  RecurringExpense,
  Transaction,
} from "@/lib/database.types";
import type { PeriodRange } from "@/lib/use-safe-withdraw";
import { useCurrentPeriod } from "@/lib/use-current-period";
import {
  type PreviousPeriodSummary,
  usePreviousPeriods,
} from "@/lib/use-previous-periods";

import { AddExpenseDialog } from "./add-expense-dialog";
import { AddRecurringExpenseDialog } from "./add-recurring-expense-dialog";
import {
  AddTransactionDialog,
  type TransactionType,
} from "./add-transaction-dialog";
import { CashflowChart } from "./cashflow-chart";
import { NewPeriodDialog } from "./new-period-dialog";
import { SafeWithdrawCard } from "./safe-withdraw-card";

type HistoryTransaction = Pick<
  Transaction,
  "id" | "type" | "amount" | "created_at"
>;
type HistoryExpense = Pick<
  Expense,
  "id" | "amount" | "description" | "created_at" | "recurring_expense_id"
>;
type HistoryRecurringExpense = Pick<
  RecurringExpense,
  "id" | "amount" | "description" | "vat_rate"
>;

/**
 * Navigation is split into TWO independent pieces of state, on purpose.
 * The spec calls for "Depuis le début" to live OUTSIDE the URSSAF period
 * dropdown, and toggling between the two surfaces should not destroy the
 * user's last period choice.
 *
 *   - `selectedPeriod` — what the URSSAF dropdown is pointing at. Either
 *     "current" (the live period) or one specific archived period. Always
 *     defined; carries the boundary data we need to filter the dashboard.
 *
 *   - `view` — which surface is being shown right now: "period" (the
 *     selected URSSAF period) or "all-time" ("Depuis le début"). Toggling
 *     to "all-time" preserves `selectedPeriod` so that a single click on
 *     the dropdown puts the user back exactly where they were.
 *
 * Editability is derived: only the LIVE current period is editable.
 * Archived periods and the all-time view are strictly read-only.
 */
type SelectedPeriod =
  | { kind: "current" }
  | {
      kind: "archived";
      periodId: string;
      startDate: string;
      endDate: string;
      type: PeriodType;
    };

const SELECTED_CURRENT: SelectedPeriod = { kind: "current" };

/**
 * Inline style applied to every `<option>` of the period dropdown.
 *
 * Native <option>s are painted by the OS, so Tailwind classes are
 * ignored — without explicit colours, Windows + Chromium browsers
 * draw the popup with the OS default (white on white in light theme),
 * which made the list appear blank until each row was hovered. The OS
 * picker DOES honour inline `background` / `color`, so we hardcode
 * slate-950 + slate-200 to match the rest of the dashboard's dark
 * canvas.
 */
const DROPDOWN_OPTION_STYLE: React.CSSProperties = {
  background: "#0f172a",
  color: "#e2e8f0",
};

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // Billing/access state. `null` while loading. The access guard runs
  // off this value: anything that isn't trialing-with-time-left or a
  // paying customer gets redirected to /billing — checkout is the only
  // path back in (per spec).
  const [billingStatus, setBillingStatus] = useState<BillingStatus | null>(
    null,
  );

  // `advanced_mode` is read from profiles. `null` while loading so the
  // SafeWithdrawCard stays in skeleton mode and we don't flash the simple
  // KPI for a user who has expenses tracked.
  const [advancedMode, setAdvancedMode] = useState<boolean | null>(null);

  const [dialogType, setDialogType] = useState<TransactionType | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [recurringExpenseDialogOpen, setRecurringExpenseDialogOpen] =
    useState(false);
  const [newPeriodDialogOpen, setNewPeriodDialogOpen] = useState(false);

  // Two-piece nav state — see `SelectedPeriod` doc above. Default is the
  // live current period in period-view: that's the user's actionable home
  // base on every load.
  const [selectedPeriod, setSelectedPeriod] =
    useState<SelectedPeriod>(SELECTED_CURRENT);
  const [view, setView] = useState<"period" | "all-time">("period");

  // Declaration frequency from urssaf_profile — needed when inserting new periods.
  const [declarationFrequency, setDeclarationFrequency] =
    useState<PeriodType>("monthly");

  // Current URSSAF period: the most recent row in `periods` for this user.
  // `undefined` while loading so SafeWithdrawCard stays in skeleton mode and
  // we never flash all-time data before the period is known. We pull the
  // period's `type` too so the dropdown label can render frequency-aware
  // ("mai 2026" vs "T2 2026").
  const currentPeriodState = useCurrentPeriod(userId);
  const periodStart =
    currentPeriodState.status === "ready"
      ? currentPeriodState.periodStart
      : undefined;
  const currentPeriodType: PeriodType =
    currentPeriodState.status === "ready"
      ? currentPeriodState.periodType
      : declarationFrequency;

  // Archived periods (everything older than the latest one). Drives both
  // the secondary "Anciennes périodes URSSAF" section AND the period
  // dropdown's archive entries. Same realtime triggers as the live KPI
  // so it updates immediately after a "Nouvelle période".
  const previousPeriodsState = usePreviousPeriods(userId, {
    advancedMode: advancedMode ?? undefined,
  });
  const archivedPeriods =
    previousPeriodsState.status === "ready"
      ? previousPeriodsState.periods
      : [];

  // Resolve the navigation state into the props the Card / Chart / lists
  // actually need. We do this in ONE place so a wrong combination (e.g.
  // "all-time" + a stray period range) is impossible to express downstream.
  //
  // `isCurrentPeriod` is what gates the OverdrawAlert: an "évite tout
  // nouveau retrait" warning would be misleading on an archived period
  // (closed) or in the all-time view (informational).
  const isCurrentPeriod =
    view === "period" && selectedPeriod.kind === "current";
  const cardMode: "period" | "all-time" = view;

  // Subtitle shown just below the hero label — "mois de mai 2026" or
  // "trimestre avr. → juin 2026". Undefined in all-time view.
  const cardPeriodSubtitle = useMemo<string | undefined>(() => {
    if (view !== "period") return undefined;
    if (selectedPeriod.kind === "current") {
      if (!periodStart || !currentPeriodType) return undefined;
      const label = periodLabel(periodStart, undefined, currentPeriodType, "standalone");
      return currentPeriodType === "quarterly"
        ? `Trimestre ${label}`
        : `Mois de ${label}`;
    }
    const label = periodLabel(
      selectedPeriod.startDate,
      selectedPeriod.endDate,
      selectedPeriod.type,
      "standalone",
    );
    return selectedPeriod.type === "quarterly"
      ? `Trimestre ${label}`
      : `Mois de ${label}`;
  }, [view, selectedPeriod, periodStart, currentPeriodType]);

  const cardPeriod: PeriodRange | undefined = useMemo(() => {
    if (view === "all-time") return undefined;
    if (selectedPeriod.kind === "current") {
      return periodStart ? { start: periodStart } : undefined;
    }
    return { start: selectedPeriod.startDate, end: selectedPeriod.endDate };
  }, [view, selectedPeriod, periodStart]);

  const chartEmptyVariant: "current-period" | "all-time" =
    view === "all-time" ? "all-time" : "current-period";

  // Default date the Add dialogs should pre-fill.
  //
  // We deliberately keep this `undefined` in every nav state — current
  // period, archived period, or all-time — so the dialog always falls
  // back to TODAY. Earlier versions tried to be clever and pre-filled
  // the last day of an archived period when one was being viewed
  // ("quick-add inside that period"). In practice users found the
  // jump-to-end-of-month behaviour surprising: most of the time when
  // they click "Ajouter du chiffre d'affaires" they want to log
  // something that just happened. Backfilling old data is still one
  // click away via the date picker — but it is no longer the default.
  const dialogDefaultDate: string | undefined = undefined;

  const [history, setHistory] = useState<HistoryTransaction[] | null>(null);
  const [expenses, setExpenses] = useState<HistoryExpense[] | null>(null);
  const [recurringExpenses, setRecurringExpenses] = useState<
    HistoryRecurringExpense[] | null
  >(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expensesTick, setExpensesTick] = useState(0);
  const [recurringExpensesTick, setRecurringExpensesTick] = useState(0);

  // SafeWithdraw is computed period-scoped or all-time depending on the
  // dropdown selection above ("Période actuelle" / "Depuis le début" /
  // an archived period). All three modes share the same hook
  // (`useSafeWithdraw`) — the only difference is which `period` (if any)
  // we pass. See `cardPeriod` derivation above.

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setEmail(data.user?.email ?? null);
      setUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Read profile flags (advanced mode + billing) in a single round-trip.
  //
  // Default to a permissive state on read errors so a hiccup never locks
  // the user out of the dashboard. The access rule then runs off the
  // resolved `billingStatus`: trial-expired / inactive users are
  // redirected to /billing — that's the only place a checkout can be
  // opened (per spec).
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("advanced_mode, trial_end, subscription_status")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setAdvancedMode(data?.advanced_mode ?? false);
        if (data) {
          const status = getBillingStatus({
            trial_end: data.trial_end,
            subscription_status: data.subscription_status,
          });
          setBillingStatus(status);
          if (!hasDashboardAccess(status)) {
            router.replace("/billing");
          }
        } else {
          setBillingStatus({ kind: "inactive" });
          router.replace("/billing");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, router]);

  // Read the user's URSSAF declaration frequency so we can tag new periods
  // with the correct type when the user resets their period.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("urssaf_profile")
      .select("declaration_frequency")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled && data?.declaration_frequency) {
          setDeclarationFrequency(data.declaration_frequency as PeriodType);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Load the FULL transaction history whenever the user changes or refresh
  // is bumped. No `.limit()` — historical entries (past months / years) the
  // user backfilled must be visible. The list is the user's storage view;
  // it is intentionally not scoped by any period.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("transactions")
      .select("id, type, amount, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setHistory(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, refreshTick]);

  // Load the expenses list — only relevant when advanced mode is on. We
  // skip the fetch entirely otherwise to keep the simple-mode page lean.
  // No "clear on toggle-off": the section isn't rendered when advanced
  // mode is off, so any stale list in state is simply invisible.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode !== true) return;
    let cancelled = false;
    supabase
      .from("expenses")
      .select("id, amount, description, created_at, recurring_expense_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setExpenses(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, advancedMode, expensesTick]);

  // Recurring expense templates — only relevant in advanced mode (same
  // gating as one-off expenses). The DB trigger
  // `materialize_recurring_expenses` does the heavy lifting on the next
  // period creation, so the UI here is purely a list + add/delete view.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode !== true) return;
    let cancelled = false;
    supabase
      .from("recurring_expenses")
      .select("id, amount, description, vat_rate")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setRecurringExpenses(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, advancedMode, recurringExpensesTick]);

  const refreshHistory = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const refreshExpenses = useCallback(() => {
    setExpensesTick((t) => t + 1);
  }, []);

  const refreshRecurringExpenses = useCallback(() => {
    setRecurringExpensesTick((t) => t + 1);
  }, []);

  // Row-level delete handlers. The realtime subscriptions on
  // `transactions` / `expenses` take it from there: every KPI, the
  // chart, and the bucketed archive recompute as soon as the row
  // disappears. We don't optimistically patch local state — letting
  // the realtime payload drive the refetch keeps a single source of
  // truth and avoids drift between tabs.
  const handleDeleteTransaction = useCallback(
    async (id: string) => {
      if (!userId) return;
      await supabase.from("transactions").delete().eq("id", id);
    },
    [userId],
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!userId) return;
      await supabase.from("expenses").delete().eq("id", id);
    },
    [userId],
  );

  // "Pour tous les mois" path — deletes the recurring template, which
  // CASCADEs to every materialized `expenses` row that was produced
  // from it (past, present, future). Future "Nouvelle période URSSAF"
  // clicks won't re-create it either, since the template is gone.
  const handleDeleteRecurringSeriesAll = useCallback(
    async (id: string) => {
      if (!userId) return;
      await supabase.from("recurring_expenses").delete().eq("id", id);
    },
    [userId],
  );

  // "À partir de ce mois-ci" path — un-links the materialized rows
  // strictly BEFORE the current calendar month (they survive as
  // plain one-off expenses, frozen in the user's archive), then
  // deletes the template. CASCADE removes the still-linked rows,
  // i.e. the current calendar month + every future occurrence.
  //
  // The cutoff is the FIRST DAY OF THIS CALENDAR MONTH UTC, NOT the
  // live URSSAF period start. Two reasons:
  //   1. The user thinks in calendar terms ("ce mois" = mai 2026),
  //      not URSSAF cadence terms (which can drift to a future
  //      period after a few "Nouvelle période URSSAF" clicks).
  //   2. Without this, deleting "à partir de ce mois" while the
  //      live period is e.g. sept 2026 would only nuke the sept row
  //      and leave the current calendar month's row untouched, so
  //      the "Dépenses pro" KPI on the user's current view would
  //      not budge — the bug they reported.
  const handleDeleteRecurringSeriesFromThisMonth = useCallback(
    async (id: string) => {
      if (!userId) return;
      const cutoff = startOfCurrentMonthUtc();
      await supabase
        .from("expenses")
        .update({ recurring_expense_id: null })
        .eq("user_id", userId)
        .eq("recurring_expense_id", id)
        .lt("created_at", cutoff);
      await supabase.from("recurring_expenses").delete().eq("id", id);
    },
    [userId],
  );

  // "À partir du mois prochain" path — keeps PAST rows AND the
  // current calendar month's row (they get un-linked from the
  // template), then deletes the template. CASCADE only removes
  // rows dated on or after the first day of NEXT calendar month,
  // i.e. future occurrences.
  //
  // Net effect: the user keeps everything they've already paid for,
  // including the current month, and the recurrence simply stops
  // appearing on subsequent periods.
  const handleDeleteRecurringSeriesFromNextMonth = useCallback(
    async (id: string) => {
      if (!userId) return;
      const cutoff = startOfNextMonthUtc();
      await supabase
        .from("expenses")
        .update({ recurring_expense_id: null })
        .eq("user_id", userId)
        .eq("recurring_expense_id", id)
        .lt("created_at", cutoff);
      await supabase.from("recurring_expenses").delete().eq("id", id);
    },
    [userId],
  );

  // "Nouvelle période URSSAF" handler. AWAITED so the dialog can show
  // a loading state and surface RLS / network errors to the user
  // instead of silently swallowing them (which previously made the
  // button feel like a no-op when something failed).
  //
  // Throws on error so the dialog's catch branch can render the
  // message inline.
  const handleNewPeriod = useCallback(async () => {
    if (!userId) {
      throw new Error("Utilisateur non connecté");
    }
    if (!periodStart) {
      throw new Error("Période actuelle non encore chargée");
    }
    const newStartDate = nextPeriodStartFromLatest(
      periodStart,
      declarationFrequency,
    );
    const { error } = await supabase.from("periods").insert({
      user_id: userId,
      type: declarationFrequency,
      start_date: newStartDate,
      current_ca: 0,
    });
    if (error) {
      throw new Error(error.message);
    }
    // Snap BOTH nav pieces back to the (new) live current period. The
    // realtime subscription on `periods` re-resolves `periodStart` to
    // the freshly inserted row, and every period-scoped hook
    // recomputes against the new boundary.
    setSelectedPeriod(SELECTED_CURRENT);
    setView("period");
  }, [userId, periodStart, declarationFrequency]);

  // Lists scoped to the active view. We always fetch the user's full
  // history (so realtime / backfill work uniformly) and slice it here:
  //
  //   - "period" view → keep rows where created_at ∈ [start, end)
  //   - "all-time"    → keep everything
  //
  // Returning the original array reference when no filtering is needed
  // keeps memo identity stable for downstream components.
  const filteredHistory = useMemo<HistoryTransaction[] | null>(() => {
    if (history === null) return null;
    if (view === "all-time") return history;
    if (!cardPeriod) return null; // period not resolved yet
    const startMs = new Date(cardPeriod.start).getTime();
    const endMs = cardPeriod.end
      ? new Date(cardPeriod.end).getTime()
      : Number.POSITIVE_INFINITY;
    return history.filter((t) => {
      const ts = new Date(t.created_at).getTime();
      return ts >= startMs && ts < endMs;
    });
  }, [history, view, cardPeriod]);

  // Sum of every recurring template's monthly TTC amount. This is the
  // user's locked-in monthly commitment, surfaced as the amber sub-line
  // on the "Dépenses pro" KPI tile so it's visible at a glance even
  // when the user is browsing a period that has none of those rows
  // materialized yet (e.g. an old period from before the template
  // existed). The value is independent of period scoping on purpose.
  const recurringMonthlyTotal = useMemo<number | undefined>(() => {
    if (!recurringExpenses) return undefined;
    return recurringExpenses.reduce(
      (sum, e) => sum + Number(e.amount),
      0,
    );
  }, [recurringExpenses]);

  const filteredExpenses = useMemo<HistoryExpense[] | null>(() => {
    if (expenses === null) return null;
    if (view === "all-time") return expenses;
    if (!cardPeriod) return null;
    const startMs = new Date(cardPeriod.start).getTime();
    const endMs = cardPeriod.end
      ? new Date(cardPeriod.end).getTime()
      : Number.POSITIVE_INFINITY;
    return expenses.filter((e) => {
      const ts = new Date(e.created_at).getTime();
      return ts >= startMs && ts < endMs;
    });
  }, [expenses, view, cardPeriod]);

  // Keep the history live across tabs / devices: any insert/update/delete
  // on this user's transactions bumps the tick and triggers a refetch.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`history:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => setRefreshTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Same idea for expenses — only subscribed when advanced mode is on.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode !== true) return;
    const channel = supabase
      .channel(`expenses-list:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `user_id=eq.${userId}`,
        },
        () => setExpensesTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, advancedMode]);

  // Recurring expense templates — same advanced-mode gating.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode !== true) return;
    const channel = supabase
      .channel(`recurring-expenses:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "recurring_expenses",
          filter: `user_id=eq.${userId}`,
        },
        () => setRecurringExpensesTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, advancedMode]);

  const handleToggleAdvancedMode = useCallback(
    async (next: boolean) => {
      if (!userId) return;
      setAdvancedMode(next);
      const { error } = await supabase
        .from("profiles")
        .update({ advanced_mode: next })
        .eq("id", userId);
      if (error) {
        // Revert optimistic update on failure so the UI stays honest.
        setAdvancedMode(!next);
      }
    },
    [userId],
  );

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    router.replace("/login");
  };

  // Trial badge label — only shown while the user is on the free trial.
  // Active subscribers see no time-pressure copy; expired users were
  // already redirected to /billing by the guard above.
  const trialBadge =
    billingStatus?.kind === "trialing"
      ? `Essai gratuit : ${formatDaysLeft(billingStatus.daysLeft)}`
      : null;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-base font-semibold tracking-tight text-slate-100">
            SafeWithdraw
          </span>
          <div className="flex items-center gap-2 sm:gap-4">
            {email && (
              <span className="hidden text-sm text-slate-500 sm:inline">
                {email}
              </span>
            )}
            <Link
              href="/account"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              Mon compte
            </Link>
            <Link
              href="/billing"
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-300 ring-1 ring-white/10 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              Abonnement
            </Link>
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {signingOut ? "Déconnexion…" : "Se déconnecter"}
            </button>
          </div>
        </div>
        {trialBadge && (
          <div className="mx-auto w-full max-w-5xl px-4 pb-3 sm:px-6">
            <Link
              href="/billing"
              className="group flex items-center justify-between gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-2.5 text-sm transition hover:border-emerald-400/40 hover:bg-emerald-500/[0.12] focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
            >
              <span className="flex items-center gap-2 font-medium text-emerald-200">
                <span aria-hidden className="text-base">🎉</span>
                {trialBadge}
              </span>
              <span className="text-xs text-emerald-300/80 transition group-hover:text-emerald-200">
                S’abonner →
              </span>
            </Link>
          </div>
        )}
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 py-12 sm:space-y-20 sm:px-6 sm:py-16">
        <PeriodNav
          view={view}
          selectedPeriod={selectedPeriod}
          onSelectPeriod={(next) => {
            setSelectedPeriod(next);
            setView("period");
          }}
          onShowAllTime={() => setView("all-time")}
          currentPeriodStart={periodStart}
          currentPeriodType={currentPeriodType}
          archivedPeriods={archivedPeriods}
        />

        {/* Primary actions — surfaced directly under the period selector
            and above the hero so a brand-new user lands on (1) period,
            (2) actions, (3) montant retirable without scrolling. Same
            buttons as the ones inside the Transactions header before;
            the section heading kept its title-only header. Mobile keeps
            a stacked column; ≥sm renders a wrapping row. */}
        <section
          aria-label="Actions principales"
          className="-mt-6 flex flex-col gap-2 sm:-mt-10 sm:flex-row sm:flex-wrap sm:gap-3"
        >
          <button
            type="button"
            onClick={() => setDialogType("income")}
            disabled={!userId}
            className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition duration-200 hover:scale-[1.02] hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            + Ajouter du chiffre d’affaires
          </button>
          <button
            type="button"
            onClick={() => setDialogType("withdrawal")}
            disabled={!userId}
            className="inline-flex items-center justify-center rounded-lg bg-white/[0.06] px-4 py-2 text-sm font-medium text-slate-100 shadow-sm ring-1 ring-white/10 backdrop-blur transition duration-200 hover:scale-[1.02] hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            Argent déjà retiré
          </button>
          <button
            type="button"
            onClick={() => setNewPeriodDialogOpen(true)}
            disabled={!userId}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-300 shadow-sm shadow-amber-900/20 transition duration-200 hover:scale-[1.02] hover:border-amber-400/60 hover:bg-amber-500/20 hover:text-amber-200 focus:outline-none focus:ring-2 focus:ring-amber-400/30 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
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
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            Nouvelle période URSSAF
          </button>
        </section>

        <SafeWithdrawCard
          userId={userId}
          advancedMode={advancedMode ?? undefined}
          mode={cardMode}
          period={cardPeriod}
          isCurrentPeriod={isCurrentPeriod}
          periodSubtitle={cardPeriodSubtitle}
          periodType={currentPeriodType ?? undefined}
          recurringMonthlyTotal={recurringMonthlyTotal}
        />

        <CashflowChart
          userId={userId}
          advancedMode={advancedMode ?? undefined}
          period={cardMode === "period" ? cardPeriod : undefined}
          emptyVariant={chartEmptyVariant}
          isCurrentPeriod={isCurrentPeriod}
          periodType={currentPeriodType ?? undefined}
        />

        {/* Transactions list — the action buttons that used to sit on the
            right of this header were promoted to a top-of-page section
            (right under the period selector). Keeping them only there
            avoids visual duplication; this section now stays a pure
            history view. */}
        <section className="space-y-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
            Transactions
          </h2>

          <HistoryCard
            transactions={filteredHistory}
            onDelete={handleDeleteTransaction}
          />
        </section>

        {/* Mode avancé — toggle paired with the feature it controls. The
            dépenses section sits directly below so the cause/effect link is
            obvious. Living below the default UX (hero + transactions) keeps
            first-time users out of the way per spec. */}
        <AdvancedModeSection
          value={advancedMode}
          disabled={!userId}
          onChange={handleToggleAdvancedMode}
        />

        {advancedMode === true && (
          <>
            <section className="space-y-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Dépenses professionnelles
                </h2>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setExpenseDialogOpen(true)}
                    disabled={!userId}
                    className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition duration-200 hover:scale-[1.02] hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
                  >
                    + Dépense
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecurringExpenseDialogOpen(true)}
                    disabled={!userId}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm font-medium text-amber-200 shadow-sm transition duration-200 hover:scale-[1.02] hover:border-amber-400/60 hover:bg-amber-500/20 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
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
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                    </svg>
                    + Dépense récurrente (tous les mois)
                  </button>
                </div>
              </div>
              <ExpensesCard
                expenses={filteredExpenses}
                onDeleteOne={handleDeleteExpense}
                onDeleteSeries={handleDeleteRecurringSeriesAll}
              />
            </section>

            <section className="space-y-5">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Dépenses récurrentes (mensuelles)
              </h2>
              <RecurringExpensesCard
                recurringExpenses={recurringExpenses}
                declarationFrequency={declarationFrequency}
                onDeleteFromThisMonth={handleDeleteRecurringSeriesFromThisMonth}
                onDeleteFromNextMonth={handleDeleteRecurringSeriesFromNextMonth}
                onDeleteAll={handleDeleteRecurringSeriesAll}
              />
            </section>
          </>
        )}

        {/* Compact archive of every closed URSSAF period. Sits at the
            bottom of the dashboard because it's secondary context — the
            user's day-to-day decisions live in the hero/breakdown above. */}
        <PreviousPeriodsSection state={previousPeriodsState} />
      </main>

      {userId && dialogType && (
        <AddTransactionDialog
          type={dialogType}
          open={dialogType !== null}
          onOpenChange={(open) => {
            if (!open) setDialogType(null);
          }}
          userId={userId}
          onCreated={refreshHistory}
          defaultDate={dialogDefaultDate}
          viewedPeriodRange={cardPeriod}
          viewedPeriodLabel={cardPeriodSubtitle}
        />
      )}

      {userId && expenseDialogOpen && (
        <AddExpenseDialog
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          userId={userId}
          onCreated={refreshExpenses}
          defaultDate={dialogDefaultDate}
          viewedPeriodRange={cardPeriod}
          viewedPeriodLabel={cardPeriodSubtitle}
        />
      )}

      {userId && recurringExpenseDialogOpen && (
        <AddRecurringExpenseDialog
          open={recurringExpenseDialogOpen}
          onOpenChange={setRecurringExpenseDialogOpen}
          userId={userId}
          onCreated={refreshRecurringExpenses}
          declarationFrequency={declarationFrequency}
        />
      )}

      {userId && newPeriodDialogOpen && (
        <NewPeriodDialog
          open={newPeriodDialogOpen}
          onOpenChange={setNewPeriodDialogOpen}
          onConfirm={handleNewPeriod}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* PeriodNav — split navigation: URSSAF dropdown + "Depuis le début" toggle    */
/* -------------------------------------------------------------------------- */

/**
 * Two side-by-side controls, per spec:
 *
 *     [ Période actuelle (mai 2026) ▾ ]   [ Depuis le début ]
 *
 * The dropdown is reserved for URSSAF periods (current + archived). The
 * "Depuis le début" tab is a separate, mutually-exclusive view. Whichever
 * surface is active gets the emerald ring; the other is muted. Picking
 * any option in the dropdown automatically returns the dashboard to the
 * "period" view (no extra click needed).
 */
function PeriodNav({
  view,
  selectedPeriod,
  onSelectPeriod,
  onShowAllTime,
  currentPeriodStart,
  currentPeriodType,
  archivedPeriods,
}: {
  view: "period" | "all-time";
  selectedPeriod: SelectedPeriod;
  onSelectPeriod: (next: SelectedPeriod) => void;
  onShowAllTime: () => void;
  currentPeriodStart: string | undefined;
  currentPeriodType: PeriodType;
  archivedPeriods: PreviousPeriodSummary[];
}) {
  const value =
    selectedPeriod.kind === "current"
      ? "current"
      : `old:${selectedPeriod.periodId}`;

  // Live current period has no explicit end. For monthly users the inline
  // label is just the month ("mai 2026"). For quarterly users we project
  // a 3-month rolling span ("mai → juil. 2026") to match the spec.
  const currentInline = currentPeriodStart
    ? periodLabel(
        currentPeriodStart,
        undefined,
        currentPeriodType,
        "inline",
      )
    : null;
  const currentLabel = currentInline
    ? `Période actuelle (${currentInline})`
    : "Période actuelle";

  const handleSelect = (raw: string) => {
    if (raw === "current") {
      onSelectPeriod(SELECTED_CURRENT);
      return;
    }
    if (raw.startsWith("old:")) {
      const id = raw.slice("old:".length);
      const archived = archivedPeriods.find((p) => p.id === id);
      if (!archived) return;
      onSelectPeriod({
        kind: "archived",
        periodId: archived.id,
        startDate: archived.startDate,
        endDate: archived.endDate,
        type: archived.type,
      });
    }
  };

  const periodActive = view === "period";
  const allTimeActive = view === "all-time";

  // Active surface gets an emerald ring + slightly brighter background;
  // the inactive one stays muted. Same visual grammar both sides so the
  // pair reads as one segmented nav.
  const activeRing =
    "bg-slate-900/80 ring-emerald-500/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";
  const idleRing = "bg-slate-900/50 ring-white/10 hover:bg-slate-900/70";

  return (
    <div className="space-y-2">
      <span className="block text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        Affichage
      </span>
      <div className="flex flex-wrap items-stretch gap-2">
        {/* Period dropdown — URSSAF periods only */}
        <div
          className={`relative w-full max-w-xs rounded-xl ring-1 backdrop-blur transition ${
            periodActive ? activeRing : idleRing
          }`}
        >
          <label htmlFor="period-select" className="sr-only">
            Sélection de la période URSSAF
          </label>
          <select
            id="period-select"
            value={value}
            onChange={(e) => handleSelect(e.target.value)}
            className={`w-full appearance-none bg-transparent py-2.5 pl-4 pr-10 text-sm font-medium focus:outline-none [color-scheme:dark] ${
              periodActive ? "text-slate-100" : "text-slate-400"
            }`}
          >
            {/* Native <option> elements are rendered by the OS, so Tailwind
                classes don't apply. On Windows + Chrome/Edge the panel
                paints white-on-white until a row is hovered. We force
                a slate panel + light text via inline styles, which the
                OS picker DOES honour. */}
            <option style={DROPDOWN_OPTION_STYLE} value="current">
              {currentLabel}
            </option>
            {archivedPeriods.map((p) => (
              <option
                style={DROPDOWN_OPTION_STYLE}
                key={p.id}
                value={`old:${p.id}`}
              >
                {periodLabel(p.startDate, p.endDate, p.type, "standalone")}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </div>

        {/* Depuis le début — separate toggle, never inside the dropdown */}
        <button
          type="button"
          onClick={onShowAllTime}
          aria-pressed={allTimeActive}
          className={`inline-flex items-center justify-center rounded-xl px-4 py-2.5 text-sm font-medium ring-1 transition focus:outline-none focus:ring-2 focus:ring-emerald-500/30 ${
            allTimeActive
              ? `${activeRing} text-slate-100`
              : `${idleRing} text-slate-400 hover:text-slate-200`
          }`}
        >
          Depuis le début
        </button>
      </div>
    </div>
  );
}

/**
 * Period label — the single source of truth for "how do we name a period
 * in the URSSAF dropdown?" Used for both the current period (inline,
 * inside `Période actuelle (…)` parentheses) and archived periods
 * (standalone, capitalised).
 *
 * Formatting rules (per spec):
 *
 *   single calendar month         → "mai 2026"
 *   multi-month inside same year  → "mai → juil. 2026"
 *   multi-month across years      → "nov. 2025 → janv. 2026"
 *
 * The `type` arg only matters for the LIVE current period (no `end`):
 *   - monthly   → label is just the start month
 *   - quarterly → label projects 3 months from the start (the rolling
 *                 quarter the user asked for: "April → mai-juin-juillet")
 *
 * For archived periods we always use the actual span [start, end-1day],
 * which means a quarterly period that the user closed early shows the
 * months it really covered — never a misleading projected range.
 */
type PeriodLabelKind = "inline" | "standalone";

function periodLabel(
  start: string,
  end: string | undefined,
  type: PeriodType,
  kind: PeriodLabelKind,
): string {
  const startDate = new Date(start);
  const startMonth = startDate.getUTCMonth();
  const startYear = startDate.getUTCFullYear();

  let endMonth: number;
  let endYear: number;
  if (end !== undefined) {
    // `end` is exclusive — show the LAST calendar month included.
    const lastIncluded = new Date(new Date(end).getTime() - 1);
    endMonth = lastIncluded.getUTCMonth();
    endYear = lastIncluded.getUTCFullYear();
  } else if (type === "quarterly") {
    const projected = new Date(Date.UTC(startYear, startMonth + 2, 1));
    endMonth = projected.getUTCMonth();
    endYear = projected.getUTCFullYear();
  } else {
    endMonth = startMonth;
    endYear = startYear;
  }

  const sameMonth = startMonth === endMonth && startYear === endYear;
  const finalize = (s: string) =>
    kind === "standalone" ? s.charAt(0).toUpperCase() + s.slice(1) : s;

  if (sameMonth) {
    const monthName = utcMonthName(startYear, startMonth, "long");
    return finalize(`${monthName} ${startYear}`);
  }

  const startName = utcMonthName(startYear, startMonth, "short");
  const endName = utcMonthName(endYear, endMonth, "short");
  if (startYear !== endYear) {
    return finalize(`${startName} ${startYear} → ${endName} ${endYear}`);
  }
  return finalize(`${startName} → ${endName} ${endYear}`);
}

function utcMonthName(
  year: number,
  monthZeroBased: number,
  length: "long" | "short",
): string {
  return new Date(Date.UTC(year, monthZeroBased, 1)).toLocaleDateString(
    "fr-FR",
    { month: length, timeZone: "UTC" },
  );
}

/**
 * Computes the start_date for the period that comes AFTER `latestStart`.
 *
 *   - monthly   → latestStart's calendar month + 1, snapped to 1st of UTC month.
 *   - quarterly → latestStart's calendar month + 3, snapped to 1st of UTC month.
 *
 * Anchored on the latest period's start, NOT on today, so repeated clicks
 * keep advancing one step at a time (May → June → July → …) even when the
 * calendar hasn't changed. Auto-rotation in `useCurrentPeriod` separately
 * handles the case where the user simply opened the app in a new month.
 */
function nextPeriodStartFromLatest(
  latestStartIso: string,
  frequency: PeriodType,
): string {
  const d = new Date(latestStartIso);
  const monthsToAdd = frequency === "quarterly" ? 3 : 1;
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthsToAdd, 1),
  ).toISOString();
}

/**
 * First day of the current calendar month, UTC, ISO timestamp.
 *
 * Used as a cutoff when slicing recurring-expense series by "this
 * month / next month" semantics. Calendar-month-anchored on
 * purpose: the user thinks in calendar terms, not URSSAF cadence
 * terms. See `handleDeleteRecurringSeriesFromThisMonth` for the
 * full reasoning.
 */
function startOfCurrentMonthUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
  ).toISOString();
}

/** First day of NEXT calendar month, UTC, ISO timestamp. */
function startOfNextMonthUtc(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  ).toISOString();
}

function AdvancedModeSection({
  value,
  disabled,
  onChange,
}: {
  value: boolean | null;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  const checked = value === true;
  const isLoading = value === null;
  const inputDisabled = disabled || isLoading;

  return (
    <label
      className={`card-soft flex items-center justify-between gap-4 rounded-2xl bg-slate-900/50 p-5 ring-1 ring-white/10 backdrop-blur-xl ${
        inputDisabled
          ? "cursor-not-allowed opacity-60"
          : "card-interactive cursor-pointer"
      }`}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-slate-100">Mode avancé</p>
        <p className="mt-0.5 text-xs text-slate-400 sm:text-sm">
          Suivez vos dépenses professionnelles. Elles sont alors déduites
          automatiquement de votre montant retirable.
        </p>
      </div>

      <span
        className={`relative inline-block h-6 w-11 flex-shrink-0 rounded-full transition-colors duration-300 ${
          checked ? "bg-amber-500" : "bg-white/10"
        }`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-300 ${
            checked ? "left-5" : "left-0.5"
          }`}
        />
      </span>
      <input
        type="checkbox"
        className="sr-only"
        checked={checked}
        disabled={inputDisabled}
        onChange={(e) => onChange(e.target.checked)}
        aria-label="Activer le mode avancé (suivi des dépenses professionnelles)"
      />
    </label>
  );
}

function HistoryCard({
  transactions,
  onDelete,
}: {
  transactions: HistoryTransaction[] | null;
  onDelete: (id: string) => void;
}) {
  if (transactions === null) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-6 text-sm text-slate-400 ring-1 ring-white/10 backdrop-blur-xl">
        Chargement des transactions…
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-sm font-medium text-slate-200">
          Aucune transaction pour l’instant
        </p>
        <p className="mt-1.5 text-sm text-slate-500">
          Ajoutez votre premier chiffre d’affaires pour commencer.
        </p>
      </div>
    );
  }

  return (
    <div className="card-soft card-interactive overflow-hidden rounded-2xl bg-slate-900/50 ring-1 ring-white/10 backdrop-blur-xl">
      <ul className="max-h-[440px] divide-y divide-white/5 overflow-y-auto">
        {transactions.map((t) => (
          <li
            key={t.id}
            className="animate-row-in group flex items-center justify-between gap-3 px-6 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <div className="flex items-center gap-3">
              <span
                className={`inline-flex h-1.5 w-1.5 rounded-full ${
                  t.type === "income" ? "bg-emerald-400" : "bg-rose-400"
                }`}
                aria-hidden="true"
              />
              <span className="text-sm text-slate-200">
                {t.type === "income" ? "Entrée" : "Retrait"}
              </span>
              <span className="text-xs text-slate-500 tabular-nums">
                {formatDate(t.created_at)}
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-3">
              <span
                className={`font-mono text-sm font-medium tabular-nums ${
                  t.type === "income" ? "text-emerald-400" : "text-rose-400"
                }`}
              >
                <span className="mr-0.5 font-sans text-slate-500">
                  {t.type === "income" ? "+" : "−"}
                </span>
                {formatEuro(t.amount)}
              </span>
              <DeleteRowButton
                onConfirm={() => onDelete(t.id)}
                ariaLabel={`Supprimer ${t.type === "income" ? "l’entrée" : "le retrait"} de ${formatEuro(t.amount)}`}
                confirmMessage={
                  t.type === "income"
                    ? "Supprimer cette entrée ?"
                    : "Supprimer ce retrait ?"
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpensesCard({
  expenses,
  onDeleteOne,
  onDeleteSeries,
}: {
  expenses: HistoryExpense[] | null;
  /** Delete a single occurrence (one row). */
  onDeleteOne: (id: string) => void;
  /**
   * Delete the whole recurring series — the template AND every row it
   * materialized (CASCADE). Only invoked from rows that have a
   * non-null `recurring_expense_id`.
   */
  onDeleteSeries: (recurringExpenseId: string) => void;
}) {
  if (expenses === null) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-6 text-sm text-slate-400 ring-1 ring-white/10 backdrop-blur-xl">
        Chargement des dépenses…
      </div>
    );
  }

  if (expenses.length === 0) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-sm font-medium text-slate-200">
          Aucune dépense enregistrée
        </p>
        <p className="mt-1.5 text-sm text-slate-500">
          Ajoutez votre première dépense professionnelle pour commencer.
        </p>
      </div>
    );
  }

  return (
    <div className="card-soft card-interactive overflow-hidden rounded-2xl bg-slate-900/50 ring-1 ring-white/10 backdrop-blur-xl">
      <ul className="max-h-[440px] divide-y divide-white/5 overflow-y-auto">
        {expenses.map((e) => {
          const isRecurring = e.recurring_expense_id !== null;
          return (
            <li
              key={e.id}
              className="animate-row-in group flex items-center justify-between gap-3 px-6 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={`inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full ${
                    isRecurring ? "bg-amber-400" : "bg-rose-400"
                  }`}
                  aria-hidden="true"
                />
                <span className="truncate text-sm text-slate-200">
                  {e.description?.trim() || "Dépense"}
                </span>
                {isRecurring && (
                  <span
                    className="inline-flex flex-shrink-0 items-center gap-1 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-300 ring-1 ring-amber-500/20"
                    title="Dépense récurrente"
                  >
                    <svg
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
                      <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
                    </svg>
                    Récurrente
                  </span>
                )}
                <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums">
                  {formatDate(e.created_at)}
                </span>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <span className="font-mono text-sm font-medium tabular-nums text-rose-400">
                  <span className="mr-0.5 font-sans text-slate-500">−</span>
                  {formatEuro(e.amount)}
                </span>
                {isRecurring && e.recurring_expense_id ? (
                  <DeleteExpenseScopeButton
                    onlyThisOne={() => onDeleteOne(e.id)}
                    allOccurrences={() =>
                      onDeleteSeries(e.recurring_expense_id as string)
                    }
                    ariaLabel={`Supprimer la dépense récurrente de ${formatEuro(e.amount)}`}
                  />
                ) : (
                  <DeleteRowButton
                    onConfirm={() => onDeleteOne(e.id)}
                    ariaLabel={`Supprimer la dépense de ${formatEuro(e.amount)}`}
                    confirmMessage="Supprimer cette dépense ?"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Delete affordance for an expense row that came from a recurring
 * template. The first click expands inline into a 3-button choice
 * panel: "Ce mois-ci" / "Tous les mois" / "Annuler". Same 4-second
 * auto-cancel timeout as the regular DeleteRowButton so an accidental
 * tap never sticks.
 *
 *   - "Ce mois-ci"     → onDeleteOne(): delete this single expense row.
 *                       Other periods stay untouched, the template
 *                       lives on (next "Nouvelle période URSSAF" will
 *                       still re-materialize it).
 *   - "Tous les mois"  → onDeleteSeries(): delete the recurring
 *                       template, which CASCADE-deletes every row it
 *                       ever produced.
 */
function DeleteExpenseScopeButton({
  onlyThisOne,
  allOccurrences,
  ariaLabel,
}: {
  onlyThisOne: () => void;
  allOccurrences: () => void;
  ariaLabel: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 6000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="hidden text-[11px] text-slate-400 sm:inline">
          Supprimer pour :
        </span>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onlyThisOne();
          }}
          className="inline-flex items-center justify-center rounded-md bg-amber-500/15 px-2.5 py-1 text-[11px] font-medium text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
        >
          Ce mois-ci
        </button>
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            allOccurrences();
          }}
          className="inline-flex items-center justify-center rounded-md bg-rose-500/15 px-2.5 py-1 text-[11px] font-medium text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25 hover:text-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        >
          Tous les mois
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          aria-label="Annuler la suppression"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-white/20"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label={ariaLabel}
      title="Supprimer"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
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
    </button>
  );
}

/**
 * RecurringExpensesCard — list of monthly recurring expense templates.
 *
 * Read-only: the only mutation surfaced inline is delete (same two-step
 * UX as every other row). Adding goes through the AddRecurringExpenseDialog
 * triggered from the section header. Each row shows the monthly amount
 * AND, when the user is on a quarterly cadence, the materialized
 * quarterly value (× 3) so the next-period effect is unambiguous.
 */
function RecurringExpensesCard({
  recurringExpenses,
  declarationFrequency,
  onDeleteFromThisMonth,
  onDeleteFromNextMonth,
  onDeleteAll,
}: {
  recurringExpenses: HistoryRecurringExpense[] | null;
  declarationFrequency: PeriodType;
  /**
   * Cutoff = first day of the current calendar month UTC. Past
   * materialized rows survive as one-off expenses; the current
   * month's row + every future occurrence + the template itself
   * are removed. The "Dépenses pro" KPI of any view on the
   * current month or later drops accordingly.
   */
  onDeleteFromThisMonth: (recurringExpenseId: string) => void;
  /**
   * Cutoff = first day of next calendar month UTC. Past AND
   * current-month rows survive (un-linked from the template);
   * only future occurrences + the template itself are removed.
   * The current month's "Dépenses pro" KPI stays unchanged.
   */
  onDeleteFromNextMonth: (recurringExpenseId: string) => void;
  /**
   * Wipes the entire history: deletes the template, which CASCADE-
   * deletes every row it ever produced.
   */
  onDeleteAll: (recurringExpenseId: string) => void;
}) {
  if (recurringExpenses === null) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-6 text-sm text-slate-400 ring-1 ring-white/10 backdrop-blur-xl">
        Chargement des dépenses récurrentes…
      </div>
    );
  }

  if (recurringExpenses.length === 0) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-10 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-sm font-medium text-slate-200">
          Aucune dépense récurrente
        </p>
        <p className="mt-1.5 text-sm text-slate-500">
          Ajoutez vos dépenses fixes (loyer, abonnements, comptable…). Elles
          seront ajoutées automatiquement à chaque{" "}
          <span className="font-medium text-amber-300">
            nouvelle période URSSAF
          </span>
          {declarationFrequency === "quarterly" ? " (× 3 sur le trimestre)" : ""}
          .
        </p>
      </div>
    );
  }

  const isQuarterly = declarationFrequency === "quarterly";

  return (
    <div className="card-soft card-interactive overflow-hidden rounded-2xl bg-slate-900/50 ring-1 ring-white/10 backdrop-blur-xl">
      <ul className="max-h-[440px] divide-y divide-white/5 overflow-y-auto">
        {recurringExpenses.map((e) => {
          const materialized = isQuarterly ? e.amount * 3 : e.amount;
          return (
            <li
              key={e.id}
              className="animate-row-in group flex items-center justify-between gap-3 px-6 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className="inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-amber-400"
                  aria-hidden="true"
                />
                <div className="min-w-0">
                  <span className="block truncate text-sm text-slate-200">
                    {e.description?.trim() || "Dépense récurrente"}
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.14em] text-slate-500">
                    Mensuelle
                    {e.vat_rate !== null
                      ? ` · TVA ${formatVatRate(e.vat_rate)}`
                      : ""}
                  </span>
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-3">
                <div className="text-right">
                  <span className="block font-mono text-sm font-medium tabular-nums text-amber-300">
                    <span className="mr-0.5 font-sans text-slate-500">−</span>
                    {formatEuro(e.amount)}
                    <span className="ml-1 text-[11px] font-normal text-slate-500">
                      / mois
                    </span>
                  </span>
                  {isQuarterly && (
                    <span className="block text-[11px] tabular-nums text-slate-500">
                      = {formatEuro(materialized)} / trimestre
                    </span>
                  )}
                </div>
                <DeleteRecurringTemplateButton
                  onDeleteFromThisMonth={() => onDeleteFromThisMonth(e.id)}
                  onDeleteFromNextMonth={() => onDeleteFromNextMonth(e.id)}
                  onDeleteAll={() => onDeleteAll(e.id)}
                  ariaLabel={`Supprimer le modèle de dépense récurrente de ${formatEuro(e.amount)}`}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * Delete affordance for a recurring TEMPLATE row.
 *
 * Clicking the trash icon expands the row footer into an explanatory
 * panel with three clear choices, ordered from least to most
 * destructive:
 *
 *   - "À partir du mois prochain"
 *       The recurrence stops AFTER this month. The current month's
 *       row stays (the user already paid for it), the historical
 *       archive stays untouched, only future occurrences disappear.
 *       Use this for a regular cancellation.
 *
 *   - "À partir de ce mois-ci"
 *       The current calendar month's row also goes away — useful
 *       when the user just discovered they don't actually owe
 *       this month either. Past months are KEPT as plain one-off
 *       rows. The "Dépenses pro" KPI of every view on the current
 *       month or later drops immediately.
 *
 *   - "Tout supprimer (historique inclus)"
 *       Wipes everything — the template AND every past/present/
 *       future occurrence the trigger ever produced. Use this when
 *       the template was a mistake from day one.
 *
 * Auto-cancel after 8 s so a stray tap never sticks. The longer
 * timeout (vs 4 s on simple deletes) accounts for users actually
 * reading the option labels before deciding.
 */
function DeleteRecurringTemplateButton({
  onDeleteFromThisMonth,
  onDeleteFromNextMonth,
  onDeleteAll,
  ariaLabel,
}: {
  onDeleteFromThisMonth: () => void;
  onDeleteFromNextMonth: () => void;
  onDeleteAll: () => void;
  ariaLabel: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 8000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        aria-label={ariaLabel}
        title="Supprimer"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
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
      </button>
    );
  }

  return (
    <div className="flex w-full max-w-[260px] flex-col items-stretch gap-1.5 rounded-lg border border-white/10 bg-slate-950/80 p-2 sm:max-w-[300px]">
      <p className="px-1 text-[11px] font-medium leading-snug text-slate-200">
        Supprimer cette dépense récurrente :
      </p>
      <button
        type="button"
        onClick={() => {
          setArmed(false);
          onDeleteFromNextMonth();
        }}
        className="rounded-md bg-sky-500/15 px-2.5 py-1.5 text-left text-[11px] font-medium leading-tight text-sky-200 ring-1 ring-sky-500/30 transition hover:bg-sky-500/25 hover:text-sky-100 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
      >
        À partir du mois prochain
        <span className="block text-[10px] font-normal text-sky-300/70">
          Garder ce mois et l’historique
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          setArmed(false);
          onDeleteFromThisMonth();
        }}
        className="rounded-md bg-amber-500/15 px-2.5 py-1.5 text-left text-[11px] font-medium leading-tight text-amber-200 ring-1 ring-amber-500/30 transition hover:bg-amber-500/25 hover:text-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
      >
        À partir de ce mois-ci
        <span className="block text-[10px] font-normal text-amber-300/70">
          Garder uniquement l’historique passé
        </span>
      </button>
      <button
        type="button"
        onClick={() => {
          setArmed(false);
          onDeleteAll();
        }}
        className="rounded-md bg-rose-500/15 px-2.5 py-1.5 text-left text-[11px] font-medium leading-tight text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25 hover:text-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
      >
        Tout supprimer
        <span className="block text-[10px] font-normal text-rose-300/70">
          Effacer aussi l’historique
        </span>
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-md px-2.5 py-1 text-[11px] font-medium text-slate-400 transition hover:bg-white/5 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-white/20"
      >
        Annuler
      </button>
    </div>
  );
}

function formatVatRate(rate: number): string {
  const pct = rate * 100;
  const rounded =
    Math.abs(pct - Math.round(pct)) < 1e-6 ? Math.round(pct) : pct.toFixed(1);
  return `${String(rounded).replace(".", ",")} %`;
}

/**
 * Small trash-icon button used inside each row of the transactions /
 * expenses lists. Two-step interaction so a stray click never erases
 * data: first click flips the button into a "Confirmer ?" pill, a
 * second click within 4 seconds actually deletes. Anywhere-else click
 * (or the timer) cancels.
 *
 * Deletion goes through `onConfirm`; the parent owns the supabase
 * call and the realtime subscriptions take care of refreshing every
 * KPI / chart / list automatically.
 */
function DeleteRowButton({
  onConfirm,
  ariaLabel,
  confirmMessage,
}: {
  onConfirm: () => void;
  ariaLabel: string;
  confirmMessage: string;
}) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(false), 4000);
    return () => window.clearTimeout(t);
  }, [armed]);

  if (armed) {
    return (
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setArmed(false);
            onConfirm();
          }}
          className="inline-flex items-center justify-center rounded-md bg-rose-500/15 px-2.5 py-1 text-[11px] font-medium text-rose-300 ring-1 ring-rose-500/30 transition hover:bg-rose-500/25 hover:text-rose-200 focus:outline-none focus:ring-2 focus:ring-rose-500/40"
        >
          {confirmMessage}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          aria-label="Annuler la suppression"
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 transition hover:bg-white/5 hover:text-slate-300 focus:outline-none focus:ring-2 focus:ring-white/20"
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
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setArmed(true)}
      aria-label={ariaLabel}
      title="Supprimer"
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-rose-500/10 hover:text-rose-300 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
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
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Anciennes périodes URSSAF — secondary archive list                          */
/* -------------------------------------------------------------------------- */

function PreviousPeriodsSection({
  state,
}: {
  state: ReturnType<typeof usePreviousPeriods>;
}) {
  // Hide this section entirely when the user has no URSSAF profile yet —
  // the rest of the dashboard already nudges them to onboard. Showing an
  // empty "anciennes périodes" rail in that state would just be noise.
  if (state.status === "no-urssaf-profile") return null;

  return (
    <section className="space-y-5">
      <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
        Anciennes périodes URSSAF
      </h2>
      <PreviousPeriodsBody state={state} />
    </section>
  );
}

function PreviousPeriodsBody({
  state,
}: {
  state: ReturnType<typeof usePreviousPeriods>;
}) {
  if (state.status === "loading") {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-6 text-sm text-slate-400 ring-1 ring-white/10 backdrop-blur-xl">
        Chargement des anciennes périodes…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="rounded-2xl bg-rose-950/40 p-5 text-sm text-rose-300 ring-1 ring-rose-500/30 backdrop-blur">
        Impossible de charger l’historique des périodes : {state.error}
      </div>
    );
  }

  // The parent (PreviousPeriodsSection) already returns null for the
  // "no-urssaf-profile" branch, so we'd never render this component in
  // that state. We still re-handle it here so TypeScript can narrow the
  // discriminated union to "ready" and unlock `state.periods` access.
  if (state.status === "no-urssaf-profile") return null;

  if (state.periods.length === 0) {
    return (
      <div className="card-soft rounded-2xl bg-slate-900/50 p-6 text-center ring-1 ring-white/10 backdrop-blur-xl">
        <p className="text-sm font-medium text-slate-200">
          Aucune période archivée
        </p>
        <p className="mt-1.5 text-sm text-slate-500">
          Vos anciennes périodes URSSAF apparaîtront ici dès que vous aurez
          cliqué sur « Nouvelle période URSSAF ».
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {state.periods.map((p) => (
        <PreviousPeriodRow key={p.id} period={p} />
      ))}
    </ul>
  );
}

function PreviousPeriodRow({ period }: { period: PreviousPeriodSummary }) {
  const { result } = period;
  // Hide the VAT chips entirely when the bucket has no VAT-flagged data —
  // beginners on simple invoices keep the original 5-tile look. The
  // 0.005 epsilon avoids surfacing rounding noise as a "1 cent VAT" tile.
  const hasIncomeVat = result.vatCollected > 0.005;
  const hasExpenseVat = result.vatRecoverable > 0.005;
  return (
    <li className="card-soft card-interactive rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/10 backdrop-blur-xl sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100">
            {formatPeriodLabel(period.startDate, period.endDate)}
          </p>
          <p className="mt-0.5 text-[11px] uppercase tracking-[0.16em] text-slate-500">
            {period.type === "quarterly" ? "Trimestre" : "Mois"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
            Montant final
          </p>
          <p
            className={`font-mono text-base font-semibold tabular-nums sm:text-lg ${
              result.safe < 0 ? "text-rose-400" : "text-emerald-400"
            }`}
          >
            {result.safe < 0 && (
              <span className="mr-0.5 font-sans text-slate-500">−</span>
            )}
            {formatEuro(Math.abs(result.safe))}
          </p>
        </div>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-5">
        <PreviousPeriodMetric
          label={hasIncomeVat ? "CA HT" : "CA"}
          amount={result.ca}
          tone="positive"
        />
        <PreviousPeriodMetric
          label="URSSAF"
          amount={result.urssafDue}
          tone="negative"
        />
        <PreviousPeriodMetric
          label="Réserve de sécurité recommandée"
          amount={result.reserve}
          tone="negative"
        />
        <PreviousPeriodMetric
          label="Retraits"
          amount={result.withdrawals}
          tone="negative"
        />
        <PreviousPeriodMetric
          label={hasExpenseVat ? "Dépenses HT" : "Dépenses"}
          amount={result.expenses}
          tone="negative"
        />
      </dl>

      {(hasIncomeVat || hasExpenseVat) && (
        <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 border-t border-white/5 pt-3 text-xs sm:grid-cols-2">
          {hasIncomeVat && (
            <PreviousPeriodMetric
              label="TVA à reverser estimée"
              amount={result.vatCollected}
              tone="neutral"
            />
          )}
          {hasExpenseVat && (
            <PreviousPeriodMetric
              label="TVA récupérable estimée"
              amount={result.vatRecoverable}
              tone="neutral"
            />
          )}
        </dl>
      )}
    </li>
  );
}

function PreviousPeriodMetric({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: number;
  tone: "positive" | "negative" | "neutral";
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-400"
      : tone === "negative"
        ? "text-rose-400"
        : "text-slate-200";
  const sign = tone === "negative" && amount !== 0 ? "−" : "";
  return (
    <div className="min-w-0">
      <dt className="text-[10px] uppercase leading-tight tracking-[0.16em] text-slate-500">
        {label}
      </dt>
      <dd
        className={`mt-0.5 truncate font-mono text-sm font-medium tabular-nums ${valueColor}`}
      >
        {sign && <span className="mr-0.5 font-sans text-slate-500">{sign}</span>}
        {formatEuro(amount)}
      </dd>
    </div>
  );
}

/**
 * Human-friendly range label for an archived period. We display the
 * inclusive start day → exclusive end day as a closed range, e.g.
 * "1 avr. 2026 → 30 avr. 2026" (one day before nextPeriod.start_date).
 */
function formatPeriodLabel(startIso: string, endIso: string): string {
  const start = new Date(startIso);
  const endExclusive = new Date(endIso);
  // Show the LAST included day (end - 1ms), which reads better than the
  // raw exclusive boundary.
  const lastIncluded = new Date(endExclusive.getTime() - 1);
  const fmt = (d: Date) =>
    d.toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  return `${fmt(start)} → ${fmt(lastIncluded)}`;
}

function formatEuro(amount: number | string): string {
  const n = typeof amount === "number" ? amount : Number(amount);
  return n.toLocaleString("fr-FR", {
    style: "currency",
    currency: "EUR",
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
