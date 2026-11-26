import React from 'react';
import { X, Calculator, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { IrogEntityMetrics } from '../../types';

interface IrogCalculationMemoryModalProps {
  entity: IrogEntityMetrics | null;
  onClose: () => void;
}

function fmtPct(v: number | null): string {
  return v === null ? 'Pendente' : `${v.toFixed(2)}%`;
}

function fmtNum(v: number | null): string {
  if (v === null) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(v);
}

export function IrogCalculationMemoryModal({ entity, onClose }: IrogCalculationMemoryModalProps) {
  if (!entity) return null;
  const mem = entity.memory;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl w-full max-w-3xl p-6 space-y-5 my-8">
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100">
          <div className="flex items-start gap-2.5">
            <Calculator className="w-5 h-5 text-[#0f2544] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-display font-bold text-[#0f2544]">
                Memória de Cálculo IROG — {entity.name}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {mem.methodology} · Consolidação: {mem.normalizationMethod}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar memória de cálculo"
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status & Incomplete Warnings */}
        {mem.incompleteReasons.length > 0 ? (
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 space-y-1.5 text-xs text-amber-900">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>Alertas de integridade / parâmetros ausentes ({entity.status})</span>
            </div>
            <ul className="list-disc pl-5 space-y-0.5">
              {mem.incompleteReasons.map((reason, idx) => (
                <li key={idx}>{reason}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Parâmetros completos para todos os {entity.recordsCount} apontamento(s) auditados nesta visão.
            </span>
          </div>
        )}

        {/* Formula Summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-3.5 rounded-lg bg-[#0f2544] text-white">
            <div className="text-[11px] text-blue-200">IROG Consolidado</div>
            <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums">
              {fmtPct(entity.irogPercent)}
            </div>
            <div className="text-[11px] text-slate-300 mt-0.5">Disp × Desemp × Qual</div>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">Disponibilidade (A)</div>
            <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtPct(entity.availabilityPercent)}
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
              {fmtNum(mem.operatingTimeMinutes)} / {fmtNum(mem.effectivePlannedTimeMinutes)} min
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">Desempenho (P)</div>
            <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtPct(entity.performancePercent)}
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
              {fmtNum(mem.standardEarnedMinutes)} / {fmtNum(mem.operatingTimeMinutes)} min
            </div>
          </div>
          <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200">
            <div className="text-[11px] text-slate-500">Qualidade (Q)</div>
            <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtPct(entity.qualityPercent)}
            </div>
            <div className="text-[11px] font-mono text-slate-500 mt-0.5">
              {fmtNum(mem.approvedQuantity)} / {fmtNum(mem.producedQuantity)}
            </div>
          </div>
        </div>

        {/* Detailed Time & Output Ledger */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="font-semibold text-[#0f2544] pb-1 border-b border-slate-100">
              Tempos Apurados (minutos)
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Tempo programado bruto</span>
              <span className="font-mono tabular-nums font-medium">{fmtNum(mem.plannedTimeMinutes)} min</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Paradas programadas (excluídas do disponível)</span>
              <span className="font-mono tabular-nums text-slate-500">
                -{fmtNum(mem.excludedPlannedDowntimeMinutes)} min
              </span>
            </div>
            <div className="flex justify-between font-medium">
              <span className="text-slate-800">Tempo disponível efetivo</span>
              <span className="font-mono tabular-nums text-[#0f2544]">
                {fmtNum(mem.effectivePlannedTimeMinutes)} min
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Paradas não programadas (reduzem disp.)</span>
              <span className="font-mono tabular-nums text-red-700">
                -{fmtNum(mem.unplannedDowntimeMinutes)} min
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-100 font-semibold">
              <span className="text-slate-900">Tempo efetivo em operação</span>
              <span className="font-mono tabular-nums text-emerald-700">
                {fmtNum(mem.operatingTimeMinutes)} min
              </span>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg p-4 space-y-2">
            <div className="font-semibold text-[#0f2544] pb-1 border-b border-slate-100">
              Volumes e Padrões Normalizados
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Produção planejada (OP / turno)</span>
              <span className="font-mono tabular-nums">{fmtNum(entity.plannedQuantity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Produção real bruta</span>
              <span className="font-mono tabular-nums font-medium">{fmtNum(mem.producedQuantity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Produção boa (aprovada)</span>
              <span className="font-mono tabular-nums text-emerald-700">{fmtNum(mem.approvedQuantity)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Perdas / refugos</span>
              <span className="font-mono tabular-nums text-red-700">{fmtNum(mem.lossQuantity)}</span>
            </div>
            <div className="flex justify-between pt-1 border-t border-slate-100 font-semibold">
              <span className="text-slate-900">Minutos padrão ganhos (soma ponderada)</span>
              <span className="font-mono tabular-nums text-blue-700">
                {fmtNum(mem.standardEarnedMinutes)} min-pad
              </span>
            </div>
          </div>
        </div>

        {/* Cycle Standards Used */}
        {mem.cycleStandardsUsed.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-[#0f2544]">
              Parâmetros de Ciclo / Capacidade Teórica Utilizados ({mem.cycleStandardsUsed.length})
            </div>
            <div className="max-h-44 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50/70 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2">Máquina</th>
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2 text-right">Cap. Teórica/h</th>
                    <th className="px-3 py-2 text-right">Ciclo (min/un)</th>
                    <th className="px-3 py-2">Origem do Parâmetro</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mem.cycleStandardsUsed.map((cs, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-800">{cs.machineName}</td>
                      <td className="px-3 py-2 text-slate-700">{cs.productName}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtNum(cs.capacityPerHour)}</td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">{cs.cycleTimeMinutes.toFixed(4)}</td>
                      <td className="px-3 py-2">
                        {cs.source === 'cycle_standard'
                          ? 'Ciclo padrão produto × máquina'
                          : cs.source === 'machine_capacity'
                          ? 'Capacidade nominal da máquina'
                          : 'Ausente (incompleto)'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
          <span>Registros auditados: {mem.sourceRecordIds.length}</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-[#0f2544] text-white text-xs font-medium rounded-lg cursor-pointer"
          >
            Fechar memória
          </button>
        </div>
      </div>
    </div>
  );
}
