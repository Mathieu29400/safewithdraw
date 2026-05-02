-- Add `declaration_frequency` to `urssaf_profile`. Pre-existing rows
-- default to 'monthly' so legacy users keep their previous behaviour
-- without action; new rows can pick 'monthly' or 'quarterly' from the
-- onboarding form. Wrapped in `if not exists` so re-runs against an
-- already-migrated database are safe no-ops.
ALTER TABLE public.urssaf_profile
  ADD COLUMN IF NOT EXISTS declaration_frequency text NOT NULL DEFAULT 'monthly'
    CHECK (declaration_frequency IN ('monthly', 'quarterly'));
