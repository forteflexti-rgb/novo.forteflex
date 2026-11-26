/**
 * Monta o painel IROG (formato IrogFactoryOverview das telas) a partir das linhas do Supabase,
 * usando o motor puro de ./engine.ts. Sem acesso a banco: recebe os dados já carregados.
 *
 * Grão: recurso × dia (o turno não vem em ~48% dos apontamentos do Iniflex).
 * Janela do dia: 00:00–24:00 no horário de Brasília (UTC−3).
 */
import {
  IROG_CALC_VERSION,
  calculateIrogGrain,
  consolidateIrog,
  type IrogResult,
  type ResourceStandard,
} from './engine';
import type {
  CalculationStatus,
  DashboardFilters,
  IrogEntityMetrics,
  IrogFactoryOverview,
  MachineStatus,
} from '../../types';

export interface IrogSourceData {
  sectors: Array<{ id: string; code: string; name: string }>;
  lines: Array<{ id: string; code: string; name: string; sector_id: string }>;
  shifts: Array<{ id: string; name: string }>;
  products: Array<{ id: string; name: string }>;
  resources: Array<{ id: string; code: string; name: string; sector_id: string; line_id: string | null; active: boolean }>;
  events: Array<{
    id: string; resource_id: string; step_id: string | null; product_id: string | null; shift_id: string | null;
    operator_id: string | null; order_id: string | null; production_date: string; started_at: string | null;
    ended_at: string | null; worked_minutes: number | null; quantity: number; unit: string; net_weight_kg: number | null; source: string;
  }>;
  losses: Array<{ id: string; resource_id: string; production_date: string; quantity: number | null; unit: string | null; weight_kg: number | null; reason_id: string | null; reason_text: string | null; source: string; created_at: string }>;
  downtime: Array<{ id: string; resource_id: string | null; production_date: string | null; duration_minutes: number; reason: string; reason_id: string | null; status: string; started_at: string | null; created_at: string; source: string | null }>;
  calendars: Array<{ resource_id: string; weekday: number; shift_id: string; planned_minutes: number; valid_from: string; valid_to: string | null }>;
  exceptions: Array<{ resource_id: string | null; exception_date: string; shift_id: string | null; kind: string; minutes: number | null }>;
  standards: Array<{ resource_id: string; product_id: string | null; step_id: string | null; standard_type: 'rate_per_hour' | 'cycle_seconds'; value: number; unit: string; valid_from: string; valid_to: string | null }>;
  downtimeReasons: Array<{ id: string; name: string; category: string | null; is_planned: boolean }>;
  lossReasons: Array<{ id: string; name: string; category: string | null }>;
  goals: Array<{ metric: string; target_percent: number | null; sector_id: string | null; line_id: string | null; resource_id: string | null; active: boolean }>;
}

const DAY_MS = 86400000;
const BRT_OFFSET_MS = 3 * 3600000;
const dayStartMs = (date: string) => Date.parse(`${date}T00:00:00Z`) + BRT_OFFSET_MS;
const weekday = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
const pct = (v: number | null) => (v === null ? null : Number((v * 100).toFixed(2)));
const inRange = (date: string, from: string, to: string | null) => date >= from && (to === null || date <= to);

