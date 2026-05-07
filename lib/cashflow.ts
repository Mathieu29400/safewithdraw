/**
 * SafeWithdraw — cashflow engine.
 *
 * Single source of truth for the safe-withdrawal formula:
 *
 *     safe = CA_HT − (CA_HT × urssaf_rate) − (CA_HT × SECURITY_RESERVE_RATE)
 *                  − withdrawals
 *                  − expenses_HT    // ONLY when advanced mode is enabled
 *
 * VAT (TVA) — value-added tax handling
 * ------------------------------------
 * Each transaction / expense can be tagged with a `vat_rate` (e.g. 0.20
 * for 20 %, 0.10, 0.055). When a row carries a VAT rate, its `amount`
 * is interpreted as TTC (tax included) and the engine derives the HT
 * value via the standard formula:
 *
 *     HT = TTC / (1 + vat_rate)
 *
 * IMPORTANT: this is NOT the same as `TTC × (1 − vat_rate)` — that
 * mistake would systematically under-count HT. Example: 1200 € TTC at
 * 20 % is 1000 € HT (not 960 €). When `vat_rate` is null/0/undefined
 * the row is treated as net revenue (no VAT) and HT === TTC.
 *
 * The KPI / safe-withdrawal computation uses HT amounts for both
 * income and expenses. The collected / recoverable VAT amounts are
 * surfaced in the result so the dashboard can display them as
 * informative breakdowns ("TVA collectée estimée" / "TVA récupérable
 * estimée") without touching the safe number itself.
 *
 * Business expenses are an opt-in concept. The engine subtracts them from
 * `safe` if and only if the caller passes an `expenses` array — when omitted
 * (the default for the simple dashboard), `result.expenses` is 0 and the
 * formula reduces to its base form. This keeps the first-time UX trivial
 * while letting power users plug in real expense tracking without forking
 * the engine.
 *
 * The 10% security reserve is a non-negotiable part of the product. It is
 * frozen at module load via `Object.freeze` to make accidental mutation in
 * tests or callsites a runtime error in strict mode.
 *
 * The engine is deliberately pure (no Supabase, no React) so it can be
 * unit-tested in isolation and reused by anything that has the inputs:
 * the React hook, server actions, future Edge Functions, etc.
 */

export const SECURITY_RESERVE_RATE = 0.1 as const;

/**
 * Frozen so `(SECURITY_RESERVE_RATE as number) = 0.05` is impossible at
 * runtime in strict mode. Const + frozen object = belt and braces.
 */
export const CASHFLOW_CONSTANTS = Object.freeze({
  SECURITY_RESERVE_RATE,
});

export type CashflowTransaction = {
  type: "income" | "withdrawal";
  /**
   * Postgres `numeric(14,2)` columns come back from supabase-js as strings
   * to preserve precision. We accept both shapes and coerce internally.
   *
   * For incomes: TTC when `vat_rate` is set, otherwise net revenue.
   * For withdrawals: gross amount actually transferred to the user — VAT
   * does not apply (a withdrawal is a personal cash movement, not an
   * invoice).
   */
  amount: number | string;
  created_at: string | Date;
  /**
   * Decimal VAT rate (e.g. 0.2 for 20 %). `null` / `undefined` / 0 means
   * no VAT was applied — the amount is treated as plain HT. Only honoured
   * for incomes; ignored for withdrawals.
   */
  vat_rate?: number | string | null;
};

/**
 * A business expense (e.g. software subscription, hardware, fuel). Same shape
 * as a transaction sans the `type` discriminator — every row is a debit.
 *
 * `vat_rate` works the same way as on incomes: when set, `amount` is TTC,
 * the engine reduces it to HT, and the difference goes to `vatRecoverable`.
 */
export type CashflowExpense = {
  amount: number | string;
  created_at: string | Date;
  vat_rate?: number | string | null;
};

export type CashflowInputs = {
  transactions: ReadonlyArray<CashflowTransaction>;
  /** Decimal, e.g. 0.218 for 21.8 %. Accepts string for the same reason. */
  urssafRate: number | string;
  /**
   * Inclusive lower bound on `created_at`. Omit for an open-ended view that
   * includes ALL transactions — this is the default the dashboard uses,
   * making SafeWithdraw a global, all-time financial safety indicator.
   */
  periodStart?: string | Date;
  /**
   * Exclusive upper bound on `created_at`. Omit for no upper bound. Used
   * by future analytics views to scope to a specific month / quarter /
   * semester / year.
   */
  periodEnd?: string | Date;
  /**
   * Business expenses, opt-in. Provide ONLY when the user has enabled
   * advanced mode. Filtered by the same period bounds as transactions.
   * When omitted, `result.expenses === 0` and `safe` is unaffected.
   */
  expenses?: ReadonlyArray<CashflowExpense>;
};

