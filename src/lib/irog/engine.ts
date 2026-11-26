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

export const IROG_CALC_VERSION = 'irog-1.2.0';

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
  /** Peso líquido (kg) — base da qualidade por peso. */
  weightKg?: number | null;
  /** Início e fim do apontamento (ms desde epoch) — base do tempo de operação observado. */
  startMs?: number | null;
  endMs?: number | null;
}

export interface LossFact {
  id: string;
  productId: string | null;
  stepId: string | null;
  quantity: number;
  unit: string;
}

/** Duração máxima aceita para um único apontamento (acima disso é erro de digitação/fechamento). */
export const MAX_EVENT_MINUTES = 24 * 60;

/**
 * Minutos cobertos pela UNIÃO dos intervalos, recortados na janela do grão.
 * Apontamentos sobrepostos no mesmo recurso não contam o tempo duas vezes.
 */
export function unionMinutes(intervals: Array<[number, number]>, windowStart: number, windowEnd: number): number {
  const clipped = intervals
    .map(([a, b]) => [Math.max(a, windowStart), Math.min(b, windowEnd)] as [number, number])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let curStart = -Infinity;
  let curEnd = -Infinity;
  for (const [a, b] of clipped) {
    if (a > curEnd) {
      if (curEnd > curStart) total += curEnd - curStart;
      curStart = a;
      curEnd = b;
    } else if (b > curEnd) {
      curEnd = b;
    }
  }
  if (curEnd > curStart) total += curEnd - curStart;
  return total / 60000;
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
  /**
   * Janela do grão (ms). Quando informada, o tempo de operação passa a ser limitado pela união dos
   * horários apontados: tempo programado sem nenhum apontamento é tratado como parada não apontada.
   */
  window?: { startMs: number; endMs: number } | null;
  /**
   * Base da qualidade. 'weight' (padrão ForteFlex): (kg produzido − kg perdido) ÷ kg produzido,
   * porque o Iniflex registra as perdas só em kg. 'quantity': perdas convertidas pelo padrão produtivo.
   */
  qualityBasis?: 'weight' | 'quantity';
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
  | 'APONTAMENTO_DURACAO_INVALIDA'
  | 'PESO_AUSENTE'
  | 'VALOR_INVALIDO';

/** Componente do IROG que a pendência impede de calcular. */
export type PendingComponent = 'time' | 'performance' | 'quality' | 'all';

export interface PendingReason {
  code: PendingCode;
  message: string;
  /** Cadastro ou parâmetro necessário para resolver. */
  required: string;
  affectedRecords: number;
  recordIds: string[];
  component: PendingComponent;
}

const COMPONENT_OF: Record<PendingCode, PendingComponent> = {
  CALENDARIO_AUSENTE: 'time',
  SEM_TEMPO_PROGRAMADO: 'time',
  PARADA_SEM_CLASSIFICACAO: 'time',
  PARADAS_EXCEDEM_CALENDARIO: 'time',
  APONTAMENTO_DURACAO_INVALIDA: 'time',
  PADRAO_AUSENTE: 'performance',
  UNIDADE_INCOMPATIVEL: 'performance',
  PERDA_SEM_PRODUCAO_CORRESPONDENTE: 'quality',
  PERDA_MAIOR_QUE_PRODUCAO: 'quality',
  PESO_AUSENTE: 'quality',
  VALOR_INVALIDO: 'all',
};

export type WarningCode = 'PERFORMANCE_ACIMA_100' | 'SEM_PRODUCAO' | 'PRODUCAO_FORA_DO_CALENDARIO' | 'PARADA_NAO_APONTADA';

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
  /** União dos horários apontados dentro da janela (null = sem janela/horários). */
  observedRunMinutes: number | null;
  /** Tempo programado sem apontamento nem parada registrada (tratado como parada não programada). */
  unrecordedStopMinutes: number;
  producedWeightKg: number | null;
  lossWeightKg: number | null;
  idealMinutes: number | null; // tempo padrão de tudo que foi produzido
  idealGoodMinutes: number | null; // tempo padrão do que foi aprovado
}

