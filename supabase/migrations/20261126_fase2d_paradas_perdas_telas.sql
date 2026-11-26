-- =============================================================================
-- Fase 2d — suporte às telas de Paradas, Perdas e Alertas (versão importada
-- adaptada ao Supabase). ADITIVA: nada é apagado; dados demonstrativos mantidos.
-- =============================================================================
begin;

-- 1. Paradas: estado (aberta/encerrada) e quem registrou
alter table public.downtime_records add column if not exists status text not null default 'closed'
  check (status in ('open', 'closed'));
alter table public.downtime_records add column if not exists recorded_by uuid
  references public.profiles(id) on delete set null default auth.uid();
alter table public.downtime_records add column if not exists sector_id text references public.sectors(id) on delete set null;
create index if not exists idx_downtime_open on public.downtime_records(resource_id) where status = 'open';

-- Paradas: operador encerra a própria parada; admin gerencia todas
drop policy if exists "irog_close_own_downtime" on public.downtime_records;
create policy "irog_close_own_downtime" on public.downtime_records for update
  using (recorded_by = auth.uid()) with check (recorded_by = auth.uid());

-- 2. Perdas lançadas pela tela (origem 'manual')
alter table public.loss_events add column if not exists reason_text text;
alter table public.loss_events add column if not exists notes text;
alter table public.loss_events add column if not exists recorded_by uuid
  references public.profiles(id) on delete set null default auth.uid();
alter table public.loss_events alter column source_ref set default gen_random_uuid()::text;

drop policy if exists "irog_insert_manual_loss" on public.loss_events;
create policy "irog_insert_manual_loss" on public.loss_events for insert
  with check (auth.role() = 'authenticated' and source = 'manual' and recorded_by = auth.uid());

-- 3. Motivos: leitura para autenticados já existe; nenhum motivo é pré-cadastrado.

commit;
