import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import {
  Maximize2,
  Minimize2,
  RefreshCw,
  ArrowLeft,
  Play,
  Pause,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { api } from '../../lib/api';
import { BrandMark } from '../BrandMark';
import type { CatalogData, DashboardFilters, DashboardSummary, ProductionRecord } from '../../types';

interface TvProjectionViewProps {
  catalog: CatalogData;
  onExit: () => void;
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

function detectCurrentShift(shifts: CatalogData['shifts'], now: Date): string {
  if (!shifts.length) return 'Operação contínua';
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const s of shifts) {
    if (!s.active) continue;
    if (s.start_time <= s.end_time) {
      if (hhmm >= s.start_time && hhmm < s.end_time) return s.name;
    } else {
      if (hhmm >= s.start_time || hhmm < s.end_time) return s.name;
    }
  }
  return shifts[0]?.name || 'Operação contínua';
}

export function TvProjectionView({ catalog, onExit }: TvProjectionViewProps) {
  const [now, setNow] = useState(() => new Date());
  const [sectorId, setSectorId] = useState('');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const [autoSlide, setAutoSlide] = useState(true);
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentRecords, setRecentRecords] = useState<ProductionRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const filters: DashboardFilters = {
      startDate: '',
      endDate: '',
      shiftId: '',
      sectorId,
      lineId: '',
      productId: '',
      operatorId: '',
      includeDemo,
    };
    try {
      const [sumRes, recRes] = await Promise.all([
        api.getDashboardSummary(filters),
        api.getProductionRecords(filters),
      ]);
      setSummary(sumRes);
      setRecentRecords(recRes.records.slice(0, 7));
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Falha ao atualizar dados do painel TV.');
    } finally {
      setRefreshing(false);
    }
  }, [sectorId, includeDemo]);

  // Initial + periodic data refresh
  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [fetchData, refreshSeconds]);

  // Live 1-second clock
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Auto-rotate slides every 15s when enabled
  useEffect(() => {
    if (!autoSlide) return;
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev === 0 ? 1 : 0));
    }, 15000);
    return () => window.clearInterval(id);
  }, [autoSlide]);

  // Track browser fullscreen state
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if blocked by iframe/browser policy; full-viewport TV layout still works
    }
  };

  const handleExit = async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch {
        // ignore
      }
    }
    onExit();
  };

  const currentShiftLabel = useMemo(() => detectCurrentShift(catalog.shifts, now), [catalog.shifts, now]);
  const selectedSectorName = sectorId
    ? catalog.sectors.find((s) => s.id === sectorId)?.name || 'Setor selecionado'
    : 'Planta Geral (Todos os Setores)';

  const kpis = summary?.kpis;
  const charts = summary?.charts;

  return (
    <div className="min-h-screen bg-[#071324] text-slate-100 flex flex-col select-none">
      {/* Top TV / Projector Header */}
      <header className="px-6 py-4 bg-[#0b1d36] border-b border-slate-700/70 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <BrandMark variant="light" size="lg" />
          <div className="hidden sm:block pl-5 border-l border-slate-700">
            <div className="text-xs font-medium text-blue-300">Gestão à Vista · Modo Projeção</div>
            <div className="text-sm font-semibold text-white">
              {selectedSectorName} · {currentShiftLabel}
            </div>
          </div>
        </div>

        {/* Controls & Live Clock */}
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filtrar setor na TV"
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs bg-[#0f2544] border border-slate-600 rounded-lg text-slate-100 focus:outline-none focus:border-blue-400"
          >
            <option value="">Todos os setores</option>
            {catalog.sectors.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5 rounded-lg bg-[#0f2544] border border-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={includeDemo}
              onChange={(e) => setIncludeDemo(e.target.checked)}
              className="rounded border-slate-500 text-blue-500"
            />
            <span>Demo</span>
          </label>

          {/* Slide switcher */}
          <div className="inline-flex items-center p-1 bg-[#071324] border border-slate-700 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveSlide(0)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeSlide === 0 ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Visão 1: Metas
            </button>
            <button
              type="button"
              onClick={() => setActiveSlide(1)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                activeSlide === 1 ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Visão 2: Turnos e Linha
            </button>
            <button
              type="button"
              onClick={() => setAutoSlide((v) => !v)}
              title={autoSlide ? 'Pausar alternância automática' : 'Retomar alternância automática'}
              className="ml-1 p-1.5 text-slate-300 hover:text-white rounded cursor-pointer"
            >
              {autoSlide ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          </div>

          <select
            aria-label="Intervalo de atualização"
            value={refreshSeconds}
            onChange={(e) => setRefreshSeconds(Number(e.target.value))}
            className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono bg-[#0f2544] border border-slate-600 rounded-lg text-slate-100"
          >
            <option value={15}>Atualizar: 15s</option>
            <option value={30}>Atualizar: 30s</option>
            <option value={60}>Atualizar: 1m</option>
            <option value={300}>Atualizar: 5m</option>
          </select>

          <button
            type="button"
            onClick={fetchData}
            title="Atualizar dados agora"
            className="min-h-[38px] px-3 py-1.5 bg-[#0f2544] hover:bg-[#17345e] border border-slate-600 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span className="hidden xl:inline">Atualizar</span>
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Sair Tela Cheia' : 'Tela Cheia'}</span>
          </button>

          <button
            type="button"
            onClick={handleExit}
            className="min-h-[38px] px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar ao Painel</span>
          </button>

          <div className="pl-4 border-l border-slate-700 text-right hidden md:block">
            <div className="text-xl font-mono tabular-nums font-bold text-white leading-none">
              {now.toLocaleTimeString('pt-BR')}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
            </div>
          </div>
        </div>
      </header>

      {error && (
        <div className="mx-6 mt-4 p-3.5 rounded-xl bg-red-950/70 border border-red-700 flex items-center gap-2.5 text-sm text-red-200">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main TV Content Viewport */}
      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1920px] w-full mx-auto">
        {/* Top Large KPI Strip (always visible on TV) */}
        {kpis && (
          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Produção do Dia</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-white">
                {formatNumber(kpis.todayProduction)}
              </div>
              <div className="mt-1.5 text-xs text-slate-400">Volume apontado hoje</div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Produção do Mês</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-blue-300">
                {formatNumber(kpis.monthProduction)}
              </div>
              <div className="mt-1.5 text-xs text-slate-400">Acumulado mensal</div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Realizado / Planejado</div>
              <div className="mt-2 text-2xl lg:text-3xl font-display font-bold font-mono tabular-nums text-white">
                {formatNumber(kpis.realizedTotal)}
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-400">
                Meta: {formatNumber(kpis.plannedTotal)}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Atingimento da Meta</span>
                {kpis.goalAttainmentPercent >= 95 ? (
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                ) : (
                  <TrendingDown className="w-4 h-4 text-red-400" />
                )}
              </div>
              <div
                className={`mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums ${
                  kpis.goalAttainmentPercent >= 95 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {kpis.goalAttainmentPercent.toFixed(1)}%
              </div>
              <div className="mt-1.5 text-xs text-slate-300">
                {kpis.goalAttainmentPercent >= 95 ? 'Meta atingida' : 'Abaixo da meta (95%)'}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Perdas / Refugos</div>
              <div
                className={`mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums ${
                  kpis.lossPercent <= 3 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {kpis.lossPercent.toFixed(2)}%
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-slate-400">
                {formatNumber(kpis.lossesTotal)} perdidos
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="flex items-center justify-between text-xs font-medium text-slate-300">
                <span>Eficiência / Paradas</span>
                <Clock className="w-4 h-4 text-slate-400" />
              </div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-white">
                {kpis.productiveEfficiencyPercent.toFixed(1)}%
              </div>
              <div className="mt-1.5 text-xs font-mono tabular-nums text-amber-300">
                Paradas: {formatMinutes(kpis.totalDowntimeMinutes)}
              </div>
            </div>
          </section>
        )}

        {/* SLIDE 1: METAS, EVOLUÇÃO E DESEMPENHO POR SETOR */}
        {charts && activeSlide === 0 && (
          <section className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-7 bg-[#0f2544] border border-slate-700/80 rounded-xl p-6 flex flex-col">
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-display font-bold text-white">
                    Produção Diária — Planejado vs Realizado
                  </h2>
                  <p className="text-xs text-slate-400">Acompanhamento de entregas ao longo dos dias</p>
                </div>
              </div>
              <div className="flex-1 min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={charts.dailyProduction}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                    <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                    <YAxis tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#09172b',
                        borderColor: '#334155',
                        color: '#f8fafc',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 13, color: '#e2e8f0' }} />
                    <Area
                      type="monotone"
                      dataKey="planned"
                      name="Planejado"
                      stroke="#94a3b8"
                      fill="#64748b"
                      fillOpacity={0.25}
                      strokeWidth={2}
                    />
                    <Area
                      type="monotone"
                      dataKey="realized"
                      name="Realizado"
                      stroke="#3b82f6"
                      fill="#2563eb"
                      fillOpacity={0.35}
                      strokeWidth={3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-5 bg-[#0f2544] border border-slate-700/80 rounded-xl p-6 flex flex-col">
              <div className="mb-5">
                <h2 className="text-lg font-display font-bold text-white">Metas por Setor</h2>
                <p className="text-xs text-slate-400">Progresso realizado frente ao volume planejado</p>
              </div>

              <div className="space-y-5 flex-1">
                {charts.bySector.map((sec) => {
                  const pct = sec.planned > 0 ? (sec.realized / sec.planned) * 100 : 0;
                  const barWidth = Math.min(100, Math.max(0, pct));
                  const ok = pct >= 95;
                  return (
                    <div key={sec.name} className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-base font-semibold text-white">{sec.name}</span>
                        <span className="font-mono tabular-nums text-sm text-slate-300">
                          {formatNumber(sec.realized)} / {formatNumber(sec.planned)}{' '}
                          <strong className={ok ? 'text-emerald-400 ml-2' : 'text-red-400 ml-2'}>
                            ({pct.toFixed(1)}%)
                          </strong>
                        </span>
                      </div>
                      <div className="w-full h-3.5 bg-[#071324] rounded-full overflow-hidden border border-slate-700">
                        <div
                          className={`h-full rounded-full ${ok ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* SLIDE 2: TURNOS, MOTIVOS DE PARADA E ÚLTIMOS APONTAMENTOS */}
        {charts && activeSlide === 1 && (
          <section className="flex-1 flex flex-col gap-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
                <h2 className="text-base font-display font-bold text-white mb-3">Produção por Turno</h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={charts.byShift}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                      <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                      <YAxis tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#09172b',
                          borderColor: '#334155',
                          color: '#f8fafc',
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Bar dataKey="planned" name="Planejado" fill="#64748b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="realized" name="Realizado" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
                <h2 className="text-base font-display font-bold text-white mb-3">
                  Principais Motivos de Parada (min)
                </h2>
                {charts.downtimeReasons.length === 0 ? (
                  <div className="h-56 flex items-center justify-center text-sm text-slate-400">
                    Nenhuma parada registrada no escopo selecionado.
                  </div>
                ) : (
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.downtimeReasons.slice(0, 5)} layout="vertical" margin={{ left: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                        <YAxis dataKey="reason" type="category" width={160} tick={{ fontSize: 11, fill: '#e2e8f0' }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: '#09172b',
                            borderColor: '#334155',
                            color: '#f8fafc',
                          }}
                        />
                        <Bar dataKey="minutes" name="Minutos" fill="#ef4444" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-700/80 flex items-center justify-between">
                <h2 className="text-base font-display font-bold text-white">
                  Últimos Apontamentos da Produção
                </h2>
                <span className="text-xs text-slate-400">Atualização contínua do chão de fábrica</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#09172b] text-xs text-slate-300 border-b border-slate-700/80">
                    <tr>
                      <th className="px-4 py-2.5">Data / Turno</th>
                      <th className="px-4 py-2.5">Setor / Linha</th>
                      <th className="px-4 py-2.5">Produto</th>
                      <th className="px-4 py-2.5">Responsável</th>
                      <th className="px-4 py-2.5 text-right">Realizado</th>
                      <th className="px-4 py-2.5 text-right">Perdas</th>
                      <th className="px-4 py-2.5 text-right">Parada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {recentRecords.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-200 whitespace-nowrap">
                          {r.production_date} · {r.shift_name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-100">
                          {r.sector_name} · <span className="text-slate-300">{r.line_name}</span>
                        </td>
                        <td className="px-4 py-2.5 text-white font-medium">{r.product_name}</td>
                        <td className="px-4 py-2.5 text-slate-300">{r.operator_name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-blue-300">
                          {formatNumber(r.produced_quantity)} {r.unit_of_measure}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-300">
                          {formatNumber(r.loss_quantity)} {r.unit_of_measure}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-300">
                          {r.has_downtime ? `${r.total_downtime_minutes} min` : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Quiet Status Footer */}
      <footer className="px-6 py-2.5 bg-[#09172b] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span>
          novo.forteflex · Gestão à Vista
          {kpis?.demoRecordsCount ? ` · Inclui ${kpis.demoRecordsCount} registros demonstrativos` : ''}
        </span>
        <span className="font-mono tabular-nums">
          {lastUpdated ? `Última atualização: ${lastUpdated.toLocaleTimeString('pt-BR')}` : 'Carregando...'}
        </span>
      </footer>
    </div>
  );
}
