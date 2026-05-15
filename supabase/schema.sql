-- =============================================================================
-- SafeWithdraw — Initial database schema
-- =============================================================================
-- Run this file in the Supabase SQL Editor.
-- It is idempotent: safe to re-run.
--
-- Conventions
--   * All app tables live in `public`.
--   * Every row carries a `user_id` (or for `profiles`, `id`) that MUST equal
--     `auth.uid()` for any read/write to succeed.
--   * Money columns use `numeric(14,2)`.
--   * Rates use `numeric(5,4)` and are stored as decimals (0.218 = 21.8%).
--   * RLS policies wrap `auth.uid()` in `(select auth.uid())` so it is
--     evaluated once per query (not per row) — critical at scale.
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. profiles
-- =============================================================================
-- One row per authenticated user. `id` mirrors `auth.users.id`.
-- Auto-populated on signup via the trigger defined below.

create table if not exists public.profiles (
  id                  uuid        primary key references auth.users(id) on delete cascade,
  email               text        not null,
  created_at          timestamptz not null default now(),
  trial_end           timestamptz not null default (now() + interval '30 days'),
  subscription_status text        not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  advanced_mode       boolean     not null default false
);

-- 30-day trial without card. Update default for re-runs of this script,
-- and backfill any still-trialing profile that was created with the old
-- 14-day default so every user gets the same 30-day window.
alter table public.profiles
  alter column trial_end set default (now() + interval '30 days');

update public.profiles
set trial_end = created_at + interval '30 days'
where subscription_status = 'trialing'
  and trial_end < created_at + interval '30 days';

-- Backfill the `advanced_mode` column on pre-existing databases.
alter table public.profiles
  add column if not exists advanced_mode boolean not null default false;

-- Paddle Billing: customer id (ctm_) populated by /api/paddle/webhook
alter table public.profiles
  add column if not exists paddle_customer_id text;

create unique index if not exists profiles_paddle_customer_id_key
  on public.profiles (paddle_customer_id)
  where paddle_customer_id is not null;

-- =============================================================================
-- 2. transactions
-- =============================================================================
-- Every income or withdrawal made by the user.
-- Drives the real-time safe-withdrawal calculation.

create table if not exists public.transactions (
  id         uuid          primary key default gen_random_uuid(),
  user_id    uuid          not null references public.profiles(id) on delete cascade,
  type       text          not null check (type in ('income', 'withdrawal')),
  amount     numeric(14,2) not null check (amount >= 0),
  created_at timestamptz   not null default now()
);

create index if not exists transactions_user_created_idx
  on public.transactions (user_id, created_at desc);

-- Optional VAT (TVA) rate. NULL = no VAT applied (the historical default;
-- amount is plain HT). Non-null = amount is TTC and HT must be derived.
alter table public.transactions
  add column if not exists vat_rate numeric(5,4)
    check (vat_rate is null or (vat_rate > 0 and vat_rate < 1));

-- =============================================================================
-- 2bis. expenses
-- =============================================================================
-- Business expenses tracked separately from withdrawals. Only consumed by
-- the safe-withdrawal calculation when the user opts in via
-- `profiles.advanced_mode = true`. Storage is independent of that flag.

create table if not exists public.expenses (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references public.profiles(id) on delete cascade,
  amount      numeric(14,2) not null check (amount >= 0),
  description text,
  created_at  timestamptz   not null default now()
);

create index if not exists expenses_user_created_idx
  on public.expenses (user_id, created_at desc);

-- Optional recoverable VAT (TVA) rate. Same semantics as `transactions.vat_rate`:
-- NULL = no VAT (amount is plain HT spend), non-null = amount is TTC and the
-- engine reduces it to HT for the safe-withdrawal calculation.
alter table public.expenses
  add column if not exists vat_rate numeric(5,4)
    check (vat_rate is null or (vat_rate > 0 and vat_rate < 1));

-- =============================================================================
-- 2ter. recurring_expenses
-- =============================================================================
-- Templates for monthly recurring expenses (subscriptions, rent, …).
-- Stored amount is always the MONTHLY value. When a new period row is
-- inserted (manual reset OR auto-rotation), a trigger copies each
-- template into `expenses` for that period — multiplied by 3 for
-- quarterly periods.

