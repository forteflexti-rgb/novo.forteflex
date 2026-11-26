-- =============================================================================
-- Fase 2i — completar o que faltava para o IROG sair (aprovado pelo administrador em 26/11/2026)
--  1. Recurso sob demanda (301 Rebobinadeira): programado só no tempo em que foi acionado.
--  2. Paradas do Iniflex sem motivo: classificadas como NÃO PROGRAMADAS (critério conservador).
--  3. Padrões de ciclo PROVISÓRIOS = melhor ritmo sustentado demonstrado em Out/2026 (P90 da
--     velocidade por apontamento de 30 min a 24 h, RPCP622). Substituídos automaticamente pelos
--     padrões oficiais da engenharia (mesma combinação, vigência mais recente vence).
-- ADITIVA e idempotente. Nenhum dado existente é apagado.
-- =============================================================================
begin;

-- 1. Modo de programação do recurso
alter table public.resources add column if not exists schedule_mode text not null default 'calendar'
  check (schedule_mode in ('calendar', 'on_demand'));
update public.resources set schedule_mode = 'on_demand' where id = 'res-301' and schedule_mode = 'calendar';

-- 2. Motivo para paradas sem causa informada no ERP
insert into public.downtime_reasons (code, name, category, is_planned, created_by)
values ('SEM-MOTIVO', 'Parada sem motivo informado (Iniflex)', 'Não informado', false, 'bb2eaea7-6a86-41c2-a30f-215ee4079398')
on conflict (code) do nothing;

update public.downtime_records d
set reason_id = r.id
from public.downtime_reasons r
where r.code = 'SEM-MOTIVO'
  and d.source = 'iniflex_report'
  and d.reason_id is null;

-- 3. Correção de dado: a impressão (201) é apontada no Iniflex só por PESO — a coluna "Quantidade" do
--    RPCP622 vem 0 em todos os apontamentos em KG da 201, com o peso preenchido. Nas demais máquinas em
--    KG, quantidade = peso em 100% dos casos. Logo, em KG com quantidade 0, quantidade = peso líquido.
update public.production_events
set quantity = net_weight_kg
where source = 'iniflex_report' and unit = 'kg' and quantity = 0 and net_weight_kg > 0;

-- 4. Padrões provisórios por recurso × produto × etapa × unidade
with ev as (
  select resource_id, product_id, step_id, unit, quantity, worked_minutes,
         quantity / (worked_minutes / 60.0) as rate
  from public.production_events
  where source = 'iniflex_report' and quantity > 0 and worked_minutes between 1 and 1440
),
combos as (
  select distinct resource_id, product_id, step_id, unit
  from public.production_events
  where source = 'iniflex_report'
),
by_combo as (
  select resource_id, product_id, step_id, unit,
         percentile_cont(0.9) within group (order by rate) filter (where worked_minutes >= 30) as p90,
         count(*) filter (where worked_minutes >= 30) as n30,
         max(rate) as rmax,
         count(*) as n
  from ev group by 1, 2, 3, 4
),
by_step as (
  select resource_id, step_id, unit,
         percentile_cont(0.9) within group (order by rate) as p90
  from ev where worked_minutes >= 30
  group by 1, 2, 3
)
insert into public.resource_standards
  (resource_id, product_id, step_id, standard_type, value, unit, valid_from, source, notes, created_by)
select
  c.resource_id, c.product_id, c.step_id, 'rate_per_hour',
  round(coalesce(b.p90, b.rmax, s.p90)::numeric, 4),
  c.unit,
  date '2026-10-01',
  'PROVISÓRIO — melhor ritmo demonstrado (P90) Iniflex RPCP622 Out/2026',
  case
    when b.p90 is not null then format('Base: P90 de %s apontamento(s) de 30 min a 24 h. Substituir pelo padrão oficial da engenharia.', b.n30)
    when b.rmax is not null then format('Base: maior velocidade de %s apontamento(s) curtos (< 30 min). Substituir pelo padrão oficial da engenharia.', b.n)
    else 'Base: P90 da etapa no recurso (combinação sem apontamento com duração válida). Substituir pelo padrão oficial da engenharia.'
  end,
  'bb2eaea7-6a86-41c2-a30f-215ee4079398'
from combos c
left join by_combo b
  on b.resource_id = c.resource_id and b.product_id is not distinct from c.product_id
 and b.step_id is not distinct from c.step_id and b.unit = c.unit
left join by_step s
  on s.resource_id = c.resource_id and s.step_id is not distinct from c.step_id and s.unit = c.unit
where coalesce(b.p90, b.rmax, s.p90) > 0
  and not exists (
    select 1 from public.resource_standards x
    where x.resource_id = c.resource_id and x.product_id is not distinct from c.product_id
      and x.step_id is not distinct from c.step_id and x.unit = c.unit
  );

commit;
