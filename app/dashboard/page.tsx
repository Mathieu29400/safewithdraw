"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { supabase } from "@/lib/supabase";
import type { Expense, PeriodType, Transaction } from "@/lib/database.types";
import { useCurrentPeriod } from "@/lib/use-current-period";

import { AddExpenseDialog } from "./add-expense-dialog";
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
  "id" | "amount" | "description" | "created_at"
>;

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  // `advanced_mode` is read from profiles. `null` while loading so the
  // SafeWithdrawCard stays in skeleton mode and we don't flash the simple
  // KPI for a user who has expenses tracked.
  const [advancedMode, setAdvancedMode] = useState<boolean | null>(null);

  const [dialogType, setDialogType] = useState<TransactionType | null>(null);
  const [expenseDialogOpen, setExpenseDialogOpen] = useState(false);
  const [newPeriodDialogOpen, setNewPeriodDialogOpen] = useState(false);

  // Declaration frequency from urssaf_profile — needed when inserting new periods.
  const [declarationFrequency, setDeclarationFrequency] =
    useState<PeriodType>("monthly");

  // Current URSSAF period: the most recent row in `periods` for this user.
  // `undefined` while loading so SafeWithdrawCard stays in skeleton mode and
  // we never flash all-time data before the period is known.
  const currentPeriodState = useCurrentPeriod(userId);
  const periodStart =
    currentPeriodState.status === "ready"
      ? currentPeriodState.periodStart
      : undefined;

  const [history, setHistory] = useState<HistoryTransaction[] | null>(null);
  const [expenses, setExpenses] = useState<HistoryExpense[] | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [expensesTick, setExpensesTick] = useState(0);

  // SafeWithdraw is computed against the user's full transaction history —
  // no period scoping on the dashboard. Multi-period views live in the
  // future /analytics section, which can opt into the period-aware mode
  // of `useSafeWithdraw(userId, period)`.

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

  // Read `advanced_mode` from the profile. Default to false on missing/error
  // so the dashboard remains usable even if the column read hiccups.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("profiles")
      .select("advanced_mode")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAdvancedMode(data?.advanced_mode ?? false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

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
      .select("id, amount, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        if (!cancelled) setExpenses(data ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, advancedMode, expensesTick]);

  const refreshHistory = useCallback(() => {
    setRefreshTick((t) => t + 1);
  }, []);

  const refreshExpenses = useCallback(() => {
    setExpensesTick((t) => t + 1);
  }, []);

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

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-white/5 bg-slate-950/70 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-base font-semibold tracking-tight text-slate-100">
            SafeWithdraw
          </span>
          <div className="flex items-center gap-4">
            {email && (
              <span className="hidden text-sm text-slate-500 sm:inline">
                {email}
              </span>
            )}
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
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-14 px-4 py-12 sm:space-y-20 sm:px-6 sm:py-16">
        <SafeWithdrawCard
          userId={userId}
          advancedMode={advancedMode ?? undefined}
          periodStart={periodStart}
        />

        <CashflowChart
          userId={userId}
          advancedMode={advancedMode ?? undefined}
        />

        <section className="space-y-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              Transactions
            </h2>

            <div className="flex flex-shrink-0 flex-col gap-2 sm:flex-row sm:gap-3">
              <button
                type="button"
                onClick={() => setDialogType("income")}
                disabled={!userId}
                className="inline-flex items-center justify-center rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.6)] transition duration-200 hover:scale-[1.02] hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                + Ajout de chiffres d’affaires
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
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-sm font-medium text-slate-400 transition duration-200 hover:scale-[1.02] hover:border-white/20 hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-white/20 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
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
            </div>
          </div>

          <HistoryCard transactions={history} />
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
          <section className="space-y-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Dépenses professionnelles
              </h2>
              <button
                type="button"
                onClick={() => setExpenseDialogOpen(true)}
                disabled={!userId}
                className="inline-flex items-center justify-center rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(245,158,11,0.55)] transition duration-200 hover:scale-[1.02] hover:bg-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:ring-offset-2 focus:ring-offset-slate-950 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
              >
                + Dépense
              </button>
            </div>
            <ExpensesCard expenses={expenses} />
          </section>
        )}
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
        />
      )}

      {userId && expenseDialogOpen && (
        <AddExpenseDialog
          open={expenseDialogOpen}
          onOpenChange={setExpenseDialogOpen}
          userId={userId}
          onCreated={refreshExpenses}
        />
      )}

      {userId && newPeriodDialogOpen && (
        <NewPeriodDialog
          open={newPeriodDialogOpen}
          onOpenChange={setNewPeriodDialogOpen}
          onConfirm={() => {
            // Insert a new period row. The `useCurrentPeriod` realtime
            // subscription will pick up the INSERT and update `periodStart`,
            // which causes `useSafeWithdraw` to re-scope to the new period.
            // Historical data (transactions, withdrawals, previous periods)
            // is never touched — only the KPI's lower bound changes.
            void supabase.from("periods").insert({
              user_id: userId,
              type: declarationFrequency,
              start_date: new Date().toISOString(),
              current_ca: 0,
            });
          }}
        />
      )}
    </div>
  );
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
}: {
  transactions: HistoryTransaction[] | null;
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
            className="animate-row-in flex items-center justify-between px-6 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
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
          </li>
        ))}
      </ul>
    </div>
  );
}

function ExpensesCard({ expenses }: { expenses: HistoryExpense[] | null }) {
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
        {expenses.map((e) => (
          <li
            key={e.id}
            className="animate-row-in flex items-center justify-between gap-3 px-6 py-4 transition-colors duration-150 hover:bg-white/[0.03]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <span
                className="inline-flex h-1.5 w-1.5 flex-shrink-0 rounded-full bg-rose-400"
                aria-hidden="true"
              />
              <span className="truncate text-sm text-slate-200">
                {e.description?.trim() || "Dépense"}
              </span>
              <span className="flex-shrink-0 text-xs text-slate-500 tabular-nums">
                {formatDate(e.created_at)}
              </span>
            </div>
            <span className="font-mono text-sm font-medium tabular-nums text-rose-400">
              <span className="mr-0.5 font-sans text-slate-500">−</span>
              {formatEuro(e.amount)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
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
