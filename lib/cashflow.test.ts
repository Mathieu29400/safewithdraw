import { describe, expect, it } from "vitest";

import {
  CASHFLOW_CONSTANTS,
  SECURITY_RESERVE_RATE,
  computeSafeWithdraw,
  computeSafeWithdrawSeries,
  type CashflowExpense,
  type CashflowTransaction,
} from "./cashflow";

const PERIOD_START = "2026-04-01T00:00:00Z";

function income(
  amount: number | string,
  at = "2026-04-15T10:00:00Z",
  vat_rate?: number | string | null,
): CashflowTransaction {
  return { type: "income", amount, created_at: at, vat_rate };
}

function withdrawal(amount: number | string, at = "2026-04-15T10:00:00Z"): CashflowTransaction {
  return { type: "withdrawal", amount, created_at: at };
}

function expense(
  amount: number | string,
  at = "2026-04-15T10:00:00Z",
  vat_rate?: number | string | null,
): CashflowExpense {
  return { amount, created_at: at, vat_rate };
}

describe("SECURITY_RESERVE_RATE", () => {
  it("is exactly 10% — non-negotiable product constant", () => {
    expect(SECURITY_RESERVE_RATE).toBe(0.1);
  });

  it("is frozen against accidental mutation", () => {
    expect(Object.isFrozen(CASHFLOW_CONSTANTS)).toBe(true);
    expect(() => {
      // @ts-expect-error — deliberately attempting forbidden mutation
      CASHFLOW_CONSTANTS.SECURITY_RESERVE_RATE = 0.05;
    }).toThrow();
  });
});

describe("computeSafeWithdraw — empty / no-op", () => {
  it("returns zeros when there are no transactions", () => {
    expect(
      computeSafeWithdraw({
        transactions: [],
        urssafRate: 0.218,
        periodStart: PERIOD_START,
      }),
    ).toEqual({
      ca: 0,
      vatCollected: 0,
      urssafDue: 0,
      reserve: 0,
      withdrawals: 0,
      expenses: 0,
      vatRecoverable: 0,
      safe: 0,
    });
  });
});

describe("computeSafeWithdraw — formula", () => {
  it("applies CA × (1 − rate − 0.10) − withdrawals", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.218,
      periodStart: PERIOD_START,
    });
    // CA=1000, urssaf=218, reserve=100, withdrawals=0 → safe=682
    expect(r).toEqual({
      ca: 1000,
      vatCollected: 0,
      urssafDue: 218,
      reserve: 100,
      withdrawals: 0,
      expenses: 0,
      vatRecoverable: 0,
      safe: 682,
    });
  });

  it("subtracts withdrawals from the safe amount", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000), withdrawal(200)],
      urssafRate: 0.218,
      periodStart: PERIOD_START,
    });
    expect(r.safe).toBe(482); // 682 - 200
    expect(r.withdrawals).toBe(200);
  });

  it("returns a NEGATIVE safe when the user has already over-withdrawn", () => {
    // Critical: do NOT clamp to zero. Negative is the warning signal.
    const r = computeSafeWithdraw({
      transactions: [income(1000), withdrawal(800)],
      urssafRate: 0.218,
      periodStart: PERIOD_START,
    });
    expect(r.safe).toBe(-118); // 1000 - 218 - 100 - 800
  });

  it("sums multiple incomes and withdrawals", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(500),
        income(300),
        income(200),
        withdrawal(50),
        withdrawal(50),
      ],
      urssafRate: 0.22,
      periodStart: PERIOD_START,
    });
    // CA=1000, urssaf=220, reserve=100, withdrawals=100 → safe=580
    expect(r).toEqual({
      ca: 1000,
      vatCollected: 0,
      urssafDue: 220,
      reserve: 100,
      withdrawals: 100,
      expenses: 0,
      vatRecoverable: 0,
      safe: 580,
    });
  });
});

