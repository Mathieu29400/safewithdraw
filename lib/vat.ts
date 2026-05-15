/**
 * VAT threshold engine — pure logic.
 *
 * Surveils the "franchise en base de TVA" annual revenue threshold for
 * micro-entrepreneurs. The user crosses two zones BEFORE losing the
 * exoneration: a soft warning at 70 % of the seuil majoré, and a
 * hard warning at 90 %. Crossing 100 % means VAT must be invoiced from
 * the next day onwards.
 *
 * 2026 thresholds — same as 2025, the proposed 25 000 € unified seuil
 * was abandoned by the law of November 3rd 2025.
 *   - services        → 41 250 € HT (seuil majoré / tolérance)
 *   - goods (vente)   → 93 500 € HT (seuil majoré / tolérance)
 *
 * NB: thresholds apply on a calendar-year basis (1 jan → 31 dec),
 * independently of the user's URSSAF declaration frequency (monthly or
 * quarterly). The caller is responsible for passing in `totalRevenueYTD`
 * computed on the calendar year. See dashboard hook for the SQL filter.
 *
 * All functions in this module are pure: same inputs → same outputs,
 * no I/O, no Supabase, fully unit-testable via `lib/vat.test.ts`.
 */

import {
  CUSTOM_ACTIVITY_ID,
  URSSAF_ACTIVITIES,
  type VatCategory,
} from "./urssaf-activities";

/** Seuil majoré (tolérance) per category — 2026 values, in € HT. */
export const VAT_THRESHOLDS: Record<VatCategory, number> = {
  services: 41_250,
  goods: 93_500,
};

/** Soft warning trigger: 70 % of the threshold. */
export const VAT_WARNING_THRESHOLD_RATIO = 0.7;
/** Hard warning trigger: 90 % of the threshold. */
export const VAT_DANGER_THRESHOLD_RATIO = 0.9;

/**
 * Minimum number of days of activity before we trust the linear
 * projection of when the threshold will be crossed. Below this, the
 * daily average is too noisy and would yield absurd dates (e.g. "you'll
 * cross it in 1989"). Tuned empirically — ~2 months is the smallest
 * window that survives a single big invoice without flipping the date.
 */
const MIN_DAYS_FOR_PROJECTION = 60;

const DAY_MS = 1000 * 60 * 60 * 24;

export type VatStatusLevel =
  /** User already invoices VAT → no alert at all. */
  | "registered"
  /** Below 70 % of the seuil majoré. */
  | "safe"
  /** 70 % – 90 %. Soft yellow alert. */
  | "warning"
  /** 90 % – 100 %. Hard amber alert. */
  | "danger"
  /** Past 100 %. User must invoice VAT from the next day. */
  | "exceeded";

export type VatStatus = {
  level: VatStatusLevel;
  category: VatCategory;
  /** Seuil majoré in € HT (41 250 or 93 500). */
  threshold: number;
  /** Cumulative HT revenue since the 1st of January, in €. */
  revenueYTD: number;
  /**
   * `revenueYTD / threshold`. Capped at `Infinity` only when threshold
   * is somehow 0; otherwise always finite and >= 0. NOT clamped to 1
   * because callers (banners, copy) need to know how far over the user
   * went, e.g. "118 % du seuil dépassé".
   */
  ratio: number;
  /** Same as `ratio` but clamped to [0, 1] — convenient for progress bars. */
  ratioClamped: number;
  /**
   * Remaining HT revenue before hitting the seuil majoré. Negative
   * once the threshold is exceeded (representing the overshoot).
   */
  remaining: number;
  /**
   * Estimated date the user will cross the seuil majoré, based on the
   * year-to-date daily average. `null` when:
   *   - user already invoices VAT (no projection needed),
   *   - threshold already exceeded (in the past),
   *   - revenue is 0 (no rate to extrapolate from),
   *   - too few days have elapsed since 1 jan (projection too noisy),
   *   - the projected date falls outside the current calendar year
   *     (we never project across the year boundary).
   */
  projectedExceedDate: Date | null;
};

