-- Add per-row VAT (TVA) handling to revenue and expense rows.
--
-- A NULL `vat_rate` means the user did NOT flag the row as VAT-bearing
-- and the `amount` keeps its historical interpretation (plain HT === TTC).
-- A non-NULL value (e.g. 0.2000 for 20%) means `amount` is TTC and the
-- engine should derive HT via `HT = amount / (1 + vat_rate)`.
--
-- We keep the stored value as a numeric(5,4) so 20 / 10 / 5.5 percent rates
-- can all be expressed exactly. The CHECK constraint pins the value into
-- the legitimate (0, 1) range — strictly greater than 0 so a 0% checkbox
-- doesn't sneak in (UI represents "no VAT" as NULL, never 0), and strictly
-- less than 1 because a >=100% rate is nonsense.
--
-- Wrapped in `if not exists` so the migration is idempotent.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,4)
    CHECK (vat_rate IS NULL OR (vat_rate > 0 AND vat_rate < 1));

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vat_rate numeric(5,4)
    CHECK (vat_rate IS NULL OR (vat_rate > 0 AND vat_rate < 1));