describe("computeSafeWithdraw — VAT (TVA)", () => {
  // Spec invariants:
  //   - HT = TTC / (1 + vat_rate). NEVER `TTC * (1 - rate)`.
  //   - The safe-withdrawal formula consumes HT, never TTC.
  //   - VAT collected/recoverable is INFORMATIVE: it must NOT change `safe`.
  //   - Missing / null / 0 / out-of-range vat_rate ⇒ row treated as plain HT.

  it("splits 1200 € TTC at 20 % into 1000 € HT + 200 € TVA (canonical example)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1200, "2026-04-15T10:00:00Z", 0.2)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(1000);
    expect(r.vatCollected).toBe(200);
  });

  it("splits 100 € TTC at 20 % into 83.33 € HT + 16.67 € TVA", () => {
    const r = computeSafeWithdraw({
      transactions: [income(100, "2026-04-15T10:00:00Z", 0.2)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(83.33);
    expect(r.vatCollected).toBe(16.67);
  });

  it("uses TTC / (1 + rate) — NOT TTC × (1 − rate)", () => {
    // The wrong formula would yield 1200 * 0.8 = 960, off by 40 €.
    // The correct formula yields 1000 (1200 / 1.2). Pin it explicitly so
    // a future "simplification" can't quietly regress this rule.
    const r = computeSafeWithdraw({
      transactions: [income(1200, "2026-04-15T10:00:00Z", 0.2)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).not.toBe(960);
    expect(r.ca).toBe(1000);
  });

  it("URSSAF + reserve are computed off CA HT, not TTC", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1200, "2026-04-15T10:00:00Z", 0.2)],
      urssafRate: 0.22,
      periodStart: PERIOD_START,
    });
    // CA HT = 1000 (not 1200). URSSAF = 220, reserve = 100, safe = 680.
    expect(r.ca).toBe(1000);
    expect(r.urssafDue).toBe(220);
    expect(r.reserve).toBe(100);
    expect(r.safe).toBe(680);
  });

  it("supports the 10 % and 5.5 % presets", () => {
    const r10 = computeSafeWithdraw({
      transactions: [income(110, "2026-04-15T10:00:00Z", 0.1)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r10.ca).toBe(100);
    expect(r10.vatCollected).toBe(10);

    const r55 = computeSafeWithdraw({
      transactions: [income(105.5, "2026-04-15T10:00:00Z", 0.055)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r55.ca).toBe(100);
    expect(r55.vatCollected).toBe(5.5);
  });

  it("treats null / undefined / 0 vat_rate as 'no VAT'", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(100, "2026-04-15T10:00:00Z", null),
        income(100, "2026-04-15T10:00:00Z", undefined),
        income(100, "2026-04-15T10:00:00Z", 0),
      ],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(300);
    expect(r.vatCollected).toBe(0);
  });

  it("ignores withdrawals' vat_rate (withdrawals are personal cash movements)", () => {
    // A withdrawal row is not an invoice: even if a corrupt client sneaks
    // a vat_rate in, the engine must treat the amount as a flat negative.
    const r = computeSafeWithdraw({
      transactions: [
        income(1000),
        { type: "withdrawal", amount: 200, created_at: "2026-04-15T10:00:00Z", vat_rate: 0.2 },
      ],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.withdrawals).toBe(200);
  });

  it("mixes VAT and non-VAT incomes correctly", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(120, "2026-04-15T10:00:00Z", 0.2), // 100 HT + 20 TVA
        income(100, "2026-04-15T10:00:00Z"), // plain 100 HT
      ],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(200);
    expect(r.vatCollected).toBe(20);
  });

  it("accepts string vat_rate (postgrest numeric column)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1200, "2026-04-15T10:00:00Z", "0.2000")],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(1000);
    expect(r.vatCollected).toBe(200);
  });

  it("filters VAT-tagged incomes by period bounds", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(1200, "2026-03-31T23:59:59Z", 0.2), // before period — excluded
        income(120, "2026-04-15T10:00:00Z", 0.2), // included → 100 HT + 20 TVA
      ],
      urssafRate: 0,
      periodStart: PERIOD_START,
      periodEnd: "2026-05-01T00:00:00Z",
    });
    expect(r.ca).toBe(100);
    expect(r.vatCollected).toBe(20);
  });

  it("splits VAT on expenses into HT spend + recoverable VAT", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0,
      periodStart: PERIOD_START,
      expenses: [expense(120, "2026-04-15T10:00:00Z", 0.2)],
    });
    // Expense HT = 100, recoverable = 20.
    expect(r.expenses).toBe(100);
    expect(r.vatRecoverable).toBe(20);
    // Safe must use HT expense, not TTC: 1000 - 100 (reserve) - 100 (HT expense) = 800.
    expect(r.safe).toBe(800);
  });

  it("recoverable VAT does NOT enter the safe-withdrawal formula", () => {
    // Two scenarios with the same TTC expense — one VAT-flagged, one not.
    // The flagged scenario should yield a HIGHER `safe` because only HT
    // counts as a real expense, AND `vatRecoverable` must not feed back
    // into safe (otherwise we'd double-count it as if it were income).
    const noVat = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0,
      periodStart: PERIOD_START,
      expenses: [expense(120)],
    });
    const withVat = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0,
      periodStart: PERIOD_START,
      expenses: [expense(120, "2026-04-15T10:00:00Z", 0.2)],
    });
    expect(noVat.safe).toBe(780); // 1000 - 100 - 120
    expect(withVat.safe).toBe(800); // 1000 - 100 - 100 (HT only)
    // vatRecoverable is informational, not added back to safe.
    expect(withVat.vatRecoverable).toBe(20);
  });

  it("ignores out-of-range / non-finite vat_rate defensively", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(120, "2026-04-15T10:00:00Z", 1.5), // > 1 → ignored
        income(120, "2026-04-15T10:00:00Z", -0.2), // < 0 → ignored
        income(120, "2026-04-15T10:00:00Z", "abc"), // non-finite → ignored
      ],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    // Each of the three rows is treated as a plain 120 HT income.
    expect(r.ca).toBe(360);
    expect(r.vatCollected).toBe(0);
  });
});

