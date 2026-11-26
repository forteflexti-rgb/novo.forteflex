import test from 'node:test';
import assert from 'node:assert/strict';
import { computeFourLevelIrog, type RawIrogRecordInput } from './irogEngine.ts';

function makeBaseCatalog() {
  return {
    sectorsCatalog: [
      { id: 'sec-1', code: 'EXT', name: 'Extrusão' },
      { id: 'sec-2', code: 'CS', name: 'Corte e Solda' },
    ],
    linesCatalog: [
      { id: 'lin-1', code: 'L1', name: 'Linha 1', sector_id: 'sec-1', sector_name: 'Extrusão' },
      { id: 'lin-2', code: 'L2', name: 'Linha 2', sector_id: 'sec-2', sector_name: 'Corte e Solda' },
    ],
    machinesCatalog: [
      {
        id: 'mac-1',
        code: 'EXT-01',
        name: 'Extrusora 01',
        sector_id: 'sec-1',
        sector_name: 'Extrusão',
        line_id: 'lin-1',
        line_name: 'Linha 1',
        status: 'operating' as const,
        theoretical_capacity_per_hour: 120,
      },
      {
        id: 'mac-2',
        code: 'CS-01',
        name: 'Corte Solda 01',
        sector_id: 'sec-2',
        sector_name: 'Corte e Solda',
        line_id: 'lin-2',
        line_name: 'Linha 2',
        status: 'operating' as const,
        theoretical_capacity_per_hour: 600,
      },
    ],
    goalsByScope: {
      factory: 80,
      sector: new Map([['sec-1', 82], ['sec-2', 78]]),
      line: new Map([['lin-1', 82], ['lin-2', 78]]),
      machine: new Map([['mac-1', 82], ['mac-2', 78]]),
    },
  };
}

test('IROG formula: Availability 90%, Performance 85%, Quality 98% -> 74.97%', () => {
  const cat = makeBaseCatalog();
  // Planned time = 500 min; unplanned downtime = 50 min => operating = 450 min (90% availability)
  // Cycle time = 0.5 min/kg => theoretical output in 450 min = 900 kg
  // Produced = 765 kg (85% of 900); Approved = 749.7 kg (98% of 765)
  const record: RawIrogRecordInput & { unit_of_measure: string } = {
    id: 'r-1',
    production_date: '2026-11-20',
    shift_id: 'shf-1',
    shift_name: 'T1',
    sector_id: 'sec-1',
    sector_name: 'Extrusão',
    line_id: 'lin-1',
    line_name: 'Linha 1',
    machine_id: 'mac-1',
    machine_code: 'EXT-01',
    machine_name: 'Extrusora 01',
    product_id: 'p-1',
    product_name: 'Filme PEBD',
    planned_quantity: 900,
    produced_quantity: 765,
    approved_quantity: 749.7,
    loss_quantity: 15.3,
    unit_of_measure: 'kg',
    planned_time_minutes: 500,
    cycle_time_minutes: 0.5,
    cycle_source: 'cycle_standard',
    included_downtime_minutes: 50,
    excluded_downtime_minutes: 0,
    is_complete_record: true,
  };

  const result = computeFourLevelIrog({ ...cat, records: [record] });
  const mac1 = result.machines.find((m) => m.id === 'mac-1')!;

  assert.equal(mac1.availabilityPercent, 90);
  assert.equal(mac1.performancePercent, 85);
  assert.equal(mac1.qualityPercent, 98);
  assert.equal(mac1.irogPercent, 74.97);
  assert.equal(mac1.status, 'complete');
});

test('Planned downtime is excluded from Availability denominator while unplanned downtime reduces Availability', () => {
  const cat = makeBaseCatalog();
  // Planned shift = 480 min, excluded planned stop = 80 min => effective planned = 400 min
  // Unplanned stop = 40 min => operating = 360 min => Availability = 360/400 = 90%
  const record: RawIrogRecordInput & { unit_of_measure: string } = {
    id: 'r-2',
    production_date: '2026-11-20',
    shift_id: 'shf-1',
    shift_name: 'T1',
    sector_id: 'sec-1',
    sector_name: 'Extrusão',
    line_id: 'lin-1',
    line_name: 'Linha 1',
    machine_id: 'mac-1',
    machine_code: 'EXT-01',
    machine_name: 'Extrusora 01',
    product_id: 'p-1',
    product_name: 'Filme PEBD',
    planned_quantity: 720,
    produced_quantity: 720,
    approved_quantity: 720,
    loss_quantity: 0,
    unit_of_measure: 'kg',
    planned_time_minutes: 480,
    cycle_time_minutes: 0.5,
    cycle_source: 'cycle_standard',
    included_downtime_minutes: 40,
    excluded_downtime_minutes: 80,
    is_complete_record: true,
  };

  const result = computeFourLevelIrog({ ...cat, records: [record] });
  const mac1 = result.machines.find((m) => m.id === 'mac-1')!;
  assert.equal(mac1.memory.effectivePlannedTimeMinutes, 400);
  assert.equal(mac1.operatingTimeMinutes, 360);
  assert.equal(mac1.availabilityPercent, 90);
  assert.equal(mac1.performancePercent, 100);
  assert.equal(mac1.qualityPercent, 100);
  assert.equal(mac1.irogPercent, 90);
});

