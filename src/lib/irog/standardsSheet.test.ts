import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetDate, parseSheetNumber, parseStandardsSheet } from './standardsSheet.ts';

const row = (over: Record<string, unknown> = {}) => ({
  'Máquina': '101 - EXT. CARNEVALLI 50MM',
  'Etapa': '10 - EXTRUSAO',
  'Produto': 'Filme',
  'Unidade': 'mt',
  'Tipo (CAPACIDADE ou CICLO)': 'CAPACIDADE',
  'Valor oficial': '18.000,5',
  'Vigente a partir de (dd/mm/aaaa)': '01/11/2026',
  'Origem / responsável': 'Cronoanálise Eng. 11/2026',
  'Observações': '',
  resource_id: 'res-101',
  product_id: 'prod-1',
  step_id: 'stp-10',
  ...over,
});

test('datas e números no formato brasileiro', () => {
  assert.equal(parseSheetDate('01/11/2026'), '2026-11-01');
  assert.equal(parseSheetDate('31/02/2026'), null);
  assert.equal(parseSheetDate(46327), '2026-11-01'); // serial do Excel
  assert.equal(parseSheetNumber('18.000,5'), 18000.5);
  assert.equal(parseSheetNumber('2.5'), 2.5);
  assert.equal(parseSheetNumber(''), null);
});

test('linha preenchida vira padrão; linha vazia continua pendente', () => {
  const r = parseStandardsSheet([row(), row({ 'Tipo (CAPACIDADE ou CICLO)': '', 'Valor oficial': '' })]);
  assert.equal(r.standards.length, 1);
  assert.equal(r.blank, 1);
  assert.equal(r.errors.length, 0);
  assert.deepEqual(
    { t: r.standards[0].standard_type, v: r.standards[0].value, u: r.standards[0].unit, d: r.standards[0].valid_from },
    { t: 'rate_per_hour', v: 18000.5, u: 'mt', d: '2026-11-01' },
  );
});

test('sem origem, valor zero ou tipo inválido: erro na linha, nada é gravado', () => {
  const r = parseStandardsSheet([
    row({ 'Origem / responsável': '' }),
    row({ 'Valor oficial': 0 }),
    row({ 'Tipo (CAPACIDADE ou CICLO)': 'VELOCIDADE' }),
  ]);
  assert.equal(r.standards.length, 0);
  assert.deepEqual(r.errors.map((e) => e.line), [2, 3, 4]);
});

test('VALE PARA TODOS vira padrão geral da máquina na etapa', () => {
  const r = parseStandardsSheet([row({ 'Observações': 'vale para todos', 'Tipo (CAPACIDADE ou CICLO)': 'ciclo' })]);
  assert.equal(r.standards[0].product_id, null);
  assert.equal(r.standards[0].stage_id, 'stp-10');
  assert.equal(r.standards[0].standard_type, 'cycle_seconds');
});

test('linha repetida é rejeitada', () => {
  const r = parseStandardsSheet([row(), row()]);
  assert.equal(r.standards.length, 1);
  assert.equal(r.errors.length, 1);
});
