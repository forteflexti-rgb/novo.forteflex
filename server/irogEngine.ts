import type {
  CalculationStatus,
  IrogCalculationMemory,
  IrogEntityMetrics,
  MachineStatus,
} from '../src/types';

export interface RawIrogRecordInput {
  id: string;
  production_date: string;
  shift_id: string;
  shift_name: string;
  sector_id: string;
  sector_name: string;
  line_id: string;
  line_name: string;
  machine_id: string | null;
  machine_code: string | null;
  machine_name: string | null;
  machine_status?: MachineStatus;
  machine_capacity_per_hour?: number | null;
  product_id: string;
  product_name: string;
  stage_id?: string | null;
  planned_quantity: number;
  produced_quantity: number;
  approved_quantity: number;
  loss_quantity: number;
  planned_time_minutes: number | null;
  cycle_time_minutes: number | null; // From cycle_time_standards for (product, stage, machine) or null
  cycle_source: 'cycle_standard' | 'machine_capacity' | 'missing';
  included_downtime_minutes: number; // Unplanned stops counting against availability
  excluded_downtime_minutes: number; // Planned stops excluded from availability denominator
  is_complete_record: boolean;
  incomplete_reason?: string;
}

export interface GoalLookup {
  targetIrogPercent: number | null;
}

interface InternalAccumulator {
  id: string;
  code?: string;
  name: string;
  level: 'factory' | 'sector' | 'line' | 'machine';
  sectorId?: string;
  sectorName?: string;
  lineId?: string | null;
  lineName?: string | null;
  machineStatus?: MachineStatus;
  theoreticalCapacityPerHour?: number | null;
  plannedTimeMinutes: number;
  excludedDowntimeMinutes: number;
  effectivePlannedTimeMinutes: number;
  unplannedDowntimeMinutes: number;
  operatingTimeMinutes: number;
  // Normalized time-equivalent metrics for mathematically valid cross-machine consolidation:
  standardEarnedMinutes: number; // Sum(produced * cycleTimeMinutes)
  standardApprovedMinutes: number; // Sum(approved * cycleTimeMinutes)
  validPerformanceOperatingMinutes: number; // Operating time across records that have valid cycle times
  validQualityProducedQty: number;
  validQualityApprovedQty: number;
  homogeneousUnits: Set<string>;
  plannedQuantity: number;
  producedQuantity: number;
  approvedQuantity: number;
  lossQuantity: number;
  recordsCount: number;
  incompleteCount: number;
  incompleteReasons: Set<string>;
  sourceRecordIds: string[];
  cycleStandardsUsed: Map<
    string,
    {
      machineName: string;
      productName: string;
      cycleTimeMinutes: number;
      capacityPerHour: number;
      source: 'cycle_standard' | 'machine_capacity' | 'missing';
    }
  >;
}

function createAccumulator(
  id: string,
  name: string,
  level: 'factory' | 'sector' | 'line' | 'machine',
  meta?: Partial<InternalAccumulator>
): InternalAccumulator {
  return {
    id,
    name,
    level,
    plannedTimeMinutes: 0,
    excludedDowntimeMinutes: 0,
    effectivePlannedTimeMinutes: 0,
    unplannedDowntimeMinutes: 0,
    operatingTimeMinutes: 0,
    standardEarnedMinutes: 0,
    standardApprovedMinutes: 0,
    validPerformanceOperatingMinutes: 0,
    validQualityProducedQty: 0,
    validQualityApprovedQty: 0,
    homogeneousUnits: new Set<string>(),
    plannedQuantity: 0,
    producedQuantity: 0,
    approvedQuantity: 0,
    lossQuantity: 0,
    recordsCount: 0,
    incompleteCount: 0,
    incompleteReasons: new Set<string>(),
    sourceRecordIds: [],
    cycleStandardsUsed: new Map(),
    ...meta,
  };
}

function round2(n: number): number {
  return Number(n.toFixed(2));
}

