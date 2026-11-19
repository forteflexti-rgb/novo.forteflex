import React, { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  AlertCircle,
  FilterX,
  Info,
  TrendingUp,
  TrendingDown,
  Clock,
  Target,
  Activity,
  PackageCheck,
  AlertTriangle,
  Tv,
} from 'lucide-react';
import { api } from '../../lib/api';
import type { CatalogData, DashboardFilters, DashboardSummary } from '../../types';

interface AdminDashboardProps {
  catalog: CatalogData;
  onOpenTvMode?: () => void;
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('pt-BR').format(n);
}

function formatMinutes(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

const DEFAULT_FILTERS: DashboardFilters = {
  startDate: '',
  endDate: '',
  shiftId: '',
  sectorId: '',
  lineId: '',
  productId: '',
  operatorId: '',
  includeDemo: true,
};

export function AdminDashboard({ catalog, onOpenTvMode }: AdminDashboardProps) {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSummary = useCallback(async (activeFilters: DashboardFilters) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getDashboardSummary(activeFilters);
      setSummary(data);
    } catch (err: any) {
      setError(err.message || 'Erro ao calcular indicadores do dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummary(filters);
  }, [filters, loadSummary]);

  const filteredLines = filters.sectorId
    ? catalog.lines.filter((l) => l.sector_id === filters.sectorId)
    : catalog.lines;

  const updateFilter = <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => {
    setFilters((prev) => {
      const next = { ...prev, [key]: value };
      if (key === 'sectorId') {
        next.lineId = '';
      }
      return next;
    });
  };

  const kpis = summary?.kpis;
  const charts = summary?.charts;

  return (
    <div className="space-y-6">
      {/* Transparent Demonstration Data Notice */}
      {kpis && kpis.demoRecordsCount > 0 && (
        <div className="bg-blue-50/80 border border-blue-200 rounded-xl px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-blue-900">
          <div className="flex items-start sm:items-center gap-2.5">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5 sm:mt-0" />
            <span>
              Os indicadores atuais incluem{' '}
              <strong className="font-mono tabular-nums">{kpis.demoRecordsCount}</strong> registros demonstrativos
              para validação inicial. Todos os valores são calculados dinamicamente a partir do banco de dados.
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

      {/* Filters Panel */}
      <section className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-display font-bold text-[#0f2544]">Filtros analíticos</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={filters.includeDemo}
                onChange={(e) => updateFilter('includeDemo', e.target.checked)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span>Incluir dados demonstrativos</span>
            </label>
            <button
              type="button"
              onClick={() => setFilters(DEFAULT_FILTERS)}
              className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
            >
              <FilterX className="w-3.5 h-3.5" />
              <span>Limpar filtros</span>
            </button>
            {onOpenTvMode && (
              <button
                type="button"
                onClick={onOpenTvMode}
                className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>Abrir Modo TV / Projetor</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
              <option value="">Todos os turnos</option>
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
              <option value="">Todos os setores</option>
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
              <option value="">Todas as linhas</option>
              {filteredLines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} — {l.name}
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
              <option value="">Todos os produtos</option>
              {catalog.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Funcionário</label>
            <select
              value={filters.operatorId}
              onChange={(e) => updateFilter('operatorId', e.target.value)}
              className="w-full min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todos</option>
              {(catalog.operators || []).map((o) => (
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

      {/* 9 KPI Cards Grid */}
      {loading && !summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, idx) => (
            <div key={idx} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : kpis ? (
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção total do dia</span>
              <PackageCheck className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {formatNumber(kpis.todayProduction)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Soma dos lançamentos na data de hoje</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção total do mês</span>
              <PackageCheck className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {formatNumber(kpis.monthProduction)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Acumulado no mês corrente</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção planejada</span>
              <Target className="w-4 h-4 text-slate-500" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {formatNumber(kpis.plannedTotal)}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {kpis.recordsCount} lançamentos filtrados
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Produção realizada</span>
              <TrendingUp className="w-4 h-4 text-blue-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-blue-700">
              {formatNumber(kpis.realizedTotal)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Volume total produzido no período</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Atingimento da meta</span>
              {kpis.goalAttainmentPercent >= 95 ? (
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              ) : (
                <TrendingDown className="w-4 h-4 text-red-600" />
              )}
            </div>
            <div
              className={`mt-2 text-2xl font-display font-bold font-mono tabular-nums ${
                kpis.goalAttainmentPercent >= 95 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {kpis.goalAttainmentPercent.toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {kpis.goalAttainmentPercent >= 95 ? 'Dentro da meta operacional' : 'Abaixo da meta planejada'} · Realizado / Planejado
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Quantidade de perdas</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-red-700">
              {formatNumber(kpis.lossesTotal)}
            </div>
            <div className="mt-1 text-xs text-slate-500">Total de refugos e perdas registradas</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Percentual de perdas</span>
              <AlertTriangle className="w-4 h-4 text-red-600" />
            </div>
            <div
              className={`mt-2 text-2xl font-display font-bold font-mono tabular-nums ${
                kpis.lossPercent <= 3 ? 'text-emerald-700' : 'text-red-700'
              }`}
            >
              {kpis.lossPercent.toFixed(2)}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {kpis.lossPercent <= 3 ? 'Índice sob controle (≤ 3%)' : 'Alerta de refugo elevado (> 3%)'}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Tempo total de paradas</span>
              <Clock className="w-4 h-4 text-slate-600" />
            </div>
            <div className="mt-2 text-2xl font-display font-bold font-mono tabular-nums text-[#0f2544]">
              {formatMinutes(kpis.totalDowntimeMinutes)}
            </div>
            <div className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {kpis.totalDowntimeMinutes} minutos acumulados
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>Eficiência produtiva</span>
              <Activity className="w-4 h-4 text-emerald-600" />
            </div>
            <div
              className={`mt-2 text-2xl font-display font-bold font-mono tabular-nums ${
                kpis.productiveEfficiencyPercent >= 85 ? 'text-emerald-700' : 'text-[#0f2544]'
              }`}
            >
              {kpis.productiveEfficiencyPercent.toFixed(1)}%
            </div>
            <div className="mt-1 text-xs text-slate-500">
              Disponibilidade × Qualidade × Desempenho
            </div>
          </div>
        </section>
      ) : null}

      {/* Empty State when 0 records match filters */}
      {charts && kpis?.recordsCount === 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center space-y-2">
          <p className="text-sm font-medium text-slate-800">Nenhum dado de produção encontrado para os filtros atuais.</p>
          <p className="text-xs text-slate-500">
            Ajuste o período ou habilite os registros demonstrativos para visualizar os gráficos gerenciais.
          </p>
        </div>
      )}

      {/* 8 Managerial Charts */}
      {charts && kpis && kpis.recordsCount > 0 && (
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* 1. Produção diária */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Produção diária</h3>
              <p className="text-xs text-slate-500">Volume planejado versus produzido por dia</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.dailyProduction}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area type="monotone" dataKey="planned" name="Planejado" stroke="#64748b" fill="#cbd5e1" fillOpacity={0.3} />
                  <Area type="monotone" dataKey="realized" name="Realizado" stroke="#2563eb" fill="#3b82f6" fillOpacity={0.2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 2. Produção por turno */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Produção por turno</h3>
              <p className="text-xs text-slate-500">Comparativo de entregas entre turnos operacionais</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.byShift}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="planned" name="Planejado" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="realized" name="Realizado" fill="#0f2544" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 3. Produção por setor */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Produção por setor</h3>
              <p className="text-xs text-slate-500">Volume realizado em cada área produtiva</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.bySector} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11, fill: '#334155' }} />
                  <Tooltip />
                  <Bar dataKey="realized" name="Realizado" fill="#2563eb" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 4. Produção por funcionário */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Produção por funcionário</h3>
              <p className="text-xs text-slate-500">Total produzido e aprovado por operador responsável</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.byEmployee}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="realized" name="Produzido" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="approved" name="Aprovado" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 5. Produção por produto */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Produção por produto</h3>
              <p className="text-xs text-slate-500">Distribuição do volume por item fabricado</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.byProduct}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Bar dataKey="realized" name="Produzido" fill="#0f2544" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 6. Planejado versus realizado */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Planejado versus realizado</h3>
              <p className="text-xs text-slate-500">Aderência ao planejamento por setor</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.plannedVsActual}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="planned" name="Planejado" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="realized" name="Realizado" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 7. Evolução das perdas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Evolução das perdas</h3>
              <p className="text-xs text-slate-500">Quantidade perdida e percentual diário de refugo</p>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={charts.lossEvolution}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: '#dc2626' }} unit="%" />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="left" dataKey="losses" name="Perdas (qtd)" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                  <Line yAxisId="right" type="monotone" dataKey="lossPercent" name="% Perda" stroke="#dc2626" strokeWidth={2} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* 8. Motivos de paradas */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="mb-4">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Motivos de paradas</h3>
              <p className="text-xs text-slate-500">Minutos acumulados por causa de interrupção</p>
            </div>
            {charts.downtimeReasons.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                Nenhuma parada registrada no período filtrado.
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.downtimeReasons} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis type="number" tick={{ fontSize: 11, fill: '#64748b' }} unit="m" />
                    <YAxis dataKey="reason" type="category" width={150} tick={{ fontSize: 10, fill: '#334155' }} />
                    <Tooltip />
                    <Bar dataKey="minutes" name="Minutos parados" fill="#dc2626" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