describe("computeSafeWithdraw — business expenses (advanced mode)", () => {
  // The `expenses` array is opt-in. Its presence flips the formula from
  // base form to:
  //   safe = CA − URSSAF − reserve − withdrawals − expenses
  // Absence keeps base form, with `result.expenses === 0`.

  it("returns expenses=0 when the array is OMITTED (default / simple mode)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
    });
    expect(r.expenses).toBe(0);
    expect(r.safe).toBe(700); // 1000 - 200 - 100 - 0
  });

  it("returns expenses=0 when the array is EMPTY (advanced mode, no entries yet)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      expenses: [],
    });
    expect(r.expenses).toBe(0);
    expect(r.safe).toBe(700);
  });

  it("subtracts expenses from safe when present", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      expenses: [expense(50), expense(80)],
    });
    expect(r.expenses).toBe(130);
    expect(r.safe).toBe(570); // 1000 - 200 - 100 - 0 - 130
  });

  it("filters expenses by periodStart (inclusive)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      expenses: [
        expense(999, "2026-03-31T23:59:59Z"), // before period — excluded
        expense(50, PERIOD_START), // boundary — included
      ],
    });
    expect(r.expenses).toBe(50);
  });

  it("filters expenses by periodEnd (exclusive)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      periodEnd: "2026-05-01T00:00:00Z",
      expenses: [
        expense(50, "2026-04-15T12:00:00Z"), // inside — included
        expense(999, "2026-05-01T00:00:00Z"), // boundary — excluded
        expense(999, "2026-05-15T00:00:00Z"), // after — excluded
      ],
    });
    expect(r.expenses).toBe(50);
  });

  it("includes ALL expenses when no period bounds are set (all-time / dashboard)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(2000, "2025-06-01T00:00:00Z")],
      urssafRate: 0.2,
      expenses: [
        expense(100, "2024-01-01T00:00:00Z"),
        expense(200, "2026-04-15T00:00:00Z"),
      ],
    });
    expect(r.expenses).toBe(300);
  });

  it("accepts string amounts for expenses (postgrest numeric)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      expenses: [expense("49.99"), expense("100.01")],
    });
    expect(r.expenses).toBe(150);
  });

  it("ignores negative expense amounts defensively", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      expenses: [expense(50), expense(-9999)],
    });
    expect(r.expenses).toBe(50);
  });

  it("can drive safe negative if expenses dominate (no clamping)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(100)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
      expenses: [expense(500)],
    });
    // 100 - 20 - 10 - 0 - 500 = -430
    expect(r.safe).toBe(-430);
  });
});