export function accumulateRecord(
  acc: InternalAccumulator,
  rec: RawIrogRecordInput,
  unitOfMeasure = 'kg'
): void {
  acc.recordsCount += 1;
  acc.sourceRecordIds.push(rec.id);
  acc.homogeneousUnits.add(unitOfMeasure);

  if (!rec.is_complete_record) {
    acc.incompleteCount += 1;
    acc.incompleteReasons.add(
      rec.incomplete_reason || 'Registro incompleto excluído da consolidação válida'
    );
    return;
  }

  // Rule 4 & 5: Do not treat unknown planned time as 0 or valid
  if (rec.planned_time_minutes === null || rec.planned_time_minutes <= 0) {
    acc.incompleteCount += 1;
    acc.incompleteReasons.add(
      `Tempo planejado não configurado para ${rec.machine_name || 'registro ' + rec.id}`
    );
    return;
  }

  if (rec.approved_quantity > rec.produced_quantity) {
    acc.incompleteCount += 1;
    acc.incompleteReasons.add(
      `Registro ${rec.id} inconsistente: aprovado (${rec.approved_quantity}) maior que produzido (${rec.produced_quantity})`
    );
    return;
  }

  const effectivePlanned = Math.max(0, rec.planned_time_minutes - rec.excluded_downtime_minutes);
  const operating = Math.max(0, effectivePlanned - rec.included_downtime_minutes);

  acc.plannedTimeMinutes += rec.planned_time_minutes;
  acc.excludedDowntimeMinutes += rec.excluded_downtime_minutes;
  acc.effectivePlannedTimeMinutes += effectivePlanned;
  acc.unplannedDowntimeMinutes += rec.included_downtime_minutes;
  acc.operatingTimeMinutes += operating;

  acc.plannedQuantity += rec.planned_quantity;
  acc.producedQuantity += rec.produced_quantity;
  acc.approvedQuantity += rec.approved_quantity;
  acc.lossQuantity += rec.loss_quantity;

  // Quality quantities (always valid if produced >= 0)
  if (rec.produced_quantity > 0) {
    acc.validQualityProducedQty += rec.produced_quantity;
    acc.validQualityApprovedQty += rec.approved_quantity;
  }

  const stdKey = `${rec.machine_id || 'none'}|${rec.product_id}`;
  if (rec.cycle_time_minutes !== null && rec.cycle_time_minutes > 0) {
    const capPerHour = Number((60 / rec.cycle_time_minutes).toFixed(2));
    acc.cycleStandardsUsed.set(stdKey, {
      machineName: rec.machine_name || 'Sem máquina',
      productName: rec.product_name,
      cycleTimeMinutes: rec.cycle_time_minutes,
      capacityPerHour: capPerHour,
      source: rec.cycle_source,
    });

    // Standard earned machine-minutes normalizes heterogeneous products/units
    if (operating > 0) {
      acc.standardEarnedMinutes += rec.produced_quantity * rec.cycle_time_minutes;
      acc.standardApprovedMinutes += rec.approved_quantity * rec.cycle_time_minutes;
      acc.validPerformanceOperatingMinutes += operating;
    }
  } else {
    acc.incompleteCount += 1;
    acc.incompleteReasons.add(
      `Tempo de ciclo padrão / capacidade não cadastrada para ${rec.product_name} em ${rec.machine_name || 'máquina não informada'}`
    );
    acc.cycleStandardsUsed.set(stdKey, {
      machineName: rec.machine_name || 'Sem máquina',
      productName: rec.product_name,
      cycleTimeMinutes: 0,
      capacityPerHour: 0,
      source: 'missing',
    });
  }
}

