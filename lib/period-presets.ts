/**
 * Period preset catalog — pure date math, no UI, no React.
 *
 * NOT USED by the dashboard. SafeWithdraw on the dashboard is a global,
 * all-time financial safety indicator and ignores periods entirely.
 *
 * This module exists for the future /analytics section: per-month, per-
 * quarter, per-semester, per-year roll-ups and comparisons. The shape is
 * `useSafeWithdraw(userId, preset.range)` — period support is already
 * wired through the engine and the hook, just not exposed in the UI yet.
 *
 * All bounds are UTC-anchored to keep the engine and the database on the
 * same clock — the transaction dialog stamps `created_at` at noon UTC,
 * which sits cleanly inside any UTC-aligned [start, end) window.
 */

import type { PeriodRange } from "./use-safe-withdraw";

export type PeriodPreset = {
  id: string;
  /** Short label suited for pill / tab UI. */
  label: string;
  /** Longer human label, e.g. "Avril 2026". */
  longLabel: string;
  range: PeriodRange;
};

export function buildAnalyticsPeriodPresets(
  now: Date = new Date(),
): ReadonlyArray<PeriodPreset> {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();

  const startOfThisMonth = utcMonth(y, m);
  const startOfNextMonth = utcMonth(y, m + 1);
  const startOfPrevMonth = utcMonth(y, m - 1);

  return [
    {
      id: "current-month",
      label: "Mois en cours",
      longLabel: capitalize(monthYear(startOfThisMonth)),
      range: {
        start: startOfThisMonth.toISOString(),
        end: startOfNextMonth.toISOString(),
      },
    },
    {
      id: "previous-month",
      label: "Mois précédent",
      longLabel: capitalize(monthYear(startOfPrevMonth)),
      range: {
        start: startOfPrevMonth.toISOString(),
        end: startOfThisMonth.toISOString(),
      },
    },
    quarterPreset(y, 1),
    quarterPreset(y, 2),
    quarterPreset(y, 3),
    quarterPreset(y, 4),
    semesterPreset(y, 1),
    semesterPreset(y, 2),
    {
      id: "all",
      label: "Tout",
      longLabel: "Tout depuis le début",
      range: { start: "1970-01-01T00:00:00.000Z" },
    },
  ];
}

function quarterPreset(year: number, q: 1 | 2 | 3 | 4): PeriodPreset {
  const startMonth = (q - 1) * 3;
  return {
    id: `quarter-${year}-q${q}`,
    label: `T${q} ${year}`,
    longLabel: `Trimestre T${q} ${year}`,
    range: {
      start: utcMonth(year, startMonth).toISOString(),
      end: utcMonth(year, startMonth + 3).toISOString(),
    },
  };
}

function semesterPreset(year: number, s: 1 | 2): PeriodPreset {
  const startMonth = (s - 1) * 6;
  return {
    id: `semester-${year}-s${s}`,
    label: `S${s} ${year}`,
    longLabel: `Semestre S${s} ${year}`,
    range: {
      start: utcMonth(year, startMonth).toISOString(),
      end: utcMonth(year, startMonth + 6).toISOString(),
    },
  };
}

function utcMonth(year: number, monthZeroBased: number): Date {
  return new Date(Date.UTC(year, monthZeroBased, 1, 0, 0, 0, 0));
}

function monthYear(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
