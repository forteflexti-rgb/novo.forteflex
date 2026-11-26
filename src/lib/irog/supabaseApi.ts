/**
 * Funções de API do IROG, paradas, perdas, alertas e auditoria — direto no Supabase (RLS).
 * Substituem as rotas Express da versão importada (/api/irog, /api/downtimes, /api/losses,
 * /api/alerts, /api/admin/audit-logs), que não existem na Vercel.
 */
import { supabase } from '../supabase';
import { buildIrogOverview, type IrogSourceData } from './overview';
import type {
  AuditLogEntry,
  CycleTimeStandard,
  DashboardFilters,
  DowntimeEvent,
  DowntimeReason,
  IrogActiveAlert,
  IrogAlertRule,
  IrogFactoryOverview,
  IrogGoal,
  LossReason,
  LossRecord,
  Machine,
  MachineStatus,
  ParameterHistoryEntry,
  ProductionCalendarEntry,
  ProductionOrder,
  ProductionStage,
} from '../../types';

function db() {
  if (!supabase) throw new Error('Supabase não configurado: as telas IROG dependem do banco Supabase.');
  return supabase;
}

/** Lê todas as linhas (o Supabase devolve no máximo 1000 por consulta). */
async function fetchAll<T = any>(table: string, select = '*', apply?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db().from(table).select(select).range(from, from + 999);
    if (apply) q = apply(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) return out;
  }
}

const todayBrt = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const LOSS_CATEGORIES = ['Refugo', 'Retrabalho', 'Matéria-prima', 'Setup', 'Operacional', 'Qualidade', 'Outros'] as const;

