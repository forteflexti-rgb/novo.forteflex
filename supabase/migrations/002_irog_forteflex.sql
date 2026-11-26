-- =============================================================================
-- MIGRATION 002 — MÓDULO IROG FORTEFLEX (Não-destrutiva / Incremental)
-- Compatível com 001 (supabase/schema.sql). Preserva todas as tabelas e dados.
-- =============================================================================

-- 1. Ampliar perfis de usuários (5 perfis: admin, director, manager, leader, operator)
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'director', 'manager', 'leader', 'operator'));

alter table public.profiles
  add column if not exists allowed_sector_ids uuid[] not null default '{}',
  add column if not exists allowed_line_ids uuid[] not null default '{}';

-- 2. Máquinas e Recursos
create table if not exists public.machines (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors(id) on delete restrict,
  line_id uuid references public.production_lines(id) on delete set null,
  code text not null unique,
  name text not null,
  resource_type text not null default 'Máquina',
  theoretical_capacity_per_hour numeric(14, 4),
  capacity_unit text not null default 'kg',
  status text not null default 'operating' check (status in ('operating', 'stopped', 'maintenance', 'idle')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. Operações e Etapas Produtivas
create table if not exists public.production_stages (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid references public.sectors(id) on delete set null,
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. Turnos (extensão para intervalos e dias de trabalho)
alter table public.shifts
  add column if not exists break_minutes integer not null default 0,
  add column if not exists working_days text not null default 'Seg,Ter,Qua,Qui,Sex';

-- 5. Calendário Industrial (feriados, paradas programadas, tempo disponível)
create table if not exists public.production_calendars (
  id uuid primary key default gen_random_uuid(),
  calendar_date date not null,
  sector_id uuid references public.sectors(id) on delete cascade,
  line_id uuid references public.production_lines(id) on delete cascade,
  machine_id uuid references public.machines(id) on delete cascade,
  shift_id uuid references public.shifts(id) on delete cascade,
  day_type text not null check (day_type in ('workday', 'holiday', 'planned_stop')),
  available_minutes integer not null check (available_minutes >= 0),
  description text,
  created_at timestamptz not null default now()
);

-- 6. Operações habilitadas por Produto e Tempos de Ciclo Padrão
create table if not exists public.product_operations (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  stage_id uuid not null references public.production_stages(id) on delete restrict,
  sequence_order integer not null default 1,
  active boolean not null default true,
  unique (product_id, stage_id)
);

create table if not exists public.cycle_time_standards (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  stage_id uuid references public.production_stages(id) on delete set null,
  machine_id uuid not null references public.machines(id) on delete cascade,
  cycle_time_minutes numeric(12, 6) not null check (cycle_time_minutes > 0),
  theoretical_capacity_per_hour numeric(14, 4) not null check (theoretical_capacity_per_hour > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  is_current boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 7. Ordens de Produção
create table if not exists public.production_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  product_id uuid not null references public.products(id) on delete restrict,
  sector_id uuid not null references public.sectors(id) on delete restrict,
  line_id uuid references public.production_lines(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  planned_quantity numeric(14, 2) not null check (planned_quantity > 0),
  status text not null default 'open' check (status in ('open', 'in_progress', 'completed', 'cancelled')),
  due_date date,
  created_at timestamptz not null default now()
);

-- 8. Motivos de Parada e Motivos de Perda configuráveis
create table if not exists public.downtime_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null,
  is_planned boolean not null default false,
  counts_for_availability boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.loss_reasons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  category text not null check (category in ('Refugo', 'Retrabalho', 'Matéria-prima', 'Setup', 'Operacional', 'Qualidade', 'Outros')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 9. Extensão de production_records & downtime_records e nova tabela loss_records
alter table public.production_records
  add column if not exists machine_id uuid references public.machines(id) on delete set null,
  add column if not exists stage_id uuid references public.production_stages(id) on delete set null,
  add column if not exists production_order_id uuid references public.production_orders(id) on delete set null,
  add column if not exists start_time time,
  add column if not exists end_time time,
  add column if not exists planned_time_minutes integer,
  add column if not exists source_origin text not null default 'manual';

alter table public.downtime_records
  add column if not exists machine_id uuid references public.machines(id) on delete set null,
  add column if not exists sector_id uuid references public.sectors(id) on delete set null,
  add column if not exists line_id uuid references public.production_lines(id) on delete set null,
  add column if not exists shift_id uuid references public.shifts(id) on delete set null,
  add column if not exists reason_id uuid references public.downtime_reasons(id) on delete set null,
  add column if not exists category text,
  add column if not exists is_planned boolean not null default false,
  add column if not exists counts_for_availability boolean not null default true,
  add column if not exists start_at timestamptz,
  add column if not exists end_at timestamptz,
  add column if not exists status text not null default 'closed' check (status in ('open', 'closed')),
  add column if not exists recorded_by uuid references public.profiles(id) on delete set null;

create table if not exists public.loss_records (
  id uuid primary key default gen_random_uuid(),
  production_record_id uuid references public.production_records(id) on delete set null,
  loss_date date not null,
  shift_id uuid not null references public.shifts(id) on delete restrict,
  sector_id uuid not null references public.sectors(id) on delete restrict,
  line_id uuid references public.production_lines(id) on delete set null,
  machine_id uuid references public.machines(id) on delete set null,
  product_id uuid not null references public.products(id) on delete restrict,
  production_order_id uuid references public.production_orders(id) on delete set null,
  reason_id uuid references public.loss_reasons(id) on delete set null,
  category text not null,
  reason_name text not null,
  quantity numeric(14, 2) not null check (quantity > 0),
  unit_of_measure text not null,
  notes text,
  is_demo boolean not null default false,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- 10. Metas IROG, Parâmetros, Alertas, Histórico e Auditoria
create table if not exists public.irog_goals (
  id uuid primary key default gen_random_uuid(),
  scope_level text not null check (scope_level in ('factory', 'sector', 'line', 'machine')),
  sector_id uuid references public.sectors(id) on delete cascade,
  line_id uuid references public.production_lines(id) on delete cascade,
  machine_id uuid references public.machines(id) on delete cascade,
  target_irog_percent numeric(5, 2) not null,
  target_availability_percent numeric(5, 2) not null,
  target_performance_percent numeric(5, 2) not null,
  target_quality_percent numeric(5, 2) not null,
  max_loss_percent numeric(5, 2) not null default 3.0,
  effective_from timestamptz not null default now(),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.irog_alerts_config (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null,
  name text not null,
  threshold_value numeric(10, 2) not null,
  comparison text not null check (comparison in ('lt', 'gt')),
  recipients text,
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.parameter_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  old_value text,
  new_value text not null,
  effective_from timestamptz not null default now(),
  changed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);

-- 11. Camada de Integração Oficial Projedata / Iniflex
create table if not exists public.integration_settings (
  id uuid primary key default gen_random_uuid(),
  provider text not null unique default 'projedata_iniflex',
  status text not null default 'not_configured' check (
    status in ('not_configured', 'awaiting_credentials', 'awaiting_network', 'configured', 'connected', 'connection_error')
  ),
  api_base_url text,
  docs_url text not null default 'https://projedata-api.apidog.io/',
  read_only boolean not null default true,
  enabled_interfaces jsonb not null default '["EXP_AP_PRODUCAO_V1", "EXP_AP_PERDA_V1", "EXP_AP_PARADA_V1"]'::jsonb,
  last_sync_at timestamptz,
  last_error text,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_logs (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'projedata_iniflex',
  interface_name text not null,
  status text not null,
  records_read integer not null default 0,
  records_imported integer not null default 0,
  duplicates_skipped integer not null default 0,
  message text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.import_errors (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null,
  raw_payload jsonb not null,
  error_message text not null,
  reprocessed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Índices e RLS
create index if not exists idx_machines_sector_line on public.machines(sector_id, line_id);
create index if not exists idx_cycle_standards_lookup on public.cycle_time_standards(product_id, machine_id, is_current);
create index if not exists idx_prod_records_machine on public.production_records(machine_id);
create index if not exists idx_loss_records_date_machine on public.loss_records(loss_date, machine_id);
create index if not exists idx_audit_logs_created on public.audit_logs(created_at desc);

alter table public.machines enable row level security;
alter table public.production_stages enable row level security;
alter table public.production_calendars enable row level security;
alter table public.product_operations enable row level security;
alter table public.cycle_time_standards enable row level security;
alter table public.production_orders enable row level security;
alter table public.downtime_reasons enable row level security;
alter table public.loss_reasons enable row level security;
alter table public.loss_records enable row level security;
alter table public.irog_goals enable row level security;
alter table public.irog_alerts_config enable row level security;
alter table public.parameter_history enable row level security;
alter table public.audit_logs enable row level security;
alter table public.integration_settings enable row level security;
alter table public.integration_logs enable row level security;
alter table public.import_errors enable row level security;

create or replace function public.can_read_executive()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and is_active = true
      and role in ('admin', 'director')
  );
$$;

create policy "Autenticados leem máquinas e padrões" on public.machines for select using (auth.role() = 'authenticated');
create policy "Somente admin gerencia máquinas" on public.machines for all using (public.is_admin()) with check (public.is_admin());
create policy "Autenticados leem operações" on public.production_stages for select using (auth.role() = 'authenticated');
create policy "Somente admin gerencia operações" on public.production_stages for all using (public.is_admin()) with check (public.is_admin());
create policy "Autenticados leem ciclos padrão" on public.cycle_time_standards for select using (auth.role() = 'authenticated');
create policy "Somente admin gerencia ciclos padrão" on public.cycle_time_standards for all using (public.is_admin()) with check (public.is_admin());
create policy "Autenticados leem motivos parada" on public.downtime_reasons for select using (auth.role() = 'authenticated');
create policy "Somente admin gerencia motivos parada" on public.downtime_reasons for all using (public.is_admin()) with check (public.is_admin());
create policy "Autenticados leem motivos perda" on public.loss_reasons for select using (auth.role() = 'authenticated');
create policy "Somente admin gerencia motivos perda" on public.loss_reasons for all using (public.is_admin()) with check (public.is_admin());
create policy "Leitura de perdas por perfil" on public.loss_records for select using (public.can_read_executive() or recorded_by = auth.uid());
create policy "Inserção de perdas autenticado" on public.loss_records for insert with check (recorded_by = auth.uid() or public.is_admin());
create policy "Admin e Diretoria leem auditoria" on public.audit_logs for select using (public.can_read_executive());
create policy "Somente admin gerencia integrações" on public.integration_settings for all using (public.is_admin()) with check (public.is_admin());
