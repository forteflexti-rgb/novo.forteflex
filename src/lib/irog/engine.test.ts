import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateIrogGrain, consolidateIrog, unionMinutes, type IrogGrainInput } from './engine.ts';

const H = 3600000;
const T0 = Date.UTC(2026, 9, 1, 9, 0); // 06:00 em Brasília

test('união de intervalos não conta sobreposição duas vezes e recorta a janela', () => {
  assert.equal(unionMinutes([[T0, T0 + 2 * H], [T0 + H, T0 + 3 * H]], T0, T0 + 8 * H), 180);
  assert.equal(unionMinutes([[T0 - H, T0 + H]], T0, T0 + 8 * H), 60);
  assert.equal(unionMinutes([], T0, T0 + H), 0);
});

const timed = (): IrogGrainInput => ({
  resourceId: 'r-101',
  date: '2026-10-01',
  shiftId: 'T1',
  calendarMinutes: 480,
  window: { startMs: T0, endMs: T0 + 8 * H },
  qualityBasis: 'weight',
  production: [
    { id: 'p1', productId: 'A', stepId: '10', quantity: 300, unit: 'mt', weightKg: 100, startMs: T0, endMs: T0 + 3 * H },
    { id: 'p2', productId: 'A', stepId: '10', quantity: 300, unit: 'mt', weightKg: 100, startMs: T0 + 2 * H, endMs: T0 + 5 * H },
  ],
  losses: [{ id: 'l1', productId: null, stepId: null, quantity: 10, unit: 'kg' }],
  downtime: [],
  standards: [{ productId: 'A', stepId: null, type: 'rate_per_hour', value: 150, unit: 'mt' }],
});

test('tempo sem apontamento vira parada não apontada; sobreposição não infla a operação', () => {
  const r = calculateIrogGrain(timed());
  assert.equal(r.status, 'ok');
  assert.equal(r.totals.observedRunMinutes, 300); // 06h–11h, não 360
  assert.equal(r.totals.operatingMinutes, 300);
  assert.equal(r.totals.unrecordedStopMinutes, 180);
  close(r.availability, 300 / 480);
  close(r.performance, 240 / 300); // 600 mt a 150 mt/h = 240 min padrão
  assert.ok(r.warnings.some((w) => w.code === 'PARADA_NAO_APONTADA'));
});

test('qualidade por peso: perdas em kg contra produção em metros', () => {
  const r = calculateIrogGrain(timed());
  close(r.quality, 190 / 200);
  close(r.irog, (240 * 0.95) / 480);
});

test('apontamento com duração impossível: horário ignorado, quantidade mantida, aviso', () => {
  const input = timed();
  input.production[1].endMs = T0 + 122 * 24 * H;
  const r = calculateIrogGrain(input);
  assert.equal(r.status, 'ok');
  assert.equal(r.totals.observedRunMinutes, 180); // só o p1 (06h–09h); o p2 de 122 dias é ignorado
  close(r.totals.idealMinutes, 240, 'as 600 mt dos dois apontamentos continuam contando');
  assert.ok(r.warnings.some((w) => w.code === 'APONTAMENTO_DURACAO_IGNORADA'));
});

test('perda em dia sem produção: aviso, e entra na qualidade do período', () => {
  const lossOnly = timed();
  lossOnly.production = [];
  lossOnly.losses = [{ id: 'l9', productId: null, stepId: null, quantity: 20, unit: 'kg' }];
  const a = calculateIrogGrain(lossOnly);
  assert.equal(a.status, 'ok');
  assert.ok(a.warnings.some((w) => w.code === 'PERDA_SEM_PRODUCAO_NO_DIA'));
  const b = calculateIrogGrain(timed()); // 200 kg produzidos, 10 kg perdidos
  close(consolidateIrog([a, b]).quality, (200 - 30) / 200);
});

test('em empate, o padrão de vigência mais recente vence (oficial substitui provisório)', () => {
  const input = timed();
  input.standards = [
    { productId: 'A', stepId: null, type: 'rate_per_hour', value: 150, unit: 'mt', validFrom: '2026-10-01' },
    { productId: 'A', stepId: null, type: 'rate_per_hour', value: 300, unit: 'mt', validFrom: '2026-12-01' },
  ];
  close(calculateIrogGrain(input).totals.idealMinutes, 120); // 600 mt a 300 mt/h
});

test('oficial vence provisório mesmo com a mesma data de vigência', () => {
  const input = timed();
  input.standards = [
    { productId: 'A', stepId: null, type: 'rate_per_hour', value: 300, unit: 'mt', validFrom: '2026-10-01' },
    { productId: 'A', stepId: null, type: 'rate_per_hour', value: 150, unit: 'mt', validFrom: '2026-10-01', provisional: true },
  ];
  close(calculateIrogGrain(input).totals.idealMinutes, 120); // usa o oficial (300 mt/h)
  input.standards.reverse();
  close(calculateIrogGrain(input).totals.idealMinutes, 120); // independe da ordem
});

test('qualidade por peso exige peso no apontamento', () => {
  const input = timed();
  input.production[0].weightKg = null;
  assert.ok(calculateIrogGrain(input).pending.some((p) => p.code === 'PESO_AUSENTE'));
});

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
  assert.equal(c.irog, null, 'com pendência no escopo o IROG fica pendente, não parcial');
  close(c.availability, (405 + 405) / (450 + 450), 'disponibilidade usa os dois dias (tempo válido)');
  close(c.performance, 360 / 405, 'performance só do dia com padrão');
  assert.equal(c.pendingByCode.PADRAO_AUSENTE, 2); // o apontamento p1 e a perda l1
});

test('dia parado completo + dia produzido pendente: IROG pendente, nunca 0', () => {
  const idle = base();
  idle.production = [];
  idle.losses = [];
  const produced = base();
  produced.standards = [];
  const c = consolidateIrog([calculateIrogGrain(idle), calculateIrogGrain(produced)]);
  assert.equal(c.irog, null);
  assert.notEqual(c.availability, null);
});
