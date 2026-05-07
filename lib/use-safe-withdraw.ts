"use client";

/**
 * useSafeWithdraw — live, RLS-safe view of "how much can I withdraw right now?"
 *
 * Default behaviour (no `period` argument): computed against the user's ENTIRE
 * transaction history — all months, all years. This is the all-time fallback.
 *
 * When a `period` is passed, both transactions and expenses are filtered to
 * `created_at >= period.start` (and optionally `< period.end`). The current
 * URSSAF period start_date is the lower bound — any transaction created
 * before that date belongs to a past period and is excluded from the KPI.
 *
 * `advancedMode`: when `true`, also fetch and feed `expenses` to the engine.
 * When `undefined`, the hook stays in `loading` to avoid flashing wrong values.
 *
 * Realtime: subscribes to `transactions`, `urssaf_profile`, and optionally
 * `expenses`. The channel is keyed on `userId + advancedMode`.
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

      // Fetch ALL transactions for the user, then filter client-side. Pure
      // Date comparison via getTime() — no string equality, no timezone tricks.
      // `vat_rate` is fetched alongside so the engine can split TTC into HT
      // and the (informational) VAT collected estimate.
      const { data: allTxs, error: txError } = await supabase
        .from("transactions")
        .select("type, amount, created_at, vat_rate")
        .eq("user_id", userId);
      if (cancelled) return;

      if (txError) {
        setState({ status: "error", error: txError.message });
        return;
      }

      const allTxsList = (allTxs ?? []) as CashflowTransaction[];

      const periodStartMs = periodStart
        ? new Date(periodStart).getTime()
        : Number.NEGATIVE_INFINITY;
      const periodEndMs = periodEnd
        ? new Date(periodEnd).getTime()
        : Number.POSITIVE_INFINITY;

      const filteredTxs = allTxsList.filter((t) => {
        const ts = new Date(t.created_at).getTime();
        return ts >= periodStartMs && ts < periodEndMs;
      });

      let expenses: CashflowExpense[] | undefined;
      if (advancedMode) {
        const { data: allExp, error: expError } = await supabase
          .from("expenses")
          .select("amount, created_at, vat_rate")
          .eq("user_id", userId);
        if (cancelled) return;

        if (expError) {
          setState({ status: "error", error: expError.message });
          return;
        }

        const allExpList = (allExp ?? []) as CashflowExpense[];
        expenses = allExpList.filter((e) => {
          const ts = new Date(e.created_at).getTime();
          return ts >= periodStartMs && ts < periodEndMs;
        });
      }

      try {
        // Pass the already-filtered list with NO periodStart so the engine
        // does not double-filter. The hook is the single source of truth for
        // period scoping.
        const result = computeSafeWithdraw({
          transactions: filteredTxs,
          urssafRate: urssaf.urssaf_rate,
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
