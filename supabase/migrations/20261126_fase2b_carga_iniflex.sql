-- =============================================================================
-- Fase 2b — preparação para a carga dos dados reais do Iniflex (Outubro/2026)
-- ADITIVA: nada é apagado. Dados demonstrativos existentes são mantidos.
-- =============================================================================
begin;

-- 1. planned_quantity: aceitar 0 (perdas do RPCP019 em dias sem produção apontada)
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.production_records'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%planned_quantity%'
  loop
    execute format('alter table public.production_records drop constraint %I', c.conname);
  end loop;
end $$;
alter table public.production_records add constraint production_records_planned_quantity_check
  check (planned_quantity >= 0);

-- 2. Setor de TI (necessário para as OS) e Rebobinadeira (recurso 301 do Iniflex)
insert into public.sectors (id, code, name, description, active) values
  ('sec-ti', 'TI', 'Tecnologia da Informação & Automação', 'Suporte Técnico, Infraestrutura, Redes e Sistemas', true),
  ('sec-reb', 'REB', 'Rebobinadeira', 'Rebobinamento, refile e corte longitudinal', true)
on conflict do nothing;

-- 3. Ordens de serviço (existia em supabase/schema.sql, mas não no banco)
create table if not exists public.service_orders (
  id text primary key default gen_random_uuid()::text,
  ticket_number text not null unique,
  title text not null,
  description text not null,
  category text not null,
  priority text not null,
  status text not null,
  sector_id text not null references public.sectors(id) on delete restrict,
  line_or_location text,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  assigned_to_id uuid references public.profiles(id) on delete set null,
  notes jsonb not null default '[]'::jsonb,
  solution text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_so_status on public.service_orders(status);
create index if not exists idx_so_requester on public.service_orders(requester_id);
create index if not exists idx_so_sector on public.service_orders(sector_id);

alter table public.service_orders enable row level security;
-- Leitura e abertura: qualquer autenticado. Atualização: quem abriu, o técnico atribuído ou admin
-- (o schema.sql original liberava atualização para qualquer autenticado).
drop policy if exists "so_select" on public.service_orders;
create policy "so_select" on public.service_orders for select using (auth.role() = 'authenticated');
drop policy if exists "so_insert" on public.service_orders;
create policy "so_insert" on public.service_orders for insert with check (requester_id = auth.uid());
drop policy if exists "so_update" on public.service_orders;
create policy "so_update" on public.service_orders for update
  using (public.is_admin() or requester_id = auth.uid() or assigned_to_id = auth.uid());
drop policy if exists "so_delete" on public.service_orders;
create policy "so_delete" on public.service_orders for delete using (public.is_admin());

commit;
