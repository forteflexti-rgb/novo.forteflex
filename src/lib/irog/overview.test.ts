import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIrogOverview, type IrogSourceData } from './overview.ts';

// Cenário fictício, só para o teste: 1 recurso, 1 turno de 480 min de seg a sex, 60 kg/h.
const base = (): IrogSourceData => ({
  sectors: [{ id: 's1', code: 'EXT', name: 'Extrusão' }],
  lines: [{ id: 'l1', code: 'L1', name: 'Linha 1', sector_id: 's1' }],
  shifts: [{ id: 't1', name: '1º Turno' }],
  products: [{ id: 'p1', name: 'Filme' }],
  resources: [{ id: 'r1', code: '101', name: 'Extrusora', sector_id: 's1', line_id: 'l1', active: true }],
  events: [
    {
      id: 'e1', resource_id: 'r1', step_id: null, product_id: 'p1', shift_id: 't1', operator_id: null, order_id: null,
      production_date: '2026-10-05', started_at: '2026-10-05T06:00:00-03:00', ended_at: '2026-10-05T10:00:00-03:00',
      worked_minutes: 240, quantity: 240, unit: 'kg', net_weight_kg: 240, source: 'iniflex_report',
    },
  ],
  losses: [],
  downtime: [],
  calendars: [1, 2, 3, 4, 5].map((w) => ({ resource_id: 'r1', weekday: w, shift_id: 't1', planned_minutes: 480, valid_from: '2026-01-01', valid_to: null })),
  exceptions: [],
  standards: [{ resource_id: 'r1', product_id: null, step_id: null, standard_type: 'rate_per_hour', value: 60, unit: 'kg', valid_from: '2026-01-01', valid_to: null }],
  downtimeReasons: [],
  lossReasons: [],
  goals: [],
});

test('dia programado sem produção conta como tempo programado (disponibilidade zero naquele dia)', () => {
  // 05/10/2026 é segunda; 06/10 terça sem apontamento
  const ov = buildIrogOverview(base(), { startDate: '2026-10-05', endDate: '2026-10-06', includeDemo: true });
  const m = ov.machines[0];
  assert.equal(m.status, 'complete');
  assert.equal(m.plannedTimeMinutes, 960);
  assert.equal(m.operatingTimeMinutes, 240);
  assert.equal(m.availabilityPercent, 25);
  assert.equal(m.performancePercent, 100);
  assert.equal(m.irogPercent, 25);
});

test('fim de semana fora do calendário não entra', () => {
  const ov = buildIrogOverview(base(), { startDate: '2026-10-03', endDate: '2026-10-05', includeDemo: true });
  assert.equal(ov.machines[0].plannedTimeMinutes, 480);
});

test('exceção de um turno só desconta aquele turno, não o dia todo', () => {
  const data = base();
  data.calendars.push({ resource_id: 'r1', weekday: 1, shift_id: 't2', planned_minutes: 480, valid_from: '2026-01-01', valid_to: null });
  data.exceptions.push({ resource_id: 'r1', exception_date: '2026-10-05', shift_id: 't2', kind: 'planned_stop', minutes: null });
  const ov = buildIrogOverview(data, { startDate: '2026-10-05', endDate: '2026-10-05', includeDemo: true });
  assert.equal(ov.machines[0].plannedTimeMinutes, 480);
});

test('feriado da fábrica tira o dia do tempo programado', () => {
  const data = base();
  data.exceptions.push({ resource_id: null, exception_date: '2026-10-06', shift_id: null, kind: 'holiday', minutes: null });
  const ov = buildIrogOverview(data, { startDate: '2026-10-05', endDate: '2026-10-06', includeDemo: true });
  assert.equal(ov.machines[0].plannedTimeMinutes, 480);
  assert.equal(ov.machines[0].irogPercent, 50);
});

test('sem calendário o IROG fica pendente com o motivo', () => {
  const data = base();
  data.calendars = [];
  const ov = buildIrogOverview(data, { startDate: '2026-10-05', endDate: '2026-10-06', includeDemo: true });
  assert.equal(ov.factory.irogPercent, null);
  assert.equal(ov.factory.status, 'incomplete');
  assert.ok(ov.factory.memory.incompleteReasons.some((r) => r.includes('calendário')));
});

test('dados demonstrativos ficam de fora quando includeDemo = false', () => {
  const data = base();
  data.events[0].source = 'demo';
  const ov = buildIrogOverview(data, { startDate: '2026-10-05', endDate: '2026-10-05', includeDemo: false });
  assert.equal(ov.factory.producedQuantity, 0);
});
