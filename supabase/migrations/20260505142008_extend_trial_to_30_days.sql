-- Extend the free-trial window from 14 to 30 days.
--
-- Two-step migration:
--   1. Change the default expression for new signups so every fresh
--      profile gets a 30-day trial out of the box.
--   2. Backfill existing rows that are still on the old 14-day window
--      AND haven't moved past the trialing state. Subscribers,
--      cancellations and past_due rows are left alone — their
--      `trial_end` no longer affects access control.
alter table public.profiles
  alter column trial_end set default (now() + interval '30 days');

update public.profiles
set trial_end = created_at + interval '30 days'
where subscription_status = 'trialing'
  and trial_end < created_at + interval '30 days';
