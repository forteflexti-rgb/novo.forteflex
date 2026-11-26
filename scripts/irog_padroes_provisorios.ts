/**
 * Script que gerou os padrões PROVISÓRIOS de 26/11/2026 (migração 2i + atualização por tempo efetivo).
 * Lê as tabelas exportadas do Supabase em preview-irog/data/*.json (pasta local, fora do Git).
 * Uso: npx tsx scripts/irog_padroes_provisorios.ts [sql]
 */
import fs from 'node:fs';
import { buildIrogOverview } from '../src/lib/irog/overview.ts';

const T = (n: string) => JSON.parse(fs.readFileSync(`preview-irog/data/${n}.json`, 'utf8'));
const events = T('production_events').filter((e: any) => e.source === 'iniflex_report');
const MAX = 1440;

// Tempo efetivo por apontamento (varredura dos intervalos por recurso)
const eff = new Map<string, number>();
const byRes = new Map<string, any[]>();
for (const e of events) {
  const a = Date.parse(e.started_at), b = Date.parse(e.ended_at);
  if (!(b > a) || (b - a) / 60000 > MAX) continue;
  if (!byRes.has(e.resource_id)) byRes.set(e.resource_id, []);
  byRes.get(e.resource_id)!.push({ id: e.id, a, b });
}
for (const list of byRes.values()) {
  const pts = [...new Set(list.flatMap((x) => [x.a, x.b]))].sort((x, y) => x - y);
  for (let i = 0; i < pts.length - 1; i++) {
    const s = pts[i], t = pts[i + 1];
    const active = list.filter((x) => x.a <= s && x.b >= t);
    for (const x of active) eff.set(x.id, (eff.get(x.id) ?? 0) + (t - s) / 60000 / active.length);
  }
}

const p90 = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const pos = 0.9 * (s.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
};
const key = (e: any) => `${e.resource_id}|${e.product_id ?? ''}|${e.step_id ?? ''}|${e.unit}`;
const groups = new Map<string, any[]>();
for (const e of events) {
  if (!groups.has(key(e))) groups.set(key(e), []);
  groups.get(key(e))!.push(e);
}
const rate = (e: any) => Number(e.quantity) / ((eff.get(e.id) ?? 0) / 60);
const valid = (e: any, minEff: number) => Number(e.quantity) > 0 && (eff.get(e.id) ?? 0) >= minEff;

const stepRates = new Map<string, number[]>();
for (const e of events) if (valid(e, 30)) {
  const k = `${e.resource_id}|${e.step_id ?? ''}|${e.unit}`;
  if (!stepRates.has(k)) stepRates.set(k, []);
  stepRates.get(k)!.push(rate(e));
}

const result: Array<{ k: string; value: number; note: string }> = [];
for (const [k, list] of groups) {
  const r30 = list.filter((e) => valid(e, 30)).map(rate);
  const rAny = list.filter((e) => valid(e, 1)).map(rate);
  const [res, , step, unit] = k.split('|');
  let value: number | null = p90(r30), note = `Base: P90 de ${r30.length} apontamento(s) com tempo efetivo ≥ 30 min (trechos simultâneos divididos).`;
  if (value === null && rAny.length) { value = Math.max(...rAny); note = `Base: maior velocidade de ${rAny.length} apontamento(s) curtos (tempo efetivo < 30 min).`; }
  if (value === null) { value = p90(stepRates.get(`${res}|${step}|${unit}`) ?? []); note = 'Base: P90 da etapa no recurso (combinação sem tempo efetivo válido).'; }
  if (value !== null && value > 0) result.push({ k, value: Math.round(value * 10000) / 10000, note: `${note} Substituir pelo padrão oficial da engenharia.` });
}

// Simulação em memória com os novos valores
const std = T('resource_standards').map((s: any) => {
  const r = result.find((x) => x.k === `${s.resource_id}|${s.product_id ?? ''}|${s.step_id ?? ''}|${s.unit}`);
  return r && /^PROVIS/.test(s.source) ? { ...s, value: r.value } : s;
});
const data: any = { sectors: T('sectors'), lines: T('production_lines'), shifts: T('shifts'), products: T('products'), resources: T('resources'), events: T('production_events'), losses: T('loss_events'), downtime: T('downtime_records'), calendars: T('work_calendars'), exceptions: T('calendar_exceptions'), standards: std, downtimeReasons: T('downtime_reasons'), lossReasons: T('loss_reasons'), goals: T('production_goals') };
const ov = buildIrogOverview(data, { startDate: '2026-10-01', endDate: '2026-10-31', includeDemo: true });
console.table([...ov.machines, ov.factory].map((m) => ({ nome: m.code ?? 'FÁBRICA', D: m.availabilityPercent, P: m.performancePercent, Q: m.qualityPercent, IROG: m.irogPercent })));
console.log('padrões calculados:', result.length);

if (process.argv[2] === 'sql') {
  const esc = (s: string) => s.replace(/'/g, "''");
  const sql = result.map(({ k, value, note }) => {
    const [res, prod, step, unit] = k.split('|');
    const eq = (col: string, v: string) => (v ? `${col} = '${esc(v)}'` : `${col} is null`);
    return `update public.resource_standards set value = ${value}, notes = '${esc(note)}', updated_at = now() where source like 'PROVIS%' and resource_id = '${esc(res)}' and ${eq('product_id', prod)} and ${eq('step_id', step)} and unit = '${esc(unit)}';`;
  });
  fs.writeFileSync('preview-irog/padroes_update.sql', sql.join('\n') + '\n');
  console.log('SQL gravado em preview-irog/padroes_update.sql');
}
