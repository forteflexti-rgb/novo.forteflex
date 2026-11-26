/**
 * Motor de cálculo do IROG FORTEFLEX.
 *
 * Função pura, sem acesso a banco: recebe os fatos de UM grão (recurso × dia × turno) e devolve
 * os componentes do IROG ou o motivo da pendência. É usada pelo frontend e pela Edge Function.
 *
 * Metodologia (docs/irog-metodologia.md):
 *   Tempo programado  = calendário − paradas programadas
 *   Tempo de operação = tempo programado − paradas não programadas
 *   Tempo padrão      = Σ quantidade ÷ taxa padrão (produto × etapa × recurso), em minutos
 *   Disponibilidade   = tempo de operação ÷ tempo programado
 *   Performance       = tempo padrão produzido ÷ tempo de operação
 *   Qualidade         = tempo padrão aprovado ÷ tempo padrão produzido
 *   IROG              = D × P × Q = tempo padrão aprovado ÷ tempo programado
 *
 * Converter tudo em "minutos padrão" permite somar produtos de unidades diferentes (kg, mil, mt)
 * sem misturar grandezas. Dado ausente NUNCA vira zero: o grão fica "pending" com o motivo.
 */

export const IROG_CALC_VERSION = 'irog-1.0.0';

export type StandardType = 'rate_per_hour' | 'cycle_seconds';

export interface ResourceStandard {
  productId: string | null; // null = padrão geral do recurso
  stepId: string | null; // null = qualquer etapa
  type: StandardType;
  value: number; // > 0
  unit: string; // unidade da quantidade a que o padrão se refere
}

export interface ProductionFact {
  id: string;
  productId: string | null;
  stepId: string | null;
  quantity: number;
  unit: string;
}

export interface LossFact {
  id: string;
  productId: string | null;
  stepId: string | null;
  quantity: number;
  unit: string;
}

export interface DowntimeFact {
  id: string;
  minutes: number;
  /** true = programada, false = não programada, null = sem classificação */
  isPlanned: boolean | null;
}

export interface IrogGrainInput {
  resourceId: string;
  date: string; // AAAA-MM-DD
  shiftId: string | null;
  /** Minutos do calendário do recurso no grão. null = calendário não cadastrado. */
  calendarMinutes: number | null;
  production: ProductionFact[];
  losses: LossFact[];
  downtime: DowntimeFact[];
  standards: ResourceStandard[];
}

export type PendingCode =
  | 'CALENDARIO_AUSENTE'
  | 'SEM_TEMPO_PROGRAMADO'
  | 'PARADA_SEM_CLASSIFICACAO'
  | 'PARADAS_EXCEDEM_CALENDARIO'
  | 'PADRAO_AUSENTE'
  | 'UNIDADE_INCOMPATIVEL'
  | 'PERDA_SEM_PRODUCAO_CORRESPONDENTE'
  | 'PERDA_MAIOR_QUE_PRODUCAO'
  | 'VALOR_INVALIDO';

export interface PendingReason {
  code: PendingCode;
  message: string;
  /** Cadastro ou parâmetro necessário para resolver. */
  required: string;
  affectedRecords: number;
  recordIds: string[];
}

export type WarningCode = 'PERFORMANCE_ACIMA_100' | 'SEM_PRODUCAO';

export interface IrogWarning {
  code: WarningCode;
  message: string;
}

/** Totais aditivos do grão — base da consolidação (nunca média de percentuais). */
export interface IrogTotals {
  calendarMinutes: number | null;
  plannedStopMinutes: number;
  unplannedStopMinutes: number;
  scheduledMinutes: number | null;
  operatingMinutes: number | null;
  idealMinutes: number | null; // tempo padrão de tudo que foi produzido
  idealGoodMinutes: number | null; // tempo padrão do que foi aprovado
}

export interface IrogResult {
  resourceId: string;
  date: string;
  shiftId: string | null;
  status: 'ok' | 'pending';
  availability: number | null; // 0..1
  performance: number | null;
  quality: number | null;
  irog: number | null;
  totals: IrogTotals;
  /** Quantidades por unidade (só para exibição; não são somadas entre unidades). */
  producedByUnit: Record<string, number>;
  lossByUnit: Record<string, number>;
  pending: PendingReason[];
  warnings: IrogWarning[];
  calcVersion: string;
}