describe("computeSafeWithdraw — period filtering", () => {
  it("ignores transactions strictly before periodStart", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(9999, "2026-03-31T23:59:59Z"), // previous period — excluded
        income(1000, "2026-04-01T00:00:00Z"), // included (inclusive boundary)
        income(500, "2026-04-15T12:00:00Z"), // included
      ],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(1500);
  });

  it("treats periodStart as inclusive", () => {
    const r = computeSafeWithdraw({
      transactions: [income(100, PERIOD_START)],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(100);
  });

  it("accepts a Date object as periodStart", () => {
    const r = computeSafeWithdraw({
      transactions: [income(100, "2026-04-15T00:00:00Z")],
      urssafRate: 0.2,
      periodStart: new Date(PERIOD_START),
    });
    expect(r.ca).toBe(100);
  });
});

describe("computeSafeWithdraw — all-time (no period bounds)", () => {
  it("includes EVERY transaction when both bounds are omitted", () => {
    // The dashboard runs in this mode: SafeWithdraw is a global, all-time
    // financial safety indicator. Past months and years must contribute.
    const r = computeSafeWithdraw({
      transactions: [
        income(1000, "2024-06-15T12:00:00Z"), // 2 years ago
        income(2000, "2025-12-15T12:00:00Z"), // last year
        income(3000, "2026-04-15T12:00:00Z"), // current month
        withdrawal(500, "2025-08-01T12:00:00Z"), // historical withdrawal
      ],
      urssafRate: 0.256,
      // periodStart and periodEnd both omitted → open on both sides.
    });
    expect(r.ca).toBe(6000);
    expect(r.withdrawals).toBe(500);
    // 6000 - (6000 * 0.256) - (6000 * 0.10) - 500 = 6000 - 1536 - 600 - 500 = 3364
    expect(r.safe).toBe(3364);
  });

  it("supports periodEnd alone (open lower bound)", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(1000, "1990-01-01T00:00:00Z"),
        income(500, "2026-04-15T12:00:00Z"),
      ],
      urssafRate: 0.2,
      periodEnd: "2026-05-01T00:00:00Z",
    });
    expect(r.ca).toBe(1500);
  });
});

describe("computeSafeWithdraw — period end (exclusive upper bound)", () => {
  it("excludes transactions ON or AFTER periodEnd (exclusive)", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(1000, "2026-04-15T10:00:00Z"),
        income(500, "2026-05-01T00:00:00Z"), // boundary — excluded
        income(200, "2026-05-15T00:00:00Z"), // outside — excluded
      ],
      urssafRate: 0.2,
      periodStart: "2026-04-01T00:00:00Z",
      periodEnd: "2026-05-01T00:00:00Z",
    });
    expect(r.ca).toBe(1000);
  });

  it("treats omitted periodEnd as no upper bound", () => {
    const r = computeSafeWithdraw({
      transactions: [
        income(1000, "2026-04-15T10:00:00Z"),
        income(500, "2027-12-31T23:59:59Z"), // far future — still included
      ],
      urssafRate: 0.2,
      periodStart: "2026-04-01T00:00:00Z",
    });
    expect(r.ca).toBe(1500);
  });

  it("scopes calculation correctly for a HISTORICAL period (March 2026)", () => {
    // Real-world scenario: user backfills March data while viewing the
    // March period. Only March transactions must show up.
    const r = computeSafeWithdraw({
      transactions: [
        income(2000, "2026-02-28T12:00:00Z"), // before March — excluded
        income(3000, "2026-03-10T12:00:00Z"), // inside March — included
        withdrawal(500, "2026-03-20T12:00:00Z"), // inside March — included
        income(1000, "2026-04-05T12:00:00Z"), // after March — excluded
      ],
      urssafRate: 0.256,
      periodStart: "2026-03-01T00:00:00Z",
      periodEnd: "2026-04-01T00:00:00Z",
    });
    expect(r.ca).toBe(3000);
    expect(r.withdrawals).toBe(500);
  });

  it("rejects an invalid periodEnd", () => {
    expect(() =>
      computeSafeWithdraw({
        transactions: [],
        urssafRate: 0.2,
        periodStart: PERIOD_START,
        periodEnd: "not-a-date",
      }),
    ).toThrow(/periodEnd/);
  });

  it("rejects periodEnd <= periodStart", () => {
    expect(() =>
      computeSafeWithdraw({
        transactions: [],
        urssafRate: 0.2,
        periodStart: "2026-04-01T00:00:00Z",
        periodEnd: "2026-04-01T00:00:00Z",
      }),
    ).toThrow(/periodEnd must be strictly after periodStart/);
  });
});