/* -------------------------------------------------------------------------- */
/* Threshold derivation                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Resolves a stored `urssaf_profile.activity_type` to its VAT category.
 *
 * For the 5 preset activities, matches on the stable `name` string.
 * For custom activities (free-form rate), defaults to "services" —
 * the more conservative choice (lower threshold = earlier alerts).
 * Most micro-entrepreneurs entering a custom rate are doing ACRE or a
 * niche service, very rarely vente/hébergement.
 */
export function getVatCategoryForActivity(activityType: string): VatCategory {
  const preset = URSSAF_ACTIVITIES.find((a) => a.name === activityType);
  if (preset) return preset.vatCategory;
  return "services";
}

/** Shortcut: directly returns the € HT threshold for a stored activity. */
export function getVatThresholdForActivity(activityType: string): number {
  return VAT_THRESHOLDS[getVatCategoryForActivity(activityType)];
}

/**
 * Same as `getVatCategoryForActivity` but takes an activity id (as used
 * in the picker UI before the row is saved). Useful for previewing the
 * threshold while the user is still on the onboarding form.
 */
export function getVatCategoryForActivityId(activityId: string): VatCategory {
  if (activityId === CUSTOM_ACTIVITY_ID) return "services";
  const preset = URSSAF_ACTIVITIES.find((a) => a.id === activityId);
  if (preset) return preset.vatCategory;
  return "services";
}

/* -------------------------------------------------------------------------- */
/* HT conversion                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Converts a transaction `amount` to its HT counterpart given an optional
 * `vat_rate`. Mirrors the semantics documented on `transactions.vat_rate`:
 *   - `vat_rate === null` → `amount` is already net HT (no VAT invoiced).
 *   - `vat_rate > 0`      → `amount` is TTC, divide by `1 + rate`.
 *
 * Keeps the math identity-safe on edge inputs (negative, NaN, Infinity)
 * by collapsing those to 0 — there's no sane "HT" of an invalid amount.
 */
export function toHt(amount: number, vatRate: number | null): number {
  if (!Number.isFinite(amount) || amount < 0) return 0;
  if (vatRate === null || vatRate === 0) return amount;
  if (!Number.isFinite(vatRate) || vatRate < 0) return amount;
  return amount / (1 + vatRate);
}

/**
 * Sums an array of `{ amount, vat_rate }` rows into a single HT total.
 * Designed to take the result of a Supabase income-only query for the
 * current calendar year directly.
 */
export function sumHtRevenue(
  rows: ReadonlyArray<{ amount: number; vat_rate: number | null }>,
): number {
  let sum = 0;
  for (const row of rows) {
    sum += toHt(row.amount, row.vat_rate);
  }
  return Math.round(sum * 100) / 100;
}

/* -------------------------------------------------------------------------- */
/* Year-to-date helpers                                                       */
/* -------------------------------------------------------------------------- */

/** ISO timestamp for `${year}-01-01T00:00:00.000Z`. */
export function startOfYearIso(year: number): string {
  return new Date(Date.UTC(year, 0, 1, 0, 0, 0)).toISOString();
}

/** ISO timestamp for `${year}-12-31T23:59:59.999Z`. */
export function endOfYearIso(year: number): string {
  return new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999)).toISOString();
}

/**
 * Number of full days between Jan 1st of the year and `now`, with a
 * minimum of 1 to avoid division-by-zero on Jan 1st. Computed in UTC
 * to stay consistent with the Supabase queries that are also UTC.
 */
export function daysElapsedInYear(now: Date): number {
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), 0, 1, 0, 0, 0),
  ).getTime();
  const elapsed = (now.getTime() - start) / DAY_MS;
  return Math.max(1, elapsed);
}

/* -------------------------------------------------------------------------- */
/* Status computation                                                         */
/* -------------------------------------------------------------------------- */

