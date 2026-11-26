-- =============================================================================
-- Fase 2e — destinatários dos alertas e auditoria de perfis/permissões. ADITIVA.
-- =============================================================================
begin;

alter table public.alert_rules add column if not exists recipients text;

-- Quem promoveu quem: alterações em profiles passam a ir para audit_log
drop trigger if exists trg_audit_profiles on public.profiles;
create trigger trg_audit_profiles after insert or update or delete on public.profiles
  for each row execute function public.audit_row_change();

commit;
