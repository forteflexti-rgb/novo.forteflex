-- =============================================================================
-- IROG FORTEFLEX — Fase 2: modelo de dados (migração ADITIVA)
-- -----------------------------------------------------------------------------
-- STATUS: APLICADA no Supabase (projeto hnvstowiivzvbqaekhxo) em 2026-11-26, após ensaio com ROLLBACK.
--         Resultado: 9 → 26 tabelas, RLS em todas, dados existentes preservados.
--
-- Garantias desta migração:
--   * Nenhuma tabela, coluna ou registro existente é apagado ou renomeado.
--   * Tabelas novas: "create table if not exists".
--   * Colunas novas em tabelas existentes: todas opcionais (nullable ou com default).
--   * Três afrouxamentos de restrição (sem perda de dados):
--       - profiles.role passa a aceitar os novos perfis;
--       - import_batches.source_type passa a aceitar 'iniflex_report';
--       - downtime_records.production_record_id e production_goals.target_quantity
--         deixam de ser obrigatórios (paradas sem registro diário e metas percentuais).
--   * Nenhum valor de capacidade, ciclo, meta ou calendário é inserido: os cadastros
--     começam vazios e o IROG fica "pendente" até a engenharia preenchê-los.
--
-- Convenções: ids "text" (como no schema atual), auditoria created_by/updated_by,
-- origem do dado em "source" ('demo' | 'manual' | 'iniflex_report' | 'iniflex_api').
-- =============================================================================

begin;

-- -----------------------------------------------------------------------------
-- 0. PERFIS DE ACESSO
-- -----------------------------------------------------------------------------
-- Remove qualquer CHECK antigo sobre profiles.role / import_batches.source_type, seja qual for o nome
-- (o banco em produção pode ter sido criado por uma versão anterior do schema).
do $$
declare c record;
begin
  for c in
    select conrelid::regclass::text as tbl, conname
    from pg_constraint
    where contype = 'c'
      and ((conrelid = 'public.profiles'::regclass and pg_get_constraintdef(oid) ilike '%role%')
        or (conrelid = 'public.import_batches'::regclass and pg_get_constraintdef(oid) ilike '%source_type%'))
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'industrial_manager', 'sector_manager', 'director', 'operator', 'ti'));

create or replace function public.current_app_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active = true;
$$;

create or replace function public.current_sector_id()
returns text language sql stable security definer set search_path = public as $$
  select sector_id from public.profiles where id = auth.uid() and is_active = true;
$$;

-- Acesso a todos os indicadores industriais
create or replace function public.has_industrial_access()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('admin', 'industrial_manager', 'director', 'ti'), false);
$$;

