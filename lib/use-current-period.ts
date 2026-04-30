"use client";

/**
 * useCurrentPeriod — resolves the user's active URSSAF period.
 *
 * The "current period" is simply the most recent row in `periods` ordered by
 * `start_date DESC`. All transactions from that date onward belong to the
 * current period; everything before it is historical and does NOT affect the
 * live KPI.
 *
 * State shapes:
 *   - `{ status: "loading" }` → fetch in flight; callers should block their
 *     own fetches to prevent flashing all-time data before the period resolves.
 *   - `{ status: "ready"; periodStart: null }` → no period row yet. The KPI
 *     should fall back to all-time (backwards-compatible with pre-period users).
 *   - `{ status: "ready"; periodStart: string }` → ISO timestamp; scope KPI
 *     to transactions with `created_at >= periodStart`.
 *   - `{ status: "error"; error: string }` → treat like "ready/null" in the UI.
 *
 * Realtime: subscribes to Postgres Changes on `periods` so a "Nouvelle
 * période" insert instantly propagates to the KPI without a page refresh.
 */

import { useEffect, useState } from "react";

import { supabase } from "./supabase";

export type CurrentPeriodState =
  | { status: "loading" }
  | { status: "ready"; periodStart: string | null }
  | { status: "error"; error: string };

export function useCurrentPeriod(userId: string | null): CurrentPeriodState {
  const [state, setState] = useState<CurrentPeriodState>({ status: "loading" });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      const { data, error } = await supabase
        .from("periods")
        .select("start_date")
        .eq("user_id", userId)
        .order("start_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        setState({ status: "error", error: error.message });
        return;
      }

      setState({ status: "ready", periodStart: data?.start_date ?? null });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  // Realtime: rebuild the state whenever any period row changes for this user.
  // An INSERT (new period) is the common case; UPDATE/DELETE are also handled.
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
