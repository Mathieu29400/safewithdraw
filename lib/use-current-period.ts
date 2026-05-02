"use client";

/**
 * useCurrentPeriod — resolves the user's active URSSAF period.
 *
 * Selection rule: the most recent row in `periods` ordered by `start_date DESC`.
 *
 * Auto-create: if no period row exists yet, one is inserted automatically
 * with `start_date` = start of the user's current URSSAF declaration period:
 *   - monthly   → first day of the current UTC month   at 00:00:00Z
 *   - quarterly → first day of the current UTC quarter at 00:00:00Z
 * These backdated boundaries ensure any transaction logged so far in the
 * current month/quarter is included in the KPI on the very first page load.
 *
 * Manual reset (the "Nouvelle période URSSAF" button) is intentionally
 * different: it stores `start_date = new Date().toISOString()` — the exact
 * instant of the click — so every transaction that exists *before* that
 * moment is excluded and the KPI restarts from zero.
 *
 * The hook returns whatever `start_date` is stored in the database, with
 * NO normalization. This is critical: normalizing a manual reset back to
 * midnight UTC would re-include same-day transactions and defeat the reset.
 *
 * Realtime: subscribes to Postgres Changes on `periods` so a "Nouvelle
 * période" insert instantly propagates to the KPI without a page refresh.
 */

import { useEffect, useState } from "react";

import type { PeriodType } from "./database.types";
import { supabase } from "./supabase";

export type CurrentPeriodState =
  | { status: "loading" }
  | { status: "ready"; periodStart: string }
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
// Hook
// ---------------------------------------------------------------------------

export function useCurrentPeriod(userId: string | null): CurrentPeriodState {
  const [state, setState] = useState<CurrentPeriodState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      // ── 1. Look for the most recent period row ──────────────────────────
      const { data, error } = await supabase
        .from("periods")
        .select("id, start_date")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setState({ status: "error", error: error.message });
        return;
      }

      if (data) {
        // Return whatever is stored — no normalization. The KPI filter is
        // `created_at >= start_date`, which is correct regardless of whether
        // start_date is at midnight UTC (initial period) or an exact timestamp
        // (manual reset).
        setState({ status: "ready", periodStart: data.start_date });
        return;
      }

      // ── 2. No period — fetch declaration frequency for correct boundary ─
      const { data: urssaf } = await supabase
        .from("urssaf_profile")
        .select("declaration_frequency")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      const frequency =
        (urssaf?.declaration_frequency as PeriodType | undefined) ?? "monthly";
      const startDate =
        frequency === "quarterly" ? startOfQuarterUTC() : startOfMonthUTC();

      // ── 3. Insert the initial period ────────────────────────────────────
      const { data: created, error: insertError } = await supabase
        .from("periods")
        .insert({
          user_id: userId,
          type: frequency,
          start_date: startDate,
          current_ca: 0,
        })
        .select("start_date")
        .single();

      if (cancelled) return;

      if (insertError || !created) {
        // Concurrent tab may have already inserted — re-fetch to get it.
        const { data: retry } = await supabase
          .from("periods")
          .select("start_date")
          .eq("user_id", userId)
          .order("start_date", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (cancelled) return;

        if (retry) {
          setState({ status: "ready", periodStart: retry.start_date });
        } else {
          setState({
            status: "error",
            error: insertError?.message ?? "period creation failed",
          });
        }
        return;
      }

      setState({ status: "ready", periodStart: created.start_date });
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
