"use client";

/**
 * usePreviousPeriods — archived URSSAF "dashboards", one per calendar
 * month or quarter that contains data.
 *
 * Why virtual buckets (not `periods` rows):
 * The user wants ONE dashboard per calendar period that holds data —
 * e.g. "Avril 2026", "Mars 2026", "Octobre 2025" — regardless of when
 * (or if) they ever clicked "Nouvelle période URSSAF". Driving the
 * archive list off `periods` rows fails that promise: a user who used
 * the app for six months without ever resetting would only see ONE
 * giant archive entry covering all six months.
 *
 * Instead we treat the LATEST `periods.start_date` as the boundary of
 * the live current period, and synthesize archive entries by walking
 * the user's transactions + expenses and grouping them by calendar
 * month (or quarter, depending on `urssaf_profile.declaration_frequency`).
 *
 * Bucketing rule:
 *   - Monthly   → key = (year, month).
 *   - Quarterly → key = (year, calendar quarter Q1/Q2/Q3/Q4).
 *
 * For each unique bucket strictly older than the current period's
 * start_date, we compute the same `CashflowResult` the live KPI uses
 * (CA, URSSAF, réserve, retraits, dépenses, montant final) by calling
 * `computeSafeWithdraw` with explicit `[periodStart, periodEnd)` bounds.
 *
 * Edge cases:
 *   - A bucket that overlaps the current period (because a legacy
 *     manual reset set the current period boundary mid-month) is
 *     clamped at currentStart so the same data isn't counted twice.
 *   - Transactions that landed in the *current* period are ignored
 *     here — they belong to the live KPI, not the archive.
 *
 * Realtime: any change to `transactions`, `expenses`, `urssaf_profile`,
 * or `periods` invalidates the buckets and triggers a recomputation.
 *
 * Note: `transactions.period_id` / `expenses.period_id` are deliberately
 * not consulted — the calendar date is the only source of truth.
 */

import { useEffect, useState } from "react";

import {
  type CashflowExpense,
  type CashflowResult,
  type CashflowTransaction,
  computeSafeWithdraw,
} from "./cashflow";
import type { PeriodType } from "./database.types";
import { supabase } from "./supabase";

export type PreviousPeriodSummary = {
  /**
   * Synthetic, stable id of the form `bucket:<frequency>:<bucketKey>`.
   * Used by the dropdown solely to round-trip the user's selection;
   * downstream filtering uses `startDate` / `endDate`, never the id.
   */
  id: string;
  type: PeriodType;
  /** ISO timestamp — inclusive lower bound used for filtering. */
  startDate: string;
  /** ISO timestamp — exclusive upper bound. */
  endDate: string;
  result: CashflowResult;
};

export type PreviousPeriodsState =
  | { status: "loading" }
  | { status: "no-urssaf-profile" }
  | { status: "ready"; periods: PreviousPeriodSummary[] }
  | { status: "error"; error: string };

export type UsePreviousPeriodsOptions = {
  /**
   * Whether the user has enabled advanced mode. When `true`, expenses
   * are pulled and subtracted in each bucket's breakdown. When `false`,
   * `result.expenses` is always 0 — same convention as `useSafeWithdraw`.
   * `undefined` keeps the hook in `loading` to avoid flashing wrong
   * totals before the user preference is known.
   */
  advancedMode?: boolean;
};

// ---------------------------------------------------------------------------
// Bucket helpers
// ---------------------------------------------------------------------------

/**
 * Stable string key for a bucket so we can deduplicate via Set.
 *   monthly   → "2026-04"
 *   quarterly → "2026-Q2"
 */
function bucketKey(date: Date, frequency: PeriodType): string {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (frequency === "monthly") {
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  }
  const q = Math.floor(m / 3) + 1;
  return `${y}-Q${q}`;
}

/**
 * Inverse of `bucketKey` — returns the half-open `[start, end)` window
 * the bucket covers, both as ISO timestamps at 00:00:00.000Z UTC.
 */
