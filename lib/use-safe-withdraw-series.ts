"use client";

/**
 * useSafeWithdrawSeries — time-series companion to `useSafeWithdraw`.
 *
 * Same data plumbing pattern (fetch transactions / urssaf rate / opt-in
 * expenses, subscribe to Realtime, refetch on changes) but feeds the data
 * to `computeSafeWithdrawSeries` instead of `computeSafeWithdraw`. The chart
 * therefore tells the SAME truth as the hero KPI: same constants, same
 * formula, same source of transactions. The two hooks differ only in the
 * shape of their output.
 *
 * Kept separate from `useSafeWithdraw` on purpose:
 *   1. The dashboard hero card and the chart can resolve independently —
 *      the chart will fail-soft to "no data" without taking down the KPI.
 *   2. Future analytics views can reuse the chart without paying for the
 *      KPI's reactive overhead.
 */

import { useEffect, useState } from "react";

import {
  type CashflowExpense,
  type CashflowPoint,
  type CashflowTransaction,
  computeSafeWithdrawSeries,
} from "./cashflow";
import { supabase } from "./supabase";

export type SafeWithdrawSeriesState =
  | { status: "loading" }
  | { status: "no-urssaf-profile" }
  | { status: "ready"; points: CashflowPoint[] }
  | { status: "error"; error: string };

export type UseSafeWithdrawSeriesOptions = {
  advancedMode?: boolean;
};

export function useSafeWithdrawSeries(
  userId: string | null,
  options: UseSafeWithdrawSeriesOptions = {},
): SafeWithdrawSeriesState {
  const [state, setState] = useState<SafeWithdrawSeriesState>({
    status: "loading",
  });
  const [refreshTick, setRefreshTick] = useState(0);

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

      const { data: txs, error: txError } = await supabase
        .from("transactions")
        .select("type, amount, created_at")
        .eq("user_id", userId);
      if (cancelled) return;

      if (txError) {
        setState({ status: "error", error: txError.message });
        return;
      }

      let expenses: CashflowExpense[] | undefined;
      if (advancedMode) {
        const { data: expRows, error: expError } = await supabase
          .from("expenses")
          .select("amount, created_at")
          .eq("user_id", userId);
        if (cancelled) return;

        if (expError) {
          setState({ status: "error", error: expError.message });
          return;
        }
        expenses = (expRows ?? []) as CashflowExpense[];
      }

      try {
        const points = computeSafeWithdrawSeries({
          transactions: (txs ?? []) as CashflowTransaction[],
          urssafRate: urssaf.urssaf_rate,
          expenses,
        });
        setState({ status: "ready", points });
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
  }, [userId, advancedMode, refreshTick]);

  // Same realtime triggers as the KPI hook so the chart stays in sync with
  // the hero on every insert / update / delete.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode === undefined) return;

    const bump = () => setRefreshTick((t) => t + 1);

    let channel = supabase
      .channel(
        `safe-withdraw-series:${userId}:${advancedMode ? "adv" : "simple"}`,
      )
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
