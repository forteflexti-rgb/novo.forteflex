/**
 * Importador dos relatórios exportados do ERP Iniflex (Projedata):
 *
 *  - RPCP622 "Análise Detalhada de Produção (Dia x Recurso x Item x Etapa)"
 *      → fonte principal: cada apontamento (início/fim, OP, turno, etapa, quantidade, UN, peso líquido).
 *  - RPCP019 "Controle de Produção Diária do Mês"
 *      → complemento: perdas (kg) e paradas (min) por dia x recurso, e o total do dia para conferência.
 *
 * Os apontamentos são consolidados em production_records por Dia + Recurso (linha) + Item (produto) + Turno.
 * A quantidade produzida gravada é o PESO LÍQUIDO (kg), para que todos os totais do dashboard sejam somáveis;
 * a quantidade na unidade original (MIL / MT / KG) e as OPs ficam registradas nas observações.
 *
 * A importação é idempotente: ao reimportar o mesmo período, os registros Iniflex anteriores desse período
 * (ids "ini-*" e a carga manual antiga "oct-*") são substituídos.
 */
import * as XLSX from 'xlsx';
import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from './db.ts';

type Row = any[];

export interface IniflexApontamento {
  date: string; // AAAA-MM-DD
  startHour: number;
  workedMinutes: number;
  op: string;
  ident: string; // turno informado no Iniflex (1/2/3) — pode vir vazio
  etapa: string; // "10 - EXTRUSAO"
  resourceCode: string; // "101"
  resourceName: string; // "101 - EXT. CARNEVALLI 50MM"
  itemCode: string; // "100314" (código do cliente/família no Iniflex — NÃO é único por item)
  itemName: string; // "MONDIAL [EL] FLEXOPACK SACO 0112-46 (30X30)"
  quantity: number;
  unit: string; // MIL | KG | MT
  weight: number; // peso líquido (kg)
}

export interface Rpcp622Report {
  kind: 'rpcp622';
  filename: string;
  periodStart: string | null;
  periodEnd: string | null;
  entries: IniflexApontamento[];
  reportedTotalWeight: number | null;
}

export interface DailyResourceValue {
  date: string;
  resourceCode: string;
  resourceName: string;
  value: number;
}

export interface Rpcp019Report {
  kind: 'rpcp019';
  filename: string;
  dailyTotals: Map<string, number>; // peso total do dia
  losses: DailyResourceValue[]; // kg
  downtime: DailyResourceValue[]; // minutos
}