create table if not exists public.recurring_expenses (
  id          uuid          primary key default gen_random_uuid(),
  user_id     uuid          not null references public.profiles(id) on delete cascade,
  amount      numeric(14,2) not null check (amount > 0),
  description text,
  vat_rate    numeric(5,4)  check (vat_rate is null or (vat_rate > 0 and vat_rate < 1)),
  created_at  timestamptz   not null default now()
);

create index if not exists recurring_expenses_user_idx
  on public.recurring_expenses (user_id, created_at desc);

-- Optional link from each materialized expense back to its recurring
-- template. NULL = one-off (manual) expense; non-null = produced by
-- the `recurring_expenses` triggers. ON DELETE CASCADE so deleting a
-- template wipes every occurrence ("supprimer pour tous les mois").
alter table public.expenses
  add column if not exists recurring_expense_id uuid
    references public.recurring_expenses(id) on delete cascade;

create index if not exists expenses_recurring_id_idx
  on public.expenses (recurring_expense_id)
  where recurring_expense_id is not null;

-- =============================================================================
-- 3. urssaf_profile
-- =============================================================================
-- The user's URSSAF configuration (one row per user).
-- `urssaf_rate` is stored as a decimal (e.g. 0.2180 for 21.80%).
-- `declaration_frequency` is `monthly` or `quarterly` (URSSAF declaration cadence).

create table if not exists public.urssaf_profile (
  user_id       uuid          primary key references public.profiles(id) on delete cascade,
  activity_type text          not null,
  urssaf_rate   numeric(5,4)  not null check (urssaf_rate >= 0 and urssaf_rate <= 1),
  declaration_frequency text not null default 'monthly'
    check (declaration_frequency in ('monthly', 'quarterly')),
  -- `true`  → user already invoices VAT, the threshold alert is silenced.
  -- `false` → user is in franchise en base, we surveil the annual threshold.
  is_vat_registered boolean not null default false
);

-- Backfill `declaration_frequency` on pre-existing databases.
alter table public.urssaf_profile
  add column if not exists declaration_frequency text not null default 'monthly'
    check (declaration_frequency in ('monthly', 'quarterly'));

-- Backfill `is_vat_registered` on pre-existing databases.
alter table public.urssaf_profile
  add column if not exists is_vat_registered boolean not null default false;

-- =============================================================================
-- 4. periods
-- =============================================================================
-- Declarative periods (monthly / quarterly) with running revenue.
-- Used to compute progress against URSSAF declaration windows.

create table if not exists public.periods (
  id         uuid          primary key default gen_random_uuid(),
  user_id    uuid          not null references public.profiles(id) on delete cascade,
  type       text          not null check (type in ('monthly', 'quarterly')),
  start_date timestamptz   not null,
  current_ca numeric(14,2) not null default 0 check (current_ca >= 0)
);

create index if not exists periods_user_start_idx
  on public.periods (user_id, start_date desc);

-- =============================================================================
-- Materialize recurring expenses on every new period
-- =============================================================================
-- Trigger function: copies every recurring template into `expenses`
-- when a period is inserted. Quarterly periods multiply the monthly
-- amount by 3 so the materialized row reflects the full quarter.
--
-- SECURITY DEFINER so it can write to `expenses` even when invoked from
-- a RLS-restricted client. The WHERE clause re-checks ownership so the
-- elevated privileges can never be used to write a row owned by anyone
-- other than the period's owner.

create or replace function public.materialize_recurring_expenses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  multiplier integer;
begin
  multiplier := case when NEW.type = 'quarterly' then 3 else 1 end;

  insert into public.expenses (
    user_id, amount, description, vat_rate, created_at, recurring_expense_id
  )
  select
    NEW.user_id,
    re.amount * multiplier,
    re.description,
    re.vat_rate,
    NEW.start_date,
    re.id
  from public.recurring_expenses re
  where re.user_id = NEW.user_id;

  return NEW;
end;
$$;

revoke execute on function public.materialize_recurring_expenses() from public;
revoke execute on function public.materialize_recurring_expenses() from anon;
revoke execute on function public.materialize_recurring_expenses() from authenticated;

drop trigger if exists on_period_created on public.periods;
create trigger on_period_created
  after insert on public.periods
  for each row execute function public.materialize_recurring_expenses();