describe("computeSafeWithdraw — postgrest string numerics", () => {
  it("accepts string amounts (numeric columns from supabase-js)", () => {
    const r = computeSafeWithdraw({
      transactions: [income("1000.00"), withdrawal("200.50")],
      urssafRate: "0.2180", // numeric(5,4) string form
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(1000);
    expect(r.withdrawals).toBe(200.5);
    expect(r.urssafDue).toBe(218);
    expect(r.safe).toBe(481.5); // 1000 - 218 - 100 - 200.5
  });
});

describe("computeSafeWithdraw — edge rates", () => {
  it("works with rate = 0 (URSSAF-exempt activity)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    // safe = 1000 - 0 - 100 - 0 = 900
    expect(r.safe).toBe(900);
  });

  it("works at rate = 0.90 (extreme): only the reserve remains negative-pull", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000)],
      urssafRate: 0.9,
      periodStart: PERIOD_START,
    });
    // safe = 1000 - 900 - 100 - 0 = 0
    expect(r.safe).toBe(0);
  });

  it("rejects rate < 0", () => {
    expect(() =>
      computeSafeWithdraw({
        transactions: [],
        urssafRate: -0.01,
        periodStart: PERIOD_START,
      }),
    ).toThrow(/urssafRate/);
  });

  it("rejects rate > 1", () => {
    expect(() =>
      computeSafeWithdraw({
        transactions: [],
        urssafRate: 1.5,
        periodStart: PERIOD_START,
      }),
    ).toThrow(/urssafRate/);
  });
});

