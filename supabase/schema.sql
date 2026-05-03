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
  trial_end           timestamptz not null default (now() + interval '14 days'),
  subscription_status text        not null default 'trialing'
    check (subscription_status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete')),
  advanced_mode       boolean     not null default false
);

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
    check (declaration_frequency in ('monthly', 'quarterly'))
);

-- Backfill `declaration_frequency` on pre-existing databases.
alter table public.urssaf_profile
  add column if not exists declaration_frequency text not null default 'monthly'
    check (declaration_frequency in ('monthly', 'quarterly'));

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
-- Auto-create profile on user signup
-- =============================================================================
-- A trigger on `auth.users` inserts the matching row in `public.profiles`
-- so the application can rely on the profile existing immediately after signup.
--
-- The function is `SECURITY DEFINER` so the trigger can write to `public.profiles`
-- on behalf of the new user, but EXECUTE is revoked from `public`/`anon`/
-- `authenticated` so the function cannot be called directly via PostgREST RPC.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
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

alter table public.profiles        enable row level security;
alter table public.transactions    enable row level security;
alter table public.expenses        enable row level security;
alter table public.urssaf_profile  enable row level security;
alter table public.periods         enable row level security;

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
end $$;

alter table public.transactions   replica identity full;
alter table public.periods        replica identity full;
alter table public.urssaf_profile replica identity full;
alter table public.expenses       replica identity full;