// ---------------------------------------------------------------------------
// Catálogo IROG (complementa api.getCatalog)
// ---------------------------------------------------------------------------
export async function loadIrogCatalog(names: { sectors: Map<string, string>; lines: Map<string, string>; products: Map<string, { name: string; sku: string }> }) {
  const [resources, steps, standards, orders, calendars, dReasons, lReasons, goals, openStops] = await Promise.all([
    fetchAll('resources', '*', (q) => q.order('code')),
    fetchAll('process_steps', '*', (q) => q.order('code')),
    fetchAll('resource_standards'),
    fetchAll('production_orders', '*', (q) => q.order('order_number')),
    fetchAll('work_calendars'),
    fetchAll('downtime_reasons', '*', (q) => q.order('name')),
    fetchAll('loss_reasons', '*', (q) => q.order('name')),
    fetchAll('production_goals', '*', (q) => q.eq('metric', 'irog')),
    fetchAll('downtime_records', 'resource_id', (q) => q.eq('status', 'open')),
  ]);
  const stopped = new Set(openStops.map((d: any) => d.resource_id));
  const resName = new Map(resources.map((r: any) => [r.id, r]));
  const stepName = new Map(steps.map((s: any) => [s.id, s.name]));
  const today = todayBrt();
  const weekdays = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

  const machines: Machine[] = resources.map((r: any) => ({
    id: r.id, sector_id: r.sector_id, sector_name: names.sectors.get(r.sector_id), line_id: r.line_id,
    line_name: r.line_id ? names.lines.get(r.line_id) ?? null : null, code: r.code, name: r.name,
    resource_type: r.resource_type, theoretical_capacity_per_hour: null, capacity_unit: '',
    status: (stopped.has(r.id) ? 'stopped' : r.status ?? 'operating') as MachineStatus, active: r.active, created_at: r.created_at,
  }));
  const stages: ProductionStage[] = steps.map((s: any) => ({
    id: s.id, sector_id: s.sector_id ?? null, sector_name: s.sector_id ? names.sectors.get(s.sector_id) ?? null : null, code: s.code, name: s.name, description: s.description ?? null, active: s.active, created_at: s.created_at,
  }));
  const cycleStandards: CycleTimeStandard[] = standards.map((s: any) => {
    const perHour = s.standard_type === 'rate_per_hour' ? Number(s.value) : 3600 / Number(s.value);
    const r: any = resName.get(s.resource_id);
    const p = s.product_id ? names.products.get(s.product_id) : undefined;
    return {
      id: s.id, product_id: s.product_id ?? '', product_name: p?.name ?? 'Todos os produtos', product_sku: p?.sku,
      stage_id: s.step_id, stage_name: s.step_id ? stepName.get(s.step_id) ?? null : null, machine_id: s.resource_id,
      machine_code: r?.code, machine_name: r?.name, cycle_time_minutes: 60 / perHour, theoretical_capacity_per_hour: perHour,
      effective_from: s.valid_from, effective_to: s.valid_to, is_current: s.valid_from <= today && (!s.valid_to || s.valid_to >= today), created_at: s.created_at,
    };
  });
  const orderRows: ProductionOrder[] = orders.map((o: any) => ({
    id: o.id, order_number: o.order_number, product_id: o.product_id ?? '', product_name: o.product_id ? names.products.get(o.product_id)?.name : undefined,
    sector_id: o.sector_id ?? '', sector_name: o.sector_id ? names.sectors.get(o.sector_id) : undefined, line_id: o.line_id ?? null, line_name: o.line_id ? names.lines.get(o.line_id) ?? null : null, machine_id: o.resource_id ?? null, machine_name: o.resource_id ? (resName.get(o.resource_id) as any)?.name ?? null : null, planned_quantity: Number(o.planned_quantity ?? 0),
    status: (['open', 'in_progress', 'completed', 'cancelled'].includes(o.status) ? o.status : 'open'), due_date: o.planned_end, created_at: o.created_at,
  }));
  const calendarRows: ProductionCalendarEntry[] = calendars.map((c: any) => {
    const r: any = resName.get(c.resource_id);
    return {
      id: c.id, calendar_date: c.valid_from, sector_id: r?.sector_id ?? null, line_id: r?.line_id ?? null, machine_id: c.resource_id,
      machine_name: r?.name ?? null, shift_id: c.shift_id, day_type: 'workday', available_minutes: c.planned_minutes,
      description: `Toda ${weekdays[c.weekday]}${c.valid_to ? ` até ${c.valid_to}` : ''}`, created_at: c.created_at,
    };
  });
  const downtimeReasons: DowntimeReason[] = dReasons.map((r: any) => ({
    id: r.id, code: r.code, name: r.name, category: r.category ?? (r.is_planned ? 'Programada' : 'Não programada'),
    is_planned: r.is_planned, counts_for_availability: !r.is_planned, active: r.active, created_at: r.created_at,
  }));
  const lossReasons: LossReason[] = lReasons.map((r: any) => ({
    id: r.id, code: r.code, name: r.name, category: (LOSS_CATEGORIES as readonly string[]).includes(r.category) ? r.category : 'Outros', active: r.active, created_at: r.created_at,
  }));
  const irogGoals: IrogGoal[] = goals.map((g: any) => ({
    id: g.id, scope_level: g.resource_id ? 'machine' : g.line_id ? 'line' : g.sector_id ? 'sector' : 'factory',
    sector_id: g.sector_id, sector_name: g.sector_id ? names.sectors.get(g.sector_id) ?? null : null, line_id: g.line_id, line_name: g.line_id ? names.lines.get(g.line_id) ?? null : null, machine_id: g.resource_id, machine_name: g.resource_id ? (resName.get(g.resource_id) as any)?.name ?? null : null, target_irog_percent: Number(g.target_percent ?? 0),
    target_availability_percent: Number(g.target_availability_percent ?? 0), target_performance_percent: Number(g.target_performance_percent ?? 0), target_quality_percent: Number(g.target_quality_percent ?? 0), max_loss_percent: Number(g.max_loss_percent ?? 0),
    effective_from: g.valid_from ?? '', active: g.active, created_at: g.created_at,
  }));
  return { machines, stages, cycleStandards, orders: orderRows, calendars: calendarRows, downtimeReasons, lossReasons, irogGoals };
}