describe("computeSafeWithdraw — rounding", () => {
  it("rounds output to 2 decimals (centimes)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(123.456)], // intentionally over-precise input
      urssafRate: 0.218,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(123.46);
    expect(r.urssafDue).toBe(26.91); // 123.456 * 0.218 = 26.91...
    expect(r.reserve).toBe(12.35); // 123.456 * 0.10
  });

  it("does not return floating-point garbage like 0.30000000000004", () => {
    const r = computeSafeWithdraw({
      transactions: [income(0.1), income(0.2)],
      urssafRate: 0,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(0.3);
  });
});

describe("computeSafeWithdraw — defensive", () => {
  it("ignores negative amounts (impossible per CHECK constraint, but defend anyway)", () => {
    const r = computeSafeWithdraw({
      transactions: [income(1000), { ...income(-500), type: "income" }],
      urssafRate: 0.2,
      periodStart: PERIOD_START,
    });
    expect(r.ca).toBe(1000);
  });

  it("throws on non-finite urssafRate", () => {
    expect(() =>
      computeSafeWithdraw({
        transactions: [],
        urssafRate: "not-a-number",
        periodStart: PERIOD_START,
      }),
    ).toThrow(/urssafRate/);
  });

  it("throws on invalid periodStart", () => {
    expect(() =>
      computeSafeWithdraw({
        transactions: [],
        urssafRate: 0.2,
        periodStart: "not-a-date",
      }),
    ).toThrow(/periodStart/);
  });
});

describe("computeSafeWithdrawSeries", () => {
  // The chart's data source. Same formula as computeSafeWithdraw, applied
  // cumulatively day by day. Critical invariant: the last point of the
  // series must EQUAL the all-time computeSafeWithdraw result, otherwise
  // the chart would tell a different truth than the hero KPI.

  it("returns an empty series when there are no transactions", () => {
    expect(
      computeSafeWithdrawSeries({ transactions: [], urssafRate: 0.218 }),
    ).toEqual([]);
  });

  it("emits ONE point per UTC day with activity", () => {
    const points = computeSafeWithdrawSeries({
      transactions: [
        income(500, "2026-04-01T10:00:00Z"),
        income(300, "2026-04-01T15:00:00Z"), // same day → consolidated
        income(200, "2026-04-05T10:00:00Z"),
      ],
      urssafRate: 0.2,
    });
    expect(points).toHaveLength(2);
    expect(points[0].date).toBe("2026-04-01");
    expect(points[0].ca).toBe(800);
    expect(points[1].date).toBe("2026-04-05");
    expect(points[1].ca).toBe(1000);
  });

  it("emits points in chronological order even if input is shuffled", () => {
    const points = computeSafeWithdrawSeries({
      transactions: [
        income(100, "2026-04-15T00:00:00Z"),
        income(100, "2026-04-01T00:00:00Z"),
        income(100, "2026-04-08T00:00:00Z"),
      ],
      urssafRate: 0.2,
    });
    expect(points.map((p) => p.date)).toEqual([
      "2026-04-01",
      "2026-04-08",
      "2026-04-15",
    ]);
  });

  it("safe value at each point matches the cumulative formula", () => {
    const points = computeSafeWithdrawSeries({
      transactions: [
        income(1000, "2026-04-01T10:00:00Z"),
        withdrawal(200, "2026-04-05T10:00:00Z"),
      ],
      urssafRate: 0.2,
    });
    // Day 1: ca=1000, withdrawals=0 → safe = 1000 - 200 - 100 - 0 = 700
    expect(points[0].safe).toBe(700);
    // Day 2: ca=1000, withdrawals=200 → safe = 1000 - 200 - 100 - 200 = 500
    expect(points[1].safe).toBe(500);
  });

  it("the FINAL point matches computeSafeWithdraw all-time (single source of truth)", () => {
    const transactions: CashflowTransaction[] = [
      income(1500, "2025-06-15T12:00:00Z"),
      income(2300, "2026-01-10T12:00:00Z"),
      withdrawal(400, "2026-02-01T12:00:00Z"),
      income(800, "2026-04-15T12:00:00Z"),
    ];
    const expenses: CashflowExpense[] = [
      { amount: 50, created_at: "2025-12-01T00:00:00Z" },
      { amount: 120, created_at: "2026-03-01T00:00:00Z" },
    ];
    const series = computeSafeWithdrawSeries({
      transactions,
      urssafRate: 0.256,
      expenses,
    });
    const allTime = computeSafeWithdraw({
      transactions,
      urssafRate: 0.256,
      expenses,
    });
    expect(series.at(-1)!.safe).toBe(allTime.safe);
    expect(series.at(-1)!.ca).toBe(allTime.ca);
  });

  it("includes expenses cumulatively when provided", () => {
    const points = computeSafeWithdrawSeries({
      transactions: [income(1000, "2026-04-01T10:00:00Z")],
      urssafRate: 0.2,
      expenses: [
        { amount: 50, created_at: "2026-04-01T15:00:00Z" }, // same day as income
      ],
    });
    // ca=1000, withdrawals=0, expenses=50 → safe = 1000 - 200 - 100 - 0 - 50 = 650
    expect(points[0].safe).toBe(650);
  });

  it("ignores expenses when not provided (simple mode)", () => {
    const points = computeSafeWithdrawSeries({
      transactions: [income(1000, "2026-04-01T10:00:00Z")],
      urssafRate: 0.2,
    });
    // No expenses subtraction.
    expect(points[0].safe).toBe(700);
  });

  it("rejects an invalid urssafRate", () => {
    expect(() =>
      computeSafeWithdrawSeries({
        transactions: [income(100)],
        urssafRate: 1.5,
      }),
    ).toThrow(/urssafRate/);
  });

  it("uses UTC for day grouping (not local time)", () => {
    // Two events that are on the SAME UTC day but might land on different
    // local days for some users — must collapse into one point.
    const points = computeSafeWithdrawSeries({
      transactions: [
        income(100, "2026-04-15T01:00:00Z"),
        income(200, "2026-04-15T22:00:00Z"),
      ],
      urssafRate: 0.2,
    });
    expect(points).toHaveLength(1);
    expect(points[0].ca).toBe(300);
  });

  it("aggregates VAT-tagged incomes as HT for the chart series", () => {
    // The chart should show CA HT progression so it stays consistent with
    // the hero KPI. A 1200 € TTC invoice at 20 % must register as 1000 €
    // CA on the series — never 1200.
    const points = computeSafeWithdrawSeries({
      transactions: [income(1200, "2026-04-01T10:00:00Z", 0.2)],
      urssafRate: 0,
    });
    expect(points[0].ca).toBe(1000);
    expect(points[0].safe).toBe(900); // 1000 − reserve(100)
  });
});