-- Symmetric direction: when a recurring template is INSERTED, fan it
-- out across every CALENDAR BUCKET the user has any activity in
-- (transaction, manual expense, period row) plus the current calendar
-- bucket, so every dashboard surface — current period, future
-- periods, and EVERY archived month/quarter — reflects the line
-- immediately.
--
-- Bucket granularity comes from the user's `declaration_frequency`
-- (monthly = 1st of month UTC, quarterly = 1st of quarter UTC * 3 on
-- the amount). Centralised in the `_fanout_recurring_template`
-- helper so the trigger and any future backfill share one source of
-- truth.
create or replace function public._fanout_recurring_template(p_template_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  template public.recurring_expenses;
  freq text;
  multiplier integer;
  bucket_unit text;
begin
  select * into template from public.recurring_expenses where id = p_template_id;
  if not found then
    return;
  end if;

  select declaration_frequency into freq
  from public.urssaf_profile
  where user_id = template.user_id;
  freq := coalesce(freq, 'monthly');

  if freq = 'quarterly' then
    multiplier := 3;
    bucket_unit := 'quarter';
  else
    multiplier := 1;
    bucket_unit := 'month';
  end if;

  insert into public.expenses (
    user_id, amount, description, vat_rate, created_at, recurring_expense_id
  )
  select
    template.user_id,
    template.amount * multiplier,
    template.description,
    template.vat_rate,
    bucket_start,
    template.id
  from (
    select distinct
      date_trunc(bucket_unit, occurred_at, 'UTC') as bucket_start
    from (
      select created_at as occurred_at
        from public.transactions
        where user_id = template.user_id
      union all
      select created_at as occurred_at
        from public.expenses
        where user_id = template.user_id
          and recurring_expense_id is null
      union all
      select start_date as occurred_at
        from public.periods
        where user_id = template.user_id
      union all
      select now() as occurred_at
    ) all_events
  ) buckets;
end;
$$;

revoke execute on function public._fanout_recurring_template(uuid) from public;
revoke execute on function public._fanout_recurring_template(uuid) from anon;
revoke execute on function public._fanout_recurring_template(uuid) from authenticated;

create or replace function public.materialize_for_existing_periods()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._fanout_recurring_template(NEW.id);
  return NEW;
end;
$$;

revoke execute on function public.materialize_for_existing_periods() from public;
revoke execute on function public.materialize_for_existing_periods() from anon;
revoke execute on function public.materialize_for_existing_periods() from authenticated;

drop trigger if exists on_recurring_expense_created on public.recurring_expenses;
create trigger on_recurring_expense_created
  after insert on public.recurring_expenses
  for each row execute function public.materialize_for_existing_periods();

-- =============================================================================
-- 5. trial_history
-- =============================================================================
-- Pseudonymous ledger of every email that ever consumed a free trial.
-- Indexed by `sha256(lower(trim(email)))` so we never store the email
-- itself (RGPD-friendly: not reversible without the original input).
--
-- Used by `handle_new_user` to decide whether a new signup deserves a
-- fresh 30-day trial or starts already-expired (forcing a paid
-- subscription via /billing). Written to by /api/account/delete just
-- before the user row is hard-deleted.

create table if not exists public.trial_history (
  email_hash     text        primary key,
  first_trial_at timestamptz not null default now(),
  last_trial_at  timestamptz not null default now(),
  trial_count    integer     not null default 1
);

alter table public.trial_history enable row level security;
-- No policies → default-deny. Only SECURITY DEFINER functions and the
-- service role ever touch this table.

create or replace function public.compute_email_hash(p_email text)
returns text
language sql
immutable
set search_path = public, extensions
as $$
  select encode(extensions.digest(lower(trim(p_email)), 'sha256'), 'hex');
$$;

revoke execute on function public.compute_email_hash(text) from public;
revoke execute on function public.compute_email_hash(text) from anon;
revoke execute on function public.compute_email_hash(text) from authenticated;

-- =============================================================================
-- Auto-create profile on user signup
-- =============================================================================
-- A trigger on `auth.users` inserts the matching row in `public.profiles`
-- so the application can rely on the profile existing immediately after signup.
--
-- The function is `SECURITY DEFINER` so the trigger can write to `public.profiles`
-- on behalf of the new user, but EXECUTE is revoked from `public`/`anon`/
-- `authenticated` so the function cannot be called directly via PostgREST RPC.
--
-- Trial-abuse guard: if the email's hash already appears in
-- `trial_history`, the new profile starts with `trial_end = now()` so
-- the user is immediately redirected to /billing. They can still
-- subscribe; only the free re-trial is blocked.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hashed text;
  has_history boolean;
  computed_trial_end timestamptz;
begin
  hashed := public.compute_email_hash(new.email);

  select exists(select 1 from public.trial_history where email_hash = hashed)
  into has_history;

  if has_history then
    computed_trial_end := now();
  else
    computed_trial_end := now() + interval '30 days';
  end if;

  insert into public.profiles (id, email, trial_end)
  values (new.id, new.email, computed_trial_end)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;
revoke execute on function public.handle_new_user() from authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- =============================================================================
-- Row Level Security
-- =============================================================================
-- Default-deny on every table; explicit policies grant per-row access only to
-- the authenticated owner.

alter table public.profiles            enable row level security;
alter table public.transactions        enable row level security;
alter table public.expenses            enable row level security;
alter table public.recurring_expenses  enable row level security;
alter table public.urssaf_profile      enable row level security;
alter table public.periods             enable row level security;

-- ---------- profiles ---------------------------------------------------------

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- ---------- transactions -----------------------------------------------------

drop policy if exists "transactions_select_own" on public.transactions;
create policy "transactions_select_own" on public.transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "transactions_insert_own" on public.transactions;
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "transactions_update_own" on public.transactions;
create policy "transactions_update_own" on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "transactions_delete_own" on public.transactions;
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- expenses ---------------------------------------------------------

drop policy if exists "expenses_select_own" on public.expenses;
create policy "expenses_select_own" on public.expenses
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "expenses_insert_own" on public.expenses;
create policy "expenses_insert_own" on public.expenses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "expenses_update_own" on public.expenses;
create policy "expenses_update_own" on public.expenses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "expenses_delete_own" on public.expenses;
create policy "expenses_delete_own" on public.expenses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- recurring_expenses ----------------------------------------------

drop policy if exists "recurring_expenses_select_own" on public.recurring_expenses;
create policy "recurring_expenses_select_own" on public.recurring_expenses
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "recurring_expenses_insert_own" on public.recurring_expenses;
create policy "recurring_expenses_insert_own" on public.recurring_expenses
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "recurring_expenses_update_own" on public.recurring_expenses;
create policy "recurring_expenses_update_own" on public.recurring_expenses
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "recurring_expenses_delete_own" on public.recurring_expenses;
create policy "recurring_expenses_delete_own" on public.recurring_expenses
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- urssaf_profile ---------------------------------------------------

drop policy if exists "urssaf_select_own" on public.urssaf_profile;
create policy "urssaf_select_own" on public.urssaf_profile
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "urssaf_insert_own" on public.urssaf_profile;
create policy "urssaf_insert_own" on public.urssaf_profile
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "urssaf_update_own" on public.urssaf_profile;
create policy "urssaf_update_own" on public.urssaf_profile
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "urssaf_delete_own" on public.urssaf_profile;
create policy "urssaf_delete_own" on public.urssaf_profile
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------- periods ----------------------------------------------------------

drop policy if exists "periods_select_own" on public.periods;
create policy "periods_select_own" on public.periods
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "periods_insert_own" on public.periods;
create policy "periods_insert_own" on public.periods
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "periods_update_own" on public.periods;
create policy "periods_update_own" on public.periods
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "periods_delete_own" on public.periods;
create policy "periods_delete_own" on public.periods
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- =============================================================================
-- Realtime
-- =============================================================================
-- The dashboard hook (`useSafeWithdraw`) listens to changes on the three
-- tables that influence the safe-withdrawal formula. For Realtime to emit
-- those events Postgres needs the tables in the `supabase_realtime`
-- publication, AND `replica identity full` so RLS-aware filters such as
-- `user_id=eq.X` can match against the OLD row on UPDATE / DELETE.

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'transactions'
  ) then
    alter publication supabase_realtime add table public.transactions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'periods'
  ) then
    alter publication supabase_realtime add table public.periods;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'urssaf_profile'
  ) then
    alter publication supabase_realtime add table public.urssaf_profile;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'expenses'
  ) then
    alter publication supabase_realtime add table public.expenses;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'recurring_expenses'
  ) then
    alter publication supabase_realtime add table public.recurring_expenses;
  end if;
end $$;

alter table public.transactions       replica identity full;
alter table public.periods            replica identity full;
alter table public.urssaf_profile     replica identity full;
alter table public.expenses           replica identity full;
alter table public.recurring_expenses replica identity full;
