import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateIrogGrain, consolidateIrog, type IrogGrainInput } from './engine.ts';

const close = (a: number | null, b: number, msg?: string) => {
  assert.ok(a !== null, msg ?? 'valor nulo');
  assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} esperado ${b}, obtido ${a}`);
};

// Cenário de referência (números fictícios, só para o teste):
// turno de 480 min, 30 min de parada programada, 45 min de parada não programada,
// padrão de 100 kg/h, produziu 600 kg, perdeu 30 kg.
const base = (): IrogGrainInput => ({
  resourceId: 'r-101',
  date: '2026-10-01',
  shiftId: 'T1',
  calendarMinutes: 480,
  production: [{ id: 'p1', productId: 'A', stepId: '10', quantity: 600, unit: 'kg' }],
  losses: [{ id: 'l1', productId: 'A', stepId: '10', quantity: 30, unit: 'kg' }],
  downtime: [
    { id: 'd1', minutes: 30, isPlanned: true },
    { id: 'd2', minutes: 45, isPlanned: false },
  ],
  standards: [{ productId: 'A', stepId: null, type: 'rate_per_hour', value: 100, unit: 'kg' }],
});

test('calcula D, P, Q e IROG pela metodologia OEE', () => {
  const r = calculateIrogGrain(base());
  assert.equal(r.status, 'ok');
  assert.equal(r.totals.scheduledMinutes, 450);
  assert.equal(r.totals.operatingMinutes, 405);
  close(r.availability, 405 / 450, 'disponibilidade');
  close(r.performance, 360 / 405, 'performance'); // 600 kg a 100 kg/h = 360 min padrão
  close(r.quality, 570 / 600, 'qualidade');
  close(r.irog, (405 / 450) * (360 / 405) * (570 / 600), 'IROG = D×P×Q');
  close(r.irog, 342 / 450, 'IROG = tempo padrão aprovado ÷ tempo programado');
});

test('ciclo em segundos equivale à taxa por hora', () => {
  const input = base();
  input.standards = [{ productId: 'A', stepId: null, type: 'cycle_seconds', value: 36, unit: 'kg' }]; // 100/h
  close(calculateIrogGrain(input).irog, 342 / 450);
});

test('sem calendário: pendente, nunca zero', () => {
  const input = base();
  input.calendarMinutes = null;
  const r = calculateIrogGrain(input);
  assert.equal(r.status, 'pending');
  assert.equal(r.irog, null);
  assert.equal(r.availability, null);
  assert.ok(r.pending.some((p) => p.code === 'CALENDARIO_AUSENTE'));
});

test('sem padrão produtivo: pendente com registros afetados', () => {
  const input = base();
  input.standards = [];
  const r = calculateIrogGrain(input);
  assert.equal(r.status, 'pending');
  const p = r.pending.find((x) => x.code === 'PADRAO_AUSENTE');
  assert.ok(p);
  assert.equal(p.affectedRecords, 1);
  assert.deepEqual(p.recordIds, ['p1']);
});

test('unidade do apontamento diferente da do padrão: pendente', () => {
  const input = base();
  input.production[0].unit = 'mil';
  input.losses = [];
  const r = calculateIrogGrain(input);
  assert.equal(r.status, 'pending');
  assert.ok(r.pending.some((p) => p.code === 'UNIDADE_INCOMPATIVEL'));
});

test('parada sem classificação: pendente', () => {
  const input = base();
  input.downtime.push({ id: 'd3', minutes: 10, isPlanned: null });
  const r = calculateIrogGrain(input);
  assert.equal(r.status, 'pending');
  assert.ok(r.pending.some((p) => p.code === 'PARADA_SEM_CLASSIFICACAO' && p.recordIds[0] === 'd3'));
});

test('perda maior que a produção: pendente (possível duplicidade)', () => {
  const input = base();
  input.losses[0].quantity = 700;
  assert.ok(calculateIrogGrain(input).pending.some((p) => p.code === 'PERDA_MAIOR_QUE_PRODUCAO'));
});

test('produtos de unidades diferentes somam em minutos padrão', () => {
  const input = base();
  input.production.push({ id: 'p2', productId: 'B', stepId: '10', quantity: 50, unit: 'mil' });
  input.standards.push({ productId: 'B', stepId: null, type: 'rate_per_hour', value: 25, unit: 'mil' }); // 120 min
  const r = calculateIrogGrain(input);
  assert.equal(r.status, 'ok');
  close(r.totals.idealMinutes, 480);
  assert.deepEqual(r.producedByUnit, { kg: 600, mil: 50 });
});

test('performance acima de 100% gera alerta, sem limitar o valor', () => {
  const input = base();
  input.standards[0].value = 50; // padrão subestimado
  const r = calculateIrogGrain(input);
  assert.ok((r.performance ?? 0) > 1);
  assert.ok(r.warnings.some((w) => w.code === 'PERFORMANCE_ACIMA_100'));
});

test('padrão mais específico (produto + etapa) tem prioridade', () => {
  const input = base();
  input.standards.push({ productId: 'A', stepId: '10', type: 'rate_per_hour', value: 200, unit: 'kg' });
  close(calculateIrogGrain(input).totals.idealMinutes, 180);
});

test('consolidação soma tempos e não faz média de percentuais', () => {
  const a = calculateIrogGrain(base()); // IROG 0,76 em 450 min
  const smallInput = base();
  smallInput.calendarMinutes = 60;
  smallInput.downtime = [];
  smallInput.losses = [];
  smallInput.production[0].quantity = 100; // 60 min padrão em 60 min → IROG 1,0
  const b = calculateIrogGrain(smallInput);
  const c = consolidateIrog([a, b]);
  close(c.irog, (342 + 60) / (450 + 60), 'IROG ponderado pelo tempo');
  assert.notEqual(c.irog, ((a.irog ?? 0) + (b.irog ?? 0)) / 2);
  close(c.availability, (405 + 60) / 510);
});

test('consolidação informa cobertura e pendências', () => {
  const ok = calculateIrogGrain(base());
  const pendingInput = base();
  pendingInput.standards = [];
  const pend = calculateIrogGrain(pendingInput);
  const c = consolidateIrog([ok, pend]);
  assert.equal(c.okGrains, 1);
  assert.equal(c.pendingGrains, 1);
  close(c.coverage, 0.5);
  close(c.irog, 342 / 450, 'pendente não entra no indicador');
  assert.equal(c.pendingByCode.PADRAO_AUSENTE, 2); // o apontamento p1 e a perda l1
});