test('Factory consolidation uses time-normalized weights instead of simple arithmetic average across heterogeneous units', () => {
  const cat = makeBaseCatalog();
  // Machine 1 (kg): 400 min planned, 0 downtime => 100% A, 100% P, 100% Q => 100% IROG
  // Machine 2 (un): 100 min planned, 50 downtime => 50% A, 100% P, 100% Q => 50% IROG
  // Simple arithmetic average would be 75%. Time-weighted factory Availability = 450/500 = 90%!
  const rec1: RawIrogRecordInput & { unit_of_measure: string } = {
    id: 'r-3a',
    production_date: '2026-11-20',
    shift_id: 'shf-1',
    shift_name: 'T1',
    sector_id: 'sec-1',
    sector_name: 'Extrusão',
    line_id: 'lin-1',
    line_name: 'Linha 1',
    machine_id: 'mac-1',
    machine_code: 'EXT-01',
    machine_name: 'Extrusora 01',
    product_id: 'p-1',
    product_name: 'Filme PEBD',
    planned_quantity: 800,
    produced_quantity: 800,
    approved_quantity: 800,
    loss_quantity: 0,
    unit_of_measure: 'kg',
    planned_time_minutes: 400,
    cycle_time_minutes: 0.5,
    cycle_source: 'cycle_standard',
    included_downtime_minutes: 0,
    excluded_downtime_minutes: 0,
    is_complete_record: true,
  };

  const rec2: RawIrogRecordInput & { unit_of_measure: string } = {
    id: 'r-3b',
    production_date: '2026-11-20',
    shift_id: 'shf-1',
    shift_name: 'T1',
    sector_id: 'sec-2',
    sector_name: 'Corte e Solda',
    line_id: 'lin-2',
    line_name: 'Linha 2',
    machine_id: 'mac-2',
    machine_code: 'CS-01',
    machine_name: 'Corte Solda 01',
    product_id: 'p-2',
    product_name: 'Saco Industrial',
    planned_quantity: 1000,
    produced_quantity: 500,
    approved_quantity: 500,
    loss_quantity: 0,
    unit_of_measure: 'un',
    planned_time_minutes: 100,
    cycle_time_minutes: 0.1,
    cycle_source: 'cycle_standard',
    included_downtime_minutes: 50,
    excluded_downtime_minutes: 0,
    is_complete_record: true,
  };

  const result = computeFourLevelIrog({ ...cat, records: [rec1, rec2] });
  assert.notEqual(result.factory.irogPercent, 75);
  assert.equal(result.factory.availabilityPercent, 90);
  assert.equal(result.factory.performancePercent, 100);
  assert.equal(result.factory.qualityPercent, 100);
  assert.equal(result.factory.irogPercent, 90);
});

test('Missing cycle time marks IROG as incomplete with explanation and never invents numbers', () => {
  const cat = makeBaseCatalog();
  const rec: RawIrogRecordInput & { unit_of_measure: string } = {
    id: 'r-4',
    production_date: '2026-11-20',
    shift_id: 'shf-1',
    shift_name: 'T1',
    sector_id: 'sec-1',
    sector_name: 'Extrusão',
    line_id: 'lin-1',
    line_name: 'Linha 1',
    machine_id: 'mac-1',
    machine_code: 'EXT-01',
    machine_name: 'Extrusora 01',
    product_id: 'p-1',
    product_name: 'Produto Novo Sem Ciclo',
    planned_quantity: 500,
    produced_quantity: 450,
    approved_quantity: 440,
    loss_quantity: 10,
    unit_of_measure: 'kg',
    planned_time_minutes: 480,
    cycle_time_minutes: null,
    cycle_source: 'missing',
    included_downtime_minutes: 20,
    excluded_downtime_minutes: 0,
    is_complete_record: true,
  };

  const result = computeFourLevelIrog({ ...cat, records: [rec] });
  const mac1 = result.machines.find((m) => m.id === 'mac-1')!;
  assert.equal(mac1.status, 'incomplete');
  assert.equal(mac1.irogPercent, null);
  assert.equal(mac1.performancePercent, null);
  assert.ok(mac1.memory.incompleteReasons.length > 0);
});
