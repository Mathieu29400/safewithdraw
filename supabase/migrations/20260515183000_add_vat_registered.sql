-- Adds `is_vat_registered` to `urssaf_profile`.
--
-- This flag is set during onboarding when the user is asked
-- "Tu factures actuellement la TVA à tes clients ?". It drives the
-- VAT threshold alert widget on the dashboard:
--   * false → user is in franchise en base, we surveil the 41 250 € or
--     93 500 € annual threshold and warn them as they approach it.
--   * true  → user already invoices VAT (volontaire ou par dépassement
--     antérieur), we silence the alert.
--
-- Defaults to FALSE so all pre-existing rows (created before this
-- migration) start in "exonéré, watch the threshold for me" mode —
-- which is the right default for micro-entrepreneurs in their first
-- months. The account page lets users toggle this later.
alter table public.urssaf_profile
  add column if not exists is_vat_registered boolean not null default false;