-- Acesso ao setor informado (gestor de setor só vê o próprio)
create or replace function public.can_read_sector(p_sector_id text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_industrial_access()
      or (public.current_app_role() in ('sector_manager', 'operator') and p_sector_id = public.current_sector_id());
$$;

-- -----------------------------------------------------------------------------
-- 1. ESTRUTURA INDUSTRIAL: Fábrica > Setor > Linha > Recurso / Etapa
-- -----------------------------------------------------------------------------
create table if not exists public.plants (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.sectors add column if not exists plant_id text references public.plants(id) on delete restrict;
alter table public.sectors add column if not exists updated_at timestamptz;

create table if not exists public.process_steps (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,              -- "10", "20"... como no Iniflex
  name text not null,                     -- "EXTRUSAO"
  sequence integer,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Recurso produtivo: máquina OU outro recurso (posto manual, equipe...). Linha é opcional.
create table if not exists public.resources (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  resource_type text not null default 'machine'
    check (resource_type in ('machine', 'manual_station', 'team', 'other')),
  sector_id text not null references public.sectors(id) on delete restrict,
  line_id text references public.production_lines(id) on delete set null,
  iniflex_code text unique,               -- código do recurso no Iniflex (ex.: "101")
  is_shared boolean not null default false,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_resources_sector on public.resources(sector_id);
create index if not exists idx_resources_line on public.resources(line_id);

-- Recurso compartilhado entre linhas
create table if not exists public.resource_lines (
  resource_id text not null references public.resources(id) on delete cascade,
  line_id text not null references public.production_lines(id) on delete cascade,
  primary key (resource_id, line_id)
);

-- -----------------------------------------------------------------------------
-- 2. CALENDÁRIO E TEMPO PROGRAMADO
-- -----------------------------------------------------------------------------
alter table public.shifts add column if not exists break_minutes integer check (break_minutes >= 0);

-- Turnos programados por recurso e dia da semana, com vigência
create table if not exists public.work_calendars (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.resources(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),   -- 0 = domingo
  shift_id text not null references public.shifts(id) on delete restrict,
  planned_minutes integer not null check (planned_minutes >= 0),
  valid_from date not null,
  valid_to date,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists idx_work_calendars_resource on public.work_calendars(resource_id, weekday);

-- Exceções: feriado, parada programada (manutenção preventiva), turno extra
create table if not exists public.calendar_exceptions (
  id text primary key default gen_random_uuid()::text,
  resource_id text references public.resources(id) on delete cascade,  -- null = fábrica toda
  exception_date date not null,
  shift_id text references public.shifts(id) on delete restrict,       -- null = dia todo
  kind text not null check (kind in ('holiday', 'planned_stop', 'extra_shift')),
  minutes integer check (minutes >= 0),
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_calendar_exceptions_date on public.calendar_exceptions(exception_date);

-- -----------------------------------------------------------------------------
-- 3. PARÂMETROS PRODUTIVOS (capacidade / ciclo) — produto x etapa x recurso
-- -----------------------------------------------------------------------------
create table if not exists public.resource_standards (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.resources(id) on delete cascade,
  product_id text references public.products(id) on delete cascade,      -- null = padrão do recurso
  step_id text references public.process_steps(id) on delete set null,
  standard_type text not null check (standard_type in ('rate_per_hour', 'cycle_seconds')),
  value numeric(14, 4) not null check (value > 0),
  unit text not null,                     -- unidade da quantidade: kg | mil | mt | un
  valid_from date not null,
  valid_to date,
  source text not null,                   -- quem/como definiu (ex.: "Engenharia — cronoanálise 11/2026")
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists idx_resource_standards_lookup
  on public.resource_standards(resource_id, product_id, step_id, valid_from);

-- -----------------------------------------------------------------------------
-- 4. CLASSIFICAÇÃO DE PARADAS E PERDAS
-- -----------------------------------------------------------------------------
create table if not exists public.downtime_reasons (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  category text,                          -- mecânica, elétrica, setup, falta de material...
  is_planned boolean not null,            -- programada (sai do tempo programado) x não programada
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loss_reasons (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  category text,
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- 5. ORDENS DE PRODUÇÃO E APONTAMENTOS BRUTOS (rastreabilidade do IROG)
-- -----------------------------------------------------------------------------
create table if not exists public.production_orders (
  id text primary key default gen_random_uuid()::text,
  order_number text not null,
  product_id text references public.products(id) on delete set null,
  planned_quantity numeric(14, 3),
  unit text,
  status text,
  planned_start date,
  planned_end date,
  source text not null check (source in ('demo', 'manual', 'iniflex_report', 'iniflex_api')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, order_number)
);

create table if not exists public.production_events (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.resources(id) on delete restrict,
  step_id text references public.process_steps(id) on delete set null,
  product_id text references public.products(id) on delete set null,
  order_id text references public.production_orders(id) on delete set null,
  shift_id text references public.shifts(id) on delete set null,
  operator_id uuid references public.profiles(id) on delete set null,
  operator_name text,                     -- nome vindo do ERP quando não há perfil vinculado
  production_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  worked_minutes numeric(10, 2) check (worked_minutes >= 0),
  quantity numeric(14, 3) not null check (quantity >= 0),
  unit text not null,
  net_weight_kg numeric(14, 3),
  source text not null check (source in ('demo', 'manual', 'iniflex_report', 'iniflex_api')),
  source_ref text not null,               -- chave natural na origem (deduplicação)
  import_batch_id text references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, source_ref),
  check (ended_at is null or started_at is null or ended_at >= started_at)
);
create index if not exists idx_prod_events_resource_date on public.production_events(resource_id, production_date);
create index if not exists idx_prod_events_date on public.production_events(production_date);
create index if not exists idx_prod_events_order on public.production_events(order_id);

-- Perdas: registro próprio, nunca somado de novo à produção
create table if not exists public.loss_events (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.resources(id) on delete restrict,
  production_event_id text references public.production_events(id) on delete set null,
  order_id text references public.production_orders(id) on delete set null,
  product_id text references public.products(id) on delete set null,
  reason_id text references public.loss_reasons(id) on delete set null,
  shift_id text references public.shifts(id) on delete set null,
  production_date date not null,
  quantity numeric(14, 3) check (quantity >= 0),
  unit text,
  weight_kg numeric(14, 3) check (weight_kg >= 0),
  source text not null check (source in ('demo', 'manual', 'iniflex_report', 'iniflex_api')),
  source_ref text not null,
  import_batch_id text references public.import_batches(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (source, source_ref),
  check (quantity is not null or weight_kg is not null)
);
create index if not exists idx_loss_events_resource_date on public.loss_events(resource_id, production_date);

-- -----------------------------------------------------------------------------
-- 6. COLUNAS NOVAS EM TABELAS EXISTENTES (todas opcionais)
-- -----------------------------------------------------------------------------
alter table public.production_records add column if not exists resource_id text references public.resources(id) on delete set null;
alter table public.production_records add column if not exists source text
  check (source in ('demo', 'manual', 'iniflex_report', 'iniflex_api'));
alter table public.production_records add column if not exists source_ref text;
alter table public.production_records add column if not exists operating_minutes numeric(10, 2) check (operating_minutes >= 0);
create index if not exists idx_prod_records_resource on public.production_records(resource_id);

alter table public.downtime_records alter column production_record_id drop not null;
alter table public.downtime_records add column if not exists resource_id text references public.resources(id) on delete set null;
alter table public.downtime_records add column if not exists reason_id text references public.downtime_reasons(id) on delete set null;
alter table public.downtime_records add column if not exists shift_id text references public.shifts(id) on delete set null;
alter table public.downtime_records add column if not exists production_date date;
alter table public.downtime_records add column if not exists started_at timestamptz;
alter table public.downtime_records add column if not exists ended_at timestamptz;
alter table public.downtime_records add column if not exists operator_id uuid references public.profiles(id) on delete set null;
alter table public.downtime_records add column if not exists order_id text references public.production_orders(id) on delete set null;
alter table public.downtime_records add column if not exists source text
  check (source in ('demo', 'manual', 'iniflex_report', 'iniflex_api'));
alter table public.downtime_records add column if not exists source_ref text;
create index if not exists idx_downtime_resource_date on public.downtime_records(resource_id, production_date);
create unique index if not exists uq_downtime_source_ref
  on public.downtime_records(source, source_ref) where source_ref is not null;

alter table public.production_goals alter column target_quantity drop not null;
alter table public.production_goals add column if not exists resource_id text references public.resources(id) on delete cascade;
alter table public.production_goals add column if not exists metric text not null default 'quantity'
  check (metric in ('quantity', 'irog', 'availability', 'performance', 'quality', 'loss_percent'));
alter table public.production_goals add column if not exists target_percent numeric(6, 2)
  check (target_percent between 0 and 100);
alter table public.production_goals add column if not exists valid_from date;
alter table public.production_goals add column if not exists valid_to date;
alter table public.production_goals add column if not exists source text;   -- quem aprovou a meta

alter table public.import_batches add constraint import_batches_source_type_check
  check (source_type in ('excel', 'csv', 'iniflex_api', 'iniflex_report'));
alter table public.import_batches add column if not exists file_hash text;

-- -----------------------------------------------------------------------------
-- 7. RESULTADOS DO IROG (grão: recurso x dia x turno)
--    Consolidação (linha/setor/fábrica) = somas de tempos e quantidades compatíveis,
--    nunca média de percentuais.
-- -----------------------------------------------------------------------------
create table if not exists public.irog_results (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.resources(id) on delete cascade,
  production_date date not null,
  shift_id text references public.shifts(id) on delete set null,      -- null = dia inteiro
  scheduled_minutes numeric(10, 2),           -- calendário − paradas programadas
  planned_stop_minutes numeric(10, 2),
  unplanned_stop_minutes numeric(10, 2),
  operating_minutes numeric(10, 2),
  ideal_minutes numeric(10, 2),               -- tempo padrão das peças produzidas (soma de qtd / taxa)
  produced_quantity numeric(14, 3),
  approved_quantity numeric(14, 3),
  loss_quantity numeric(14, 3),
  unit text,
  availability numeric(7, 4),                 -- 0..1; null quando pendente
  performance numeric(7, 4),
  quality numeric(7, 4),
  irog numeric(7, 4),
  status text not null check (status in ('ok', 'pending')),
  pending_reasons jsonb not null default '[]'::jsonb,  -- [{code, message, required, affected_records}]
  source_summary jsonb not null default '{}'::jsonb,   -- contagem de registros por origem
  calc_version text not null,
  calculated_at timestamptz not null default now()
);
create unique index if not exists uq_irog_results_grain
  on public.irog_results(resource_id, production_date, coalesce(shift_id, ''));
create index if not exists idx_irog_results_date on public.irog_results(production_date);

-- -----------------------------------------------------------------------------
-- 8. ALERTAS (limites definidos pelo administrador)
-- -----------------------------------------------------------------------------
create table if not exists public.alert_rules (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  metric text not null check (metric in ('irog', 'availability', 'performance', 'quality', 'loss_percent', 'downtime_minutes')),
  scope_type text not null check (scope_type in ('plant', 'sector', 'line', 'resource')),
  scope_id text,                              -- null = todos do tipo
  comparator text not null check (comparator in ('lt', 'gt')),
  threshold numeric(12, 4) not null,
  period text not null check (period in ('shift', 'day', 'week', 'month')),
  active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.alert_events (
  id text primary key default gen_random_uuid()::text,
  rule_id text not null references public.alert_rules(id) on delete cascade,
  scope_type text not null,
  scope_id text,
  period_start date not null,
  period_end date not null,
  value numeric(12, 4) not null,
  threshold numeric(12, 4) not null,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'closed')),
  acknowledged_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_alert_events_status on public.alert_events(status, created_at);

-- -----------------------------------------------------------------------------
-- 9. INTEGRAÇÃO INIFLEX (somente leitura) — histórico de sincronização
-- -----------------------------------------------------------------------------
create table if not exists public.sync_runs (
  id text primary key default gen_random_uuid()::text,
  source text not null check (source in ('iniflex_report', 'iniflex_api')),
  endpoint text,
  period_start date,
  period_end date,
  status text not null check (status in ('running', 'success', 'partial', 'failed')),
  fetched_count integer not null default 0,
  inserted_count integer not null default 0,
  updated_count integer not null default 0,
  duplicate_count integer not null default 0,
  error_count integer not null default 0,
  error_detail jsonb,
  import_batch_id text references public.import_batches(id) on delete set null,
  triggered_by uuid references public.profiles(id) on delete set null,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- -----------------------------------------------------------------------------
-- 10. AUDITORIA DE CADASTROS E PARÂMETROS
-- -----------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists idx_audit_log_table_record on public.audit_log(table_name, record_id);

create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (table_name, record_id, action, old_data, new_data, changed_by)
  values (
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id', null),
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'plants', 'sectors', 'production_lines', 'resources', 'process_steps', 'products', 'shifts',
    'work_calendars', 'calendar_exceptions', 'resource_standards', 'downtime_reasons', 'loss_reasons',
    'production_goals', 'alert_rules'
  ] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$I', t);
    execute format(
      'create trigger trg_audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY DAS TABELAS NOVAS
--     Leitura: perfis industriais (todos) ou do próprio setor. Escrita: administrador.
--     Cargas do Iniflex e o motor IROG gravam via backend com service role (ignora RLS);
--     a chave service role NUNCA vai para o navegador.
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  -- Cadastros sem setor: leitura para qualquer autenticado
  foreach t in array array['plants', 'process_steps', 'downtime_reasons', 'loss_reasons', 'production_orders'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "irog_read_%1$s" on public.%1$I', t);
    execute format('create policy "irog_read_%1$s" on public.%1$I for select using (auth.role() = ''authenticated'')', t);
    execute format('drop policy if exists "irog_admin_%1$s" on public.%1$I', t);
    execute format('create policy "irog_admin_%1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;

  -- Industriais e alertas: somente perfis industriais
  foreach t in array array['alert_rules', 'alert_events', 'sync_runs', 'audit_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "irog_read_%1$s" on public.%1$I', t);
    execute format('create policy "irog_read_%1$s" on public.%1$I for select using (public.has_industrial_access())', t);
    execute format('drop policy if exists "irog_admin_%1$s" on public.%1$I', t);
    execute format('create policy "irog_admin_%1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

-- Tabelas com recurso: filtradas pelo setor do recurso
alter table public.resources enable row level security;
drop policy if exists "irog_read_resources" on public.resources;
create policy "irog_read_resources" on public.resources for select using (public.can_read_sector(sector_id));
drop policy if exists "irog_admin_resources" on public.resources;
create policy "irog_admin_resources" on public.resources for all using (public.is_admin()) with check (public.is_admin());

alter table public.resource_lines enable row level security;
drop policy if exists "irog_read_resource_lines" on public.resource_lines;
create policy "irog_read_resource_lines" on public.resource_lines for select using (auth.role() = 'authenticated');
drop policy if exists "irog_admin_resource_lines" on public.resource_lines;
create policy "irog_admin_resource_lines" on public.resource_lines for all using (public.is_admin()) with check (public.is_admin());

do $$
declare t text;
begin
  foreach t in array array['work_calendars', 'calendar_exceptions', 'resource_standards',
                           'production_events', 'loss_events', 'irog_results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "irog_read_%1$s" on public.%1$I', t);
    execute format(
      'create policy "irog_read_%1$s" on public.%1$I for select using (
         public.has_industrial_access()
         or exists (select 1 from public.resources r
                    where r.id = %1$I.resource_id and public.can_read_sector(r.sector_id)))', t);
    execute format('drop policy if exists "irog_admin_%1$s" on public.%1$I', t);
    execute format('create policy "irog_admin_%1$s" on public.%1$I for all using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;

commit;

-- =============================================================================
-- REVERSÃO (somente se aprovada; apaga apenas o que esta migração criou):
--   drop table if exists public.audit_log, public.sync_runs, public.alert_events, public.alert_rules,
--     public.irog_results, public.loss_events, public.production_events, public.production_orders,
--     public.loss_reasons, public.downtime_reasons, public.resource_standards, public.calendar_exceptions,
--     public.work_calendars, public.resource_lines, public.resources, public.process_steps, public.plants cascade;
--   (as colunas novas das tabelas existentes podem ficar; são opcionais.)
-- =============================================================================
