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
  asset_type text default 'Equity',
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
  analytics_only boolean not null default false,
  external_trade_id text,
  source text,
  created_at timestamptz not null default now()
);

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  yahoo_symbol text,
  as_of date not null,
  close numeric, daily_change_pct numeric,
  sector text, asset_type text,
  return_1m_pct numeric, return_3m_pct numeric, return_6m_pct numeric,
  return_1y_pct numeric, return_2y_pct numeric,
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
  operating_cash_flow numeric, capital_expenditure numeric, free_cash_flow numeric,
  revenue_yoy numeric, revenue_qoq numeric,
  operating_income_yoy numeric, operating_income_qoq numeric,
  net_income_yoy numeric, net_income_qoq numeric, eps_yoy numeric,
  ocf_yoy numeric, capex_yoy numeric, fcf_yoy numeric,
  operating_margin_pct numeric, operating_margin_change_yoy_pp numeric,
  net_margin_pct numeric, ocf_margin_pct numeric, fcf_margin_pct numeric,
  cash_conversion_pct numeric, capex_intensity_pct numeric,
  quality_score integer, quality_label text,
  cash_flow_basis text, cash_flow_note text, cash_metrics_applicable boolean default true,
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
  impact_reason text, watch_items text, time_horizon text, materiality text,
  is_manual boolean not null default false,
  fetched_at timestamptz not null default now(),
  unique(user_id, external_id)
);

-- Safe upgrades when this script is rerun on an existing project.
alter table public.instruments add column if not exists asset_type text default 'Equity';
alter table public.market_snapshots add column if not exists sector text;
alter table public.market_snapshots add column if not exists asset_type text;
alter table public.market_snapshots add column if not exists return_1m_pct numeric;
alter table public.market_snapshots add column if not exists return_3m_pct numeric;
alter table public.market_snapshots add column if not exists return_6m_pct numeric;
alter table public.market_snapshots add column if not exists return_1y_pct numeric;
alter table public.market_snapshots add column if not exists return_2y_pct numeric;
alter table public.financial_results add column if not exists operating_cash_flow numeric;
alter table public.financial_results add column if not exists capital_expenditure numeric;
alter table public.financial_results add column if not exists free_cash_flow numeric;
alter table public.financial_results add column if not exists revenue_qoq numeric;
alter table public.financial_results add column if not exists operating_income_yoy numeric;
alter table public.financial_results add column if not exists operating_income_qoq numeric;
alter table public.financial_results add column if not exists net_income_qoq numeric;
alter table public.financial_results add column if not exists eps_yoy numeric;
alter table public.financial_results add column if not exists ocf_yoy numeric;
alter table public.financial_results add column if not exists capex_yoy numeric;
alter table public.financial_results add column if not exists fcf_yoy numeric;
alter table public.financial_results add column if not exists operating_margin_pct numeric;
alter table public.financial_results add column if not exists operating_margin_change_yoy_pp numeric;
alter table public.financial_results add column if not exists net_margin_pct numeric;
alter table public.financial_results add column if not exists ocf_margin_pct numeric;
alter table public.financial_results add column if not exists fcf_margin_pct numeric;
alter table public.financial_results add column if not exists cash_conversion_pct numeric;
alter table public.financial_results add column if not exists capex_intensity_pct numeric;
alter table public.financial_results add column if not exists quality_score integer;
alter table public.financial_results add column if not exists quality_label text;
alter table public.financial_results add column if not exists cash_flow_basis text;
alter table public.financial_results add column if not exists cash_flow_note text;
alter table public.financial_results add column if not exists cash_metrics_applicable boolean default true;
alter table public.transactions add column if not exists analytics_only boolean not null default false;
alter table public.transactions add column if not exists external_trade_id text;
alter table public.transactions add column if not exists source text;
alter table public.announcements add column if not exists impact_reason text;
alter table public.announcements add column if not exists watch_items text;
alter table public.announcements add column if not exists time_horizon text;
alter table public.announcements add column if not exists materiality text;

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

-- v3 tradebook deduplication constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_user_external_trade_unique'
  ) then
    alter table public.transactions
      add constraint transactions_user_external_trade_unique unique (user_id, external_trade_id);
  end if;
end $$;