// ---------------------------------------------------------------------------
// IROG
// ---------------------------------------------------------------------------
export async function getIrogOverview(filters: Partial<DashboardFilters> = {}): Promise<IrogFactoryOverview> {
  const dateFilter = (q: any) => {
    if (filters.startDate) q = q.gte('production_date', filters.startDate);
    if (filters.endDate) q = q.lte('production_date', filters.endDate);
    return q;
  };
  const [sectors, lines, shifts, products, resources, events, losses, downtime, calendars, exceptions, standards, downtimeReasons, lossReasons, goals] =
    await Promise.all([
      fetchAll('sectors', 'id,code,name'),
      fetchAll('production_lines', 'id,code,name,sector_id'),
      fetchAll('shifts', 'id,name'),
      fetchAll('products', 'id,name'),
      fetchAll('resources', 'id,code,name,sector_id,line_id,active'),
      fetchAll('production_events', 'id,resource_id,step_id,product_id,shift_id,operator_id,order_id,production_date,started_at,ended_at,worked_minutes,quantity,unit,net_weight_kg,source', dateFilter),
      fetchAll('loss_events', 'id,resource_id,production_date,quantity,unit,weight_kg,reason_id,reason_text,source,created_at', dateFilter),
      fetchAll('downtime_records', 'id,resource_id,production_date,duration_minutes,reason,reason_id,status,started_at,created_at,source', dateFilter),
      fetchAll('work_calendars', 'resource_id,weekday,shift_id,planned_minutes,valid_from,valid_to'),
      fetchAll('calendar_exceptions', 'resource_id,exception_date,shift_id,kind,minutes'),
      fetchAll('resource_standards', 'resource_id,product_id,step_id,standard_type,value,unit,valid_from,valid_to'),
      fetchAll('downtime_reasons', 'id,name,category,is_planned'),
      fetchAll('loss_reasons', 'id,name,category'),
      fetchAll('production_goals', 'metric,target_percent,sector_id,line_id,resource_id,active'),
    ]);
  const data: IrogSourceData = { sectors, lines, shifts, products, resources, events, losses, downtime, calendars, exceptions, standards, downtimeReasons, lossReasons, goals } as any;
  return buildIrogOverview(data, filters);
}

// ---------------------------------------------------------------------------
// Paradas
// ---------------------------------------------------------------------------
export async function getDowntimes(filters?: { machineId?: string; status?: 'open' | 'closed' }): Promise<{ downtimes: DowntimeEvent[] }> {
  const rows = await fetchAll(
    'downtime_records',
    '*, resource:resources(code,name,sector_id,line_id), shift:shifts(name), reason_ref:downtime_reasons(name,category,is_planned), recorder:profiles!downtime_records_recorded_by_fkey(full_name)',
    (q) => {
      q = q.not('resource_id', 'is', null).order('created_at', { ascending: false });
      if (filters?.machineId) q = q.eq('resource_id', filters.machineId);
      if (filters?.status) q = q.eq('status', filters.status);
      return q;
    },
  );
  const [sectors, lines] = await Promise.all([fetchAll('sectors', 'id,name'), fetchAll('production_lines', 'id,name')]);
  const sName = new Map(sectors.map((s: any) => [s.id, s.name]));
  const lName = new Map(lines.map((l: any) => [l.id, l.name]));
  return {
    downtimes: rows.map((d: any) => {
      const sector = d.sector_id ?? d.resource?.sector_id ?? null;
      const line = d.resource?.line_id ?? null;
      const planned = d.reason_ref?.is_planned ?? false;
      return {
        id: d.id, production_record_id: d.production_record_id, machine_id: d.resource_id, machine_code: d.resource?.code, machine_name: d.resource?.name,
        sector_id: sector, sector_name: sector ? sName.get(sector) : null, line_id: line, line_name: line ? lName.get(line) : null,
        shift_id: d.shift_id, shift_name: d.shift?.name ?? 'Turno não informado', reason_id: d.reason_id, reason: d.reason_ref?.name ?? d.reason,
        category: d.reason_ref?.category ?? (d.reason_id ? null : 'Sem classificação'), is_planned: planned, counts_for_availability: !planned,
        duration_minutes: d.duration_minutes, production_date: d.production_date, start_at: d.started_at, end_at: d.ended_at, status: d.status, description: d.description,
        recorded_by: d.recorded_by, recorded_by_name: d.recorder?.full_name ?? (d.source === 'iniflex_report' ? 'Iniflex (RPCP019)' : null), created_at: d.created_at,
      } satisfies DowntimeEvent;
    }),
  };
}

