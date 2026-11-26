-- =============================================================================
-- Fase 2g — Ordens de produção (OPs) do Iniflex a partir dos apontamentos do RPCP622.
-- ADITIVA e idempotente. A quantidade planejada da OP fica NULA: o RPCP622 não a informa
-- (virá das OPs da API Projedata). Dados demonstrativos não são alterados.
-- =============================================================================
begin;

-- 1. Número da(s) OP(s) no registro consolidado (o registro diário pode reunir mais de uma OP)
alter table public.production_records add column if not exists order_number text;
update public.production_records
set order_number = substring(notes from 'OP: ([^.]+)\.')
where source = 'iniflex_report' and order_number is null and notes ~ 'OP: ';

-- 2. Uma OP por número; produto único por OP (conferido: 99 OPs, nenhuma com mais de um produto).
--    Unidade só quando a OP foi apontada numa única unidade; recurso/setor só quando passou por um só.
insert into public.production_orders (order_number, product_id, planned_quantity, unit, planned_start, sector_id, resource_id, status, source)
select
  x.op,
  x.product_id,
  null,
  case when x.units = 1 then x.unit end,
  x.first_date,
  case when x.resources = 1 then x.sector_id end,
  case when x.resources = 1 then x.resource_id end,
  null,
  'iniflex_report'
from (
  select
    substring(e.source_ref from '\|OP([^|]+)\|') as op,
    min(e.product_id) as product_id,
    count(distinct e.unit) as units,
    min(e.unit) as unit,
    min(e.production_date) as first_date,
    count(distinct e.resource_id) as resources,
    min(e.resource_id) as resource_id,
    min(r.sector_id) as sector_id
  from public.production_events e
  join public.resources r on r.id = e.resource_id
  where e.source = 'iniflex_report'
  group by 1
) x
where x.op is not null
on conflict (source, order_number) do nothing;

-- 3. Liga cada apontamento à sua OP
update public.production_events e
set order_id = o.id
from public.production_orders o
where e.source = 'iniflex_report'
  and e.order_id is null
  and o.source = 'iniflex_report'
  and o.order_number = substring(e.source_ref from '\|OP([^|]+)\|');

commit;