const norm = (u: string) => u.trim().toLowerCase();
const isValidNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Padrão mais específico: produto+etapa > produto > etapa > geral. Precisa ser da mesma unidade. */
export function findStandard(
  standards: ResourceStandard[],
  productId: string | null,
  stepId: string | null,
): ResourceStandard | null {
  const score = (s: ResourceStandard): number => {
    if (s.productId !== null && s.productId !== productId) return -1;
    if (s.stepId !== null && s.stepId !== stepId) return -1;
    return (s.productId !== null ? 2 : 0) + (s.stepId !== null ? 1 : 0);
  };
  let best: ResourceStandard | null = null;
  let bestScore = -1;
  for (const s of standards) {
    const sc = score(s);
    if (sc > bestScore) {
      best = s;
      bestScore = sc;
    }
  }
  return best;
}

/** Minutos padrão para produzir `quantity` segundo o padrão. */
export function idealMinutesFor(quantity: number, std: ResourceStandard): number {
  return std.type === 'rate_per_hour' ? (quantity / std.value) * 60 : (quantity * std.value) / 60;
}

function addPending(list: PendingReason[], reason: Omit<PendingReason, 'affectedRecords'>) {
  const existing = list.find((p) => p.code === reason.code && p.required === reason.required);
  if (existing) {
    for (const id of reason.recordIds) if (!existing.recordIds.includes(id)) existing.recordIds.push(id);
    existing.affectedRecords = existing.recordIds.length;
  } else {
    list.push({ ...reason, affectedRecords: reason.recordIds.length });
  }
}