export type CashflowResult = {
  /**
   * Sum of incomes since `periodStart`, expressed as HT (tax-excluded).
   * This is the value the URSSAF / reserve / safe-withdrawal formula
   * runs against. For rows without a VAT rate this equals the raw
   * amount; for VAT-tagged rows it is `amount / (1 + vat_rate)`.
   */
  ca: number;
  /**
   * Estimated VAT collected on incomes (only sums up rows that carry a
   * VAT rate). Informational — not part of the safe-withdrawal formula.
   */
  vatCollected: number;
  /** `caHT * urssafRate` — what the user owes URSSAF on this period's CA HT. */
  urssafDue: number;
  /** `caHT * SECURITY_RESERVE_RATE` — mandatory cushion. */
  reserve: number;
  /**
   * Sum of withdrawals since `periodStart`. Pure cash movements, never
   * adjusted for VAT.
   */
  withdrawals: number;
  /**
   * Sum of business expenses HT in the period, or 0 if expenses were not
   * provided (advanced mode off). Always present in the result so the UI
   * can render a stable shape regardless of mode.
   */
  expenses: number;
  /**
   * Estimated recoverable VAT on expenses (rows that carry a VAT rate).
   * Informational — does NOT affect the safe number, since "récupérable"
   * means the user reclaims it from the tax authority, not that it
   * unlocks more withdrawable cash.
   */
  vatRecoverable: number;
  /**
   * Final amount the user can safely withdraw right now. May be negative
   * if the user has already withdrawn more than the formula allows — the
   * UI should surface that as a warning rather than clamp to zero, because
   * silently clamping would hide a real problem.
   */
  safe: number;
};

export function computeSafeWithdraw(input: CashflowInputs): CashflowResult {
  let periodStartMs = Number.NEGATIVE_INFINITY;
  if (input.periodStart !== undefined) {
    periodStartMs = toDate(input.periodStart).getTime();
    if (Number.isNaN(periodStartMs)) {
      throw new Error("computeSafeWithdraw: invalid periodStart");
    }
  }

  let periodEndMs = Number.POSITIVE_INFINITY;
  if (input.periodEnd !== undefined) {
    periodEndMs = toDate(input.periodEnd).getTime();
    if (Number.isNaN(periodEndMs)) {
      throw new Error("computeSafeWithdraw: invalid periodEnd");
    }
    if (periodEndMs <= periodStartMs) {
      throw new Error(
        "computeSafeWithdraw: periodEnd must be strictly after periodStart",
      );
    }
  }

  const urssafRate = toFiniteNumber(input.urssafRate, "urssafRate");
  if (urssafRate < 0 || urssafRate > 1) {
    throw new Error(
      `computeSafeWithdraw: urssafRate must be in [0, 1], got ${urssafRate}`,
    );
  }

  let ca = 0;
  let vatCollected = 0;
  let withdrawals = 0;

  for (const t of input.transactions) {
    const ts = toDate(t.created_at).getTime();
    if (Number.isNaN(ts) || ts < periodStartMs || ts >= periodEndMs) continue;

    const amount = toFiniteNumber(t.amount, "transaction.amount");
    if (amount < 0) continue;

    if (t.type === "income") {
      const { ht, vat } = splitVat(amount, t.vat_rate);
      ca += ht;
      vatCollected += vat;
    } else if (t.type === "withdrawal") {
      // Withdrawals never carry VAT (personal cash movement, not an invoice).
      // We deliberately ignore any `vat_rate` set on a withdrawal row.
      withdrawals += amount;
    }
  }

  let expensesHt = 0;
  let vatRecoverable = 0;
  if (input.expenses) {
    for (const e of input.expenses) {
      const ts = toDate(e.created_at).getTime();
      if (Number.isNaN(ts) || ts < periodStartMs || ts >= periodEndMs) continue;

      const amount = toFiniteNumber(e.amount, "expense.amount");
      if (amount < 0) continue;

      const { ht, vat } = splitVat(amount, e.vat_rate);
      expensesHt += ht;
      vatRecoverable += vat;
    }
  }

  const urssafDue = ca * urssafRate;
  const reserve = ca * SECURITY_RESERVE_RATE;
  const safe = ca - urssafDue - reserve - withdrawals - expensesHt;

  return {
    ca: round2(ca),
    vatCollected: round2(vatCollected),
    urssafDue: round2(urssafDue),
    reserve: round2(reserve),
    withdrawals: round2(withdrawals),
    expenses: round2(expensesHt),
    vatRecoverable: round2(vatRecoverable),
    safe: round2(safe),
  };
}

/**
 * Time-series variant of `computeSafeWithdraw`, used by the dashboard chart.
 *
 * Returns ONE point per UTC day on which there was at least one event, with
 * the snapshot reflecting the cumulative state AFTER all that day's events
 * have been applied. Lives in the same module on purpose: it reuses the same
 * constants (`SECURITY_RESERVE_RATE`), the same validation primitives, and
 * the same formula. The chart is therefore a different VIEW of the same
 * truth — never an independent re-implementation of it.
 *
 * Inputs are deliberately the subset of `CashflowInputs` the chart actually
 * needs: no period bounds (we want the full history) and no rounding choices
 * to propagate. The output is rounded to 2 decimals like everywhere else.
 */
