-- Paddle customer ID (from webhooks) — used for customer portal + billing sync
alter table public.profiles
  add column if not exists paddle_customer_id text;

create unique index if not exists profiles_paddle_customer_id_key
  on public.profiles (paddle_customer_id)
  where paddle_customer_id is not null;
