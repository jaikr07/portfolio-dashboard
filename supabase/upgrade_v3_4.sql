-- Portfolio Command Center v3.4 multi-account upgrade
-- Run once in Supabase SQL Editor before importing m.Stock data in cloud mode.

alter table public.transactions add column if not exists account text;
update public.transactions
set account = case when lower(coalesce(source,'')) like '%mstock%' then 'm.Stock' else 'Zerodha' end
where account is null or btrim(account) = '';
alter table public.transactions alter column account set default 'Zerodha';
alter table public.transactions alter column account set not null;

grant select, insert, update, delete on public.transactions to authenticated;
