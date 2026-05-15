"use client";

/**
 * useVatStatus — surveils the calendar-year revenue against the VAT
 * seuil majoré and exposes a UI-ready `VatStatus`.
 *
 * Why this hook is independent of the URSSAF period state:
 * VAT thresholds in France apply on a calendar-year basis
 * (1 January → 31 December), not on the user's URSSAF declaration
 * cadence (monthly or quarterly). So this hook completely ignores the
 * dashboard's period dropdown and always reports year-to-date totals.
 *
 * Data path:
 *   1. Load `urssaf_profile` for `activity_type` + `is_vat_registered`.
 *   2. Load every `transactions` row of `type='income'` for the current
 *      calendar year (no aggregation in SQL — we sum HT amounts client-
 *      side, which lets `lib/vat.ts` stay 100 % pure / testable).
 *   3. Compose a `VatStatus` via `computeVatStatus()`.
 *
 * Realtime: subscribes to both tables so changes propagate without a
 * page refresh:
 *   - `transactions`     → any income insert/update/delete bumps the
 *                          progress bar.
 *   - `urssaf_profile`   → if the user toggles `is_vat_registered` on
 *                          their account page, the dashboard widget
 *                          silences immediately.
 *
 * Year boundary: when the calendar rolls over (Dec 31 → Jan 1), the
 * SQL filter `created_at >= ${year}-01-01` naturally resets the
 * counter to 0 on the next render. There is no cron job, no stored
 * counter, no manual reset. The only edge case is a user who keeps
 * the dashboard open across midnight Dec 31 — that tab will still
 * show the previous year's total until the next realtime event or
 * page reload. Acceptable for v1; we could add a `setInterval(60_000)`
 * later if it becomes a real problem (likely never).
 */

import { useEffect, useState } from "react";

import { supabase } from "./supabase";
import {
  computeVatStatus,
  getVatCategoryForActivity,
  getVatThresholdForActivity,
  startOfYearIso,
  sumHtRevenue,
  type VatStatus,
} from "./vat";

export type VatStatusState =
  | { status: "loading" }
  | {
      status: "ready";
      vat: VatStatus;
      /**
       * Human-readable activity stored in `urssaf_profile.activity_type`.
       * Mirrored here so the widget can render "Dans ton cas (Freelance)"
       * without a second round-trip.
       */
      activityLabel: string;
    }
  /**
   * The user has no `urssaf_profile` row yet (typically: they haven't
   * completed onboarding). The widget renders nothing in this state.
   */
  | { status: "no-urssaf-profile" }
  | { status: "error"; error: string };

export function useVatStatus(userId: string | null): VatStatusState {
  const [state, setState] = useState<VatStatusState>({ status: "loading" });
  // Bumped by either of the two realtime channels below. Triggers a
  // full re-load of (profile + YTD transactions) on the next render.
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const load = async () => {
      // 1. URSSAF profile — drives the threshold and the silence flag.
      const { data: profile, error: profileError } = await supabase
        .from("urssaf_profile")
        .select("activity_type, is_vat_registered")
        .eq("user_id", userId)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        setState({ status: "error", error: profileError.message });
        return;
      }

      if (!profile) {
        // User hasn't finished onboarding — show nothing. The /onboarding
        // route enforces completion anyway, so this state is rare.
        setState({ status: "no-urssaf-profile" });
        return;
      }

      // 2. YTD income transactions — filtered server-side by created_at.
      //    No .limit() because a user with hundreds of small invoices
      //    must still see the right total. Even 5 000 rows return in
      //    < 100 ms with the existing user_id index.
      const year = new Date().getUTCFullYear();
      const { data: rows, error: txError } = await supabase
        .from("transactions")
        .select("amount, vat_rate")
        .eq("user_id", userId)
        .eq("type", "income")
        .gte("created_at", startOfYearIso(year));

      if (cancelled) return;

      if (txError) {
        setState({ status: "error", error: txError.message });
        return;
      }

      const revenueYTD = sumHtRevenue(rows ?? []);
      const threshold = getVatThresholdForActivity(profile.activity_type);
      const category = getVatCategoryForActivity(profile.activity_type);

      const vat = computeVatStatus({
        revenueYTD,
        threshold,
        category,
        isVatRegistered: profile.is_vat_registered ?? false,
      });

      setState({
        status: "ready",
        vat,
        activityLabel: profile.activity_type,
      });
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [userId, tick]);

  // Realtime — transactions: any income mutation refreshes the widget.
  // We don't filter by `type=income` in the realtime channel because
  // Supabase realtime doesn't support multi-column filters; we instead
  // refetch on any transaction change and let the SELECT filter to
  // income rows. Cheap enough — refetch is one indexed query.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`vat-status-tx:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "transactions",
          filter: `user_id=eq.${userId}`,
        },
        () => setTick((t) => t + 1),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  // Realtime — urssaf_profile: activity change (different threshold)
  // or is_vat_registered toggle (silence on/off) propagates instantly
  // across all open tabs / devices.
  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`vat-status-profile:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "urssaf_profile",
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