export function calculateIrogGrain(input: IrogGrainInput): IrogResult {
  const pending: PendingReason[] = [];
  const warnings: IrogWarning[] = [];
  const producedByUnit: Record<string, number> = {};
  const lossByUnit: Record<string, number> = {};

  // ---- Validação básica dos valores ----
  const invalidIds = [
    ...input.production.filter((p) => !isValidNumber(p.quantity) || p.quantity < 0).map((p) => p.id),
    ...input.losses.filter((l) => !isValidNumber(l.quantity) || l.quantity < 0).map((l) => l.id),
    ...input.downtime.filter((d) => !isValidNumber(d.minutes) || d.minutes < 0).map((d) => d.id),
  ];
  if (invalidIds.length > 0) {
    addPending(pending, {
      code: 'VALOR_INVALIDO',
      message: 'Há quantidades ou durações negativas ou não numéricas.',
      required: 'Corrigir os apontamentos de origem',
      recordIds: invalidIds,
    });
  }

  for (const p of input.production) if (isValidNumber(p.quantity)) producedByUnit[norm(p.unit)] = (producedByUnit[norm(p.unit)] ?? 0) + p.quantity;
  for (const l of input.losses) if (isValidNumber(l.quantity)) lossByUnit[norm(l.unit)] = (lossByUnit[norm(l.unit)] ?? 0) + l.quantity;

  // ---- Tempos ----
  let plannedStopMinutes = 0;
  let unplannedStopMinutes = 0;
  const unclassified: string[] = [];
  for (const d of input.downtime) {
    if (!isValidNumber(d.minutes) || d.minutes < 0) continue;
    if (d.isPlanned === null) unclassified.push(d.id);
    else if (d.isPlanned) plannedStopMinutes += d.minutes;
    else unplannedStopMinutes += d.minutes;
  }
  if (unclassified.length > 0) {
    addPending(pending, {
      code: 'PARADA_SEM_CLASSIFICACAO',
      message: 'Paradas sem motivo classificado como programada ou não programada.',
      required: 'Classificação de paradas (downtime_reasons.is_planned)',
      recordIds: unclassified,
    });
  }

  let scheduledMinutes: number | null = null;
  let operatingMinutes: number | null = null;
  if (input.calendarMinutes === null || !isValidNumber(input.calendarMinutes)) {
    addPending(pending, {
      code: 'CALENDARIO_AUSENTE',
      message: 'Recurso sem calendário de operação para este dia/turno.',
      required: 'Calendário de operação do recurso (work_calendars)',
      recordIds: [],
    });
  } else {
    scheduledMinutes = input.calendarMinutes - plannedStopMinutes;
    operatingMinutes = scheduledMinutes - unplannedStopMinutes;
    if (scheduledMinutes <= 0) {
      if (input.production.length > 0) {
        addPending(pending, {
          code: 'SEM_TEMPO_PROGRAMADO',
          message: 'Há produção apontada, mas o tempo programado é zero.',
          required: 'Revisar calendário ou exceções do dia',
          recordIds: input.production.map((p) => p.id),
        });
      }
    } else if (operatingMinutes < 0) {
      addPending(pending, {
        code: 'PARADAS_EXCEDEM_CALENDARIO',
        message: 'As paradas somam mais que o tempo programado.',
        required: 'Revisar durações das paradas ou o calendário',
        recordIds: input.downtime.map((d) => d.id),
      });
    }
  }

  // ---- Tempo padrão (performance) ----
  let idealMinutes = 0;
  const stdByKey = new Map<string, ResourceStandard | null>();
  const lookup = (productId: string | null, stepId: string | null) => {
    const key = `${productId ?? ''}|${stepId ?? ''}`;
    if (!stdByKey.has(key)) stdByKey.set(key, findStandard(input.standards, productId, stepId));
    return stdByKey.get(key)!;
  };

  for (const p of input.production) {
    if (!isValidNumber(p.quantity) || p.quantity < 0) continue;
    const std = lookup(p.productId, p.stepId);
    if (!std) {
      addPending(pending, {
        code: 'PADRAO_AUSENTE',
        message: 'Produto/etapa sem capacidade ou tempo de ciclo cadastrado neste recurso.',
        required: `Padrão produtivo (resource_standards) para produto ${p.productId ?? '—'} / etapa ${p.stepId ?? '—'}`,
        recordIds: [p.id],
      });
      continue;
    }
    if (!(std.value > 0)) {
      addPending(pending, {
        code: 'VALOR_INVALIDO',
        message: 'Padrão produtivo com valor zero ou negativo.',
        required: 'Corrigir o padrão produtivo',
        recordIds: [p.id],
      });
      continue;
    }
    if (norm(std.unit) !== norm(p.unit)) {
      addPending(pending, {
        code: 'UNIDADE_INCOMPATIVEL',
        message: `Apontamento em "${p.unit}" e padrão em "${std.unit}".`,
        required: `Padrão produtivo na unidade ${p.unit}`,
        recordIds: [p.id],
      });
      continue;
    }
    idealMinutes += idealMinutesFor(p.quantity, std);
  }

  // ---- Qualidade: perdas convertidas em minutos padrão ----
  let lossIdealMinutes = 0;
  for (const l of input.losses) {
    if (!isValidNumber(l.quantity) || l.quantity < 0) continue;
    const matching = input.production.filter(
      (p) => norm(p.unit) === norm(l.unit) && (l.productId === null || p.productId === l.productId),
    );
    if (matching.length === 0) {
      addPending(pending, {
        code: 'PERDA_SEM_PRODUCAO_CORRESPONDENTE',
        message: 'Perda sem produção do mesmo produto e unidade neste grão.',
        required: 'Vincular a perda ao produto/apontamento correto',
        recordIds: [l.id],
      });
      continue;
    }
    // Perda sem produto só é convertível se todo o produzido nessa unidade usa o mesmo padrão.
    const stds = new Set(matching.map((p) => lookup(p.productId, p.stepId)));
    const std = l.productId !== null || stds.size === 1 ? lookup(l.productId ?? matching[0].productId, l.stepId ?? matching[0].stepId) : null;
    if (!std) {
      addPending(pending, {
        code: stds.size > 1 ? 'UNIDADE_INCOMPATIVEL' : 'PADRAO_AUSENTE',
        message: stds.size > 1
          ? 'Perda sem produto em grão com produtos de padrões diferentes: não é possível converter.'
          : 'Produto da perda sem padrão produtivo.',
        required: stds.size > 1 ? 'Informar o produto da perda' : 'Padrão produtivo do produto',
        recordIds: [l.id],
      });
      continue;
    }
    if (norm(std.unit) !== norm(l.unit)) {
      addPending(pending, {
        code: 'UNIDADE_INCOMPATIVEL',
        message: `Perda em "${l.unit}" e padrão em "${std.unit}".`,
        required: `Padrão produtivo na unidade ${l.unit}`,
        recordIds: [l.id],
      });
      continue;
    }
    lossIdealMinutes += idealMinutesFor(l.quantity, std);
  }

  for (const [unit, loss] of Object.entries(lossByUnit)) {
    if (loss > (producedByUnit[unit] ?? 0) + 1e-9) {
      addPending(pending, {
        code: 'PERDA_MAIOR_QUE_PRODUCAO',
        message: `Perda (${loss} ${unit}) maior que a produção (${producedByUnit[unit] ?? 0} ${unit}).`,
        required: 'Conferir se a perda já está incluída ou duplicada na produção',
        recordIds: input.losses.filter((l) => norm(l.unit) === unit).map((l) => l.id),
      });
    }
  }

  if (input.production.length === 0) {
    warnings.push({ code: 'SEM_PRODUCAO', message: 'Nenhuma produção apontada no grão.' });
  }

  const idealGoodMinutes = idealMinutes - lossIdealMinutes;
  const totals: IrogTotals = {
    calendarMinutes: input.calendarMinutes,
    plannedStopMinutes,
    unplannedStopMinutes,
    scheduledMinutes,
    operatingMinutes,
    idealMinutes: pending.length === 0 ? idealMinutes : null,
    idealGoodMinutes: pending.length === 0 ? idealGoodMinutes : null,
  };

  const base = {
    resourceId: input.resourceId,
    date: input.date,
    shiftId: input.shiftId,
    totals,
    producedByUnit,
    lossByUnit,
    pending,
    warnings,
    calcVersion: IROG_CALC_VERSION,
  };

  if (pending.length > 0 || scheduledMinutes === null || operatingMinutes === null || scheduledMinutes <= 0) {
    // Recurso sem programação e sem produção: grão legítimo "fora de operação", sem IROG.
    return { ...base, status: pending.length > 0 ? 'pending' : 'ok', availability: null, performance: null, quality: null, irog: null };
  }

  const availability = operatingMinutes / scheduledMinutes;
  const performance = operatingMinutes > 0 ? idealMinutes / operatingMinutes : null;
  const quality = idealMinutes > 0 ? idealGoodMinutes / idealMinutes : null;
  if (performance !== null && performance > 1) {
    warnings.push({
      code: 'PERFORMANCE_ACIMA_100',
      message: `Performance de ${(performance * 100).toFixed(1)}%: o padrão produtivo pode estar subestimado.`,
    });
  }
  const irog = idealGoodMinutes / scheduledMinutes;

  return { ...base, status: 'ok', availability, performance, quality, irog };
}

