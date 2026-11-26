-- =============================================================================
-- Fase 2h — Calendário APROVADO pelo administrador (andre.sausen) em 26/11/2026.
-- Proposta baseada nos horários de início dos apontamentos RPCP622 de Out/2026.
-- 101: T1+T2+T3 seg–sáb · 201: T1+T2 seg–sex · 501/502: T1+T2 seg–sáb (3º turno eventual
-- como turno extra nos dias apontados) · 301: sob demanda (sem grade) · 420 min/turno (60 min de intervalo).
-- STATUS: APLICADA em 26/11/2026. Idempotente.
-- =============================================================================
begin;
-- Calendário aprovado pelo administrador em 26/11/2026 (proposta baseada nos apontamentos RPCP622 Out/2026)
update public.shifts set break_minutes = 60 where id in ('shf-01','shf-02','shf-03') and break_minutes is null;

insert into public.work_calendars (resource_id, weekday, shift_id, planned_minutes, valid_from, created_by)
select r, w, s, 420, date '2026-10-01', 'bb2eaea7-6a86-41c2-a30f-215ee4079398'::uuid
from (values
  ('res-101', array['shf-01','shf-02','shf-03'], array[1,2,3,4,5,6]),
  ('res-201', array['shf-01','shf-02'],          array[1,2,3,4,5]),
  ('res-501', array['shf-01','shf-02'],          array[1,2,3,4,5,6]),
  ('res-502', array['shf-01','shf-02'],          array[1,2,3,4,5,6])
) as g(r, shifts, days)
cross join lateral unnest(g.shifts) s
cross join lateral unnest(g.days) w
where not exists (select 1 from public.work_calendars c where c.resource_id = g.r and c.weekday = w and c.shift_id = s);

-- 3º turno eventual de 501/502: turno extra nos dias em que houve apontamento iniciado entre 22h e 6h
insert into public.calendar_exceptions (resource_id, exception_date, shift_id, kind, minutes, reason, created_by)
select distinct e.resource_id, e.production_date, 'shf-03', 'extra_shift', 420,
       'Turno extra (3º turno) apontado no Iniflex RPCP622', 'bb2eaea7-6a86-41c2-a30f-215ee4079398'::uuid
from public.production_events e
where e.resource_id in ('res-501','res-502')
  and e.worked_minutes <= 1440
  and (extract(hour from e.started_at at time zone 'America/Sao_Paulo') >= 22 or extract(hour from e.started_at at time zone 'America/Sao_Paulo') < 6)
  and not exists (select 1 from public.calendar_exceptions x where x.resource_id = e.resource_id and x.exception_date = e.production_date and x.kind = 'extra_shift');
commit;
