-- Link materialized expenses back to their recurring template + apply
-- new templates to ALL existing periods (not just future ones).
--
-- Rationale
--   Previously the recurring_expenses trigger only fired on `INSERT ON
--   periods`, which meant a freshly-created template had no effect on
--   the user's CURRENT period — the safe-withdrawal KPI did not move
--   until the next "Nouvelle période URSSAF" click. Users expect the
--   opposite: typing in a 50 €/mois recurring expense should drop the
--   retirable amount immediately.
--
--   We also link every materialized row to its source template via a
--   nullable `recurring_expense_id`. That powers the "this month vs.
--   every month" delete UX: deleting one row leaves the other periods
--   untouched, while deleting the template cascade-deletes every row
--   it ever produced (clean slate).

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS recurring_expense_id uuid
    REFERENCES public.recurring_expenses(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS expenses_recurring_id_idx
  ON public.expenses (recurring_expense_id)
  WHERE recurring_expense_id IS NOT NULL;

-- Replace the existing on-period-created trigger function so the
-- materialized row carries the recurring_expense_id.
CREATE OR REPLACE FUNCTION public.materialize_recurring_expenses()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  multiplier integer;
BEGIN
  multiplier := CASE WHEN NEW.type = 'quarterly' THEN 3 ELSE 1 END;

  INSERT INTO public.expenses (
    user_id, amount, description, vat_rate, created_at, recurring_expense_id
  )
  SELECT
    NEW.user_id,
    re.amount * multiplier,
    re.description,
    re.vat_rate,
    NEW.start_date,
    re.id
  FROM public.recurring_expenses re
  WHERE re.user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

-- Brand-new trigger: when a recurring template is INSERTED, fan it out
-- across every period the user already has. We deduplicate by
-- start_date so users with accidental duplicate periods don't get the
-- same expense materialized N times.
CREATE OR REPLACE FUNCTION public.materialize_for_existing_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.expenses (
    user_id, amount, description, vat_rate, created_at, recurring_expense_id
  )
  SELECT
    NEW.user_id,
    NEW.amount * (CASE WHEN p.type = 'quarterly' THEN 3 ELSE 1 END),
    NEW.description,
    NEW.vat_rate,
    p.start_date,
    NEW.id
  FROM (
    SELECT DISTINCT ON (start_date) start_date, type
    FROM public.periods
    WHERE user_id = NEW.user_id
    ORDER BY start_date, id
  ) p;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.materialize_for_existing_periods() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.materialize_for_existing_periods() FROM anon;
REVOKE EXECUTE ON FUNCTION public.materialize_for_existing_periods() FROM authenticated;

DROP TRIGGER IF EXISTS on_recurring_expense_created ON public.recurring_expenses;
CREATE TRIGGER on_recurring_expense_created
  AFTER INSERT ON public.recurring_expenses
  FOR EACH ROW EXECUTE FUNCTION public.materialize_for_existing_periods();