export async function createDowntime(payload: {
  machine_id: string; shift_id: string; reason_id?: string | null; reason?: string; category?: string;
  start_at?: string; end_at?: string; duration_minutes?: number; description?: string; mode?: 'open' | 'closed';
}): Promise<{ id: string; status: 'open' | 'closed' }> {
  const { data: res } = await db().from('resources').select('sector_id').eq('id', payload.machine_id).single();
  let reasonName = payload.reason ?? '';
  if (payload.reason_id) {
    const { data: r } = await db().from('downtime_reasons').select('name').eq('id', payload.reason_id).single();
    reasonName = r?.name ?? reasonName;
  }
  const mode = payload.mode ?? 'closed';
  const startedAt = payload.start_at ?? new Date().toISOString();
  const duration = mode === 'open' ? 0 : Number(payload.duration_minutes ?? 0);
  if (mode === 'closed' && !(duration > 0)) throw new Error('Informe a duração da parada em minutos.');
  const { data, error } = await db()
    .from('downtime_records')
    .insert({
      resource_id: payload.machine_id, sector_id: res?.sector_id ?? null, shift_id: payload.shift_id || null, reason_id: payload.reason_id || null,
      reason: reasonName || 'Parada sem motivo informado', description: payload.description || null, duration_minutes: duration,
      production_date: todayBrt(), started_at: startedAt, ended_at: mode === 'closed' ? payload.end_at ?? new Date(Date.parse(startedAt) + duration * 60000).toISOString() : null,
      status: mode, source: 'manual',
    })
    .select('id,status')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string; status: 'open' | 'closed' };
}

export async function closeDowntime(id: string, payload?: { end_at?: string; duration_minutes?: number; description?: string }) {
  const { data: cur, error: e1 } = await db().from('downtime_records').select('started_at,description').eq('id', id).single();
  if (e1 || !cur) throw new Error(e1?.message ?? 'Parada não encontrada.');
  const end = payload?.end_at ?? new Date().toISOString();
  const minutes = payload?.duration_minutes ?? Math.max(1, Math.round((Date.parse(end) - Date.parse(cur.started_at)) / 60000));
  const { error } = await db()
    .from('downtime_records')
    .update({ status: 'closed', ended_at: end, duration_minutes: minutes, description: payload?.description ?? cur.description })
    .eq('id', id);
  if (error) throw new Error(error.message);
  return { closed: true, duration_minutes: minutes };
}

// ---------------------------------------------------------------------------
// Perdas
// ---------------------------------------------------------------------------
export async function getLosses(filters?: { includeDemo?: boolean }): Promise<{ losses: LossRecord[] }> {
  const rows = await fetchAll(
    'loss_events',
    '*, resource:resources(code,name,sector_id,line_id), shift:shifts(name), product:products(name,sku), reason:loss_reasons(name,category), order:production_orders(order_number), recorder:profiles!loss_events_recorded_by_fkey(full_name)',
    (q) => {
      q = q.order('production_date', { ascending: false });
      if (filters?.includeDemo === false) q = q.neq('source', 'demo');
      return q;
    },
  );
  const [sectors, lines] = await Promise.all([fetchAll('sectors', 'id,name'), fetchAll('production_lines', 'id,name')]);
  const sName = new Map(sectors.map((s: any) => [s.id, s.name]));
  const lName = new Map(lines.map((l: any) => [l.id, l.name]));
  return {
    losses: rows.map((l: any) => ({
      id: l.id, production_record_id: null, loss_date: l.production_date, shift_id: l.shift_id ?? '', shift_name: l.shift?.name ?? 'Turno não informado',
      sector_id: l.resource?.sector_id ?? '', sector_name: sName.get(l.resource?.sector_id), line_id: l.resource?.line_id ?? null,
      line_name: l.resource?.line_id ? lName.get(l.resource.line_id) : null, machine_id: l.resource_id, machine_name: l.resource?.name,
      product_id: l.product_id ?? '', product_name: l.product?.name ?? (l.source === 'iniflex_report' ? 'Vários (perda diária do recurso)' : undefined),
      product_sku: l.product?.sku, production_order_id: l.order_id, order_number: l.order?.order_number ?? null, reason_id: l.reason_id,
      category: l.reason?.category ?? 'Sem classificação', reason_name: l.reason?.name ?? l.reason_text ?? (l.source === 'iniflex_report' ? 'Perda apontada no Iniflex (RPCP019)' : 'Sem motivo'),
      quantity: Number(l.weight_kg ?? l.quantity ?? 0), unit_of_measure: l.weight_kg !== null ? 'kg' : l.unit ?? '', notes: l.notes,
      is_demo: l.source === 'demo', recorded_by: l.recorded_by ?? '', recorded_by_name: l.recorder?.full_name ?? (l.source === 'iniflex_report' ? 'Iniflex (RPCP019)' : undefined),
      created_at: l.created_at,
    })),
  };
}

