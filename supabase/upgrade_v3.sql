-- Portfolio Command Center v3 upgrade
-- Run once in Supabase SQL Editor before importing a Zerodha tradebook in cloud mode.

alter table public.transactions add column if not exists analytics_only boolean not null default false;
alter table public.transactions add column if not exists external_trade_id text;
alter table public.transactions add column if not exists source text;

-- Nullable external IDs permit ordinary manual transactions while preventing
-- duplicate tradebook executions for the same user.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'transactions_user_external_trade_unique'
  ) then
    alter table public.transactions
      add constraint transactions_user_external_trade_unique unique (user_id, external_trade_id);
  end if;
end $$;

alter table public.financial_results add column if not exists cash_flow_basis text;
alter table public.financial_results add column if not exists cash_flow_note text;
alter table public.financial_results add column if not exists cash_metrics_applicable boolean default true;

grant select, insert, update, delete on public.transactions, public.financial_results to authenticated;