export interface IrogResult {
  resourceId: string;
  date: string;
  shiftId: string | null;
  status: 'ok' | 'pending';
  /** Quais componentes são válidos neste grão (mesmo com outras pendências). */
  components: { availability: boolean; performance: boolean; quality: boolean };
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

function addPending(
  list: PendingReason[],
  reason: Omit<PendingReason, 'affectedRecords' | 'component'> & { component?: PendingComponent },
) {
  const component = reason.component ?? COMPONENT_OF[reason.code];
  const existing = list.find((p) => p.code === reason.code && p.required === reason.required && p.component === component);
  if (existing) {
    for (const id of reason.recordIds) if (!existing.recordIds.includes(id)) existing.recordIds.push(id);
    existing.affectedRecords = existing.recordIds.length;
  } else {
    list.push({ ...reason, component, affectedRecords: reason.recordIds.length });
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

  // ---- Tempo de operação observado (união dos horários apontados) ----
  let observedRunMinutes: number | null = null;
  let unrecordedStopMinutes = 0;
  if (input.window) {
    const intervals: Array<[number, number]> = [];
    const badDuration: string[] = [];
    let withTimes = 0;
    for (const p of input.production) {
      if (!isValidNumber(p.startMs) || !isValidNumber(p.endMs)) continue;
      withTimes++;
      const minutes = (p.endMs - p.startMs) / 60000;
      if (minutes < 0 || minutes > MAX_EVENT_MINUTES) badDuration.push(p.id);
      else intervals.push([p.startMs, p.endMs]);
    }
    if (badDuration.length > 0) {
      addPending(pending, {
        code: 'APONTAMENTO_DURACAO_INVALIDA',
        message: `Apontamento com duração negativa ou acima de ${MAX_EVENT_MINUTES / 60} h.`,
        required: 'Corrigir início/fim do apontamento no ERP',
        recordIds: badDuration,
      });
    }
    if (withTimes > 0 || input.production.length === 0) {
      observedRunMinutes = unionMinutes(intervals, input.window.startMs, input.window.endMs);
      if (operatingMinutes !== null && scheduledMinutes !== null && scheduledMinutes > 0 && operatingMinutes >= 0) {
        if (observedRunMinutes < operatingMinutes) {
          unrecordedStopMinutes = operatingMinutes - observedRunMinutes;
          operatingMinutes = observedRunMinutes;
          warnings.push({
            code: 'PARADA_NAO_APONTADA',
            message: `${Math.round(unrecordedStopMinutes)} min programados sem apontamento nem parada registrada.`,
          });
        } else if (observedRunMinutes > operatingMinutes + 1) {
          warnings.push({
            code: 'PRODUCAO_FORA_DO_CALENDARIO',
            message: `${Math.round(observedRunMinutes - operatingMinutes)} min apontados além do tempo programado.`,
          });
        }
      }
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

  // ---- Qualidade ----
  const basis = input.qualityBasis ?? 'quantity';
  let lossIdealMinutes = 0;
  let producedWeightKg: number | null = null;
  let lossWeightKg: number | null = null;
  let weightQuality: number | null = null;

  if (basis === 'weight') {
    const noWeight = input.production.filter((p) => !isValidNumber(p.weightKg) || (p.weightKg as number) < 0).map((p) => p.id);
    if (noWeight.length > 0) {
      addPending(pending, {
        code: 'PESO_AUSENTE',
        message: 'Apontamento sem peso líquido: a qualidade por peso não pode ser calculada.',
        required: 'Peso líquido (kg) no apontamento',
        recordIds: noWeight,
      });
    }
    const nonKgLoss = input.losses.filter((l) => norm(l.unit) !== 'kg').map((l) => l.id);
    if (nonKgLoss.length > 0) {
      addPending(pending, {
        component: 'quality',
        code: 'UNIDADE_INCOMPATIVEL',
        message: 'Qualidade por peso exige perdas em kg.',
        required: 'Perda informada em kg',
        recordIds: nonKgLoss,
      });
    }
    producedWeightKg = input.production.reduce((s, p) => s + (isValidNumber(p.weightKg) ? p.weightKg : 0), 0);
    lossWeightKg = input.losses.filter((l) => norm(l.unit) === 'kg' && isValidNumber(l.quantity)).reduce((s, l) => s + l.quantity, 0);
    if (lossWeightKg > producedWeightKg + 1e-9) {
      addPending(pending, {
        code: 'PERDA_MAIOR_QUE_PRODUCAO',
        message: `Perda (${lossWeightKg} kg) maior que a produção (${producedWeightKg} kg).`,
        required: 'Conferir se a perda já está incluída ou duplicada na produção',
        recordIds: input.losses.map((l) => l.id),
      });
    }
    weightQuality = producedWeightKg > 0 ? (producedWeightKg - lossWeightKg) / producedWeightKg : null;
  }

  for (const l of basis === 'quantity' ? input.losses : []) {
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
        component: 'quality',
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
        component: 'quality',
        code: 'UNIDADE_INCOMPATIVEL',
        message: `Perda em "${l.unit}" e padrão em "${std.unit}".`,
        required: `Padrão produtivo na unidade ${l.unit}`,
        recordIds: [l.id],
      });
      continue;
    }
    lossIdealMinutes += idealMinutesFor(l.quantity, std);
  }

  for (const [unit, loss] of basis === 'quantity' ? Object.entries(lossByUnit) : []) {
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

  const idealGoodMinutes =
    basis === 'weight' ? (weightQuality === null ? 0 : idealMinutes * weightQuality) : idealMinutes - lossIdealMinutes;
  const totals: IrogTotals = {
    calendarMinutes: input.calendarMinutes,
    plannedStopMinutes,
    unplannedStopMinutes,
    scheduledMinutes,
    operatingMinutes,
    observedRunMinutes,
    unrecordedStopMinutes,
    producedWeightKg,
    lossWeightKg,
    idealMinutes: null,
    idealGoodMinutes: null,
  };

  // ---- Validade por componente ----
  const blocks = (c: PendingComponent) => pending.some((p) => p.component === c || p.component === 'all');
  const timeOk =
    !blocks('time') && scheduledMinutes !== null && operatingMinutes !== null && scheduledMinutes > 0 && operatingMinutes >= 0;
  const perfOk = timeOk && !blocks('performance');
  const qualOk = !blocks('quality') && (basis === 'weight' || perfOk);
  totals.idealMinutes = perfOk ? idealMinutes : null;
  totals.idealGoodMinutes = perfOk && qualOk ? idealGoodMinutes : null;

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

  // Cada componente é calculado quando os SEUS dados são válidos; o IROG só sem nenhuma pendência.
  // Grão sem programação e sem produção ("fora de operação") fica com tudo nulo e status ok.
  const availability = timeOk ? (operatingMinutes as number) / (scheduledMinutes as number) : null;
  const performance = perfOk && (operatingMinutes as number) > 0 ? idealMinutes / (operatingMinutes as number) : null;
  const quality = !qualOk ? null : basis === 'weight' ? weightQuality : idealMinutes > 0 ? idealGoodMinutes / idealMinutes : null;
  if (performance !== null && performance > 1) {
    warnings.push({
      code: 'PERFORMANCE_ACIMA_100',
      message: `Performance de ${(performance * 100).toFixed(1)}%: o padrão produtivo pode estar subestimado.`,
    });
  }
  const irog = pending.length === 0 && timeOk ? idealGoodMinutes / (scheduledMinutes as number) : null;

  return {
    ...base,
    status: pending.length > 0 ? 'pending' : 'ok',
    components: { availability: timeOk, performance: perfOk, quality: qualOk },
    availability,
    performance,
    quality,
    irog,
  };
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
 * Consolida grãos somando tempos (nunca média de percentuais), componente a componente:
 *  - Disponibilidade: grãos com tempo válido (calendário, paradas e horários ok);
 *  - Performance: grãos com tempo e padrão produtivo válidos;
 *  - Qualidade: grãos com peso/perdas válidos (kg produzido − kg perdido) ÷ kg produzido;
 *  - IROG: SOMENTE quando nenhum grão do escopo tem pendência — senão fica nulo (pendente), nunca
 *    calculado só com a parte que sobrou (ex.: só os dias parados daria IROG 0, o que é falso).
 */
export function consolidateIrog(results: IrogResult[]): IrogConsolidated {
  let schedA = 0;
  let operA = 0;
  let operP = 0;
  let idealP = 0;
  let prodKg = 0;
  let lossKg = 0;
  let idealQ = 0;
  let goodQ = 0;
  let schedI = 0;
  let goodI = 0;
  let totalScheduled = 0;
  let okGrains = 0;
  let pendingGrains = 0;
  const pendingByCode: Partial<Record<PendingCode, number>> = {};

  for (const r of results) {
    const t = r.totals;
    totalScheduled += t.scheduledMinutes && t.scheduledMinutes > 0 ? t.scheduledMinutes : 0;
    if (r.status === 'pending') {
      pendingGrains++;
      // motivos sem registro associado (ex.: calendário ausente) contam 1 por grão
      for (const p of r.pending) pendingByCode[p.code] = (pendingByCode[p.code] ?? 0) + Math.max(1, p.affectedRecords);
    }
    if (r.components.availability) {
      schedA += t.scheduledMinutes ?? 0;
      operA += t.operatingMinutes ?? 0;
    }
    if (r.components.performance) {
      operP += t.operatingMinutes ?? 0;
      idealP += t.idealMinutes ?? 0;
    }
    if (r.components.quality) {
      if (t.producedWeightKg !== null) {
        prodKg += t.producedWeightKg;
        lossKg += t.lossWeightKg ?? 0;
      } else if (t.idealMinutes !== null && t.idealGoodMinutes !== null) {
        idealQ += t.idealMinutes;
        goodQ += t.idealGoodMinutes;
      }
    }
    if (r.status === 'ok' && r.irog !== null) {
      okGrains++;
      schedI += t.scheduledMinutes ?? 0;
      goodI += t.idealGoodMinutes ?? 0;
    }
  }

  const complete = pendingGrains === 0;
  const quality = prodKg > 0 ? (prodKg - lossKg) / prodKg : idealQ > 0 ? goodQ / idealQ : null;
  return {
    grains: results.length,
    okGrains,
    pendingGrains,
    coverage: totalScheduled > 0 ? schedI / totalScheduled : null,
    scheduledMinutes: schedA,
    operatingMinutes: operA,
    idealMinutes: idealP,
    idealGoodMinutes: goodI,
    availability: schedA > 0 ? operA / schedA : null,
    performance: operP > 0 ? idealP / operP : null,
    quality,
    irog: complete && schedI > 0 ? goodI / schedI : null,
    pendingByCode,
  };
}
