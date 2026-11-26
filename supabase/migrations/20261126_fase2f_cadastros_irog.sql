-- =============================================================================
-- Fase 2f — colunas usadas pela tela de Cadastros Industriais & Parâmetros IROG.
-- ADITIVA: nada é apagado; nenhum valor de capacidade, ciclo ou meta é inserido.
-- =============================================================================
begin;

-- Máquinas/recursos: status manual (manutenção, ociosa). "Parada" vem das paradas em aberto.
alter table public.resources add column if not exists status text not null default 'operating'
  check (status in ('operating', 'stopped', 'maintenance', 'idle'));

-- Operações/etapas: setor e descrição opcionais
alter table public.process_steps add column if not exists sector_id text references public.sectors(id) on delete set null;
alter table public.process_steps add column if not exists description text;

-- OPs: onde serão produzidas
alter table public.production_orders add column if not exists sector_id text references public.sectors(id) on delete set null;
alter table public.production_orders add column if not exists line_id text references public.production_lines(id) on delete set null;
alter table public.production_orders add column if not exists resource_id text references public.resources(id) on delete set null;
alter table public.production_orders add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

-- Metas de IROG: meta da fábrica (sem setor) e metas de D, P e Q junto da meta de IROG
alter table public.production_goals alter column sector_id drop not null;
alter table public.production_goals add column if not exists target_availability_percent numeric(6, 2) check (target_availability_percent between 0 and 100);
alter table public.production_goals add column if not exists target_performance_percent numeric(6, 2) check (target_performance_percent between 0 and 100);
alter table public.production_goals add column if not exists target_quality_percent numeric(6, 2) check (target_quality_percent between 0 and 100);
alter table public.production_goals add column if not exists created_by uuid references public.profiles(id) on delete set null default auth.uid();

-- Autor dos padrões, calendários e exceções preenchido automaticamente
alter table public.resource_standards alter column created_by set default auth.uid();
alter table public.work_calendars alter column created_by set default auth.uid();
alter table public.calendar_exceptions alter column created_by set default auth.uid();
alter table public.resources alter column created_by set default auth.uid();
alter table public.process_steps alter column created_by set default auth.uid();
alter table public.downtime_reasons alter column created_by set default auth.uid();
alter table public.loss_reasons alter column created_by set default auth.uid();

commit;