export function finalizeAccumulator(
  acc: InternalAccumulator,
  goal?: GoalLookup
): IrogEntityMetrics {
  const availabilityPercent =
    acc.effectivePlannedTimeMinutes > 0
      ? round2((acc.operatingTimeMinutes / acc.effectivePlannedTimeMinutes) * 100)
      : null;

  // Normalized performance across products/units using Standard Earned Minutes / Valid Operating Minutes
  const performancePercent =
    acc.validPerformanceOperatingMinutes > 0
      ? round2((acc.standardEarnedMinutes / acc.validPerformanceOperatingMinutes) * 100)
      : null;

  // Quality weighted by standard minutes when mixed units exist, or exact unit ratio when homogeneous
  let qualityPercent: number | null = null;
  if (acc.homogeneousUnits.size <= 1) {
    if (acc.validQualityProducedQty > 0) {
      qualityPercent = round2((acc.validQualityApprovedQty / acc.validQualityProducedQty) * 100);
    }
  } else if (acc.standardEarnedMinutes > 0) {
    qualityPercent = round2((acc.standardApprovedMinutes / acc.standardEarnedMinutes) * 100);
  } else if (acc.validQualityProducedQty > 0) {
    qualityPercent = round2((acc.validQualityApprovedQty / acc.validQualityProducedQty) * 100);
  }

  let irogPercent: number | null = null;
  if (availabilityPercent !== null && performancePercent !== null && qualityPercent !== null) {
    irogPercent = round2(
      (availabilityPercent / 100) * (performancePercent / 100) * (qualityPercent / 100) * 100
    );
  }

  let status: CalculationStatus = 'complete';
  if (irogPercent === null || acc.recordsCount === 0) {
    status = 'incomplete';
  } else if (acc.incompleteCount > 0) {
    status = 'partial';
  }

  const targetIrogPercent = goal?.targetIrogPercent ?? null;
  const irogDeviationPercent =
    irogPercent !== null && targetIrogPercent !== null
      ? round2(irogPercent - targetIrogPercent)
      : null;

  const goalAttainmentPercent =
    acc.plannedQuantity > 0 ? round2((acc.producedQuantity / acc.plannedQuantity) * 100) : 0;

  // Theoretical output equivalent in operating time if single cycle or documented aggregate
  const theoreticalOutput =
    acc.cycleStandardsUsed.size === 1 && acc.operatingTimeMinutes > 0
      ? (() => {
          const only = Array.from(acc.cycleStandardsUsed.values())[0];
          return only.cycleTimeMinutes > 0
            ? round2(acc.operatingTimeMinutes / only.cycleTimeMinutes)
            : null;
        })()
      : null;

  const memory: IrogCalculationMemory = {
    methodology: 'IROG = Disponibilidade × Desempenho × Qualidade',
    normalizationMethod:
      acc.level === 'machine' && acc.cycleStandardsUsed.size <= 1
        ? 'Cálculo direto por tempo de ciclo padrão do recurso'
        : 'Consolidação ponderada por tempo padrão ganho (Σ Qtd × Ciclo Padrão / Σ Tempo em Operação)',
    plannedTimeMinutes: acc.plannedTimeMinutes,
    excludedPlannedDowntimeMinutes: acc.excludedDowntimeMinutes,
    effectivePlannedTimeMinutes: acc.effectivePlannedTimeMinutes,
    unplannedDowntimeMinutes: acc.unplannedDowntimeMinutes,
    operatingTimeMinutes: acc.operatingTimeMinutes,
    theoreticalOutput,
    standardEarnedMinutes:
      acc.validPerformanceOperatingMinutes > 0 ? round2(acc.standardEarnedMinutes) : null,
    producedQuantity: round2(acc.producedQuantity),
    approvedQuantity: round2(acc.approvedQuantity),
    lossQuantity: round2(acc.lossQuantity),
    incompleteReasons: Array.from(acc.incompleteReasons),
    sourceRecordIds: acc.sourceRecordIds,
    cycleStandardsUsed: Array.from(acc.cycleStandardsUsed.values()),
  };

  return {
    id: acc.id,
    code: acc.code,
    name: acc.name,
    level: acc.level,
    sectorId: acc.sectorId,
    sectorName: acc.sectorName,
    lineId: acc.lineId,
    lineName: acc.lineName,
    machineStatus: acc.machineStatus,
    theoreticalCapacityPerHour: acc.theoreticalCapacityPerHour,
    irogPercent,
    availabilityPercent,
    performancePercent,
    qualityPercent,
    plannedQuantity: round2(acc.plannedQuantity),
    producedQuantity: round2(acc.producedQuantity),
    approvedQuantity: round2(acc.approvedQuantity),
    lossQuantity: round2(acc.lossQuantity),
    plannedTimeMinutes: acc.plannedTimeMinutes,
    operatingTimeMinutes: acc.operatingTimeMinutes,
    downtimeMinutes: acc.unplannedDowntimeMinutes,
    targetIrogPercent,
    irogDeviationPercent,
    goalAttainmentPercent,
    status,
    recordsCount: acc.recordsCount,
    incompleteCount: acc.incompleteCount,
    memory,
  };
}

