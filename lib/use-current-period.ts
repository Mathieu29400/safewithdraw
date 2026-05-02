"use client";

/**
 * useCurrentPeriod — resolves the user's active URSSAF period.
 *
 * Selection rule: the most recent row in `periods` ordered by `start_date DESC`.
 *
 * Auto-rotation (the important UX rule):
 * The dashboard label MUST match the current calendar month / quarter. If
 * the latest period's `start_date` lies BEFORE the start of the current
 * calendar period (because the user was around in a previous month and
 * never explicitly reset), this hook quietly inserts a new period at the
 * calendar boundary and treats it as the active one. Effect:
 *   - User signed up in April, opens the app on May 2 → dashboard rolls
 *     to "Mai 2026" automatically.
 *   - All April data stays inside the previous (now archived) period —
 *     nothing is moved, nothing is lost, nothing is double-counted.
 *
 * Auto-create: if NO period row exists yet (brand-new user), one is
 * inserted with `start_date` = current calendar boundary:
 *   - monthly   → first day of the current UTC month
 *   - quarterly → first day of the current UTC quarter
 * Either way, transactions logged so far in the current period land
 * inside the KPI from the very first page load.
 *
 * Realtime: subscribes to Postgres Changes on `periods` so a "Nouvelle
 * période" insert instantly propagates to the KPI without a page refresh.
 */

import { useEffect, useState } from "react";

import type { PeriodType } from "./database.types";
import { supabase } from "./supabase";

export type CurrentPeriodState =
  | { status: "loading" }
  | {
      status: "ready";
      periodStart: string;
      /**
       * Frequency stored on the active period row. The dashboard label
       * derives from THIS, not from `urssaf_profile.declaration_frequency`,
       * so a period created when the user was monthly stays labelled as a
       * month even after they switch to quarterly mid-year.
       */
      periodType: PeriodType;
    }
  | { status: "error"; error: string };

// ---------------------------------------------------------------------------
// Boundary helpers — all return ISO strings at 00:00:00.000Z
// ---------------------------------------------------------------------------

/** First moment of the current UTC month, e.g. "2026-04-01T00:00:00.000Z". */
function startOfMonthUTC(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

/** First moment of the current UTC quarter (Jan/Apr/Jul/Oct 1). */
function startOfQuarterUTC(): string {
  const d = new Date();
  const quarterStartMonth = Math.floor(d.getUTCMonth() / 3) * 3;
  return new Date(Date.UTC(d.getUTCFullYear(), quarterStartMonth, 1)).toISOString();
}

// ---------------------------------------------------------------------------
// Insert helper — used both for the very-first period and for auto-rotation.
// Keeping it in one place ensures the race-handling (concurrent tab re-fetch)
// is identical in both code paths.
// ---------------------------------------------------------------------------

type Setter = (next: CurrentPeriodState) => void;

async function insertAndApply(args: {
  userId: string;
  frequency: PeriodType;
  startDate: string;
  cancelledRef: () => boolean;
  setState: Setter;
  fallback?: { periodStart: string; periodType: PeriodType };
}): Promise<void> {
  const { userId, frequency, startDate, cancelledRef, setState, fallback } = args;

  const { data: created, error: insertError } = await supabase
    .from("periods")
    .insert({
      user_id: userId,
      type: frequency,
      start_date: startDate,
      current_ca: 0,
    })
    .select("start_date, type")
    .single();

  if (cancelledRef()) return;

  if (!insertError && created) {
    setState({
      status: "ready",
      periodStart: created.start_date,
      periodType: created.type as PeriodType,
    });
    return;
  }

  // Insert failed — most often this is a concurrent tab that already
  // inserted the same boundary row. Re-fetch the latest and apply it.
  const { data: retry } = await supabase
    .from("periods")
    .select("start_date, type")
    .eq("user_id", userId)
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (cancelledRef()) return;

  if (retry) {
    setState({
      status: "ready",
      periodStart: retry.start_date,
      periodType: retry.type as PeriodType,
    });
    return;
  }

  if (fallback) {
    setState({
      status: "ready",
      periodStart: fallback.periodStart,
      periodType: fallback.periodType,
    });
    return;
  }

  setState({
    status: "error",
    error: insertError?.message ?? "period creation failed",
  });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCurrentPeriod(userId: string | null): CurrentPeriodState {
  const [state, setState] = useState<CurrentPeriodState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      // ── 1. Resolve the user's declared frequency ────────────────────────
      // We need this BEFORE anything else: it dictates which calendar
      // boundary we measure against (month vs. quarter), and which `type`
      // we stamp on any rows we insert.
      const { data: urssaf } = await supabase
        .from("urssaf_profile")
        .select("declaration_frequency")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      const frequency =
        (urssaf?.declaration_frequency as PeriodType | undefined) ?? "monthly";
      const calendarBoundary =
        frequency === "quarterly" ? startOfQuarterUTC() : startOfMonthUTC();

      // ── 2. Look for the most recent period row ──────────────────────────
      const { data, error } = await supabase
        .from("periods")
        .select("id, start_date, type")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setState({ status: "error", error: error.message });
        return;
      }

      // ── 3. No period at all → create the initial one ────────────────────
      if (!data) {
        await insertAndApply({
          userId,
          frequency,
          startDate: calendarBoundary,
          cancelledRef: () => cancelled,
          setState,
        });
        return;
      }

      // ── 4. Latest period is stale → auto-rotate ─────────────────────────
      // "Stale" means the start_date lies strictly before the start of
      // today's calendar month/quarter. We never touch the existing row;
      // we just insert a new one at the calendar boundary so the user's
      // dashboard rolls forward to the right month automatically.
      if (new Date(data.start_date).getTime() < new Date(calendarBoundary).getTime()) {
        await insertAndApply({
          userId,
          frequency,
          startDate: calendarBoundary,
          cancelledRef: () => cancelled,
          setState,
          // Fallback to keeping the (stale) latest period if the rotate
          // insert fails for any reason — better stale label than a
          // broken dashboard.
          fallback: {
            periodStart: data.start_date,
            periodType: data.type as PeriodType,
          },
        });
        return;
      }

      // ── 5. Latest period is fresh enough — use it as-is ─────────────────
      setState({
        status: "ready",
        periodStart: data.start_date,
        periodType: data.type as PeriodType,
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  // Realtime: bump tick whenever any period row changes for this user.
  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`current-period:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "periods",
          filter: `user_id=eq.${userId}`,
        },
        () => setTick((t) => t + 1),
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  return state;
}
