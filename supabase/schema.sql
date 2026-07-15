-- Portfolio Command Center: run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.instruments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  yahoo_symbol text not null,
  name text,
  exchange text default 'NSE',
  sector text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, symbol)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  transaction_type text not null check (transaction_type in ('opening','buy','sell','bonus','split','adjustment')),
  trade_date date not null,
  quantity numeric not null check (quantity >= 0),
  price numeric not null default 0 check (price >= 0),
  fees numeric not null default 0 check (fees >= 0),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  yahoo_symbol text,
  as_of date not null,
  close numeric, daily_change_pct numeric,
  sma20 numeric, sma50 numeric, sma200 numeric,
  ema20 numeric, ema50 numeric, rsi14 numeric,
  high_52w numeric, low_52w numeric,
  volume numeric, avg_volume20 numeric, volume_ratio numeric,
  trend_score integer, trend_label text,
  alerts jsonb not null default '[]'::jsonb,
  source text, fetched_at timestamptz not null default now(),
  unique(user_id, symbol, as_of)
);

create table if not exists public.financial_results (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  period_end date not null,
  period_type text not null check (period_type in ('quarterly','annual')),
  revenue numeric, operating_income numeric, net_income numeric, eps numeric,
  revenue_yoy numeric, net_income_yoy numeric,
  currency text default 'INR', source text, fetched_at timestamptz not null default now(),
  unique(user_id, symbol, period_end, period_type)
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  symbol text not null,
  external_id text,
  published_at timestamptz not null,
  title text not null,
  source text,
  source_url text,
  summary text,
  category text,
  impact_score integer not null default 0 check (impact_score between -5 and 5),
  impact_label text,
  confidence text,
  is_manual boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique(user_id, external_id)
);

create or replace view public.latest_market_snapshots with (security_invoker=true) as
select distinct on (user_id, symbol) *
from public.market_snapshots
order by user_id, symbol, as_of desc, fetched_at desc;

alter table public.instruments enable row level security;
alter table public.transactions enable row level security;
alter table public.market_snapshots enable row level security;
alter table public.financial_results enable row level security;
alter table public.announcements enable row level security;

-- Recreate policies safely.
do $$ declare t text; begin
  foreach t in array array['instruments','transactions','market_snapshots','financial_results','announcements'] loop
    execute format('drop policy if exists "owner_select" on public.%I',t);
    execute format('drop policy if exists "owner_insert" on public.%I',t);
    execute format('drop policy if exists "owner_update" on public.%I',t);
    execute format('drop policy if exists "owner_delete" on public.%I',t);
    execute format('create policy "owner_select" on public.%I for select using ((select auth.uid()) = user_id)',t);
    execute format('create policy "owner_insert" on public.%I for insert with check ((select auth.uid()) = user_id)',t);
    execute format('create policy "owner_update" on public.%I for update using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',t);
    execute format('create policy "owner_delete" on public.%I for delete using ((select auth.uid()) = user_id)',t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.instruments, public.transactions, public.market_snapshots, public.financial_results, public.announcements to authenticated;
grant select on public.latest_market_snapshots to authenticated;
revoke all on public.instruments, public.transactions, public.market_snapshots, public.financial_results, public.announcements from anon;
