-- Materialize recurring expenses on every CALENDAR BUCKET the user has
-- activity in, not just on rows in `periods`.
--
-- Why
--   The previous trigger only fanned out across `periods.start_date`.
--   But the dashboard's archived view (`usePreviousPeriods`) groups
--   history by calendar month/quarter, including months that contain
--   only a transaction or a manual expense — even when no `period`
--   row was ever explicitly inserted for that month. A recurring
--   template would silently miss those buckets, so e.g. a user with
--   an expense in February but no "Nouvelle période URSSAF" click for
--   February would never see the recurring line on their February
--   dashboard. The KPI tile + the safe-withdrawal number both come
--   out wrong for that month.
--
-- New rule
--   For every distinct calendar bucket (UTC, monthly OR quarterly
--   depending on the user's `declaration_frequency`) the user has any
--   activity in — transaction, manual expense (recurring_expense_id
--   IS NULL), or `periods` row, plus the current calendar bucket —
--   create exactly one materialized expense row, anchored at the
--   bucket's first day at 00:00:00 UTC. Quarterly cadences multiply
--   the monthly amount by 3 as before.
--
-- Implementation
--   Extracted into a SECURITY DEFINER helper so the AFTER INSERT
--   trigger and the one-shot backfill below share a single source of
--   truth. The helper is private (REVOKE EXECUTE ... FROM
--   authenticated) so clients cannot call it directly.

CREATE OR REPLACE FUNCTION public._fanout_recurring_template(p_template_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  template public.recurring_expenses;
  freq text;
  multiplier integer;
  bucket_unit text;
BEGIN
  SELECT * INTO template FROM public.recurring_expenses WHERE id = p_template_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT declaration_frequency INTO freq
  FROM public.urssaf_profile
  WHERE user_id = template.user_id;
  freq := COALESCE(freq, 'monthly');

  IF freq = 'quarterly' THEN
    multiplier := 3;
    bucket_unit := 'quarter';
  ELSE
    multiplier := 1;
    bucket_unit := 'month';
  END IF;

  INSERT INTO public.expenses (
    user_id, amount, description, vat_rate, created_at, recurring_expense_id
  )
  SELECT
    template.user_id,
    template.amount * multiplier,
    template.description,
    template.vat_rate,
    bucket_start,
    template.id
  FROM (
    SELECT DISTINCT
      date_trunc(bucket_unit, occurred_at, 'UTC') AS bucket_start
    FROM (
      SELECT created_at AS occurred_at
        FROM public.transactions
        WHERE user_id = template.user_id
      UNION ALL
      SELECT created_at AS occurred_at
        FROM public.expenses
        WHERE user_id = template.user_id
          AND recurring_expense_id IS NULL
      UNION ALL
      SELECT start_date AS occurred_at
        FROM public.periods
        WHERE user_id = template.user_id
      UNION ALL
      SELECT now() AS occurred_at
    ) all_events
  ) buckets;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._fanout_recurring_template(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public._fanout_recurring_template(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public._fanout_recurring_template(uuid) FROM authenticated;

-- Re-point the existing AFTER INSERT trigger at the helper.
CREATE OR REPLACE FUNCTION public.materialize_for_existing_periods()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._fanout_recurring_template(NEW.id);
  RETURN NEW;
END;
$$;

-- Backfill: redo materialization for every existing template using
-- the new bucket logic so users who already created a template
-- before this migration catch up immediately. We wipe all currently-
-- materialized rows (those linked back to a template) first so there
-- are no leftovers from the old trigger sitting at obsolete dates.
DELETE FROM public.expenses WHERE recurring_expense_id IS NOT NULL;

DO $$
DECLARE
  t uuid;
BEGIN
  FOR t IN SELECT id FROM public.recurring_expenses LOOP
    PERFORM public._fanout_recurring_template(t);
  END LOOP;
END $$;
