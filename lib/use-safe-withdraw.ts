"use client";

/**
 * useSafeWithdraw — live, RLS-safe view of "how much can I withdraw right now?"
 *
 * Default behaviour (no `period` argument): SafeWithdraw is computed against
 * the user's ENTIRE transaction history — all months, all years. This is the
 * dashboard's mode. The KPI is a single global financial safety indicator,
 * not a per-month report.
 *
 * Optional `period` argument: when a period is passed, the hook scopes both
 * the SQL fetch and the engine to that range. Reserved for future analytics
 * views (per-month, per-quarter, year-to-date…). The dashboard never passes
 * a period.
 *
 * Optional `advancedMode` (in `options`): when `true`, also fetch and feed
 * `expenses` to the engine so the KPI subtracts business expenses from the
 * safe amount. When `false`, expenses are ignored entirely (no fetch, no
 * subscription) — the simple-mode UX is unaffected. When `undefined`, the
 * hook stays in `loading` until the parent has resolved the user preference,
 * preventing the KPI from flashing wrong values on first paint.
 *
 * Storage vs. scope: transactions and expenses are stored unfiltered and
 * remain visible in their respective lists regardless of period. Period
 * only affects the calculation, never the storage.
 *
 * Realtime: subscribes to Postgres Changes on `transactions` and
 * `urssaf_profile` always; on `expenses` only when advanced mode is on. The
 * channel is keyed on `userId + advancedMode` so flipping the flag rebuilds
 * the subscription set cleanly.
 */

import { useEffect, useState } from "react";

import {
  type CashflowExpense,
  type CashflowResult,
  type CashflowTransaction,
  computeSafeWithdraw,
} from "./cashflow";
import { supabase } from "./supabase";

export type PeriodRange = {
  /** ISO timestamp — inclusive lower bound on `transactions.created_at`. */
  start: string;
  /** ISO timestamp — exclusive upper bound. Omit for no upper bound. */
  end?: string;
};

export type UseSafeWithdrawOptions = {
  /**
   * Whether the user has enabled the advanced-mode expenses feature.
   * - `undefined` → hook waits (still resolving the user preference).
   * - `false` → simple mode, expenses ignored.
   * - `true` → fetch `expenses`, subscribe to changes, subtract from safe.
   */
  advancedMode?: boolean;
};

export type SafeWithdrawState =
  | { status: "loading" }
  | { status: "no-urssaf-profile" }
  | { status: "ready"; data: CashflowResult }
  | { status: "error"; error: string };

export function useSafeWithdraw(
  userId: string | null,
  period?: PeriodRange,
  options: UseSafeWithdrawOptions = {},
): SafeWithdrawState {
  const [state, setState] = useState<SafeWithdrawState>({ status: "loading" });
  const [refreshTick, setRefreshTick] = useState(0);

  const periodStart = period?.start;
  const periodEnd = period?.end;
  const { advancedMode } = options;

  useEffect(() => {
    if (!userId) return;
    if (advancedMode === undefined) return;
    let cancelled = false;

    const load = async () => {
      const { data: urssaf, error: urssafError } = await supabase
        .from("urssaf_profile")
        .select("urssaf_rate")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;

      if (urssafError) {
        setState({ status: "error", error: urssafError.message });
        return;
      }
      if (!urssaf) {
        setState({ status: "no-urssaf-profile" });
        return;
      }

      let txQuery = supabase
        .from("transactions")
        .select("type, amount, created_at")
        .eq("user_id", userId);
      if (periodStart) txQuery = txQuery.gte("created_at", periodStart);
      if (periodEnd) txQuery = txQuery.lt("created_at", periodEnd);

      const { data: txs, error: txError } = await txQuery;
      if (cancelled) return;

      if (txError) {
        setState({ status: "error", error: txError.message });
        return;
      }

      let expenses: CashflowExpense[] | undefined;
      if (advancedMode) {
        let expQuery = supabase
          .from("expenses")
          .select("amount, created_at")
          .eq("user_id", userId);
        if (periodStart) expQuery = expQuery.gte("created_at", periodStart);
        if (periodEnd) expQuery = expQuery.lt("created_at", periodEnd);

        const { data: expRows, error: expError } = await expQuery;
        if (cancelled) return;

        if (expError) {
          setState({ status: "error", error: expError.message });
          return;
        }
        expenses = (expRows ?? []) as CashflowExpense[];
      }

      try {
        const result = computeSafeWithdraw({
          transactions: (txs ?? []) as CashflowTransaction[],
          urssafRate: urssaf.urssaf_rate,
          periodStart,
          periodEnd,
          expenses,
        });
        setState({ status: "ready", data: result });
      } catch (err) {
        setState({
          status: "error",
          error: err instanceof Error ? err.message : "compute failed",
        });
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, periodStart, periodEnd, advancedMode, refreshTick]);

  // Realtime subscriptions. The channel topic includes `advancedMode` so the
  // listener set is rebuilt cleanly when the user flips the flag.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode === undefined) return;

    const bump = () => setRefreshTick((t) => t + 1);

    let channel = supabase
      .channel(`safe-withdraw:${userId}:${advancedMode ? "adv" : "simple"}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        bump,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "urssaf_profile",
          filter: `user_id=eq.${userId}`,
        },
        bump,
      );

    if (advancedMode) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "expenses",
          filter: `user_id=eq.${userId}`,
        },
        bump,
      );
    }

    channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, advancedMode]);

  return state;
}