// ---------------------------------------------------------------------------
// Consolidação (linha, setor, fábrica, período)
// ---------------------------------------------------------------------------
export interface IrogConsolidated {
  grains: number;
  okGrains: number;
  pendingGrains: number;
  /** Fração do tempo programado coberta por grãos calculados. */
  coverage: number | null;
  scheduledMinutes: number;
  operatingMinutes: number;
  idealMinutes: number;
  idealGoodMinutes: number;
  availability: number | null;
  performance: number | null;
  quality: number | null;
  irog: number | null;
  pendingByCode: Partial<Record<PendingCode, number>>;
}

/**
 * Consolida grãos somando tempos (nunca média de percentuais). Só grãos "ok" entram nos indicadores;
 * os pendentes são contados para que a tela mostre a cobertura e os motivos.
 */
export function consolidateIrog(results: IrogResult[]): IrogConsolidated {
  let scheduled = 0;
  let operating = 0;
  let ideal = 0;
  let idealGood = 0;
  let pendingScheduled = 0;
  let okGrains = 0;
  const pendingByCode: Partial<Record<PendingCode, number>> = {};

  for (const r of results) {
    if (r.status === 'pending') {
      pendingScheduled += r.totals.scheduledMinutes ?? 0;
      // motivos sem registro associado (ex.: calendário ausente) contam 1 por grão
      for (const p of r.pending) pendingByCode[p.code] = (pendingByCode[p.code] ?? 0) + Math.max(1, p.affectedRecords);
      continue;
    }
    if (r.irog === null) continue; // fora de operação
    okGrains++;
    scheduled += r.totals.scheduledMinutes ?? 0;
    operating += r.totals.operatingMinutes ?? 0;
    ideal += r.totals.idealMinutes ?? 0;
    idealGood += r.totals.idealGoodMinutes ?? 0;
  }

  const totalScheduled = scheduled + pendingScheduled;
  return {
    grains: results.length,
    okGrains,
    pendingGrains: results.filter((r) => r.status === 'pending').length,
    coverage: totalScheduled > 0 ? scheduled / totalScheduled : null,
    scheduledMinutes: scheduled,
    operatingMinutes: operating,
    idealMinutes: ideal,
    idealGoodMinutes: idealGood,
    availability: scheduled > 0 ? operating / scheduled : null,
    performance: operating > 0 ? ideal / operating : null,
    quality: ideal > 0 ? idealGood / ideal : null,
    irog: scheduled > 0 ? idealGood / scheduled : null,
    pendingByCode,
  };
}