function isoWeek(date: string): string {
  const d = new Date(`${date}T12:00:00Z`);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-S${String(week).padStart(2, '0')}`;
}

interface Grain {
  resourceId: string;
  date: string;
  result: IrogResult;
  eventIds: string[];
  producedKg: number;
  lossKg: number;
  downtimeMinutes: number;
}

export function buildIrogOverview(data: IrogSourceData, filters: Partial<DashboardFilters>): IrogFactoryOverview {
  const start = filters.startDate || '0000-01-01';
  const end = filters.endDate || '9999-12-31';
  const lineById = new Map(data.lines.map((l) => [l.id, l]));
  const sectorById = new Map(data.sectors.map((s) => [s.id, s]));
  const reasonById = new Map(data.downtimeReasons.map((r) => [r.id, r]));
  const productName = new Map(data.products.map((p) => [p.id, p.name]));

  const resources = data.resources.filter(
    (r) =>
      r.active &&
      (!filters.sectorId || r.sector_id === filters.sectorId) &&
      (!filters.lineId || r.line_id === filters.lineId) &&
      (!filters.machineId || r.id === filters.machineId),
  );
  const resourceIds = new Set(resources.map((r) => r.id));
  const keep = (src: string | null | undefined) => filters.includeDemo !== false || src !== 'demo';

  const events = data.events.filter(
    (e) =>
      resourceIds.has(e.resource_id) && e.production_date >= start && e.production_date <= end && keep(e.source) &&
      (!filters.shiftId || e.shift_id === filters.shiftId) &&
      (!filters.productId || e.product_id === filters.productId) &&
      (!filters.operatorId || e.operator_id === filters.operatorId) &&
      (!filters.orderId || e.order_id === filters.orderId),
  );
  // Perdas e paradas do Iniflex são por recurso × dia: filtros de produto/OP/operador não se aplicam a elas.
  const losses = data.losses.filter((l) => resourceIds.has(l.resource_id) && l.production_date >= start && l.production_date <= end && keep(l.source));
  const downtime = data.downtime.filter(
    (d) => d.resource_id && resourceIds.has(d.resource_id) && d.production_date && d.production_date >= start && d.production_date <= end && keep(d.source),
  );

  // ---- Grãos recurso × dia (todo dia com produção, perda ou parada) ----
  const keys = new Set<string>();
  for (const e of events) keys.add(`${e.resource_id}|${e.production_date}`);
  for (const l of losses) keys.add(`${l.resource_id}|${l.production_date}`);
  for (const d of downtime) keys.add(`${d.resource_id}|${d.production_date}`);

  // Dias PROGRAMADOS sem nenhum apontamento também entram (máquina programada e parada = perda de
  // disponibilidade). Período: o filtro, ou o intervalo dos dados quando não há filtro de datas.
  const dataDates = [...keys].map((k) => k.split('|')[1]).sort();
  const from = filters.startDate || dataDates[0];
  const to = filters.endDate || dataDates.at(-1);
  if (from && to) {
    const todayBrt = new Date(Date.now() - BRT_OFFSET_MS).toISOString().slice(0, 10);
    const last = to < todayBrt ? to : todayBrt; // não conta dias futuros
    let day = 0;
    for (let t = Date.parse(`${from}T12:00:00Z`); day < 400; t += DAY_MS, day++) {
      const date = new Date(t).toISOString().slice(0, 10);
      if (date > last) break;
      for (const r of resources) {
        if (data.calendars.some((c) => c.resource_id === r.id && c.weekday === weekday(date) && inRange(date, c.valid_from, c.valid_to))) {
          keys.add(`${r.id}|${date}`);
        }
      }
    }
  }

  const grains: Grain[] = [];
  for (const key of keys) {
    const [resourceId, date] = key.split('|');
    const ws = dayStartMs(date);

    // Calendário do recurso no dia (null = não cadastrado)
    const cal = data.calendars.filter((c) => c.resource_id === resourceId && c.weekday === weekday(date) && inRange(date, c.valid_from, c.valid_to));
    const hasCalendar = data.calendars.some((c) => c.resource_id === resourceId);
    let calendarMinutes: number | null = hasCalendar ? cal.reduce((s, c) => s + c.planned_minutes, 0) : null;
    if (calendarMinutes !== null) {
      for (const x of data.exceptions.filter((x) => x.exception_date === date && (x.resource_id === null || x.resource_id === resourceId))) {
        const mins = x.minutes ?? null;
        if (x.kind === 'holiday' || x.kind === 'planned_stop') {
          // sem minutos informados = o período inteiro (o turno indicado ou, sem turno, o dia todo)
          const periodMinutes = x.shift_id ? cal.filter((c) => c.shift_id === x.shift_id).reduce((s, c) => s + c.planned_minutes, 0) : calendarMinutes;
          calendarMinutes = Math.max(0, calendarMinutes - (mins === null ? periodMinutes : mins));
        }
        if (x.kind === 'extra_shift') calendarMinutes += mins ?? 0;
      }
    }

    const gEvents = events.filter((e) => e.resource_id === resourceId && e.production_date === date);
    const gLosses = losses.filter((l) => l.resource_id === resourceId && l.production_date === date);
    const gDown = downtime.filter((d) => d.resource_id === resourceId && d.production_date === date);
    const standards: ResourceStandard[] = data.standards
      .filter((s) => s.resource_id === resourceId && inRange(date, s.valid_from, s.valid_to))
      .map((s) => ({ productId: s.product_id, stepId: s.step_id, type: s.standard_type, value: Number(s.value), unit: s.unit }));

    const result = calculateIrogGrain({
      resourceId,
      date,
      shiftId: null,
      calendarMinutes,
      window: { startMs: ws, endMs: ws + DAY_MS },
      qualityBasis: 'weight',
      standards,
      production: gEvents.map((e) => ({
        id: e.id,
        productId: e.product_id,
        stepId: e.step_id,
        quantity: Number(e.quantity),
        unit: e.unit,
        weightKg: e.net_weight_kg === null ? null : Number(e.net_weight_kg),
        startMs: e.started_at ? Date.parse(e.started_at) : null,
        endMs: e.ended_at ? Date.parse(e.ended_at) : null,
      })),
      losses: gLosses.map((l) => ({ id: l.id, productId: null, stepId: null, quantity: Number(l.weight_kg ?? l.quantity ?? 0), unit: l.weight_kg !== null ? 'kg' : l.unit ?? '' })),
      downtime: gDown.map((d) => ({
        id: d.id,
        minutes: Number(d.duration_minutes),
        isPlanned: d.reason_id && reasonById.has(d.reason_id) ? reasonById.get(d.reason_id)!.is_planned : null,
      })),
    });

    grains.push({
      resourceId,
      date,
      result,
      eventIds: gEvents.map((e) => e.id),
      producedKg: gEvents.reduce((s, e) => s + Number(e.net_weight_kg ?? 0), 0),
      lossKg: gLosses.reduce((s, l) => s + Number(l.weight_kg ?? 0), 0),
      downtimeMinutes: gDown.reduce((s, d) => s + Number(d.duration_minutes), 0),
    });
  }

  const goalFor = (level: string, id: string | null) => {
    const g = data.goals.find(
      (x) =>
        x.active && x.metric === 'irog' && x.target_percent !== null &&
        (level === 'machine' ? x.resource_id === id : level === 'line' ? x.line_id === id && !x.resource_id : level === 'sector' ? x.sector_id === id && !x.line_id && !x.resource_id : !x.sector_id && !x.line_id && !x.resource_id),
    );
    return g ? Number(g.target_percent) : null;
  };

  const metrics = (
    gs: Grain[],
    base: { id: string; code?: string; name: string; level: IrogEntityMetrics['level']; sectorId?: string; sectorName?: string; lineId?: string | null; lineName?: string | null; machineStatus?: MachineStatus },
  ): IrogEntityMetrics => {
    const c = consolidateIrog(gs.map((g) => g.result));
    const produced = gs.reduce((s, g) => s + g.producedKg, 0);
    const loss = gs.reduce((s, g) => s + g.lossKg, 0);
    const status: CalculationStatus =
      c.irog !== null ? 'complete' : c.availability !== null || c.performance !== null || c.quality !== null ? 'partial' : 'incomplete';
    const target = goalFor(base.level, base.level === 'factory' ? null : base.id);
    const irogPercent = pct(c.irog);
    const reasons = new Map<string, number>();
    for (const g of gs)
      for (const p of g.result.pending) {
        // agrupa por tipo de cadastro faltante (sem detalhar produto/etapa na lista)
        const key = `${p.message} Necessário: ${p.required.replace(/ para produto .*$/, '').replace(/ na unidade .*$/, ' na unidade do apontamento')}.`;
        reasons.set(key, (reasons.get(key) ?? 0) + Math.max(1, p.affectedRecords));
      }
    for (const g of gs)
      for (const w of g.result.warnings) {
        if (w.code !== 'PARADA_NAO_APONTADA' && w.code !== 'PERFORMANCE_ACIMA_100') continue;
        const key =
          w.code === 'PARADA_NAO_APONTADA'
            ? 'Aviso: tempo programado sem apontamento nem parada registrada (conta como parada não apontada).'
            : 'Aviso: performance acima de 100% — o padrão produtivo pode estar subestimado.';
        reasons.set(key, (reasons.get(key) ?? 0) + 1);
      }
    const ok = gs.filter((g) => g.result.status === 'ok');
    const sumT = (f: (g: Grain) => number | null) => gs.reduce((s, g) => s + (f(g) ?? 0), 0);
    return {
      ...base,
      theoreticalCapacityPerHour: null,
      irogPercent,
      availabilityPercent: pct(c.availability),
      performancePercent: pct(c.performance),
      qualityPercent: produced > 0 ? Number((((produced - loss) / produced) * 100).toFixed(2)) : null,
      plannedQuantity: 0,
      producedQuantity: Number(produced.toFixed(3)),
      approvedQuantity: Number((produced - loss).toFixed(3)),
      lossQuantity: Number(loss.toFixed(3)),
      plannedTimeMinutes: Math.round(sumT((g) => g.result.totals.scheduledMinutes)),
      operatingTimeMinutes: Math.round(sumT((g) => g.result.totals.operatingMinutes ?? g.result.totals.observedRunMinutes)),
      downtimeMinutes: Math.round(gs.reduce((s, g) => s + g.downtimeMinutes, 0)),
      targetIrogPercent: target,
      irogDeviationPercent: target !== null && irogPercent !== null ? Number((irogPercent - target).toFixed(2)) : null,
      goalAttainmentPercent: 0,
      status,
      recordsCount: gs.reduce((s, g) => s + g.eventIds.length, 0),
      incompleteCount: c.pendingGrains,
      memory: {
        methodology: `IROG = Disponibilidade × Performance × Qualidade, por recurso × dia (${IROG_CALC_VERSION}). Ver docs/irog-metodologia.md.`,
        normalizationMethod:
          'Quantidades convertidas em minutos padrão pelo padrão produtivo (produto × etapa × recurso); consolidação por soma de tempos, nunca média de percentuais. Qualidade por peso (kg), pois o Iniflex registra perdas só em kg.',
        plannedTimeMinutes: Math.round(sumT((g) => g.result.totals.calendarMinutes)),
        excludedPlannedDowntimeMinutes: Math.round(sumT((g) => g.result.totals.plannedStopMinutes)),
        effectivePlannedTimeMinutes: Math.round(sumT((g) => g.result.totals.scheduledMinutes)),
        unplannedDowntimeMinutes: Math.round(sumT((g) => g.result.totals.unplannedStopMinutes + g.result.totals.unrecordedStopMinutes)),
        operatingTimeMinutes: Math.round(ok.reduce((s, g) => s + (g.result.totals.operatingMinutes ?? 0), 0)),
        theoreticalOutput: null,
        standardEarnedMinutes: c.okGrains > 0 ? Number(c.idealMinutes.toFixed(1)) : null,
        producedQuantity: Number(produced.toFixed(3)),
        approvedQuantity: Number((produced - loss).toFixed(3)),
        lossQuantity: Number(loss.toFixed(3)),
        incompleteReasons: [...reasons].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} (${n} ocorrência${n > 1 ? 's' : ''})`),
        sourceRecordIds: gs.flatMap((g) => g.eventIds).slice(0, 500),
        cycleStandardsUsed: data.standards
          .filter((s) => gs.some((g) => g.resourceId === s.resource_id))
          .map((s) => {
            const r = data.resources.find((x) => x.id === s.resource_id);
            const perHour = s.standard_type === 'rate_per_hour' ? Number(s.value) : 3600 / Number(s.value);
            return { machineName: r?.name ?? s.resource_id, productName: s.product_id ? productName.get(s.product_id) ?? s.product_id : 'Todos os produtos', cycleTimeMinutes: Number((60 / perHour).toFixed(4)), capacityPerHour: perHour, source: 'cycle_standard' as const };
          }),
      },
    };
  };

  const openStop = new Set(data.downtime.filter((d) => d.status === 'open' && d.resource_id).map((d) => d.resource_id as string));
  const machineStatus = (id: string): MachineStatus => (openStop.has(id) ? 'stopped' : grains.some((g) => g.resourceId === id && g.eventIds.length > 0) ? 'operating' : 'idle');

  const machines = resources.map((r) => {
    const line = r.line_id ? lineById.get(r.line_id) : undefined;
    return metrics(grains.filter((g) => g.resourceId === r.id), {
      id: r.id, code: r.code, name: r.name, level: 'machine', sectorId: r.sector_id, sectorName: sectorById.get(r.sector_id)?.name,
      lineId: r.line_id, lineName: line?.name ?? null, machineStatus: machineStatus(r.id),
    });
  });
  const lineIds = [...new Set(resources.map((r) => r.line_id).filter((x): x is string => !!x))];
  const lines = lineIds.map((id) => {
    const l = lineById.get(id)!;
    const ids = new Set(resources.filter((r) => r.line_id === id).map((r) => r.id));
    return metrics(grains.filter((g) => ids.has(g.resourceId)), { id, code: l?.code, name: l?.name ?? id, level: 'line', sectorId: l?.sector_id, sectorName: sectorById.get(l?.sector_id)?.name, lineId: id, lineName: l?.name });
  });
  const sectorIds = [...new Set(resources.map((r) => r.sector_id))];
  const sectors = sectorIds.map((id) => {
    const ids = new Set(resources.filter((r) => r.sector_id === id).map((r) => r.id));
    const s = sectorById.get(id);
    return metrics(grains.filter((g) => ids.has(g.resourceId)), { id, code: s?.code, name: s?.name ?? id, level: 'sector', sectorId: id, sectorName: s?.name });
  });
  const factory = metrics(grains, { id: 'factory', name: 'Fábrica ForteFlex', level: 'factory' });

  // ---- Séries ----
  const series = (keyOf: (date: string) => string) => {
    const m = new Map<string, Grain[]>();
    for (const g of grains) {
      const k = keyOf(g.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(g);
    }
    return [...m].sort(([a], [b]) => a.localeCompare(b)).map(([period, gs]) => {
      const c = consolidateIrog(gs.map((g) => g.result));
      const kg = gs.reduce((s, g) => s + g.producedKg, 0);
      const loss = gs.reduce((s, g) => s + g.lossKg, 0);
      return { period, irog: pct(c.irog), availability: pct(c.availability), performance: pct(c.performance), quality: kg > 0 ? Number((((kg - loss) / kg) * 100).toFixed(2)) : null, realized: Math.round(kg) };
    });
  };

  const shiftName = new Map(data.shifts.map((s) => [s.id, s.name]));
  const byShiftMap = new Map<string, number>();
  for (const e of events) {
    const n = e.shift_id ? shiftName.get(e.shift_id) ?? e.shift_id : 'Turno não informado';
    byShiftMap.set(n, (byShiftMap.get(n) ?? 0) + Number(e.net_weight_kg ?? 0));
  }

  const dtReason = new Map<string, { reason: string; category: string; minutes: number; occurrences: number }>();
  for (const d of downtime) {
    const r = d.reason_id ? reasonById.get(d.reason_id) : undefined;
    const name = r?.name ?? d.reason ?? 'Sem motivo';
    const cur = dtReason.get(name) ?? { reason: name, category: r ? (r.is_planned ? 'Programada' : r.category ?? 'Não programada') : 'Sem classificação', minutes: 0, occurrences: 0 };
    cur.minutes += Number(d.duration_minutes);
    cur.occurrences += 1;
    dtReason.set(name, cur);
  }
  const lossReasonName = new Map(data.lossReasons.map((r) => [r.id, r]));
  const lsReason = new Map<string, { reason: string; category: string; quantity: number }>();
  for (const l of losses) {
    const r = l.reason_id ? lossReasonName.get(l.reason_id) : undefined;
    const name = r?.name ?? l.reason_text ?? (l.source === 'iniflex_report' ? 'Perda apontada no Iniflex (RPCP019)' : 'Sem motivo');
    const cur = lsReason.get(name) ?? { reason: name, category: r?.category ?? 'Sem classificação', quantity: 0 };
    cur.quantity += Number(l.weight_kg ?? l.quantity ?? 0);
    lsReason.set(name, cur);
  }

  const resName = new Map(data.resources.map((r) => [r.id, r.name]));
  const timeline = [
    ...events.map((e) => ({ id: e.id, timestamp: e.started_at ?? `${e.production_date}T00:00:00-03:00`, machineId: e.resource_id, machineName: resName.get(e.resource_id) ?? e.resource_id, eventType: 'start' as const, title: 'Apontamento de produção', detail: `${Number(e.quantity).toLocaleString('pt-BR')} ${e.unit} · ${Number(e.net_weight_kg ?? 0).toLocaleString('pt-BR')} kg` })),
    ...downtime.map((d) => ({ id: d.id, timestamp: d.started_at ?? `${d.production_date}T00:00:00-03:00`, machineId: d.resource_id, machineName: resName.get(d.resource_id ?? '') ?? '—', eventType: 'downtime' as const, title: d.status === 'open' ? 'Parada em aberto' : 'Parada', detail: `${d.reason} · ${d.duration_minutes} min` })),
    ...losses.map((l) => ({ id: l.id, timestamp: `${l.production_date}T23:59:00-03:00`, machineId: l.resource_id, machineName: resName.get(l.resource_id) ?? l.resource_id, eventType: 'loss' as const, title: 'Perda', detail: `${Number(l.weight_kg ?? l.quantity ?? 0).toLocaleString('pt-BR')} kg` })),
  ]
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 30);

  return {
    factory,
    machineCounts: {
      total: machines.length,
      operating: machines.filter((m) => m.machineStatus === 'operating').length,
      stopped: machines.filter((m) => m.machineStatus === 'stopped').length,
      maintenance: machines.filter((m) => m.machineStatus === 'maintenance').length,
      idle: machines.filter((m) => m.machineStatus === 'idle').length,
      belowTarget: machines.filter((m) => m.targetIrogPercent !== null && m.irogPercent !== null && m.irogPercent < m.targetIrogPercent).length,
    },
    sectors,
    lines,
    machines,
    charts: {
      dailyIrog: series((d) => d).map((x) => ({ date: x.period, irog: x.irog, availability: x.availability, performance: x.performance, quality: x.quality, planned: 0, realized: x.realized })),
      weeklyIrog: series(isoWeek).map(({ realized: _r, ...x }) => x),
      monthlyIrog: series((d) => d.slice(0, 7)).map(({ realized: _r, ...x }) => x),
      downtimeByReason: [...dtReason.values()].sort((a, b) => b.minutes - a.minutes),
      lossByReason: [...lsReason.values()].sort((a, b) => b.quantity - a.quantity),
      byShift: [...byShiftMap].map(([name, kg]) => ({ name, irog: null, availability: null, performance: null, quality: null, realized: Math.round(kg), planned: 0 })),
    },
    timelineEvents: timeline,
    demoRecordsCount: data.events.filter((e) => e.source === 'demo').length,
  };
}