export type CashflowPoint = {
  /** UTC day, formatted YYYY-MM-DD. Stable, sortable, locale-free. */
  date: string;
  /** Millisecond timestamp at end-of-day UTC, for time-axis math. */
  ts: number;
  /** Cumulative CA HT. */
  ca: number;
  safe: number;
};

export type CashflowSeriesInputs = {
  transactions: ReadonlyArray<CashflowTransaction>;
  urssafRate: number | string;
  expenses?: ReadonlyArray<CashflowExpense>;
};

export function computeSafeWithdrawSeries(
  input: CashflowSeriesInputs,
): CashflowPoint[] {
  const urssafRate = toFiniteNumber(input.urssafRate, "urssafRate");
  if (urssafRate < 0 || urssafRate > 1) {
    throw new Error(
      `computeSafeWithdrawSeries: urssafRate must be in [0, 1], got ${urssafRate}`,
    );
  }

  type Event = {
    ts: number;
    kind: "income" | "withdrawal" | "expense";
    /** HT amount (after VAT split) — what the formula consumes. */
    amount: number;
  };
  const events: Event[] = [];

  for (const t of input.transactions) {
    const ts = toDate(t.created_at).getTime();
    if (Number.isNaN(ts)) continue;
    const amount = toFiniteNumber(t.amount, "transaction.amount");
    if (amount < 0) continue;
    if (t.type === "income") {
      const { ht } = splitVat(amount, t.vat_rate);
      events.push({ ts, kind: "income", amount: ht });
    } else if (t.type === "withdrawal") {
      events.push({ ts, kind: "withdrawal", amount });
    }
  }

  if (input.expenses) {
    for (const e of input.expenses) {
      const ts = toDate(e.created_at).getTime();
      if (Number.isNaN(ts)) continue;
      const amount = toFiniteNumber(e.amount, "expense.amount");
      if (amount < 0) continue;
      const { ht } = splitVat(amount, e.vat_rate);
      events.push({ ts, kind: "expense", amount: ht });
    }
  }

  events.sort((a, b) => a.ts - b.ts);

  // Walk events chronologically, accumulating cumulative state. We commit
  // exactly ONE snapshot per UTC day, after the last event on that day, so
  // the chart shows clean step changes rather than several stacked points.
  const days = new Map<
    string,
    { ts: number; ca: number; withdrawals: number; expenses: number }
  >();
  let ca = 0;
  let withdrawals = 0;
  let expenses = 0;

  for (const ev of events) {
    if (ev.kind === "income") ca += ev.amount;
    else if (ev.kind === "withdrawal") withdrawals += ev.amount;
    else expenses += ev.amount;

    const day = isoUtcDay(ev.ts);
    days.set(day, { ts: ev.ts, ca, withdrawals, expenses });
  }

  const points: CashflowPoint[] = [];
  for (const [date, snap] of days) {
    const safe =
      snap.ca -
      snap.ca * urssafRate -
      snap.ca * SECURITY_RESERVE_RATE -
      snap.withdrawals -
      snap.expenses;
    points.push({
      date,
      ts: snap.ts,
      ca: round2(snap.ca),
      safe: round2(safe),
    });
  }

  points.sort((a, b) => a.date.localeCompare(b.date));
  return points;
}

function isoUtcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function toDate(v: string | Date): Date {
  return v instanceof Date ? v : new Date(v);
}

function toFiniteNumber(v: number | string, label: string): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) {
    throw new Error(`computeSafeWithdraw: ${label} is not a finite number`);
  }
  return n;
}

/**
 * Splits a TTC amount into its HT / VAT parts using `HT = TTC / (1 + rate)`.
 *
 * This is the ONE place the engine encodes the VAT formula. Centralising it
 * keeps the rule consistent across the KPI computation, the chart series,
 * and any future analytics. We deliberately do NOT use `TTC × (1 - rate)`
 * which is a common (and wrong) approximation: at 20 % it would yield
 * 960 € HT for a 1200 € TTC invoice instead of the correct 1000 € HT.
 *
 * Defensive on the rate: a missing / nullish / non-finite / 0 / negative /
 * out-of-range rate is treated as "no VAT" so we never produce nonsense
 * numbers. The amount is then returned as-is.
 */
function splitVat(
  amountTtc: number,
  rateLike: number | string | null | undefined,
): { ht: number; vat: number } {
  if (rateLike === null || rateLike === undefined || rateLike === "") {
    return { ht: amountTtc, vat: 0 };
  }
  const rate = typeof rateLike === "number" ? rateLike : Number(rateLike);
  if (!Number.isFinite(rate) || rate <= 0 || rate >= 1) {
    return { ht: amountTtc, vat: 0 };
  }
  const ht = amountTtc / (1 + rate);
  return { ht, vat: amountTtc - ht };
}

/**
 * Rounds to 2 decimals using banker-friendly arithmetic. We add a tiny epsilon
 * before rounding to keep results like `0.1 + 0.2 → 0.30` instead of `0.30000…4`.
 */
function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