function bucketBounds(
  key: string,
  frequency: PeriodType,
): { startDate: string; endDate: string } {
  if (frequency === "monthly") {
    const [yStr, mStr] = key.split("-");
    const y = Number(yStr);
    const m = Number(mStr) - 1;
    return {
      startDate: new Date(Date.UTC(y, m, 1)).toISOString(),
      endDate: new Date(Date.UTC(y, m + 1, 1)).toISOString(),
    };
  }
  const [yStr, qStr] = key.split("-Q");
  const y = Number(yStr);
  const q = Number(qStr);
  const startMonth = (q - 1) * 3;
  return {
    startDate: new Date(Date.UTC(y, startMonth, 1)).toISOString(),
    endDate: new Date(Date.UTC(y, startMonth + 3, 1)).toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function usePreviousPeriods(
  userId: string | null,
  options: UsePreviousPeriodsOptions = {},
): PreviousPeriodsState {
  const [state, setState] = useState<PreviousPeriodsState>({
    status: "loading",
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const { advancedMode } = options;

  useEffect(() => {
    if (!userId) return;
    if (advancedMode === undefined) return;
    let cancelled = false;

    const load = async () => {
      // 1. URSSAF profile — needed for the rate AND the declaration
      //    frequency (which dictates monthly vs. quarterly buckets).
      const { data: urssaf, error: urssafError } = await supabase
        .from("urssaf_profile")
        .select("urssaf_rate, declaration_frequency")
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

      const frequency =
        (urssaf.declaration_frequency as PeriodType | undefined) ?? "monthly";

      // 2. ALL `periods` rows for this user, sorted DESC by start_date.
      //    The first row is the live current period; everything else
      //    is treated as a historical anchor. We need every non-current
      //    row so that periods the user explicitly created via
      //    "Nouvelle période URSSAF" (or that auto-rotated forward)
      //    still show up as a slot in the dropdown EVEN IF no
      //    transaction was logged inside them — that "empty period"
      //    is itself meaningful information.
      const { data: periodsData, error: periodsError } = await supabase
        .from("periods")
        .select("start_date")
        .eq("user_id", userId)
        .order("start_date", { ascending: false });
      if (cancelled) return;

      if (periodsError) {
        setState({ status: "error", error: periodsError.message });
        return;
      }

      const allPeriods = (periodsData ?? []) as Array<{ start_date: string }>;
      // No period at all → nothing has been "archived" yet either.
      if (allPeriods.length === 0) {
        setState({ status: "ready", periods: [] });
        return;
      }
      const currentStartIso = allPeriods[0].start_date;
      const currentStartMs = new Date(currentStartIso).getTime();

      // 3. Pull transactions + (optional) expenses once, then re-bin
      //    them in memory for each bucket.
      const { data: txData, error: txError } = await supabase
        .from("transactions")
        .select("type, amount, created_at")
        .eq("user_id", userId);
      if (cancelled) return;

      if (txError) {
        setState({ status: "error", error: txError.message });
        return;
      }
      const transactions = (txData ?? []) as CashflowTransaction[];

      let expenses: CashflowExpense[] | undefined;
      if (advancedMode) {
        const { data: expData, error: expError } = await supabase
          .from("expenses")
          .select("amount, created_at")
          .eq("user_id", userId);
        if (cancelled) return;

        if (expError) {
          setState({ status: "error", error: expError.message });
          return;
        }
        expenses = (expData ?? []) as CashflowExpense[];
      }

      // 4. Build the set of bucket keys to render. We seed it from
      //    THREE complementary sources, all deduplicated by the Set:
      //
      //      (a) every `periods` row strictly older than the current
      //          period — this guarantees that empty periods the user
      //          created (or auto-rotated through) still get a
      //          dropdown slot.
      //      (b) every transaction `created_at` strictly older than
      //          the current period.
      //      (c) every expense `created_at` ditto.
      //
      //    Without (a), clicking "Nouvelle période URSSAF" twice in
      //    a row with no data in between would silently make the
      //    intermediate months disappear from the dropdown.
      const keys = new Set<string>();

      for (const period of allPeriods) {
        const d = new Date(period.start_date);
        if (d.getTime() >= currentStartMs) continue;
        keys.add(bucketKey(d, frequency));
      }

      const collect = (createdAt: string | Date) => {
        const d = createdAt instanceof Date ? createdAt : new Date(createdAt);
        const ts = d.getTime();
        if (ts >= currentStartMs) return;
        keys.add(bucketKey(d, frequency));
      };
      for (const tx of transactions) collect(tx.created_at);
      if (expenses) for (const exp of expenses) collect(exp.created_at);

      // 5. Compute a CashflowResult for each bucket window. If the
      //    window happens to overflow into the current period (legacy
      //    sub-month boundary), clamp the upper bound at currentStart
      //    so the breakdown can't double-count anything.
      const summaries: PreviousPeriodSummary[] = [];
      for (const key of keys) {
        const { startDate, endDate } = bucketBounds(key, frequency);
        const clampedEnd =
          new Date(endDate).getTime() > currentStartMs
            ? currentStartIso
            : endDate;

        try {
          const result = computeSafeWithdraw({
            transactions,
            urssafRate: urssaf.urssaf_rate,
            expenses,
            periodStart: startDate,
            periodEnd: clampedEnd,
          });
          summaries.push({
            id: `bucket:${frequency}:${key}`,
            type: frequency,
            startDate,
            endDate: clampedEnd,
            result,
          });
        } catch (err) {
          setState({
            status: "error",
            error: err instanceof Error ? err.message : "compute failed",
          });
          return;
        }
      }

      summaries.sort((a, b) => b.startDate.localeCompare(a.startDate));
      setState({ status: "ready", periods: summaries });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, advancedMode, refreshTick]);

  // Realtime: anything that could change a bucket's contents (or the
  // current-period boundary, which gates which buckets count as
  // archived) should trigger a recomputation.
  useEffect(() => {
    if (!userId) return;
    if (advancedMode === undefined) return;

    const bump = () => setRefreshTick((t) => t + 1);

    let channel = supabase
      .channel(
        `previous-periods:${userId}:${advancedMode ? "adv" : "simple"}`,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "periods",
          filter: `user_id=eq.${userId}`,
        },
        bump,
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
