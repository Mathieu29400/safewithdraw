/**
 * Billing — shared helpers for the access rule and the trial badge.
 *
 * Single source of truth for "does this user still have access to the
 * dashboard?". Used by both the dashboard guard (redirect to /billing
 * when access is denied) and the /billing page (decide which CTA to
 * render: checkout vs customer portal).
 *
 * Access rule (per spec):
 *   - subscription_status = "active"            → access granted
 *   - subscription_status = "trialing"          → access granted while
 *                                                 trial_end is still in
 *                                                 the future
 *   - everything else (expired trial, past_due,
 *     canceled, incomplete)                     → access denied
 *
 * The 30-day free trial is configured at the database layer (default
 * value of `profiles.trial_end`); this module never invents trial
 * durations on the fly.
 */
import type { Profile } from "./database.types";

export type BillingStatus =
  | { kind: "trialing"; daysLeft: number; trialEnd: Date }
  | { kind: "trial-expired"; trialEnd: Date }
  | { kind: "active" }
  | { kind: "inactive" };

type ProfileBillingFields = Pick<
  Profile,
  "trial_end" | "subscription_status"
>;

export function getBillingStatus(
  profile: ProfileBillingFields,
  now: Date = new Date(),
): BillingStatus {
  if (profile.subscription_status === "active") {
    return { kind: "active" };
  }

  const trialEnd = new Date(profile.trial_end);

  if (profile.subscription_status === "trialing") {
    if (trialEnd.getTime() > now.getTime()) {
      return {
        kind: "trialing",
        daysLeft: daysBetween(now, trialEnd),
        trialEnd,
      };
    }
    return { kind: "trial-expired", trialEnd };
  }

  return { kind: "inactive" };
}

export function hasDashboardAccess(status: BillingStatus): boolean {
  return status.kind === "trialing" || status.kind === "active";
}

/**
 * French-aware "X jours restants" label for the dashboard trial badge.
 *
 *   30 → "30 jours restants"
 *   1  → "1 jour restant"
 *   0  → "moins d’une journée restante"
 */
export function formatDaysLeft(daysLeft: number): string {
  if (daysLeft <= 0) return "moins d’une journée restante";
  if (daysLeft === 1) return "1 jour restant";
  return `${daysLeft} jours restants`;
}

/**
 * Whole-day distance between two dates, rounded UP so a trial that
 * still has 1 hour left reads "1 jour restant" rather than "0".
 */
function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  if (ms <= 0) return 0;
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}
