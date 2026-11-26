import React, { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  Calculator,
  Clock,
  Cpu,
  FilterX,
  Info,
  PackageCheck,
  Target,
  TrendingDown,
  TrendingUp,
  Tv,
  ArrowUpRight,
} from 'lucide-react';
import { api } from '../../lib/api';
import type {
  CatalogData,
  DashboardFilters,
  IrogEntityMetrics,
  IrogFactoryOverview,
} from '../../types';
import { IrogCalculationMemoryModal } from './IrogCalculationMemoryModal';

interface IrogFactoryDashboardProps {
  catalog: CatalogData;
  onOpenTvMode?: () => void;
  onDrilldown?: (target: { level: 'sector' | 'line' | 'machine'; id: string }) => void;
}

const DEFAULT_FILTERS: DashboardFilters = {
  startDate: '',
  endDate: '',
  shiftId: '',
  sectorId: '',
  lineId: '',
  machineId: '',
  productId: '',
  operatorId: '',
  includeDemo: true,
};

function fmtNum(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n);
}

function fmtPct(v: number | null): string {
  return v === null ? 'Incompleto' : `${v.toFixed(1)}%`;
}

function fmtMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

export function IrogFactoryDashboard({ catalog, onOpenTvMode, onDrilldown }: IrogFactoryDashboardProps) {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [overview, setOverview] = useState<IrogFactoryOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodChartMode, setPeriodChartMode] = useState<'weekly' | 'monthly'>('weekly');
  const [memoryEntity, setMemoryEntity] = useState<IrogEntityMetrics | null>(null);

  const loadData = useCallback(async (activeFilters: DashboardFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getIrogOverview(activeFilters);
      setOverview(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao calcular indicadores IROG.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData(filters);
  }, [filters, loadData]);

  const updateFilter = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'sectorId') {
        next.lineId = '';
        next.machineId = '';
      }
      if (key === 'lineId') {
        next.machineId = '';
      }
      return next;
    });
  };

  const filteredLines = filters.sectorId
    ? catalog.lines.filter((l) => l.sector_id === filters.sectorId)
    : catalog.lines;

  const filteredMachines = catalog.machines.filter(
    (m) => (!filters.sectorId || m.sector_id === filters.sectorId) && (!filters.lineId || m.line_id === filters.lineId)
  );

  const factory = overview?.factory;
  const mc = overview?.machineCounts;
  const charts = overview?.charts;

  const lossPercent =
    factory && factory.producedQuantity > 0
      ? (factory.lossQuantity / factory.producedQuantity) * 100
      : 0;

  return (
    <div className="space-y-6">
      {/* Demo Data Notice */}
      {overview && overview.demoRecordsCount > 0 && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-start sm:items-center gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Indicadores consolidados com{' '}
              <strong className="font-mono tabular-nums">{overview.demoRecordsCount}</strong> registros demonstrativos
              (consolidação ponderada por tempo padrão, sem média aritmética simples).
            </span>
          </div>
          <button
            type="button"
            onClick={() => updateFilter('includeDemo', !filters.includeDemo)}
            className="px-3 py-1.5 rounded-lg bg-white border border-blue-200 hover:bg-blue-100 text-blue-800 font-medium whitespace-nowrap shrink-0 cursor-pointer"
          >
            {filters.includeDemo ? 'Ver somente dados reais' : 'Incluir demonstrativos'}
          </button>
        </div>
      )}

      {/* 8 Analytical Filters */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-display font-bold text-[#0f2544]">
              Filtros IROG ForteFlex — Visão Geral da Fábrica
            </h2>
            <p className="text-xs text-slate-500">
              Acompanhe IROG, Disponibilidade, Desempenho, Qualidade e gargalos do parque fabril.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includeDemo}
                onChange={(e) => updateFilter('includeDemo', e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Incluir demo</span>
            </label>
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Limpar</span>
            </button>
            {factory && (
              <button
                type="button"
                onClick={() => setMemoryEntity(factory)}
                className="px-3 py-1.5 text-xs font-medium text-[#0f2544] bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Calculator className="w-3.5 h-3.5" />
                <span>Memória de Cálculo</span>
              </button>
            )}
            {onOpenTvMode && (
              <button
                type="button"
                onClick={onOpenTvMode}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Modo TV / Projetor</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Data inicial</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => updateFilter('startDate', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Data final</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => updateFilter('endDate', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Turno</label>
            <select
              value={filters.shiftId}
              onChange={(e) => updateFilter('shiftId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todos</option>
              {catalog.shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Setor</label>
            <select
              value={filters.sectorId}
              onChange={(e) => updateFilter('sectorId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todos</option>
              {catalog.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Linha</label>
            <select
              value={filters.lineId}
              onChange={(e) => updateFilter('lineId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todas</option>
              {filteredLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Máquina</label>
            <select
              value={filters.machineId || ''}
              onChange={(e) => updateFilter('machineId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todas</option>
              {filteredMachines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Produto</label>
            <select
              value={filters.productId}
              onChange={(e) => updateFilter('productId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todos</option>
              {catalog.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Operador</label>
            <select
              value={filters.operatorId}
              onChange={(e) => updateFilter('operatorId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todos</option>
              {catalog.operators.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 12 EXECUTIVE KPI CARDS */}
      {loading && !factory ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : factory && mc ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. IROG Geral */}
          <div className="bg-[#0f2544] text-white rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-blue-200">
              <span>IROG Geral da Fábrica</span>
              <Activity className="w-4 h-4 text-blue-300" />
            </div>
            <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums">
              {fmtPct(factory.irogPercent)}
            </div>
            <div className="mt-1 text-xs text-slate-300 font-mono tabular-nums">
              Meta: {factory.targetIrogPercent !== null ? `${factory.targetIrogPercent}%` : 'Não definida'}
            </div>
          </div>

          {/* 2. Disponibilidade */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Disponibilidade</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtPct(factory.availabilityPercent)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              Operação: {fmtMinutes(factory.operatingTimeMinutes)}
            </div>
          </div>

          {/* 3. Desempenho */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Desempenho</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtPct(factory.performancePercent)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Ritmo real vs ciclo padrão</div>
          </div>

          {/* 4. Qualidade */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Qualidade</span>
              <PackageCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
              {fmtPct(factory.qualityPercent)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              Aprovado: {fmtNum(factory.approvedQuantity)}
            </div>
          </div>

          {/* 5. Produção Planejada */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção Planejada</span>
              <Target className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtNum(factory.plannedQuantity)}
            </div>
            <div className="mt-1 text-xs text-slate-500">{factory.recordsCount} apontamentos</div>
          </div>

          {/* 6. Produção Realizada */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção Realizada</span>
              <PackageCheck className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-blue-700">
              {fmtNum(factory.producedQuantity)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Volume produzido no escopo</div>
          </div>

          {/* 7. Atingimento de Meta */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>% Atingimento da Meta</span>
              {factory.goalAttainmentPercent >= 95 ? (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
            </div>
            <div
              className={`mt-2 text-2xl font-display font-bold font-mono tabular-nums ${
                factory.goalAttainmentPercent >= 95 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {factory.goalAttainmentPercent.toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-slate-500">Realizado / Planejado</div>
          </div>

          {/* 8. Perdas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Perdas / Refugos</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-700">
              {fmtNum(factory.lossQuantity)}
            </div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
              Índice: {lossPercent.toFixed(2)}%
            </div>
          </div>

          {/* 9. Tempo Total de Paradas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Tempo Total de Paradas</span>
              <Clock className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {fmtMinutes(factory.downtimeMinutes)}
            </div>
            <div className="mt-1 text-xs font-mono text-slate-500">
              {factory.downtimeMinutes} minutos acumulados
            </div>
          </div>

          {/* 10. Máquinas em Operação */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Máquinas em Operação</span>
              <Cpu className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
              {mc.operating} <span className="text-sm font-normal text-slate-400">/ {mc.total}</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">Recursos rodando no momento</div>
          </div>

          {/* 11. Máquinas Paradas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Máquinas Paradas / Manut.</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-700">
              {mc.stopped + mc.maintenance}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono">
              {mc.stopped} paradas · {mc.maintenance} manutenção
            </div>
          </div>

          {/* 12. Máquinas Abaixo da Meta */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Máquinas Abaixo da Meta</span>
              <TrendingDown className="w-4 h-4 text-amber-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-amber-700">
              {mc.belowTarget}
            </div>
            <div className="mt-1 text-xs text-slate-500">Abaixo do IROG meta configurado</div>
          </div>
        </section>
      ) : null}

      {/* Drill-down Sector & Machine Summary Strips */}
      {overview && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Setores Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">IROG por Setor (Drill-down)</h3>
              <span className="text-xs text-slate-500">Clique para detalhar</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                  <tr>
                    <th className="px-4 py-2.5">Setor</th>
                    <th className="px-4 py-2.5 text-right">Disp.</th>
                    <th className="px-4 py-2.5 text-right">Desemp.</th>
                    <th className="px-4 py-2.5 text-right">Qual.</th>
                    <th className="px-4 py-2.5 text-right">IROG</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.sectors.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{s.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(s.availabilityPercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(s.performancePercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{fmtPct(s.qualityPercent)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0f2544]">
                        {fmtPct(s.irogPercent)}
                      </td>
                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setMemoryEntity(s)}
                          className="text-slate-600 hover:text-[#0f2544] px-1.5 py-1 cursor-pointer"
                          title="Ver Memória de Cálculo"
                        >
                          <Calculator className="w-3.5 h-3.5 inline" />
                        </button>
                        {onDrilldown && (
                          <button
                            type="button"
                            onClick={() => onDrilldown({ level: 'sector', id: s.id })}
                            className="text-blue-600 hover:text-blue-800 font-medium px-1.5 py-1 cursor-pointer inline-flex items-center gap-0.5"
                          >
                            <span>Abrir</span>
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Ranking de Máquinas */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Ranking de Máquinas e Recursos</h3>
              <span className="text-xs text-slate-500">Status e IROG individual</span>
            </div>
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Máquina</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">IROG</th>
                    <th className="px-4 py-2.5 text-right">Paradas</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {overview.machines
                    .slice()
                    .sort((a, b) => (b.irogPercent ?? -1) - (a.irogPercent ?? -1))
                    .map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <div className="font-medium text-slate-900">
                            {m.code} — {m.name}
                          </div>
                          <div className="text-slate-500">{m.sectorName}</div>
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
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0f2544]">
                          {fmtPct(m.irogPercent)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                          {m.downtimeMinutes} min
                        </td>
                        <td className="px-4 py-2.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setMemoryEntity(m)}
                            className="text-slate-600 hover:text-[#0f2544] px-1.5 py-1 cursor-pointer"
                            title="Memória de Cálculo"
                          >
                            <Calculator className="w-3.5 h-3.5 inline" />
                          </button>
                          {onDrilldown && (
                            <button
                              type="button"
                              onClick={() => onDrilldown({ level: 'machine', id: m.id })}
                              className="text-blue-600 hover:text-blue-800 font-medium px-1.5 py-1 cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <span>Detalhe</span>
                              <ArrowUpRight className="w-3 h-3" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* 9 EXECUTIVE CHARTS */}
      {overview && charts && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Evolução Diária do IROG */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">1. Evolução Diária do IROG (%)</h3>
              <p className="text-xs text-slate-500">IROG, Disponibilidade, Desempenho e Qualidade dia a dia</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={charts.dailyIrog}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line type="monotone" dataKey="irog" name="IROG %" stroke="#0f2544" strokeWidth={2.5} />
                  <Line type="monotone" dataKey="availability" name="Disp. %" stroke="#2563eb" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="performance" name="Desemp. %" stroke="#f59e0b" strokeWidth={1.5} />
                  <Line type="monotone" dataKey="quality" name="Qualid. %" stroke="#16a34a" strokeWidth={1.5} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Evolução Semanal / Mensal */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-display font-bold text-[#0f2544]">2. IROG Semanal e Mensal</h3>
                <p className="text-xs text-slate-500">Consolidação histórica por período</p>
              </div>
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setPeriodChartMode('weekly')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    periodChartMode === 'weekly' ? 'bg-white text-[#0f2544] font-semibold shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Semanal
                </button>
                <button
                  type="button"
                  onClick={() => setPeriodChartMode('monthly')}
                  className={`px-2.5 py-1 rounded-md cursor-pointer ${
                    periodChartMode === 'monthly' ? 'bg-white text-[#0f2544] font-semibold shadow-sm' : 'text-slate-600'
                  }`}
                >
                  Mensal
                </button>
              </div>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={periodChartMode === 'weekly' ? charts.weeklyIrog : charts.monthlyIrog}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="irog" name="IROG %" fill="#0f2544" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="availability" name="Disponibilidade %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. IROG por Setor */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">3. IROG por Setor</h3>
              <p className="text-xs text-slate-500">Comparativo ponderado entre setores da fábrica</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.sectors}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="irogPercent" name="IROG %" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="targetIrogPercent" name="Meta %" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. IROG por Linha */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">4. IROG por Linha de Produção</h3>
              <p className="text-xs text-slate-500">Identificação de linhas abaixo da meta</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={overview.lines}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Bar dataKey="irogPercent" name="IROG %" fill="#0f2544" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Ranking de Máquinas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">5. Ranking de Máquinas (IROG %)</h3>
              <p className="text-xs text-slate-500">Desempenho individual por equipamento</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={overview.machines.slice().sort((a, b) => (b.irogPercent ?? 0) - (a.irogPercent ?? 0))}
                  layout="vertical"
                  margin={{ left: 10 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <YAxis dataKey="code" type="category" width={85} tick={{ fontSize: 11, fill: '#334155' }} />
                  <Tooltip />
                  <Bar dataKey="irogPercent" name="IROG %" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. Principais Motivos de Parada */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">6. Principais Motivos de Parada</h3>
              <p className="text-xs text-slate-500">Tempo perdido acumulado em minutos</p>
            </div>
            <div className="h-64">
              {charts.downtimeByReason.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Nenhuma parada registrada no filtro atual.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.downtimeByReason.slice(0, 7)} layout="vertical" margin={{ left: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                    <YAxis dataKey="reason" type="category" width={145} tick={{ fontSize: 10, fill: '#334155' }} />
                    <Tooltip />
                    <Bar dataKey="minutes" name="Minutos" fill="#dc2626" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 7. Principais Motivos de Perda */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">7. Principais Motivos de Perda</h3>
              <p className="text-xs text-slate-500">Refugos, retrabalhos e perdas operacionais</p>
            </div>
            <div className="h-64">
              {charts.lossByReason.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-slate-500">
                  Nenhuma perda detalhada registrada no filtro atual.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.lossByReason.slice(0, 7)} layout="vertical" margin={{ left: 15 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                    <YAxis dataKey="reason" type="category" width={145} tick={{ fontSize: 10, fill: '#334155' }} />
                    <Tooltip />
                    <Bar dataKey="quantity" name="Quantidade" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 8. A/P/Q por Turno */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">
                8. Disponibilidade, Desempenho e Qualidade por Turno
              </h3>
              <p className="text-xs text-slate-500">Comparação dos três pilares entre turnos</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.byShift}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="availability" name="Disp. %" fill="#2563eb" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="performance" name="Desemp. %" fill="#f59e0b" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="quality" name="Qualid. %" fill="#16a34a" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 9. Planejado versus Realizado */}
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">9. Planejado versus Realizado Diário</h3>
              <p className="text-xs text-slate-500">Aderência de volume diário frente ao programado</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.dailyIrog}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="planned" name="Planejado" stroke="#64748b" fill="#cbd5e1" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="realized" name="Realizado" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.25} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>
      )}

      <IrogCalculationMemoryModal entity={memoryEntity} onClose={() => setMemoryEntity(null)} />
    </div>
  );
}