export type ComputeVatStatusInput = {
  /** Cumulative HT revenue since Jan 1st of the current year. */
  revenueYTD: number;
  /** Seuil majoré (en € HT). Pass `VAT_THRESHOLDS[category]` or use
   *  `getVatThresholdForActivity` upstream. */
  threshold: number;
  /** VAT category, mostly informational for downstream UI / copy. */
  category: VatCategory;
  /** `true` when the user already invoices VAT — short-circuits to
   *  `level: 'registered'`. */
  isVatRegistered: boolean;
  /** "Now" — injected for deterministic testing. Defaults to wall clock. */
  now?: Date;
};

/**
 * Pure VAT status computation. Given the inputs above, returns a
 * `VatStatus` that the UI can render directly:
 *   - badges / banners watch `level`,
 *   - the progress bar uses `ratioClamped`,
 *   - the "at this rate, you'll cross X by..." line uses
 *     `projectedExceedDate` (and falls back gracefully when null).
 *
 * The function never throws and never mutates inputs.
 */
export function computeVatStatus({
  revenueYTD,
  threshold,
  category,
  isVatRegistered,
  now = new Date(),
}: ComputeVatStatusInput): VatStatus {
  const safeRevenue = Number.isFinite(revenueYTD) && revenueYTD > 0
    ? revenueYTD
    : 0;
  const safeThreshold = Number.isFinite(threshold) && threshold > 0
    ? threshold
    : VAT_THRESHOLDS[category];

  const ratio = safeRevenue / safeThreshold;
  const ratioClamped = Math.min(1, Math.max(0, ratio));
  const remaining = safeThreshold - safeRevenue;

  let level: VatStatusLevel;
  if (isVatRegistered) {
    level = "registered";
  } else if (ratio >= 1) {
    level = "exceeded";
  } else if (ratio >= VAT_DANGER_THRESHOLD_RATIO) {
    level = "danger";
  } else if (ratio >= VAT_WARNING_THRESHOLD_RATIO) {
    level = "warning";
  } else {
    level = "safe";
  }

  const projectedExceedDate = computeProjectedExceedDate({
    revenueYTD: safeRevenue,
    threshold: safeThreshold,
    isVatRegistered,
    now,
  });

  return {
    level,
    category,
    threshold: safeThreshold,
    revenueYTD: safeRevenue,
    ratio,
    ratioClamped,
    remaining,
    projectedExceedDate,
  };
}

/**
 * Linear projection of the date the user will cross the seuil majoré
 * given their year-to-date pace. Intentionally simple — a smarter
 * seasonal model would over-fit for users with only a few months of
 * history.
 *
 * Returns `null` when projection isn't meaningful (see VatStatus doc).
 * Exported separately so the dashboard can also use it in isolation
 * (e.g. tests, "what-if" tooling).
 */
export function computeProjectedExceedDate({
  revenueYTD,
  threshold,
  isVatRegistered,
  now,
}: {
  revenueYTD: number;
  threshold: number;
  isVatRegistered: boolean;
  now: Date;
}): Date | null {
  if (isVatRegistered) return null;
  if (revenueYTD <= 0) return null;
  if (revenueYTD >= threshold) return null;

  const daysElapsed = daysElapsedInYear(now);
  if (daysElapsed < MIN_DAYS_FOR_PROJECTION) return null;

  const dailyAverage = revenueYTD / daysElapsed;
  if (!Number.isFinite(dailyAverage) || dailyAverage <= 0) return null;

  const remaining = threshold - revenueYTD;
  const daysToCross = remaining / dailyAverage;
  if (!Number.isFinite(daysToCross) || daysToCross < 0) return null;

  const projected = new Date(now.getTime() + daysToCross * DAY_MS);

  // We never project across the year boundary — the threshold resets
  // on Jan 1st anyway, so a projection in February of next year is
  // misleading. Returning `null` lets the UI render "tu n'atteindras
  // probablement pas le seuil cette année" instead.
  const endOfYear = new Date(
    Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999),
  );
  if (projected > endOfYear) return null;

  return projected;
}
