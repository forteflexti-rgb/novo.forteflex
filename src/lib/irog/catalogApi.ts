/**
 * Cadastros industriais & parâmetros IROG (tela AdminCatalogView) — direto no Supabase (RLS: admin grava).
 * Regra do projeto: nenhum valor de capacidade, ciclo, meta ou calendário é preenchido pelo sistema.
 * Autor e data de cada alteração ficam em audit_log (trigger) e em created_by (default auth.uid()).
 */
import { supabase } from '../supabase';

function db() {
  if (!supabase) throw new Error('Supabase não configurado.');
  return supabase;
}

async function fetchAll<T = any>(table: string, apply?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db().from(table).select('*').range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

async function insertRow(table: string, row: Record<string, unknown>) {
  const { data, error } = await db().from(table).insert(row).select('id').single();
  if (error) throw new Error(error.message.includes('duplicate') ? 'Já existe um cadastro com este código.' : error.message);
  return data as { id: string };
}

async function updateRow(table: string, id: string, patch: Record<string, unknown>) {
  const { error } = await db().from(table).update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
  return { updated: true };
}

async function deleteRow(table: string, id: string) {
  const { error } = await db().from(table).delete().eq('id', id);
  if (error) throw new Error(error.message);
  return { deleted: true };
}

const empty = (v: unknown) => v === null || v === undefined || v === '';

function positive(v: unknown, label: string) {
  const n = Number(v);
  if (empty(v) || !Number.isFinite(n) || n <= 0) throw new Error(`${label}: informe um valor maior que zero.`);
  return n;
}

function percent(v: unknown, label: string) {
  const n = Number(v);
  if (empty(v) || !Number.isFinite(n) || n <= 0 || n > 100) throw new Error(`${label}: informe um percentual entre 0 e 100.`);
  return n;
}

/** Campo opcional: vazio ou 0 (a tela converte vazio em 0) = meta não definida. */
const optionalPercent = (v: unknown, label: string) => (empty(v) || Number(v) === 0 ? null : percent(v, label));

// ---- Máquinas / recursos ----
const RESOURCE_TYPES = ['machine', 'manual_station', 'team', 'other'];

export const createMachine = (p: { sector_id: string; line_id?: string | null; code: string; name: string; resource_type?: string; status?: string }) =>
  insertRow('resources', {
    sector_id: p.sector_id,
    line_id: p.line_id || null,
    code: p.code.trim().toUpperCase(),
    name: p.name.trim(),
    resource_type: RESOURCE_TYPES.includes(p.resource_type ?? '') ? p.resource_type : 'machine',
    notes: p.resource_type && !RESOURCE_TYPES.includes(p.resource_type) ? `Tipo: ${p.resource_type}` : null,
    status: p.status ?? 'operating',
  });

export const updateMachine = (id: string, p: Record<string, any>) => {
  const allowed: Record<string, unknown> = {};
  for (const k of ['name', 'line_id', 'sector_id', 'status', 'active', 'notes']) if (k in p) allowed[k] = p[k];
  return updateRow('resources', id, allowed);
};

// ---- Operações / etapas ----
export const createStage = (p: { sector_id?: string | null; code: string; name: string; description?: string }) =>
  insertRow('process_steps', {
    code: p.code.trim(),
    name: p.name.trim(),
    sector_id: p.sector_id || null,
    description: p.description || null,
    sequence: Number(p.code) || null,
  });

// ---- Padrões produtivos (capacidade ou ciclo) ----
export const createCycleStandard = (p: {
  machine_id: string;
  product_id?: string | null;
  stage_id?: string | null;
  standard_type: 'rate_per_hour' | 'cycle_seconds';
  value: number | string;
  unit: string;
  valid_from: string;
  source: string;
  notes?: string;
}) => {
  if (!p.machine_id) throw new Error('Selecione a máquina/recurso.');
  if (!p.unit?.trim()) throw new Error('Informe a unidade do padrão (kg, mil, mt, un).');
  if (!p.source?.trim()) throw new Error('Informe a origem do padrão: quem definiu e como (ex.: cronoanálise, manual do fabricante).');
  if (!p.valid_from) throw new Error('Informe a data de início da vigência.');
  return insertRow('resource_standards', {
    resource_id: p.machine_id,
    product_id: p.product_id || null,
    step_id: p.stage_id || null,
    standard_type: p.standard_type,
    value: positive(p.value, p.standard_type === 'rate_per_hour' ? 'Capacidade por hora' : 'Ciclo em segundos'),
    unit: p.unit.trim().toLowerCase(),
    valid_from: p.valid_from,
    source: p.source.trim(),
    notes: p.notes || null,
  });
};

export interface StandardRow {
  id: string;
  resource_id: string;
  product_id: string | null;
  step_id: string | null;
  standard_type: 'rate_per_hour' | 'cycle_seconds';
  value: number;
  unit: string;
  valid_from: string;
  valid_to: string | null;
  source: string;
  notes: string | null;
  created_at: string;
}

export const getStandards = () => fetchAll<StandardRow>('resource_standards', (q) => q.order('created_at', { ascending: false }));

/**
 * Combinações recurso × produto × etapa que aparecem nos apontamentos reais, com a indicação de
 * existir ou não um padrão vigente hoje — o que a engenharia precisa cadastrar para destravar o IROG.
 */
export async function getStandardCoverage() {
  const [events, standards] = await Promise.all([
    fetchAll<any>('production_events', (q) => q.neq('source', 'demo')),
    getStandards(),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  const vigentes = standards.filter((s) => s.valid_from <= today && (!s.valid_to || s.valid_to >= today));
  const map = new Map<string, { resource_id: string; product_id: string | null; step_id: string | null; unit: string; events: number; weightKg: number; lastDate: string }>();
  for (const e of events) {
    const key = `${e.resource_id}|${e.product_id ?? ''}|${e.step_id ?? ''}|${e.unit}`;
    const cur = map.get(key) ?? { resource_id: e.resource_id, product_id: e.product_id, step_id: e.step_id, unit: e.unit, events: 0, weightKg: 0, lastDate: '' };
    cur.events += 1;
    cur.weightKg += Number(e.net_weight_kg ?? 0);
    if (e.production_date > cur.lastDate) cur.lastDate = e.production_date;
    map.set(key, cur);
  }
  return [...map.values()]
    .map((c) => {
      const match = vigentes.find(
        (s) => s.resource_id === c.resource_id && (s.product_id === null || s.product_id === c.product_id) && (s.step_id === null || s.step_id === c.step_id),
      );
      return { ...c, hasStandard: !!match, unitMismatch: !!match && match.unit !== c.unit };
    })
    .sort((a, b) => Number(a.hasStandard) - Number(b.hasStandard) || b.weightKg - a.weightKg);
}

/** Encerra a vigência (não apaga): cálculos de períodos anteriores continuam rastreáveis. */
export const endCycleStandard = (id: string, validTo: string) => updateRow('resource_standards', id, { valid_to: validTo });

// ---- Ordens de produção ----
export const createOrder = (p: {
  order_number: string;
  product_id: string;
  sector_id: string;
  line_id?: string | null;
  machine_id?: string | null;
  planned_quantity: number | string;
  unit?: string;
  due_date?: string | null;
}) =>
  insertRow('production_orders', {
    order_number: p.order_number.trim(),
    product_id: p.product_id,
    sector_id: p.sector_id || null,
    line_id: p.line_id || null,
    resource_id: p.machine_id || null,
    planned_quantity: positive(p.planned_quantity, 'Quantidade planejada'),
    unit: p.unit || null,
    planned_end: p.due_date || null,
    status: 'open',
    source: 'manual',
  });

// ---- Calendário: grade semanal por recurso + exceções ----
export interface WeeklyCalendarRow {
  id: string;
  resource_id: string;
  weekday: number;
  shift_id: string;
  planned_minutes: number;
  valid_from: string;
  valid_to: string | null;
}

export interface CalendarExceptionRow {
  id: string;
  resource_id: string | null;
  exception_date: string;
  shift_id: string | null;
  kind: 'holiday' | 'planned_stop' | 'extra_shift';
  minutes: number | null;
  reason: string;
}

export async function getCalendarSetup(): Promise<{ weekly: WeeklyCalendarRow[]; exceptions: CalendarExceptionRow[] }> {
  const [weekly, exceptions] = await Promise.all([
    fetchAll<WeeklyCalendarRow>('work_calendars', (q) => q.order('resource_id').order('weekday')),
    fetchAll<CalendarExceptionRow>('calendar_exceptions', (q) => q.order('exception_date', { ascending: false })),
  ]);
  return { weekly, exceptions };
}

export async function createWeeklyCalendar(p: { machine_ids: string[]; weekdays: number[]; shift_id: string; planned_minutes: number | string; valid_from: string }) {
  if (p.machine_ids.length === 0) throw new Error('Selecione ao menos uma máquina/recurso.');
  if (p.weekdays.length === 0) throw new Error('Selecione ao menos um dia da semana.');
  if (!p.shift_id) throw new Error('Selecione o turno.');
  const minutes = positive(p.planned_minutes, 'Minutos programados');
  if (minutes > 1440) throw new Error('Minutos programados: no máximo 1440 por turno.');
  const rows = p.machine_ids.flatMap((m) =>
    p.weekdays.map((w) => ({ resource_id: m, weekday: w, shift_id: p.shift_id, planned_minutes: minutes, valid_from: p.valid_from })),
  );
  const { error } = await db().from('work_calendars').insert(rows);
  if (error) throw new Error(error.message);
  return { created: rows.length };
}

export const deleteWeeklyCalendar = (id: string) => deleteRow('work_calendars', id);

export const createCalendarException = (p: {
  resource_id?: string | null;
  exception_date: string;
  shift_id?: string | null;
  kind: 'holiday' | 'planned_stop' | 'extra_shift';
  minutes?: number | string | null;
  reason: string;
}) => {
  if (!p.reason?.trim()) throw new Error('Informe o motivo da exceção.');
  if (p.kind === 'extra_shift') positive(p.minutes, 'Minutos do turno extra');
  return insertRow('calendar_exceptions', {
    resource_id: p.resource_id || null,
    exception_date: p.exception_date,
    shift_id: p.shift_id || null,
    kind: p.kind,
    minutes: empty(p.minutes) ? null : Number(p.minutes),
    reason: p.reason.trim(),
  });
};

export const deleteCalendarException = (id: string) => deleteRow('calendar_exceptions', id);

// ---- Motivos de parada e de perda ----
export const createDowntimeReason = (p: { code: string; name: string; category: string; is_planned: boolean; counts_for_availability?: boolean }) =>
  insertRow('downtime_reasons', { code: p.code.trim().toUpperCase(), name: p.name.trim(), category: p.category || null, is_planned: !!p.is_planned });

export const updateDowntimeReason = (id: string, p: Record<string, any>) => {
  const allowed: Record<string, unknown> = {};
  for (const k of ['name', 'category', 'is_planned', 'active']) if (k in p) allowed[k] = p[k];
  return updateRow('downtime_reasons', id, allowed);
};

export const createLossReason = (p: { code: string; name: string; category: string }) =>
  insertRow('loss_reasons', { code: p.code.trim().toUpperCase(), name: p.name.trim(), category: p.category || null });

// ---- Metas de IROG (definidas pela direção; nenhum valor padrão) ----
export async function createIrogGoal(p: {
  scope_level: 'factory' | 'sector' | 'line' | 'machine';
  sector_id?: string | null;
  line_id?: string | null;
  machine_id?: string | null;
  target_irog_percent: number | string;
  target_availability_percent?: number | string | null;
  target_performance_percent?: number | string | null;
  target_quality_percent?: number | string | null;
  max_loss_percent?: number | string | null;
}) {
  let sector = p.scope_level === 'factory' ? null : p.sector_id || null;
  if (p.scope_level === 'machine') {
    if (!p.machine_id) throw new Error('Selecione a máquina.');
    const { data } = await db().from('resources').select('sector_id').eq('id', p.machine_id).single();
    sector = data?.sector_id ?? sector;
  }
  if (p.scope_level === 'line') {
    if (!p.line_id) throw new Error('Selecione a linha.');
    const { data } = await db().from('production_lines').select('sector_id').eq('id', p.line_id).single();
    sector = data?.sector_id ?? sector;
  }
  if (p.scope_level === 'sector' && !sector) throw new Error('Selecione o setor.');
  return insertRow('production_goals', {
    metric: 'irog',
    period_type: 'monthly',
    sector_id: sector,
    line_id: p.scope_level === 'line' ? p.line_id : null,
    resource_id: p.scope_level === 'machine' ? p.machine_id : null,
    target_percent: percent(p.target_irog_percent, 'Meta de IROG'),
    target_availability_percent: optionalPercent(p.target_availability_percent, 'Meta de disponibilidade'),
    target_performance_percent: optionalPercent(p.target_performance_percent, 'Meta de performance'),
    target_quality_percent: optionalPercent(p.target_quality_percent, 'Meta de qualidade'),
    max_loss_percent: empty(p.max_loss_percent) ? 0 : Number(p.max_loss_percent),
    valid_from: new Date().toISOString().slice(0, 10),
    active: true,
  });
}

export const deleteIrogGoal = (id: string) => deleteRow('production_goals', id);