export async function createLoss(payload: {
  loss_date: string; shift_id: string; sector_id: string; line_id?: string | null; machine_id?: string | null; product_id: string;
  production_order_id?: string | null; reason_id?: string | null; category?: string; reason_name?: string; quantity: number; unit_of_measure?: string; notes?: string;
}): Promise<{ id: string }> {
  if (!payload.machine_id) throw new Error('Selecione a máquina/recurso da perda: o IROG é calculado por recurso.');
  if (!(payload.quantity > 0)) throw new Error('Informe a quantidade perdida.');
  const { data: auth } = await db().auth.getUser();
  const unit = (payload.unit_of_measure || 'kg').toLowerCase();
  const { data, error } = await db()
    .from('loss_events')
    .insert({
      resource_id: payload.machine_id, production_date: payload.loss_date, shift_id: payload.shift_id || null, product_id: payload.product_id || null,
      order_id: payload.production_order_id || null, reason_id: payload.reason_id || null, reason_text: payload.reason_name || null,
      quantity: payload.quantity, unit, weight_kg: unit === 'kg' ? payload.quantity : null, notes: payload.notes || null,
      source: 'manual', recorded_by: auth.user?.id,
    })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

// ---------------------------------------------------------------------------
// Alertas (regras do administrador; nenhum limite vem pré-definido)
// ---------------------------------------------------------------------------
const ALERT_MAP: Record<string, { metric: string; scope_type: string; comparator: 'lt' | 'gt' }> = {
  machine_irog_below_goal: { metric: 'irog', scope_type: 'resource', comparator: 'lt' },
  sector_irog_below_goal: { metric: 'irog', scope_type: 'sector', comparator: 'lt' },
  downtime_above_limit: { metric: 'downtime_minutes', scope_type: 'resource', comparator: 'gt' },
  loss_above_limit: { metric: 'loss_percent', scope_type: 'resource', comparator: 'gt' },
};
const typeOf = (r: any) =>
  Object.entries(ALERT_MAP).find(([, v]) => v.metric === r.metric && v.scope_type === r.scope_type)?.[0] ?? `${r.metric}_${r.scope_type}`;

export async function getAlerts(includeDemo = true, filters: Partial<DashboardFilters> = {}): Promise<{ rules: IrogAlertRule[]; activeAlerts: IrogActiveAlert[] }> {
  const rules = await fetchAll('alert_rules', '*', (q) => q.order('created_at'));
  const mapped: IrogAlertRule[] = rules.map((r: any) => ({
    id: r.id, alert_type: typeOf(r), name: r.name, threshold_value: Number(r.threshold), comparison: r.comparator,
    recipients: r.recipients ?? null, enabled: r.active, created_at: r.created_at,
  }));
  const activeAlerts: IrogActiveAlert[] = [];
  const enabled = rules.filter((r: any) => r.active);
  if (enabled.length > 0) {
    const ov = await getIrogOverview({ ...filters, includeDemo });
    for (const r of enabled) {
      const pool = r.scope_type === 'sector' ? ov.sectors : r.scope_type === 'line' ? ov.lines : r.scope_type === 'plant' ? [ov.factory] : ov.machines;
      for (const e of pool.filter((x) => !r.scope_id || x.id === r.scope_id)) {
        const value =
          r.metric === 'irog' ? e.irogPercent : r.metric === 'availability' ? e.availabilityPercent : r.metric === 'performance' ? e.performancePercent
            : r.metric === 'quality' ? e.qualityPercent : r.metric === 'downtime_minutes' ? e.downtimeMinutes
            : r.metric === 'loss_percent' ? (e.producedQuantity > 0 ? (e.lossQuantity / e.producedQuantity) * 100 : null) : null;
        if (value === null) continue; // indicador pendente não dispara alerta
        const hit = r.comparator === 'lt' ? value < Number(r.threshold) : value > Number(r.threshold);
        if (!hit) continue;
        const unit = r.metric === 'downtime_minutes' ? ' min' : '%';
        activeAlerts.push({
          id: `${r.id}-${e.id}`, ruleName: r.name, severity: Math.abs(value - Number(r.threshold)) > Math.abs(Number(r.threshold)) * 0.1 ? 'critical' : 'warning',
          entityLevel: e.level, entityName: e.name, message: `${r.name}: ${e.name}`, currentValue: `${value.toFixed(1)}${unit}`, thresholdValue: `${Number(r.threshold).toFixed(1)}${unit}`,
        });
      }
    }
  }
  return { rules: mapped, activeAlerts };
}

export async function createAlertRule(payload: { alert_type: string; name: string; threshold_value: number; comparison?: 'lt' | 'gt'; recipients?: string }) {
  const m = ALERT_MAP[payload.alert_type];
  if (!m) throw new Error(`Tipo de alerta desconhecido: ${payload.alert_type}`);
  const { data, error } = await db()
    .from('alert_rules')
    .insert({ name: payload.name, metric: m.metric, scope_type: m.scope_type, comparator: payload.comparison ?? m.comparator, threshold: payload.threshold_value, period: 'day', recipients: payload.recipients || null })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return data as { id: string };
}

export async function updateAlertRule(id: string, payload: { enabled?: boolean; threshold_value?: number; recipients?: string }) {
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (payload.enabled !== undefined) patch.active = payload.enabled;
  if (payload.threshold_value !== undefined) patch.threshold = payload.threshold_value;
  if (payload.recipients !== undefined) patch.recipients = payload.recipients;
  const { error } = await db().from('alert_rules').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
  return { updated: true };
}

// ---------------------------------------------------------------------------
// Auditoria (audit_log, preenchido por trigger)
// ---------------------------------------------------------------------------
const PARAM_TABLES = new Set(['resource_standards', 'work_calendars', 'calendar_exceptions', 'production_goals', 'alert_rules', 'downtime_reasons', 'loss_reasons']);
const IGNORE_FIELDS = new Set(['updated_at', 'created_at', 'updated_by', 'created_by']);

export async function getAuditLogs(): Promise<{ logs: AuditLogEntry[]; parameterHistory: ParameterHistoryEntry[] }> {
  const { data, error } = await db().from('audit_log').select('*').order('changed_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  const people = await fetchAll('profiles', 'id,full_name');
  const who = new Map(people.map((p: any) => [p.id, p.full_name]));
  const rows = data ?? [];
  const logs: AuditLogEntry[] = rows.map((r: any) => {
    const changed =
      r.action === 'UPDATE' && r.old_data && r.new_data
        ? Object.keys(r.new_data).filter((k) => !IGNORE_FIELDS.has(k) && JSON.stringify(r.old_data[k]) !== JSON.stringify(r.new_data[k]))
        : [];
    return {
      id: String(r.id), actor_id: r.changed_by, actor_name: r.changed_by ? who.get(r.changed_by) ?? 'Usuário' : 'Sistema / carga',
      action: r.action, entity_type: r.table_name, entity_id: r.record_id,
      details: changed.length ? `Campos alterados: ${changed.join(', ')}` : r.action === 'INSERT' ? 'Registro criado' : r.action === 'DELETE' ? 'Registro excluído' : null,
      created_at: r.changed_at,
    };
  });
  const parameterHistory: ParameterHistoryEntry[] = [];
  for (const r of rows.filter((x: any) => PARAM_TABLES.has(x.table_name) && x.action === 'UPDATE' && x.old_data && x.new_data)) {
    for (const k of Object.keys(r.new_data)) {
      if (IGNORE_FIELDS.has(k) || JSON.stringify(r.old_data[k]) === JSON.stringify(r.new_data[k])) continue;
      parameterHistory.push({
        id: `${r.id}-${k}`, entity_type: r.table_name, entity_id: r.record_id, field_name: k,
        old_value: r.old_data[k] === null ? null : String(r.old_data[k]), new_value: String(r.new_data[k]),
        effective_from: r.new_data.valid_from ?? r.changed_at, changed_by_name: r.changed_by ? who.get(r.changed_by) : 'Sistema', created_at: r.changed_at,
      });
    }
  }
  return { logs, parameterHistory };
}
