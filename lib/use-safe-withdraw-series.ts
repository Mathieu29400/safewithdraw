"use client";

/**
 * useSafeWithdrawSeries — time-series companion to `useSafeWithdraw`.
 *
 * Same data plumbing pattern (fetch transactions / urssaf rate / opt-in
 * expenses, subscribe to Realtime, refetch on changes) but feeds the data
 * to `computeSafeWithdrawSeries` instead of `computeSafeWithdraw`.
 *
 * Scoping: the chart can be either ALL-TIME (default — no period passed)
 * or scoped to a specific period range. The dashboard's "Période actuelle"
 * tab passes the current URSSAF period; the "All-time" tab passes nothing.
 *
 * When a `period` is provided, transactions and expenses are filtered to
 * `created_at >= period.start` (and optionally `< period.end`) BEFORE
 * being handed to the engine. The engine itself stays period-agnostic.
 */

import { useEffect, useState } from "react";

import {
  type CashflowExpense,
  type CashflowPoint,
  type CashflowTransaction,
  computeSafeWithdrawSeries,
} from "./cashflow";
import { supabase } from "./supabase";
import type { PeriodRange } from "./use-safe-withdraw";

export type SafeWithdrawSeriesState =
  | { status: "loading" }
  | { status: "no-urssaf-profile" }
  | { status: "ready"; points: CashflowPoint[]; urssafRate: number }
  | { status: "error"; error: string };

export type UseSafeWithdrawSeriesOptions = {
  advancedMode?: boolean;
  /**
   * Optional period range. When set, the series is filtered to
   * `created_at >= period.start` (and optionally `< period.end`) before
   * being computed. When omitted, the series spans the full history.
   */
  period?: PeriodRange;
};

export function useSafeWithdrawSeries(
  userId: string | null,
  options: UseSafeWithdrawSeriesOptions = {},
): SafeWithdrawSeriesState {
  const [state, setState] = useState<SafeWithdrawSeriesState>({
    status: "loading",
  });
  const [refreshTick, setRefreshTick] = useState(0);

  const { advancedMode, period } = options;
  const periodStart = period?.start;
  const periodEnd = period?.end;

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
        .select("type, amount, created_at, vat_rate")
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
          .select("amount, created_at, vat_rate")
          .eq("user_id", userId);
        if (cancelled) return;

        if (expError) {
          setState({ status: "error", error: expError.message });
          return;
        }
        expenses = (expRows ?? []) as CashflowExpense[];
      }

      // Apply optional period scoping client-side. The engine itself stays
      // period-agnostic for the time-series shape; we pre-filter so the
      // first point is the first event INSIDE the window (otherwise the
      // chart would start with a stale carry-over from before the reset).
      const periodStartMs = periodStart
        ? new Date(periodStart).getTime()
        : Number.NEGATIVE_INFINITY;
      const periodEndMs = periodEnd
        ? new Date(periodEnd).getTime()
        : Number.POSITIVE_INFINITY;

      const allTxs = (txs ?? []) as CashflowTransaction[];
      const filteredTxs = allTxs.filter((t) => {
        const ts = new Date(t.created_at).getTime();
        return ts >= periodStartMs && ts < periodEndMs;
      });

      const filteredExpenses = expenses?.filter((e) => {
        const ts = new Date(e.created_at).getTime();
        return ts >= periodStartMs && ts < periodEndMs;
      });

      try {
        const points = computeSafeWithdrawSeries({
          transactions: filteredTxs,
          urssafRate: urssaf.urssaf_rate,
          expenses: filteredExpenses,
        });

        // When the chart is scoped to a period, prepend a synthetic
        // "0 €" anchor point at the period's start day. Two reasons:
        //
        //   1) The engine commits one point per UTC day. A fresh period
        //      with 5 transactions all on the same day yields a single
        //      point — Recharts cannot draw a line from that, and the
        //      user (correctly) sees the "no data" empty state even
        //      though there IS data. The anchor gives us a guaranteed
        //      second point and turns the visualization into a clean
        //      step from zero up to the latest cumulative state.
        //
        //   2) The narrative is also more accurate: the period truly
        //      starts at zero, and the line should rise FROM there.
        //
        // The anchor is skipped when the first real point already sits
        // on the period-start day (its data already reflects the day's
        // events; another point with the same X would just clutter).
        if (periodStart && points.length > 0) {
          const periodStartDate = new Date(periodStart);
          const anchorDay = periodStartDate.toISOString().slice(0, 10);
          if (points[0].date !== anchorDay) {
            points.unshift({
              date: anchorDay,
              ts: periodStartDate.getTime(),
              ca: 0,
              safe: 0,
            });
          }
        }

        setState({ status: "ready", points, urssafRate: urssaf.urssaf_rate });
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
  }, [userId, advancedMode, periodStart, periodEnd, refreshTick]);

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
