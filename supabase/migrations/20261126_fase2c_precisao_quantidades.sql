-- =============================================================================
-- Fase 2c — precisão das quantidades em production_records: 2 → 3 casas decimais
-- Motivo: as perdas do RPCP019 são rateadas com 3 casas; com 2 casas a perda de
-- Outubro/2026 ficaria 1.512,26 kg em vez de 1.512,051 kg.
-- Ampliação de escala: nenhum valor existente é alterado.
-- =============================================================================
begin;
alter table public.production_records
  alter column planned_quantity type numeric(15, 3),
  alter column produced_quantity type numeric(15, 3),
  alter column approved_quantity type numeric(15, 3),
  alter column loss_quantity type numeric(15, 3);
commit;