export function computeFourLevelIrog(params: {
  records: Array<RawIrogRecordInput & { unit_of_measure?: string }>;
  machinesCatalog: Array<{
    id: string;
    code: string;
    name: string;
    sector_id: string;
    sector_name: string;
    line_id: string | null;
    line_name: string | null;
    status: MachineStatus;
    theoretical_capacity_per_hour: number | null;
  }>;
  linesCatalog: Array<{ id: string; code: string; name: string; sector_id: string; sector_name: string }>;
  sectorsCatalog: Array<{ id: string; code: string; name: string }>;
  goalsByScope: {
    factory?: number | null;
    sector: Map<string, number>;
    line: Map<string, number>;
    machine: Map<string, number>;
  };
}): {
  factory: IrogEntityMetrics;
  sectors: IrogEntityMetrics[];
  lines: IrogEntityMetrics[];
  machines: IrogEntityMetrics[];
} {
  const factoryAcc = createAccumulator('factory', 'Fábrica ForteFlex', 'factory');
  const sectorAccs = new Map<string, InternalAccumulator>();
  const lineAccs = new Map<string, InternalAccumulator>();
  const machineAccs = new Map<string, InternalAccumulator>();

  for (const s of params.sectorsCatalog) {
    sectorAccs.set(s.id, createAccumulator(s.id, s.name, 'sector', { code: s.code, sectorId: s.id, sectorName: s.name }));
  }

  for (const l of params.linesCatalog) {
    lineAccs.set(
      l.id,
      createAccumulator(l.id, l.name, 'line', {
        code: l.code,
        sectorId: l.sector_id,
        sectorName: l.sector_name,
        lineId: l.id,
        lineName: l.name,
      })
    );
  }

  for (const m of params.machinesCatalog) {
    machineAccs.set(
      m.id,
      createAccumulator(m.id, m.name, 'machine', {
        code: m.code,
        sectorId: m.sector_id,
        sectorName: m.sector_name,
        lineId: m.line_id,
        lineName: m.line_name,
        machineStatus: m.status,
        theoreticalCapacityPerHour: m.theoretical_capacity_per_hour,
      })
    );
  }

  for (const rec of params.records) {
    const uom = rec.unit_of_measure || 'kg';
    accumulateRecord(factoryAcc, rec, uom);

    if (rec.sector_id) {
      let sAcc = sectorAccs.get(rec.sector_id);
      if (!sAcc) {
        sAcc = createAccumulator(rec.sector_id, rec.sector_name, 'sector', {
          sectorId: rec.sector_id,
          sectorName: rec.sector_name,
        });
        sectorAccs.set(rec.sector_id, sAcc);
      }
      accumulateRecord(sAcc, rec, uom);
    }

    if (rec.line_id) {
      let lAcc = lineAccs.get(rec.line_id);
      if (!lAcc) {
        lAcc = createAccumulator(rec.line_id, rec.line_name, 'line', {
          sectorId: rec.sector_id,
          sectorName: rec.sector_name,
          lineId: rec.line_id,
          lineName: rec.line_name,
        });
        lineAccs.set(rec.line_id, lAcc);
      }
      accumulateRecord(lAcc, rec, uom);
    }

    if (rec.machine_id) {
      let mAcc = machineAccs.get(rec.machine_id);
      if (!mAcc) {
        mAcc = createAccumulator(rec.machine_id, rec.machine_name || rec.machine_id, 'machine', {
          code: rec.machine_code || undefined,
          sectorId: rec.sector_id,
          sectorName: rec.sector_name,
          lineId: rec.line_id,
          lineName: rec.line_name,
          machineStatus: rec.machine_status || 'operating',
          theoreticalCapacityPerHour: rec.machine_capacity_per_hour ?? null,
        });
        machineAccs.set(rec.machine_id, mAcc);
      }
      accumulateRecord(mAcc, rec, uom);
    } else {
      factoryAcc.incompleteReasons.add(`Registro ${rec.id} sem máquina/recurso vinculado`);
    }
  }

  const factory = finalizeAccumulator(factoryAcc, { targetIrogPercent: params.goalsByScope.factory ?? null });
  const sectors = Array.from(sectorAccs.values()).map((acc) =>
    finalizeAccumulator(acc, { targetIrogPercent: params.goalsByScope.sector.get(acc.id) ?? null })
  );
  const lines = Array.from(lineAccs.values()).map((acc) =>
    finalizeAccumulator(acc, { targetIrogPercent: params.goalsByScope.line.get(acc.id) ?? null })
  );
  const machines = Array.from(machineAccs.values()).map((acc) =>
    finalizeAccumulator(acc, { targetIrogPercent: params.goalsByScope.machine.get(acc.id) ?? null })
  );

  return { factory, sectors, lines, machines };
}
