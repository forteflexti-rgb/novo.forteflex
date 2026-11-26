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
  return v === null ? 'Pendente' : `${v.toFixed(1)}%`;
}

function fmtMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Percentual em tabela: "pendente" discreto em vez de texto grande de erro. */
function Pct({ v }: { v: number | null }) {
  if (v === null) {
    return <span className="text-[10px] font-sans font-medium uppercase tracking-wide text-slate-400">pendente</span>;
  }
  return <>{v.toFixed(1)}%</>;
}

const fmtDay = (v: unknown) => {
  const d = String(v ?? '');
  return d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d;
};
const fmtPeriod = (v: unknown) => {
  const p = String(v ?? '');
  const w = p.match(/^(\d{4})-S(\d{2})$/);
  if (w) return `Sem ${Number(w[2])}`;
  const m = p.match(/^(\d{4})-(\d{2})$/);
  return m ? `${['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'][Number(m[2]) - 1]}/${m[1].slice(2)}` : p;
};
const pctTip = (v: any) => (v === null || v === undefined ? 'pendente' : `${Number(v).toFixed(1)}%`);

/** "501 - CORTE E SOLDA…" já começa pelo código: não repetir "501 — 501 - …". */
const shortName = (e: { code?: string; name: string }) =>
  e.code && !e.name.startsWith(e.code) ? `${e.code} — ${e.name}` : e.name;

type PctFlags = { irog: boolean; availability: boolean; performance: boolean; quality: boolean };
const ENTITY_KEYS = { irog: 'irogPercent', availability: 'availabilityPercent', performance: 'performancePercent', quality: 'qualityPercent' } as const;
const anyValue = (rows: any[], key: string) => rows.some((r) => r[key] !== null && r[key] !== undefined);
const entityHas = (rows: any[]): PctFlags => ({
  irog: anyValue(rows, 'irogPercent'),
  availability: anyValue(rows, 'availabilityPercent'),
  performance: anyValue(rows, 'performancePercent'),
  quality: anyValue(rows, 'qualityPercent'),
});
const periodLikeHas = (rows: any[]): PctFlags => ({
  irog: anyValue(rows, 'irog'),
  availability: anyValue(rows, 'availability'),
  performance: anyValue(rows, 'performance'),
  quality: anyValue(rows, 'quality'),
});

/** Barras só dos indicadores calculados, na ordem D, P, Q, IROG. */
function pctBars(has: PctFlags, keys: { irog: string; availability: string; performance: string; quality: string }) {
  const spec = [
    { on: has.availability, key: keys.availability, name: 'Disponibilidade', fill: '#2563eb' },
    { on: has.performance, key: keys.performance, name: 'Desempenho', fill: '#f59e0b' },
    { on: has.quality, key: keys.quality, name: 'Qualidade', fill: '#16a34a' },
    { on: has.irog, key: keys.irog, name: 'IROG', fill: '#0f2544' },
  ];
  return spec
    .filter((s) => s.on)
    .map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} fill={s.fill} radius={[4, 4, 0, 0]} isAnimationActive={false} />);
}

const seriesSubtitle = (has: PctFlags) => {
  const on = [has.availability && 'Disponibilidade', has.performance && 'Desempenho', has.quality && 'Qualidade', has.irog && 'IROG'].filter(Boolean);
  const off = [!has.performance && 'Desempenho', !has.irog && 'IROG'].filter(Boolean);
  return `${on.join(', ')} dia a dia${off.length ? ` · ${off.join(' e ')} em implantação` : ''}`;
};