export type IniflexReport = Rpcp622Report | Rpcp019Report;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const str = (v: unknown) => (v === undefined || v === null ? '' : String(v)).trim();
const num = (v: unknown) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')) || 0);
const round = (v: number, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

/** Data serial do Excel (dias desde 1899-12-30) → data local do relatório, sem efeito de fuso horário. */
function serialToParts(serial: number) {
  const d = new Date(Math.round((serial - 25569) * 86400) * 1000);
  const date = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { date, hour: d.getUTCHours() + d.getUTCMinutes() / 60 };
}

function brDateToIso(value: string): string | null {
  const m = value.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Primeiro valor não vazio à direita da coluna do rótulo ("Recurso:", "Item:", "Período:"...). */
function valueAfterLabel(row: Row, labelCol: number): string {
  for (let i = labelCol + 1; i < row.length; i++) {
    if (str(row[i])) return str(row[i]);
  }
  return '';
}

function splitCodeName(label: string): { code: string; name: string } {
  const m = label.match(/^\s*(\d+)\s*-\s*(.*)$/);
  return m ? { code: m[1], name: m[2].trim() } : { code: '', name: label.trim() };
}

export function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function tokenSimilarity(a: string, b: string): number {
  const ta = new Set(normalizeText(a).split(' ').filter(Boolean));
  const tb = new Set(normalizeText(b).split(' ').filter(Boolean));
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

// ---------------------------------------------------------------------------
// Parsers
// ---------------------------------------------------------------------------
export function detectReportKind(rows: Row[]): 'rpcp622' | 'rpcp019' | null {
  for (const row of rows.slice(0, 15)) {
    for (const cell of row) {
      const v = str(cell).toUpperCase();
      if (v === 'RPCP622') return 'rpcp622';
      if (v === 'RPCP019') return 'rpcp019';
    }
  }
  return null;
}

export function parseIniflexWorkbook(buffer: Buffer | ArrayBuffer, filename: string): IniflexReport {
  const wb = XLSX.read(buffer, { type: Buffer.isBuffer(buffer) ? 'buffer' : 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error(`${filename}: planilha vazia.`);
  const rows = XLSX.utils.sheet_to_json<Row>(sheet, { header: 1, defval: '' });
  const kind = detectReportKind(rows);
  if (kind === 'rpcp622') return parseRpcp622(rows, filename);
  if (kind === 'rpcp019') return parseRpcp019(rows, filename);
  throw new Error(
    `${filename}: não é um relatório Iniflex reconhecido (esperado RPCP622 ou RPCP019 no cabeçalho "ROTINA").`
  );
}

function parseRpcp622(rows: Row[], filename: string): Rpcp622Report {
  let periodStart: string | null = null;
  let periodEnd: string | null = null;
  let reportedTotalWeight: number | null = null;
  let reportDay: string | null = null; // cabeçalho 'Dia:' — data oficial do apontamento no Iniflex
  let resource = '';
  let item = '';
  let cols: Record<string, number> | null = null;
  const entries: IniflexApontamento[] = [];

  for (const row of rows) {
    const label = str(row[1]);

    if (label === 'Período:') {
      const dates = valueAfterLabel(row, 1).match(/\d{2}\/\d{2}\/\d{4}/g) || [];
      periodStart = dates[0] ? brDateToIso(dates[0]) : null;
      periodEnd = dates[1] ? brDateToIso(dates[1]) : periodStart;
      continue;
    }
    if (label === 'Dia:') {
      reportDay = brDateToIso(valueAfterLabel(row, 1));
      continue;
    }
    if (label === 'Recurso:') {
      resource = valueAfterLabel(row, 1);
      continue;
    }
    if (label === 'Item:') {
      item = valueAfterLabel(row, 1);
      continue;
    }
    if (label === 'Início') {
      // Linha de cabeçalho da tabela de apontamentos: localiza as colunas pelo título
      const find = (title: string) => row.findIndex((c) => str(c) === title);
      cols = {
        start: 1,
        end: find('Fim'),
        op: find('OP'),
        ident: find('Ident.'),
        etapa: find('Etapa'),
        qty: find('Quantidade'),
        unit: find('UN'),
        weight: find('Peso'),
      };
      continue;
    }

    const totalGeralIdx = row.findIndex((c) => str(c) === 'Total Geral:');
    if (totalGeralIdx >= 0 && cols) {
      reportedTotalWeight = num(row[cols.weight]);
      continue;
    }

    if (cols && typeof row[cols.start] === 'number' && resource && item) {
      const start = row[cols.start] as number;
      const end = typeof row[cols.end] === 'number' ? (row[cols.end] as number) : start;
      const { date: startDate, hour } = serialToParts(start);
      const date = reportDay || startDate;
      const res = splitCodeName(resource);
      const it = splitCodeName(item);
      const unit = str(row[cols.unit]).toUpperCase() || 'KG';
      const weight = num(row[cols.weight]);
      const rawQty = num(row[cols.qty]);
      // A impressão é apontada só por peso: em KG a "Quantidade" vem 0 e o peso é a quantidade.
      // (Nas demais máquinas em KG, quantidade = peso em 100% dos apontamentos de Out/2026.)
      const quantity = unit === 'KG' && rawQty === 0 && weight > 0 ? weight : rawQty;
      entries.push({
        date,
        startHour: hour,
        workedMinutes: Math.max(0, Math.round((end - start) * 24 * 60)),
        op: str(row[cols.op]),
        ident: str(row[cols.ident]),
        etapa: str(row[cols.etapa]),
        resourceCode: res.code,
        resourceName: resource,
        itemCode: it.code,
        itemName: it.name.replace(/\s+/g, ' '),
        quantity,
        unit,
        weight,
      });
    }
  }

  if (entries.length === 0) {
    throw new Error(`${filename}: nenhum apontamento encontrado no RPCP622.`);
  }
  if (!periodStart) {
    const dates = entries.map((e) => e.date).sort();
    periodStart = dates[0];
    periodEnd = dates[dates.length - 1];
  }
  return { kind: 'rpcp622', filename, periodStart, periodEnd, entries, reportedTotalWeight };
}

/**
 * O RPCP019 é composto por blocos: uma linha de título ("Produção" | "Perdas" | "Paradas") com os recursos
 * nas colunas, 1-2 linhas de sub-cabeçalho ("Data", "Quantidade", "Peso", "Minutos") e as linhas diárias
 * (data serial na coluna B) até "Totais".
 */
function parseRpcp019(rows: Row[], filename: string): Rpcp019Report {
  const dailyTotals = new Map<string, number>();
  const losses: DailyResourceValue[] = [];
  const downtime: DailyResourceValue[] = [];

  for (let i = 0; i < rows.length; i++) {
    const title = str(rows[i][1]);
    if (title !== 'Produção' && title !== 'Perdas' && title !== 'Paradas') continue;

    const groups: Array<{ col: number; label: string }> = [];
    rows[i].forEach((c, j) => {
      if (j > 1 && str(c)) groups.push({ col: j, label: str(c) });
    });
    if (groups.length === 0) continue;

    // Sub-cabeçalhos até a primeira linha com data
    let k = i + 1;
    const subHeaders: Row[] = [];
    while (k < rows.length && typeof rows[k][1] !== 'number' && str(rows[k][1]) !== 'Totais' && k - i <= 4) {
      subHeaders.push(rows[k]);
      k++;
    }
    const valueTitle = title === 'Paradas' ? 'Minutos' : 'Peso';
    const valueCols = groups.map((g, gi) => {
      const limit = gi + 1 < groups.length ? groups[gi + 1].col : Infinity;
      for (const sh of subHeaders) {
        const idx = sh.findIndex((c, j) => j >= g.col && j < limit && str(c) === valueTitle);
        if (idx >= 0) return idx;
      }
      return g.col;
    });

    for (; k < rows.length && typeof rows[k][1] === 'number'; k++) {
      const { date } = serialToParts(rows[k][1] as number);
      groups.forEach((g, gi) => {
        const value = num(rows[k][valueCols[gi]]);
        if (g.label === 'Total do Dia') {
          if (title === 'Produção') dailyTotals.set(date, value);
          return;
        }
        if (title === 'Produção' || value <= 0) return; // produção por recurso vem do RPCP622
        const res = splitCodeName(g.label);
        const entry = { date, resourceCode: res.code, resourceName: g.label, value };
        (title === 'Perdas' ? losses : downtime).push(entry);
      });
    }
    i = k - 1;
  }

  return { kind: 'rpcp019', filename, dailyTotals, losses, downtime };
}

// ---------------------------------------------------------------------------
// Importação no banco
// ---------------------------------------------------------------------------
export interface IniflexImportSummary {
  committed: boolean;
  batchId: string | null;
  files: Array<{ filename: string; kind: string }>;
  periodStart: string;
  periodEnd: string;
  apontamentos: number;
  recordsCreated: number;
  totalWeightKg: number;
  reportedTotalWeightKg: number | null;
  totalLossKg: number;
  totalDowntimeMinutes: number;
  replacedRecords: number;
  otherRecordsInPeriod: number;
  newProducts: Array<{ sku: string; name: string }>;
  renamedProducts: number;
  newLines: string[];
  byLine: Array<{ line: string; weightKg: number; lossKg: number; downtimeMinutes: number }>;
  warnings: string[];
}

const INIFLEX_OPERATOR_ID = 'usr-iniflex';
const ROLLBACK = Symbol('dry-run-rollback');

function ensureIniflexOperator(): string {
  const exists = db.prepare('SELECT id FROM profiles WHERE id = ?').get(INIFLEX_OPERATOR_ID);
  if (!exists) {
    // Perfil técnico (inativo, sem login) que representa os apontamentos vindos do ERP
    const hash = bcrypt.hashSync(crypto.randomUUID(), 10);
    const permissions = JSON.stringify({
      can_create_records: false,
      can_edit_own_records: false,
      can_view_own_records: false,
      can_view_sector_records: false,
      can_export_own_records: false,
    });
    db.prepare(
      `INSERT INTO profiles (id, username, email, password_hash, full_name, role, sector_id, is_active, permissions)
       VALUES (?, 'iniflex', 'iniflex@sistema.local', ?, 'Apontamento ERP Iniflex', 'operator', NULL, 0, ?)`
    ).run(INIFLEX_OPERATOR_ID, hash, permissions);
  }
  return INIFLEX_OPERATOR_ID;
}

function guessCategory(name: string): string {
  const n = normalizeText(name);
  if (n.includes('BOBINA')) return n.includes('FLEXOPACK') ? 'Bobinas Impressas' : 'Bobinas';
  if (n.includes('SACO') || n.includes('PAPEL')) return n.includes('FLEXOPACK') ? 'Sacos Impressos' : 'Sacos Industriais';
  return 'Outros';
}

function hashId(prefix: string, key: string) {
  return `${prefix}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 14)}`;
}

/**
 * Valida e (opcionalmente) grava os relatórios. Em modo prévia (commit=false) tudo roda dentro de uma
 * transação que é desfeita no final, então a prévia mostra exatamente o que a gravação fará.
 */
export function importIniflexReports(
  reports: IniflexReport[],
  options: { commit: boolean; userId: string }
): IniflexImportSummary {
  const detail = reports.find((r): r is Rpcp622Report => r.kind === 'rpcp622');
  const daily = reports.find((r): r is Rpcp019Report => r.kind === 'rpcp019');
  if (!detail) {
    throw new Error(
      'O relatório RPCP622 (Análise Detalhada de Produção) é obrigatório — é ele que traz os apontamentos por item. O RPCP019 é opcional e complementa com perdas e paradas.'
    );
  }

  let summary!: IniflexImportSummary;
  const run = db.transaction(() => {
    summary = buildAndApply(detail, daily, options);
    if (!options.commit) throw ROLLBACK;
  });
  try {
    run();
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return summary;
}

function buildAndApply(
  detail: Rpcp622Report,
  daily: Rpcp019Report | undefined,
  options: { commit: boolean; userId: string }
): IniflexImportSummary {
  const warnings: string[] = [];
  const periodStart = detail.periodStart!;
  const periodEnd = detail.periodEnd!;
  const batchId = `imp-${crypto.randomUUID().slice(0, 10)}`;

  // ----- Turnos -----
  const shifts = db.prepare('SELECT id, code, start_time, end_time FROM shifts').all() as any[];
  if (shifts.length === 0) throw new Error('Nenhum turno cadastrado no sistema.');
  const shiftByNumber = new Map<string, any>();
  for (const s of shifts) {
    const n = String(s.code).match(/(\d+)/);
    if (n) shiftByNumber.set(n[1], s);
  }
  const toHours = (t: string) => {
    const [h, m] = String(t).split(':').map(Number);
    return (h || 0) + (m || 0) / 60;
  };
  const shiftForHour = (hour: number) =>
    shifts.find((s) => {
      const a = toHours(s.start_time);
      const b = toHours(s.end_time);
      return a < b ? hour >= a && hour < b : hour >= a || hour < b;
    }) || shifts[0];
  const resolveShift = (e: IniflexApontamento) => shiftByNumber.get(e.ident) || shiftForHour(e.startHour);

  // ----- Setores e linhas (Recurso Iniflex → production_lines pelo código numérico) -----
  const sectors = db.prepare('SELECT id, code, name FROM sectors').all() as any[];
  const lines = db.prepare('SELECT id, code, name, sector_id FROM production_lines').all() as any[];
  const lineByResource = new Map<string, any>();
  for (const l of lines) {
    const m = String(l.code).match(/^(\d+)/) || String(l.name).match(/^(\d+)/);
    if (m && !lineByResource.has(m[1])) lineByResource.set(m[1], l);
  }
  const newLines: string[] = [];
  const sectorForEtapa = (etapa: string) => {
    const { code, name } = splitCodeName(etapa);
    const exact = sectors.find((s) => splitCodeName(s.name).code === code);
    if (exact) return exact.id;
    const sameFamily = sectors.find((s) => splitCodeName(s.name).code.charAt(0) === code.charAt(0) && code);
    if (sameFamily) return sameFamily.id;
    const id = `sec-et${code || crypto.randomUUID().slice(0, 4)}`;
    db.prepare(`INSERT INTO sectors (id, code, name, description, active) VALUES (?, ?, ?, ?, 1)`).run(
      id,
      `ET${code}`,
      `${code} - ${name}`,
      'Etapa criada automaticamente pela importação Iniflex'
    );
    sectors.push({ id, code: `ET${code}`, name: `${code} - ${name}` });
    return id;
  };
  const resolveLine = (resourceCode: string, resourceName: string, etapa: string) => {
    let line = lineByResource.get(resourceCode);
    if (!line) {
      const sector_id = sectorForEtapa(etapa);
      line = { id: `lin-${resourceCode}-ini`, code: `${resourceCode}-INI`, name: resourceName, sector_id };
      db.prepare(
        `INSERT INTO production_lines (id, sector_id, code, name, capacity_per_hour, active) VALUES (?, ?, ?, ?, 0, 1)`
      ).run(line.id, line.sector_id, line.code, line.name);
      lineByResource.set(resourceCode, line);
      newLines.push(resourceName);
    }
    return line;
  };

  // ----- Produtos (Item Iniflex → products). O código do Iniflex se repete entre itens, então a chave é a descrição -----
  const products = db.prepare('SELECT id, sku, name FROM products').all() as any[];
  const productByName = new Map<string, any>(products.map((p) => [normalizeText(p.name), p]));
  const claimed = new Set<string>();
  const productCache = new Map<string, any>();
  const newProducts: Array<{ sku: string; name: string }> = [];
  let renamedProducts = 0;
  const itemUnits = new Map<string, Set<string>>();
  for (const e of detail.entries) {
    const key = `${e.itemCode}|${e.itemName}`;
    if (!itemUnits.has(key)) itemUnits.set(key, new Set());
    itemUnits.get(key)!.add(e.unit);
  }

  const resolveProduct = (itemCode: string, itemName: string) => {
    const key = `${itemCode}|${itemName}`;
    const cached = productCache.get(key);
    if (cached) return cached;

    let product = productByName.get(normalizeText(itemName));
    if (!product) {
      // Cadastro anterior com nome abreviado: mesmo código no SKU e descrição parecida
      const candidates = products
        .filter((p) => p.sku.startsWith(`${itemCode}-`) && !claimed.has(p.id))
        .map((p) => ({ p, score: tokenSimilarity(p.name, itemName) }))
        .sort((a, b) => b.score - a.score);
      if (candidates[0] && candidates[0].score >= 0.5 && candidates[0].score > (candidates[1]?.score ?? 0)) {
        product = candidates[0].p;
        db.prepare('UPDATE products SET name = ? WHERE id = ?').run(itemName, product.id);
        product.name = itemName;
        renamedProducts++;
      }
    }
    if (!product) {
      let n = 1;
      const skuTaken = (sku: string) => products.some((p) => p.sku.toUpperCase() === sku.toUpperCase());
      while (skuTaken(`${itemCode || 'INI'}-${String(n).padStart(2, '0')}`)) n++;
      const sku = `${itemCode || 'INI'}-${String(n).padStart(2, '0')}`;
      const units = itemUnits.get(key) || new Set();
      product = { id: `prod-ini-${crypto.randomUUID().slice(0, 8)}`, sku, name: itemName };
      db.prepare(
        `INSERT INTO products (id, sku, name, category, unit_of_measure, target_cycle_minutes, active)
         VALUES (?, ?, ?, ?, ?, 1.0, 1)`
      ).run(product.id, sku, itemName, guessCategory(itemName), units.has('MIL') ? 'mil' : 'kg');
      products.push(product);
      productByName.set(normalizeText(itemName), product);
      newProducts.push({ sku, name: itemName });
    }
    claimed.add(product.id);
    productCache.set(key, product);
    return product;
  };

  const operatorId = ensureIniflexOperator();

  // ----- Consolidação: Dia + Linha + Produto + Turno -----
  interface Agg {
    id: string;
    date: string;
    line: any;
    product: any;
    shift: any;
    weight: number;
    loss: number;
    downtime: number;
    workedMinutes: number;
    qtyByUnit: Map<string, number>;
    ops: Set<string>;
    etapas: Set<string>;
    apontamentos: number;
    lossOnly?: boolean;
  }
  const aggs = new Map<string, Agg>();
  const getAgg = (date: string, line: any, product: any, shift: any) => {
    const key = `${date}|${line.id}|${product.id}|${shift.id}`;
    let a = aggs.get(key);
    if (!a) {
      a = {
        id: hashId('ini', key),
        date,
        line,
        product,
        shift,
        weight: 0,
        loss: 0,
        downtime: 0,
        workedMinutes: 0,
        qtyByUnit: new Map(),
        ops: new Set(),
        etapas: new Set(),
        apontamentos: 0,
      };
      aggs.set(key, a);
    }
    return a;
  };

  for (const e of detail.entries) {
    const line = resolveLine(e.resourceCode, e.resourceName, e.etapa);
    const product = resolveProduct(e.itemCode, e.itemName);
    const a = getAgg(e.date, line, product, resolveShift(e));
    a.weight += e.weight;
    a.workedMinutes += e.workedMinutes;
    a.qtyByUnit.set(e.unit, (a.qtyByUnit.get(e.unit) || 0) + e.quantity);
    if (e.op) a.ops.add(e.op);
    if (e.etapa) a.etapas.add(e.etapa);
    a.apontamentos++;
  }

  // ----- Perdas e paradas do RPCP019: distribuídas entre os registros do dia/linha -----
  const recordsOf = (date: string, lineId: string) =>
    [...aggs.values()].filter((a) => a.date === date && a.line.id === lineId);
  const lastProductOnLine = (date: string, lineId: string) => {
    const prev = [...aggs.values()]
      .filter((a) => a.line.id === lineId && a.date <= date && a.weight > 0)
      .sort((x, y) => (x.date < y.date ? 1 : -1));
    return prev[0]?.product;
  };
  const fallbackAgg = (v: DailyResourceValue, kindLabel: string) => {
    const line = lineByResource.get(v.resourceCode);
    if (!line) {
      warnings.push(`${kindLabel} em ${v.date} no recurso "${v.resourceName}" ignorada: recurso sem apontamentos no RPCP622.`);
      return null;
    }
    const product =
      lastProductOnLine(v.date, line.id) ||
      [...aggs.values()].find((a) => a.line.id === line.id)?.product;
    if (!product) return null;
    const a = getAgg(v.date, line, product, shiftByNumber.get('1') || shifts[0]);
    a.lossOnly = true;
    return a;
  };

  let totalLoss = 0;
  let totalDowntime = 0;
  if (daily) {
    const inPeriod = (d: string) => d >= periodStart && d <= periodEnd;
    for (const l of daily.losses.filter((x) => inPeriod(x.date))) {
      const line = lineByResource.get(l.resourceCode);
      let targets = line ? recordsOf(l.date, line.id).filter((a) => a.weight > 0) : [];
      if (targets.length === 0) {
        const fb = fallbackAgg(l, 'Perda');
        if (!fb) continue;
        targets = [fb];
      }
      const base = targets.reduce((s, a) => s + a.weight, 0);
      let distributed = 0;
      targets
        .sort((x, y) => y.weight - x.weight)
        .forEach((a, idx) => {
          const share = idx === targets.length - 1 ? round(l.value - distributed) : round(base > 0 ? (l.value * a.weight) / base : l.value / targets.length);
          a.loss += share;
          distributed += share;
        });
      totalLoss += l.value;
    }
    for (const d of daily.downtime.filter((x) => inPeriod(x.date))) {
      const line = lineByResource.get(d.resourceCode);
      const candidates = line ? recordsOf(d.date, line.id).sort((x, y) => y.weight - x.weight) : [];
      const target = candidates[0] || fallbackAgg(d, 'Parada');
      if (!target) continue;
      target.downtime += Math.round(d.value);
      totalDowntime += Math.round(d.value);
    }

    // Conferência: total do dia RPCP622 x RPCP019
    const weightByDay = new Map<string, number>();
    for (const e of detail.entries) weightByDay.set(e.date, (weightByDay.get(e.date) || 0) + e.weight);
    for (const [date, total] of daily.dailyTotals) {
      if (!inPeriod(date)) continue;
      const diff = (weightByDay.get(date) || 0) - total;
      if (Math.abs(diff) > 0.05) {
        warnings.push(
          `Divergência em ${date}: RPCP622 soma ${round(weightByDay.get(date) || 0, 2)} kg e RPCP019 informa ${round(total, 2)} kg.`
        );
      }
    }
  } else {
    warnings.push('RPCP019 não enviado: perdas e paradas não serão importadas (somente a produção do RPCP622).');
  }

  const totalWeight = detail.entries.reduce((s, e) => s + e.weight, 0);
  if (detail.reportedTotalWeight !== null && Math.abs(totalWeight - detail.reportedTotalWeight) > 0.05) {
    warnings.push(
      `A soma dos apontamentos (${round(totalWeight, 2)} kg) difere do "Total Geral" do RPCP622 (${round(detail.reportedTotalWeight, 2)} kg).`
    );
  }

  // ----- Substitui a carga Iniflex anterior do mesmo período -----
  const replacedRecords = db
    .prepare(
      `DELETE FROM production_records
       WHERE production_date BETWEEN ? AND ? AND (id LIKE 'ini-%' OR id LIKE 'oct-%')`
    )
    .run(periodStart, periodEnd).changes;
  const otherRecordsInPeriod = (
    db
      .prepare(`SELECT COUNT(*) as c FROM production_records WHERE production_date BETWEEN ? AND ? AND is_demo = 0`)
      .get(periodStart, periodEnd) as { c: number }
  ).c;
  if (otherRecordsInPeriod > 0) {
    warnings.push(
      `Existem ${otherRecordsInPeriod} apontamento(s) lançados manualmente no portal entre ${periodStart} e ${periodEnd}. Eles foram mantidos e serão somados aos dados do Iniflex no dashboard — confira se não são duplicados.`
    );
  }

  // ----- Gravação -----
  const insertRec = db.prepare(
    `INSERT INTO production_records (
      id, production_date, shift_id, operator_id, sector_id, line_id, product_id,
      planned_quantity, produced_quantity, approved_quantity, loss_quantity, unit_of_measure,
      has_downtime, total_downtime_minutes, notes, additional_notes, is_demo, created_by, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'kg', ?, ?, ?, ?, 0, ?, ?)`
  );
  const insertDt = db.prepare(
    `INSERT INTO downtime_records (id, production_record_id, reason, duration_minutes, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const fmt = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 });

  const byLine = new Map<string, { weightKg: number; lossKg: number; downtimeMinutes: number }>();
  for (const a of aggs.values()) {
    const weight = round(a.weight);
    const qty = [...a.qtyByUnit].map(([u, q]) => `${fmt(q)} ${u}`).join(' + ');
    const notes = a.lossOnly && weight === 0
      ? `Iniflex RPCP019: ${a.loss > 0 ? `perda de ${fmt(a.loss)} kg` : ''}${a.loss > 0 && a.downtime > 0 ? ' e ' : ''}${a.downtime > 0 ? `parada de ${a.downtime} min` : ''} sem produção apontada no dia.`
      : `Iniflex RPCP622: ${a.apontamentos} apontamento(s), ${qty}, ${Math.round(a.workedMinutes)} min trabalhados. Etapa: ${[...a.etapas].join(', ')}. OP: ${[...a.ops].join(', ')}.`;
    const createdAt = `${a.date} ${String(a.shift.end_time || '18:00').slice(0, 5)}:00`;
    insertRec.run(
      a.id,
      a.date,
      a.shift.id,
      operatorId,
      a.line.sector_id,
      a.line.id,
      a.product.id,
      weight, // o ERP não exporta plano: planejado = realizado (metas são definidas no módulo de Metas)
      weight,
      weight,
      round(a.loss),
      a.downtime > 0 ? 1 : 0,
      a.downtime,
      notes,
      `Importação Iniflex · lote ${batchId}`,
      options.userId,
      createdAt
    );
    if (a.downtime > 0) {
      insertDt.run(
        hashId('dt-ini', a.id),
        a.id,
        'Parada apontada no Iniflex (RPCP019)',
        a.downtime,
        `Parada de ${a.downtime} min registrada no ERP para ${a.line.name}.`,
        createdAt
      );
    }
    const bl = byLine.get(a.line.name) || { weightKg: 0, lossKg: 0, downtimeMinutes: 0 };
    bl.weightKg += a.weight;
    bl.lossKg += a.loss;
    bl.downtimeMinutes += a.downtime;
    byLine.set(a.line.name, bl);
  }

  const files = [detail, daily].filter(Boolean).map((r) => ({ filename: r!.filename, kind: r!.kind.toUpperCase() }));
  const result: IniflexImportSummary = {
    committed: options.commit,
    batchId: options.commit ? batchId : null,
    files,
    periodStart,
    periodEnd,
    apontamentos: detail.entries.length,
    recordsCreated: aggs.size,
    totalWeightKg: round(totalWeight, 2),
    reportedTotalWeightKg: detail.reportedTotalWeight,
    totalLossKg: round(totalLoss, 2),
    totalDowntimeMinutes: totalDowntime,
    replacedRecords,
    otherRecordsInPeriod,
    newProducts,
    renamedProducts,
    newLines,
    byLine: [...byLine].map(([line, v]) => ({
      line,
      weightKg: round(v.weightKg, 2),
      lossKg: round(v.lossKg, 2),
      downtimeMinutes: v.downtimeMinutes,
    })),
    warnings,
  };

  db.prepare(
    `INSERT INTO import_batches (
      id, source_type, filename, total_rows, imported_rows, duplicate_rows, error_rows, status, validation_summary, imported_by
    ) VALUES (?, 'excel', ?, ?, ?, 0, 0, 'completed', ?, ?)`
  ).run(
    batchId,
    `Iniflex ${files.map((f) => f.kind).join(' + ')} (${periodStart} a ${periodEnd})`,
    detail.entries.length,
    aggs.size,
    JSON.stringify({
      replacedRecords,
      totalWeightKg: result.totalWeightKg,
      totalLossKg: result.totalLossKg,
      totalDowntimeMinutes: totalDowntime,
      newProducts: newProducts.length,
      warnings,
    }),
    options.userId
  );

  return result;
}
