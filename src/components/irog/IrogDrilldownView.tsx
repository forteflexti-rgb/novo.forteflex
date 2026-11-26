import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calculator, Cpu, Layers, GitBranch, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import type { CatalogData, IrogEntityMetrics, IrogFactoryOverview } from '../../types';
import { IrogCalculationMemoryModal } from './IrogCalculationMemoryModal';

interface IrogDrilldownViewProps {
  catalog: CatalogData;
  initialTarget?: { level: 'sector' | 'line' | 'machine'; id: string } | null;
}

function fmtPct(v: number | null): string {
  return v === null ? 'Pendente' : `${v.toFixed(1)}%`;
}

function fmtNum(v: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(v);
}

export function IrogDrilldownView({ catalog, initialTarget }: IrogDrilldownViewProps) {
  const [level, setLevel] = useState<'sector' | 'line' | 'machine'>(initialTarget?.level || 'sector');
  const [selectedId, setSelectedId] = useState<string>(initialTarget?.id || '');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [overview, setOverview] = useState<IrogFactoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [memoryEntity, setMemoryEntity] = useState<IrogEntityMetrics | null>(null);

  useEffect(() => {
    if (initialTarget) {
      setLevel(initialTarget.level);
      setSelectedId(initialTarget.id);
    }
  }, [initialTarget]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getIrogOverview({ includeDemo });
      setOverview(res);
    } finally {
      setLoading(false);
    }
  }, [includeDemo]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const entities = useMemo(() => {
    if (!overview) return [];
    if (level === 'sector') return overview.sectors;
    if (level === 'line') return overview.lines;
    return overview.machines;
  }, [overview, level]);

  useEffect(() => {
    if (entities.length > 0 && (!selectedId || !entities.some((e) => e.id === selectedId))) {
      setSelectedId(entities[0].id);
    }
  }, [entities, selectedId]);

  const currentEntity = useMemo(() => entities.find((e) => e.id === selectedId) || null, [entities, selectedId]);

  const childLines = useMemo(() => {
    if (!overview || level !== 'sector' || !currentEntity) return [];
    return overview.lines.filter((l) => l.sectorId === currentEntity.id);
  }, [overview, level, currentEntity]);

  const childMachines = useMemo(() => {
    if (!overview || !currentEntity) return [];
    if (level === 'sector') return overview.machines.filter((m) => m.sectorId === currentEntity.id);
    if (level === 'line') return overview.machines.filter((m) => m.lineId === currentEntity.id);
    return [];
  }, [overview, level, currentEntity]);

  const machineCycleStandards = useMemo(() => {
    if (level !== 'machine' || !currentEntity) return [];
    return catalog.cycleStandards.filter((c) => c.machine_id === currentEntity.id && c.is_current);
  }, [catalog.cycleStandards, level, currentEntity]);

  const machineTimeline = useMemo(() => {
    if (!overview || level !== 'machine' || !currentEntity) return [];
    return overview.timelineEvents.filter((ev) => ev.machineId === currentEntity.id);
  }, [overview, level, currentEntity]);

  return (
    <div className="space-y-6">
      {/* Selector Header */}
      <section className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setLevel('sector');
              setSelectedId('');
            }}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer ${
              level === 'sector' ? 'bg-[#0f2544] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Setor</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLevel('line');
              setSelectedId('');
            }}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer ${
              level === 'line' ? 'bg-[#0f2544] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Linha de Produção</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setLevel('machine');
              setSelectedId('');
            }}
            className={`px-3.5 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer ${
              level === 'machine' ? 'bg-[#0f2544] text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Máquina / Recurso</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="min-h-[40px] min-w-[240px] px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white"
          >
            {entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.code && !e.name.startsWith(e.code) ? `${e.code} — ${e.name}` : e.name}
              </option>
            ))}
          </select>

          {overview && overview.demoRecordsCount > 0 && (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDemo}
                onChange={(e) => setIncludeDemo(e.target.checked)}
              />
              <span>Incluir demo</span>
            </label>
          )}

          {currentEntity && (
            <button
              type="button"
              onClick={() => setMemoryEntity(currentEntity)}
              className="min-h-[40px] px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-[#0f2544] text-xs font-semibold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span>Memória de Cálculo</span>
            </button>
          )}
        </div>
      </section>

      {loading || !currentEntity ? (
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : (
        <>
          {/* Entity Metrics Strip */}
          <section className="grid grid-cols-2 lg:grid-cols-6 gap-4">
            <div className="col-span-2 bg-[#0f2544] text-white rounded-xl p-5">
              <div className="text-xs text-blue-200">
                {level === 'sector' ? 'Setor' : level === 'line' ? 'Linha de Produção' : 'Máquina / Recurso'}
              </div>
              <div className="text-lg font-display font-bold mt-0.5 truncate">{currentEntity.name}</div>
              <div className="mt-3 flex items-baseline gap-3">
                {currentEntity.irogPercent !== null ? (
                  <>
                    <span className="text-3xl font-display font-bold font-mono tabular-nums">
                      {currentEntity.irogPercent.toFixed(1)}%
                    </span>
                    <span className="text-xs text-slate-300 font-mono">
                      Meta: {currentEntity.targetIrogPercent !== null ? `${currentEntity.targetIrogPercent}%` : 'não definida'}
                    </span>
                  </>
                ) : (
                  <span className="text-lg font-display font-semibold">
                    IROG em implantação
                    <span className="block text-xs font-normal text-blue-100 mt-0.5">Veja abaixo o que falta cadastrar</span>
                  </span>
                )}
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Disponibilidade</div>
              <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
                {fmtPct(currentEntity.availabilityPercent)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                Paradas: {currentEntity.downtimeMinutes} min
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Desempenho</div>
              <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
                {fmtPct(currentEntity.performancePercent)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                Operação: {Math.round(currentEntity.operatingTimeMinutes)} min
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">Qualidade</div>
              <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
                {fmtPct(currentEntity.qualityPercent)}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                Perdas: {fmtNum(currentEntity.lossQuantity)} kg
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{currentEntity.plannedQuantity > 0 ? 'Realizado / Planejado' : 'Produção realizada'}</div>
              <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-blue-700">
                {currentEntity.plannedQuantity > 0
                  ? `${currentEntity.goalAttainmentPercent.toFixed(1)}%`
                  : <>{fmtNum(currentEntity.producedQuantity)} <span className="text-sm font-normal text-slate-500">kg</span></>}
              </div>
              <div className="text-xs text-slate-500 mt-1 font-mono">
                {currentEntity.plannedQuantity > 0
                  ? `${fmtNum(currentEntity.producedQuantity)} / ${fmtNum(currentEntity.plannedQuantity)} kg`
                  : `${currentEntity.recordsCount} apontamentos`}
              </div>
            </div>
          </section>

          {currentEntity.memory.incompleteReasons.length > 0 && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong>Atenção aos parâmetros:</strong> {currentEntity.memory.incompleteReasons.join(' · ')}
              </div>
            </div>
          )}

          {/* Sector child lines */}
          {level === 'sector' && childLines.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-display font-bold text-[#0f2544]">
                  Linhas do Setor ({childLines.length})
                </h3>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Linha</th>
                    <th className="px-4 py-2.5 text-right">Disp.</th>
                    <th className="px-4 py-2.5 text-right">Desemp.</th>
                    <th className="px-4 py-2.5 text-right">Qual.</th>
                    <th className="px-4 py-2.5 text-right">IROG</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {childLines.map((l) => (
                    <tr key={l.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {l.code && !l.name.startsWith(l.code) ? `${l.code} — ${l.name}` : l.name}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(l.availabilityPercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(l.performancePercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(l.qualityPercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0f2544]">
                        {fmtPct(l.irogPercent)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setLevel('line');
                            setSelectedId(l.id);
                          }}
                          className="text-blue-600 hover:underline font-medium cursor-pointer"
                        >
                          Detalhar linha
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Sector or Line child machines */}
          {(level === 'sector' || level === 'line') && childMachines.length > 0 && (
            <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-display font-bold text-[#0f2544]">
                  Máquinas / Recursos Associados ({childMachines.length})
                </h3>
              </div>
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Máquina</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Disp.</th>
                    <th className="px-4 py-2.5 text-right">Desemp.</th>
                    <th className="px-4 py-2.5 text-right">Qual.</th>
                    <th className="px-4 py-2.5 text-right">IROG</th>
                    <th className="px-4 py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {childMachines.map((m) => (
                    <tr key={m.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {m.code && !m.name.startsWith(m.code) ? `${m.code} — ${m.name}` : m.name}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`font-semibold ${
                            m.machineStatus === 'operating'
                              ? 'text-emerald-700'
                              : m.machineStatus === 'stopped'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {m.machineStatus === 'operating'
                            ? 'Operando'
                            : m.machineStatus === 'stopped'
                            ? 'Parada'
                            : m.machineStatus === 'maintenance'
                            ? 'Manutenção'
                            : 'Ociosa'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(m.availabilityPercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(m.performancePercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(m.qualityPercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0f2544]">
                        {fmtPct(m.irogPercent)}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            setLevel('machine');
                            setSelectedId(m.id);
                          }}
                          className="text-blue-600 hover:underline font-medium cursor-pointer"
                        >
                          Abrir máquina
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* Machine Individual Details: Cycle Standards + Event Timeline */}
          {level === 'machine' && (
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-display font-bold text-[#0f2544]">
                    Ciclos Padrão Configurados nesta Máquina
                  </h3>
                </div>
                {machineCycleStandards.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500">
                    Nenhum ciclo padrão produto × máquina cadastrado (usando capacidade nominal da máquina quando disponível).
                  </div>
                ) : (
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                      <tr>
                        <th className="px-4 py-2.5">Produto</th>
                        <th className="px-4 py-2.5 text-right">Cap. Teórica/h</th>
                        <th className="px-4 py-2.5 text-right">Ciclo (min)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {machineCycleStandards.map((cs) => (
                        <tr key={cs.id}>
                          <td className="px-4 py-2.5 font-medium text-slate-900">
                            {cs.product_name} ({cs.product_sku})
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {cs.theoretical_capacity_per_hour}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {cs.cycle_time_minutes.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#0f2544]" />
                  <h3 className="text-sm font-display font-bold text-[#0f2544]">
                    Linha do Tempo de Eventos da Máquina
                  </h3>
                </div>
                {machineTimeline.length === 0 ? (
                  <div className="p-6 text-xs text-slate-500">Sem eventos recentes registrados para esta máquina.</div>
                ) : (
                  <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                    {machineTimeline.map((ev) => (
                      <div key={ev.id} className="px-4 py-3 flex items-start justify-between gap-3 text-xs">
                        <div>
                          <div
                            className={`font-semibold ${
                              ev.eventType === 'downtime'
                                ? 'text-red-700'
                                : ev.eventType === 'loss'
                                ? 'text-amber-700'
                                : 'text-[#0f2544]'
                            }`}
                          >
                            {ev.title}
                          </div>
                          <div className="text-slate-500 mt-0.5">{ev.detail}</div>
                        </div>
                        <span className="font-mono tabular-nums text-slate-400 shrink-0">
                          {new Date(ev.timestamp).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}

      <IrogCalculationMemoryModal entity={memoryEntity} onClose={() => setMemoryEntity(null)} />
    </div>
  );
}