function ChartCard({
  title,
  subtitle,
  empty,
  actions,
  wide,
  children,
}: {
  title: string;
  subtitle?: string;
  empty?: string | null;
  actions?: React.ReactNode;
  wide?: boolean;
  children: React.ReactElement;
}) {
  return (
    <div className={`${wide ? 'lg:col-span-2 ' : ''}bg-white border border-slate-200 rounded-xl p-5`}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-display font-bold text-[#0f2544]">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <div className="h-64">
        {empty ? (
          <div className="h-full flex items-center justify-center rounded-lg bg-slate-50 text-xs text-slate-500">{empty}</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {children}
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/** Frase curta do que falta para o IROG sair (vem da memória de cálculo). */
function pendingHint(reasons: string[]): string {
  if (reasons.some((r) => r.includes('Padrão produtivo'))) return 'Aguardando os padrões de ciclo da engenharia';
  if (reasons.some((r) => r.includes('calendário'))) return 'Aguardando o calendário das máquinas';
  if (reasons.some((r) => r.includes('Classificação de paradas'))) return 'Aguardando a classificação das paradas';
  return reasons.length ? 'Dados incompletos — ver memória de cálculo' : 'Sem dados no período';
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

  // ---- Dados derivados para os gráficos (só o que já está calculado) ----
  const dailyHas = periodLikeHas(charts?.dailyIrog ?? []);
  const periodData = (periodChartMode === 'weekly' ? charts?.weeklyIrog : charts?.monthlyIrog) ?? [];
  const periodHas = periodLikeHas(periodData);
  const dailyHasPlanned = (charts?.dailyIrog ?? []).some((d) => d.planned > 0);
  const shiftHasPct = anyValue(charts?.byShift ?? [], 'availability') || anyValue(charts?.byShift ?? [], 'quality');
  const shiftTotal = (charts?.byShift ?? []).reduce((s, x) => s + x.realized, 0);
  const noShiftShare = shiftTotal > 0 ? Math.round((((charts?.byShift ?? []).find((x) => x.name === 'Turno não informado')?.realized ?? 0) / shiftTotal) * 100) : 0;
  const rankingMetric = anyValue(overview?.machines ?? [], 'irogPercent')
    ? ({ key: 'irogPercent', label: 'IROG' } as const)
    : ({ key: 'availabilityPercent', label: 'Disponibilidade' } as const);
  const ranking = (overview?.machines ?? [])
    .filter((m) => m[rankingMetric.key] !== null)
    .sort((a, b) => (b[rankingMetric.key] ?? 0) - (a[rankingMetric.key] ?? 0))
    .map((m) => ({ ...m, label: shortName(m) }));
  const idleMinutes = factory ? Math.max(0, factory.plannedTimeMinutes - factory.operatingTimeMinutes - factory.downtimeMinutes) : 0;

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
            {overview && overview.demoRecordsCount > 0 && (
              <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filters.includeDemo}
                  onChange={(e) => updateFilter('includeDemo', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600"
                />
                <span>Incluir demo</span>
              </label>
            )}
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
            {factory.irogPercent !== null ? (
              <>
                <div className="mt-2 text-3xl font-display font-bold font-mono tabular-nums">{factory.irogPercent.toFixed(1)}%</div>
                <div className="mt-1 text-xs text-slate-300 font-mono tabular-nums">
                  Meta: {factory.targetIrogPercent !== null ? `${factory.targetIrogPercent}%` : 'não definida'}
                </div>
              </>
            ) : (
              <>
                <div className="mt-2 text-xl font-display font-bold">Em implantação</div>
                <div className="mt-1 text-xs text-blue-100">{pendingHint(factory.memory.incompleteReasons)}</div>
                <button
                  type="button"
                  onClick={() => setMemoryEntity(factory)}
                  className="mt-2 text-[11px] text-blue-200 hover:text-white underline underline-offset-2 cursor-pointer"
                >
                  Ver o que falta
                </button>
              </>
            )}
          </div>

          {/* 2. Disponibilidade */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Disponibilidade</span>
              <Clock className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              <Pct v={factory.availabilityPercent} />
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
            {factory.performancePercent !== null ? (
              <>
                <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
                  {factory.performancePercent.toFixed(1)}%
                </div>
                <div className="mt-1 text-xs text-slate-500">Ritmo real vs ciclo padrão</div>
              </>
            ) : (
              <>
                <div className="mt-2 text-lg font-display font-semibold text-slate-400">Em implantação</div>
                <div className="mt-1 text-xs text-slate-500">Depende dos padrões de ciclo</div>
              </>
            )}
          </div>

          {/* 4. Qualidade */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Qualidade</span>
              <PackageCheck className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-emerald-700">
              <Pct v={factory.qualityPercent} />
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              Aprovado: {fmtNum(factory.approvedQuantity)} kg
            </div>
          </div>

          {/* 5. Produção Planejada */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção Planejada</span>
              <Target className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {factory.plannedQuantity > 0 ? fmtNum(factory.plannedQuantity) : '—'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {factory.plannedQuantity > 0 ? `${factory.recordsCount} apontamentos` : 'Sem OPs planejadas no período'}
            </div>
          </div>

          {/* 6. Produção Realizada */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção Realizada</span>
              <PackageCheck className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-blue-700">
              {fmtNum(factory.producedQuantity)} <span className="text-sm font-normal text-slate-500">kg</span>
            </div>
            <div className="mt-1 text-xs text-slate-500">{factory.recordsCount} apontamentos no período</div>
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
                factory.plannedQuantity === 0 ? 'text-slate-400' : factory.goalAttainmentPercent >= 95 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {factory.plannedQuantity > 0 ? `${factory.goalAttainmentPercent.toFixed(1)}%` : '—'}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {factory.plannedQuantity > 0 ? 'Realizado / Planejado' : 'Pendente: sem planejamento cadastrado'}
            </div>
          </div>

          {/* 8. Perdas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Perdas / Refugos</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-700">
              {fmtNum(factory.lossQuantity)} <span className="text-sm font-normal text-slate-500">kg</span>
            </div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-500">
              Índice: {lossPercent.toFixed(2)}%
            </div>
          </div>

          {/* 9. Tempo Total de Paradas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Tempo Programado sem Produção</span>
              <Clock className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-700">
              {fmtMinutes(idleMinutes + factory.downtimeMinutes)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {fmtMinutes(factory.downtimeMinutes)} em paradas registradas · {fmtMinutes(idleMinutes)} sem apontamento
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
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums"><Pct v={s.availabilityPercent} /></td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums"><Pct v={s.performancePercent} /></td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums"><Pct v={s.qualityPercent} /></td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-[#0f2544]">
                        <Pct v={s.irogPercent} />
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
                            {shortName(m)}
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
                          <Pct v={m.irogPercent} />
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

      {/* 9 EXECUTIVE CHARTS — cada gráfico mostra os indicadores já calculados; o que está pendente
          sai da legenda em vez de virar barra vazia. Sem animação: estável na TV e na impressão. */}
      {overview && charts && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Evolução Diária */}
          <ChartCard
            title="1. Evolução Diária dos Indicadores"
            subtitle={seriesSubtitle(dailyHas)}
            empty={charts.dailyIrog.length === 0 ? 'Sem dados no período.' : null}
          >
            <LineChart data={charts.dailyIrog}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={16} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" width={44} />
              <Tooltip formatter={pctTip} labelFormatter={fmtDay} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {dailyHas.irog && <Line type="monotone" dataKey="irog" name="IROG" stroke="#0f2544" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />}
              {dailyHas.availability && <Line type="monotone" dataKey="availability" name="Disponibilidade" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
              {dailyHas.performance && <Line type="monotone" dataKey="performance" name="Desempenho" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
              {dailyHas.quality && <Line type="monotone" dataKey="quality" name="Qualidade" stroke="#16a34a" strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />}
            </LineChart>
          </ChartCard>

          {/* 2. Semanal / Mensal */}
          <ChartCard
            title={periodChartMode === 'weekly' ? '2. Indicadores por Semana' : '2. Indicadores por Mês'}
            subtitle="Consolidação por período (soma de tempos, sem média de percentuais)"
            empty={periodData.length === 0 ? 'Sem dados no período.' : null}
            actions={
              <div className="inline-flex p-0.5 bg-slate-100 rounded-lg text-xs">
                {(['weekly', 'monthly'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPeriodChartMode(mode)}
                    className={`px-2.5 py-1 rounded-md cursor-pointer ${
                      periodChartMode === mode ? 'bg-white text-[#0f2544] font-semibold shadow-sm' : 'text-slate-600'
                    }`}
                  >
                    {mode === 'weekly' ? 'Semanal' : 'Mensal'}
                  </button>
                ))}
              </div>
            }
          >
            <BarChart data={periodData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tickFormatter={fmtPeriod} tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" width={44} />
              <Tooltip formatter={pctTip} labelFormatter={fmtPeriod} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {pctBars(periodHas, { irog: 'irog', availability: 'availability', performance: 'performance', quality: 'quality' })}
            </BarChart>
          </ChartCard>

          {/* 3. Por Setor */}
          <ChartCard title="3. Indicadores por Setor" subtitle="Comparativo ponderado por tempo entre os setores" empty={overview.sectors.length === 0 ? 'Sem setores com dados.' : null}>
            <BarChart data={overview.sectors}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" width={44} />
              <Tooltip formatter={pctTip} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {pctBars(entityHas(overview.sectors), ENTITY_KEYS)}
            </BarChart>
          </ChartCard>

          {/* 4. Por Linha */}
          <ChartCard title="4. Indicadores por Linha de Produção" subtitle="Disponibilidade, desempenho e qualidade por linha" empty={overview.lines.length === 0 ? 'Sem linhas com dados.' : null}>
            <BarChart data={overview.lines.map((l) => ({ ...l, label: l.code ?? l.name }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" width={44} />
              <Tooltip formatter={pctTip} labelFormatter={(_l: any, p: any) => (p?.[0]?.payload?.name as string) ?? String(_l)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {pctBars(entityHas(overview.lines), ENTITY_KEYS)}
            </BarChart>
          </ChartCard>

          {/* 5. Ranking de Máquinas */}
          <ChartCard
            title={`5. Ranking de Máquinas — ${rankingMetric.label}`}
            subtitle={rankingMetric.key === 'irogPercent' ? 'IROG individual por equipamento' : 'Ordenado pela disponibilidade enquanto o IROG está em implantação'}
            empty={ranking.length === 0 ? 'Nenhuma máquina com o indicador calculado.' : null}
          >
            <BarChart data={ranking} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" />
              <YAxis dataKey="label" type="category" width={150} tick={{ fontSize: 11, fill: '#334155' }} />
              <Tooltip formatter={pctTip} />
              <Bar dataKey={rankingMetric.key} name={rankingMetric.label} fill="#2563eb" radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: '#0f2544', formatter: (v: any) => (v == null ? '' : `${Number(v).toFixed(1)}%`) }} />
            </BarChart>
          </ChartCard>

          {/* 6. Motivos de Parada */}
          <ChartCard title="6. Principais Motivos de Parada" subtitle="Tempo parado registrado, em minutos" empty={charts.downtimeByReason.length === 0 ? 'Nenhuma parada registrada no período.' : null}>
            <BarChart data={charts.downtimeByReason.slice(0, 7)} layout="vertical" margin={{ left: 8, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis dataKey="reason" type="category" width={190} tick={{ fontSize: 10, fill: '#334155' }} />
              <Tooltip formatter={(v: any) => `${v} min`} />
              <Bar dataKey="minutes" name="Minutos" fill="#dc2626" maxBarSize={34} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: '#334155', formatter: (v: any) => `${v} min` }} />
            </BarChart>
          </ChartCard>

          {/* 7. Motivos de Perda */}
          <ChartCard title="7. Principais Motivos de Perda" subtitle="Perdas registradas, em kg" empty={charts.lossByReason.length === 0 ? 'Nenhuma perda registrada no período.' : null}>
            <BarChart data={charts.lossByReason.slice(0, 7)} layout="vertical" margin={{ left: 8, right: 56 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
              <YAxis dataKey="reason" type="category" width={190} tick={{ fontSize: 10, fill: '#334155' }} />
              <Tooltip formatter={(v: any) => `${fmtNum(Number(v))} kg`} />
              <Bar dataKey="quantity" name="kg" fill="#f59e0b" maxBarSize={34} radius={[0, 4, 4, 0]} isAnimationActive={false} label={{ position: 'right', fontSize: 11, fill: '#334155', formatter: (v: any) => `${fmtNum(Number(v))} kg` }} />
            </BarChart>
          </ChartCard>

          {/* 8. Por Turno */}
          {shiftHasPct ? (
            <ChartCard title="8. Indicadores por Turno" subtitle="Comparação dos três pilares entre turnos">
              <BarChart data={charts.byShift}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: '#64748b' }} unit="%" width={44} />
                <Tooltip formatter={pctTip} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {pctBars(periodLikeHas(charts.byShift), { irog: 'irog', availability: 'availability', performance: 'performance', quality: 'quality' })}
              </BarChart>
            </ChartCard>
          ) : (
            <ChartCard
              title="8. Produção por Turno (kg)"
              subtitle={`${noShiftShare}% do volume foi apontado sem turno no Iniflex — indicadores por turno indisponíveis`}
              empty={charts.byShift.length === 0 ? 'Sem produção no período.' : null}
            >
              <BarChart data={charts.byShift} margin={{ top: 18 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} interval={0} />
                <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmtNum(Number(v))} width={56} />
                <Tooltip formatter={(v: any) => `${fmtNum(Number(v))} kg`} />
                <Bar dataKey="realized" name="Produção (kg)" fill="#2563eb" radius={[4, 4, 0, 0]} isAnimationActive={false} label={{ position: 'top', fontSize: 11, fill: '#0f2544', formatter: (v: any) => fmtNum(Number(v)) }} />
              </BarChart>
            </ChartCard>
          )}

          {/* 9. Produção diária (com planejado quando houver OPs planejadas) */}
          <ChartCard
            wide
            title={dailyHasPlanned ? '9. Planejado versus Realizado Diário (kg)' : '9. Produção Diária (kg)'}
            subtitle={dailyHasPlanned ? 'Aderência do volume diário ao programado' : 'Peso líquido apontado por dia · o planejado aparece quando as OPs trouxerem a quantidade programada'}
            empty={charts.dailyIrog.length === 0 ? 'Sem produção no período.' : null}
          >
            <AreaChart data={charts.dailyIrog}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tickFormatter={fmtDay} tick={{ fontSize: 11, fill: '#64748b' }} minTickGap={16} />
              <YAxis tick={{ fontSize: 11, fill: '#64748b' }} tickFormatter={(v) => fmtNum(Number(v))} width={56} />
              <Tooltip formatter={(v: any) => `${fmtNum(Number(v))} kg`} labelFormatter={fmtDay} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {dailyHasPlanned && (
                <Area type="monotone" dataKey="planned" name="Planejado" stroke="#64748b" fill="#cbd5e1" fillOpacity={0.3} isAnimationActive={false} />
              )}
              <Area type="monotone" dataKey="realized" name="Realizado" stroke="#2563eb" strokeWidth={2} fill="#3b82f6" fillOpacity={0.2} isAnimationActive={false} />
            </AreaChart>
          </ChartCard>
        </section>
      )}

      <IrogCalculationMemoryModal entity={memoryEntity} onClose={() => setMemoryEntity(null)} />
    </div>
  );
}
