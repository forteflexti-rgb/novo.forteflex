-- =============================================================================
-- NOVO.FORTEFLEX — Schema PostgreSQL & Políticas RLS para Supabase
-- Tabelas: profiles, sectors, production_lines, products, shifts,
--          production_records, downtime_records, production_goals, import_batches
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. SETORES
create table if not exists public.sectors (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 2. PERFIS DE USUÁRIOS (vinculado ao auth.users do Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique,
  email text not null unique,
  full_name text not null,
  role text not null check (role in ('admin', 'operator')),
  sector_id uuid references public.sectors(id) on delete set null,
  is_active boolean not null default true,
  permissions jsonb not null default '{
    "can_create_records": true,
    "can_edit_own_records": true,
    "can_view_own_records": true,
    "can_view_sector_records": false,
    "can_export_own_records": false
  }'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. LINHAS DE PRODUÇÃO
create table if not exists public.production_lines (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors(id) on delete restrict,
  code text not null unique,
  name text not null,
  capacity_per_hour numeric(12, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. PRODUTOS
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  name text not null,
  category text not null,
  unit_of_measure text not null default 'kg',
  target_cycle_minutes numeric(8, 2) not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 5. TURNOS
create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6. REGISTROS DE PRODUÇÃO
create table if not exists public.production_records (
  id uuid primary key default gen_random_uuid(),
  production_date date not null,
  shift_id uuid not null references public.shifts(id) on delete restrict,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  sector_id uuid not null references public.sectors(id) on delete restrict,
  line_id uuid not null references public.production_lines(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  planned_quantity numeric(14, 2) not null check (planned_quantity > 0),
  produced_quantity numeric(14, 2) not null check (produced_quantity >= 0),
  approved_quantity numeric(14, 2) not null check (approved_quantity >= 0),
  loss_quantity numeric(14, 2) not null check (loss_quantity >= 0),
  unit_of_measure text not null,
  has_downtime boolean not null default false,
  total_downtime_minutes integer not null default 0 check (total_downtime_minutes >= 0),
  notes text,
  additional_notes text,
  is_demo boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 7. REGISTROS DE PARADAS
create table if not exists public.downtime_records (
  id uuid primary key default gen_random_uuid(),
  production_record_id uuid not null references public.production_records(id) on delete cascade,
  reason text not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  description text,
  created_at timestamptz not null default now()
);

-- 8. METAS DE PRODUÇÃO
create table if not exists public.production_goals (
  id uuid primary key default gen_random_uuid(),
  sector_id uuid not null references public.sectors(id) on delete cascade,
  line_id uuid references public.production_lines(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  shift_id uuid references public.shifts(id) on delete set null,
  period_type text not null check (period_type in ('daily', 'monthly')),
  target_quantity numeric(14, 2) not null check (target_quantity > 0),
  max_loss_percent numeric(5, 2) not null default 3.0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 9. HISTÓRICO DE IMPORTAÇÃO & PREPARAÇÃO ERP INIFLEX (PROJEDATA)
create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('excel', 'csv', 'iniflex_api')),
  filename text not null,
  total_rows integer not null default 0,
  imported_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  error_rows integer not null default 0,
  status text not null check (status in ('validated', 'completed', 'failed')),
  validation_summary jsonb,
  imported_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

-- Índices para performance analítica
create index if not exists idx_prod_records_date on public.production_records(production_date);
create index if not exists idx_prod_records_operator on public.production_records(operator_id);
create index if not exists idx_prod_records_sector on public.production_records(sector_id);
create index if not exists idx_prod_records_line on public.production_records(line_id);
create index if not exists idx_prod_records_product on public.production_records(product_id);
create index if not exists idx_downtime_record on public.downtime_records(production_record_id);

-- =============================================================================
-- FUNÇÕES AUXILIARES DE SEGURANÇA (RLS)
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

-- =============================================================================
-- ATIVAÇÃO DE ROW LEVEL SECURITY (RLS)
-- =============================================================================

alter table public.profiles enable row level security;
alter table public.sectors enable row level security;
alter table public.production_lines enable row level security;
alter table public.products enable row level security;
alter table public.shifts enable row level security;
alter table public.production_records enable row level security;
alter table public.downtime_records enable row level security;
alter table public.production_goals enable row level security;
alter table public.import_batches enable row level security;

-- PROFILES
create policy "Usuário visualiza o próprio perfil"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

create policy "Somente administrador gerencia perfis"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- CATÁLOGO OPERACIONAL (sectors, production_lines, products, shifts, goals)
create policy "Autenticados leem setores"
  on public.sectors for select
  using (auth.role() = 'authenticated');

create policy "Admin gerencia setores"
  on public.sectors for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Autenticados leem linhas"
  on public.production_lines for select
  using (auth.role() = 'authenticated');

create policy "Admin gerencia linhas"
  on public.production_lines for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Autenticados leem produtos"
  on public.products for select
  using (auth.role() = 'authenticated');

create policy "Admin gerencia produtos"
  on public.products for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Autenticados leem turnos"
  on public.shifts for select
  using (auth.role() = 'authenticated');

create policy "Admin gerencia turnos"
  on public.shifts for all
  using (public.is_admin())
  with check (public.is_admin());

create policy "Autenticados leem metas"
  on public.production_goals for select
  using (auth.role() = 'authenticated');

create policy "Admin gerencia metas"
  on public.production_goals for all
  using (public.is_admin())
  with check (public.is_admin());

-- PRODUCTION RECORDS
create policy "Operador lê próprios lançamentos e Admin lê todos"
  on public.production_records for select
  using (
    public.is_admin()
    or operator_id = auth.uid()
    or created_by = auth.uid()
  );

create policy "Operador ativo insere próprio lançamento"
  on public.production_records for insert
  with check (
    public.is_admin()
    or (
      created_by = auth.uid()
      and operator_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid() and is_active = true
      )
    )
  );

create policy "Operador edita apenas próprios lançamentos se permitido"
  on public.production_records for update
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and operator_id = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and is_active = true
          and coalesce((permissions->>'can_edit_own_records')::boolean, false) = true
      )
    )
  );

create policy "Somente admin exclui lançamentos"
  on public.production_records for delete
  using (public.is_admin());

-- DOWNTIME RECORDS
create policy "Leitura de paradas vinculada ao lançamento"
  on public.downtime_records for select
  using (
    public.is_admin()
    or exists (
      select 1 from public.production_records pr
      where pr.id = production_record_id
        and (pr.operator_id = auth.uid() or pr.created_by = auth.uid())
    )
  );

create policy "Inserção de paradas vinculada ao lançamento"
  on public.downtime_records for insert
  with check (
    public.is_admin()
    or exists (
      select 1 from public.production_records pr
      where pr.id = production_record_id
        and pr.created_by = auth.uid()
    )
  );

create policy "Admin gerencia paradas"
  on public.downtime_records for all
  using (public.is_admin())
  with check (public.is_admin());

-- IMPORT BATCHES
create policy "Somente admin acessa lotes de importação"
  on public.import_batches for all
  using (public.is_admin())
  with check (public.is_admin());
