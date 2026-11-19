-- =============================================================================
-- NOVO.FORTEFLEX — Schema PostgreSQL, Políticas RLS e Dados Iniciais para Supabase
-- Tabelas: profiles, sectors, production_lines, products, shifts,
--          production_records, downtime_records, production_goals, import_batches
-- =============================================================================

create extension if not exists "pgcrypto";

-- 1. SETORES
create table if not exists public.sectors (
  id text primary key default gen_random_uuid()::text,
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
  sector_id text references public.sectors(id) on delete set null,
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
  id text primary key default gen_random_uuid()::text,
  sector_id text not null references public.sectors(id) on delete restrict,
  code text not null unique,
  name text not null,
  capacity_per_hour numeric(12, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. PRODUTOS
create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
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
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  start_time time not null,
  end_time time not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 6. REGISTROS DE PRODUÇÃO
create table if not exists public.production_records (
  id text primary key default gen_random_uuid()::text,
  production_date date not null,
  shift_id text not null references public.shifts(id) on delete restrict,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  sector_id text not null references public.sectors(id) on delete restrict,
  line_id text not null references public.production_lines(id) on delete restrict,
  product_id text not null references public.products(id) on delete restrict,
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
  id text primary key default gen_random_uuid()::text,
  production_record_id text not null references public.production_records(id) on delete cascade,
  reason text not null,
  duration_minutes integer not null check (duration_minutes >= 0),
  description text,
  created_at timestamptz not null default now()
);

-- 8. METAS DE PRODUÇÃO
create table if not exists public.production_goals (
  id text primary key default gen_random_uuid()::text,
  sector_id text not null references public.sectors(id) on delete cascade,
  line_id text references public.production_lines(id) on delete set null,
  product_id text references public.products(id) on delete set null,
  shift_id text references public.shifts(id) on delete set null,
  period_type text not null check (period_type in ('daily', 'monthly')),
  target_quantity numeric(14, 2) not null check (target_quantity > 0),
  max_loss_percent numeric(5, 2) not null default 3.0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 9. HISTÓRICO DE IMPORTAÇÃO & PREPARAÇÃO ERP INIFLEX
create table if not exists public.import_batches (
  id text primary key default gen_random_uuid()::text,
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

-- Índices para performance
create index if not exists idx_prod_records_date on public.production_records(production_date);
create index if not exists idx_prod_records_operator on public.production_records(operator_id);
create index if not exists idx_prod_records_sector on public.production_records(sector_id);
create index if not exists idx_prod_records_line on public.production_records(line_id);
create index if not exists idx_prod_records_product on public.production_records(product_id);
create index if not exists idx_downtime_record on public.downtime_records(production_record_id);

-- =============================================================================
-- FUNÇÃO AUXILIAR DE SEGURANÇA (RLS)
-- =============================================================================

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
as $$
  select coalesce(
    (
      select role = 'admin' and is_active = true
      from public.profiles
      where id = auth.uid()
    ),
    false
  );
$$;

-- Trigger para sincronizar auth.users com public.profiles automaticamente
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username, email, full_name, role, permissions)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'operator'),
    '{"can_create_records": true, "can_edit_own_records": true, "can_view_own_records": true, "can_view_sector_records": false, "can_export_own_records": false}'::jsonb
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
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
create policy "Usuário visualiza perfis"
  on public.profiles for select
  using (auth.role() = 'authenticated');

create policy "Somente administrador gerencia perfis"
  on public.profiles for all
  using (public.is_admin())
  with check (public.is_admin());

-- CATÁLOGOS OPERACIONAIS (sectors, production_lines, products, shifts, goals)
create policy "Leitura pública de setores" on public.sectors for select using (true);
create policy "Admin gerencia setores" on public.sectors for all using (public.is_admin()) with check (public.is_admin());

create policy "Leitura pública de linhas" on public.production_lines for select using (true);
create policy "Admin gerencia linhas" on public.production_lines for all using (public.is_admin()) with check (public.is_admin());

create policy "Leitura pública de produtos" on public.products for select using (true);
create policy "Admin gerencia produtos" on public.products for all using (public.is_admin()) with check (public.is_admin());

create policy "Leitura pública de turnos" on public.shifts for select using (true);
create policy "Admin gerencia turnos" on public.shifts for all using (public.is_admin()) with check (public.is_admin());

create policy "Leitura pública de metas" on public.production_goals for select using (true);
create policy "Admin gerencia metas" on public.production_goals for all using (public.is_admin()) with check (public.is_admin());

-- PRODUCTION RECORDS
create policy "Operador lê próprios e Admin lê todos"
  on public.production_records for select
  using (
    public.is_admin()
    or operator_id = auth.uid()
    or created_by = auth.uid()
  );

create policy "Operador autenticado insere lançamentos"
  on public.production_records for insert
  with check (auth.role() = 'authenticated');

create policy "Operador edita próprios se permitido"
  on public.production_records for update
  using (
    public.is_admin()
    or (
      created_by = auth.uid()
      and exists (
        select 1 from public.profiles
        where id = auth.uid()
          and is_active = true
          and coalesce((permissions->>'can_edit_own_records')::boolean, false) = true
      )
    )
  );

create policy "Admin exclui lançamentos"
  on public.production_records for delete
  using (public.is_admin());

-- DOWNTIME RECORDS
create policy "Leitura de paradas"
  on public.downtime_records for select
  using (auth.role() = 'authenticated');

create policy "Inserção de paradas"
  on public.downtime_records for insert
  with check (auth.role() = 'authenticated');

create policy "Admin gerencia paradas"
  on public.downtime_records for all
  using (public.is_admin())
  with check (public.is_admin());

-- IMPORT BATCHES
create policy "Admin acessa lotes de importação"
  on public.import_batches for all
  using (public.is_admin())
  with check (public.is_admin());

-- =============================================================================
-- DADOS INICIAIS (SEED)
-- =============================================================================

insert into public.sectors (id, code, name, description, active) values
  ('sec-ext', 'EXT', 'Extrusão', 'Extrusão de filmes técnicos e tubulares', true),
  ('sec-cs', 'CS', 'Corte e Solda', 'Conversão, corte e soldagem industrial', true),
  ('sec-imp', 'IMP', 'Impressão Flexográfica', 'Impressão rotativa de alta definição', true),
  ('sec-emb', 'EMB', 'Acabamento e Embalagem', 'Revisão final, paletização e expedição', true)
on conflict (code) do nothing;

insert into public.production_lines (id, sector_id, code, name, capacity_per_hour, active) values
  ('lin-ext-01', 'sec-ext', 'EXT-01', 'Extrusora Balão 01', 220, true),
  ('lin-ext-02', 'sec-ext', 'EXT-02', 'Extrusora Coextrusada 02', 310, true),
  ('lin-cs-01', 'sec-cs', 'CS-01', 'Corte e Solda Automática 01', 180, true),
  ('lin-cs-02', 'sec-cs', 'CS-02', 'Corte Lateral Alta Velocidade 02', 210, true),
  ('lin-imp-01', 'sec-imp', 'IMP-01', 'Impressora Flexo 8 Cores', 260, true),
  ('lin-emb-01', 'sec-emb', 'EMB-01', 'Linha de Rebobinamento e Paletização', 350, true)
on conflict (code) do nothing;

insert into public.products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active) values
  ('prod-01', 'FF-PEBD-040', 'Filme Técnico PEBD 40µm', 'Filmes Técnicos', 'kg', 0.45, true),
  ('prod-02', 'FF-BOPP-025', 'Bobina Laminada BOPP', 'Laminados', 'kg', 0.35, true),
  ('prod-03', 'FF-SAC-025', 'Saco Industrial Valvulado 25kg', 'Sacos Industriais', 'un', 0.12, true),
  ('prod-04', 'FF-SHR-060', 'Filme Termoencolhível Shrink 60µm', 'Termoencolhíveis', 'kg', 0.40, true),
  ('prod-05', 'FF-BOB-IMP', 'Bobina Impressa Personalizada', 'Impressos', 'kg', 0.38, true)
on conflict (sku) do nothing;

insert into public.shifts (id, code, name, start_time, end_time, active) values
  ('shf-01', 'T1', '1º Turno (Manhã)', '06:00:00', '14:00:00', true),
  ('shf-02', 'T2', '2º Turno (Tarde)', '14:00:00', '22:00:00', true),
  ('shf-03', 'T3', '3º Turno (Noite)', '22:00:00', '06:00:00', true)
on conflict (code) do nothing;

insert into public.production_goals (id, sector_id, line_id, product_id, shift_id, period_type, target_quantity, max_loss_percent, active) values
  ('goal-01', 'sec-ext', 'lin-ext-01', 'prod-01', 'shf-01', 'daily', 1600, 2.5, true),
  ('goal-02', 'sec-ext', 'lin-ext-02', 'prod-04', 'shf-02', 'daily', 2100, 2.8, true),
  ('goal-03', 'sec-cs', 'lin-cs-01', 'prod-03', 'shf-01', 'daily', 1400, 2.0, true),
  ('goal-04', 'sec-imp', 'lin-imp-01', 'prod-05', 'shf-02', 'daily', 1900, 3.0, true)
on conflict (id) do nothing;
