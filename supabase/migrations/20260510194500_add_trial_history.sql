-- =============================================================================
-- Trial-history: prevent trial reset on account deletion + re-signup
-- =============================================================================
-- Rationale:
--   `profiles.trial_end` lives only as long as the row itself. When a user
--   deletes their account and re-signs up with the same email, the trigger
--   `handle_new_user` recreates a fresh profile with a brand-new 30-day
--   trial — effectively a free unlimited trial.
--
--   This migration introduces a long-lived ledger keyed by a SHA-256 hash
--   of the (lowercased, trimmed) email. The hash is RGPD-friendly: it's
--   pseudonymous and not reversible to the original email without the
--   original input. We never store the email itself.
--
--   On signup the trigger looks up the hash; if it's present, the new
--   profile starts with `trial_end = now()` (already expired) so the
--   user is immediately redirected to `/billing`. Subscribing remains
--   possible — only the free re-trial is blocked.
-- =============================================================================

-- pgcrypto is auto-installed in the `extensions` schema on every Supabase
-- project — we only need to reference `extensions.digest()` below.

-- ---------------------------------------------------------------------------
-- 1. Ledger table
-- ---------------------------------------------------------------------------
create table if not exists public.trial_history (
  email_hash     text        primary key,
  first_trial_at timestamptz not null default now(),
  last_trial_at  timestamptz not null default now(),
  trial_count    integer     not null default 1
);

-- RLS: nobody can read this table directly. Only the SECURITY DEFINER
-- functions below (and the service role for `/api/account/delete`)
-- ever touch it. Locking down RLS prevents an authenticated user from
-- enumerating every email hash via PostgREST.
alter table public.trial_history enable row level security;

-- (No policies → default-deny.)

-- ---------------------------------------------------------------------------
-- 2. Helper to compute the hash. SECURITY DEFINER + revoked execute so it
-- can be called from inside other definer functions but never directly
-- by a client. The cast to lower(trim(...)) normalises the email so
-- "  Foo@Bar.com " and "foo@bar.com" produce the same hash.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- 3. Replace `handle_new_user` so it consults `trial_history` and assigns
-- the right `trial_end` depending on whether the email has already
-- consumed a trial.
-- ---------------------------------------------------------------------------
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
    -- User already burnt their trial on a previous account. Start at "expired"
    -- so middleware/dashboard guards kick them straight to /billing.
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

-- The trigger itself was created in `schema.sql`; it picks up the new
-- function body automatically because triggers reference the function
-- by name, not by definition.
