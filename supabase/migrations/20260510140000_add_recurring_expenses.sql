-- Recurring (monthly) expenses — templates that auto-materialize as
-- real `expenses` rows whenever the user opens a NEW URSSAF period.
--
-- Storage model
--   * The amount stored is always the MONTHLY value, regardless of the
--     user's declaration frequency.
--   * On a quarterly period the trigger multiplies by 3 so the
--     materialized expense reflects the full quarter.
--   * `vat_rate` mirrors the semantics of `expenses.vat_rate`: NULL = no
--     VAT (HT === TTC), non-null = `amount` is TTC and the engine reduces
--     it to HT downstream.
--
-- Materialization is triggered by `AFTER INSERT ON public.periods`, which
-- covers both code paths that create periods today:
--   * the explicit "Nouvelle période URSSAF" button click
--   * the silent auto-rotation in `useCurrentPeriod` when a calendar
--     boundary is crossed
-- Anything else (data import, admin tools…) gets the same behaviour
-- without having to reach into application code.

CREATE TABLE IF NOT EXISTS public.recurring_expenses (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount      numeric(14,2) NOT NULL CHECK (amount > 0),
  description text,
  vat_rate    numeric(5,4)  CHECK (vat_rate IS NULL OR (vat_rate > 0 AND vat_rate < 1)),
  created_at  timestamptz   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recurring_expenses_user_idx
  ON public.recurring_expenses (user_id, created_at DESC);

ALTER TABLE public.recurring_expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring_expenses_select_own" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_select_own" ON public.recurring_expenses
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "recurring_expenses_insert_own" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_insert_own" ON public.recurring_expenses
  FOR INSERT TO authenticated
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "recurring_expenses_update_own" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_update_own" ON public.recurring_expenses
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "recurring_expenses_delete_own" ON public.recurring_expenses;
CREATE POLICY "recurring_expenses_delete_own" ON public.recurring_expenses
  FOR DELETE TO authenticated
  USING (user_id = (select auth.uid()));

-- Trigger: when a new period row is created, copy every recurring
-- template the user has defined into `expenses` for that period.
--
-- The trigger function runs as SECURITY DEFINER so it can write to
-- `expenses` from any client (RLS would otherwise block the cross-row
-- INSERT during the same transaction). It re-checks `re.user_id =
-- NEW.user_id` itself so the elevated privileges can never be used to
-- write a row owned by anyone other than the period's owner.

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

  INSERT INTO public.expenses (user_id, amount, description, vat_rate, created_at)
  SELECT
    NEW.user_id,
    re.amount * multiplier,
    re.description,
    re.vat_rate,
    NEW.start_date
  FROM public.recurring_expenses re
  WHERE re.user_id = NEW.user_id;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.materialize_recurring_expenses() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.materialize_recurring_expenses() FROM anon;
REVOKE EXECUTE ON FUNCTION public.materialize_recurring_expenses() FROM authenticated;

DROP TRIGGER IF EXISTS on_period_created ON public.periods;
CREATE TRIGGER on_period_created
  AFTER INSERT ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.materialize_recurring_expenses();

-- Realtime: surface inserts/updates/deletes on the new table so the
-- dashboard list refreshes across tabs without a page reload.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'recurring_expenses'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.recurring_expenses;
  END IF;
END $$;

ALTER TABLE public.recurring_expenses REPLICA IDENTITY FULL;
