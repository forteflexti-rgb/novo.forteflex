import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
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
} from 'lucide-react';
import { api } from '../../lib/api';
import { BrandMark } from '../BrandMark';
import type { CatalogData, DashboardFilters, IrogFactoryOverview, ProductionRecord } from '../../types';

interface TvProjectionViewProps {
  catalog: CatalogData;
  onExit: () => void;
}

/** Eixo de percentual: 0–100%, ou até o próximo múltiplo de 25 quando algum valor passar de 100%. */
const PCT_DOMAIN: [number, (max: number) => number] = [0, (max: number) => Math.max(100, Math.ceil(max / 25) * 25)];

function fmtNum(n: number): string {
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(n);
}

function fmtPct(v: number | null): string {
  return v === null ? 'Em implantação' : `${v.toFixed(1)}%`;
}

/** Valor grande da TV: pendente aparece discreto, nunca como erro. */
function TvValue({ v }: { v: number | null }) {
  if (v === null) return <span className="text-lg font-sans font-semibold text-slate-400">Em implantação</span>;
  return <>{v.toFixed(1)}%</>;
}

/** IROG quando calculado; senão a disponibilidade, com o rótulo certo. */
function headline(e: { irogPercent: number | null; availabilityPercent: number | null }) {
  return e.irogPercent !== null ? { label: 'IROG', value: e.irogPercent } : { label: 'Disp.', value: e.availabilityPercent };
}

const fmtDay = (v: unknown) => {
  const d = String(v ?? '');
  return d.length >= 10 ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : d;
};

function fmtMin(totalMin: number): string {
  const h = Math.floor(totalMin / 60);
  const m = Math.round(totalMin % 60);
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}

function detectCurrentShift(shifts: CatalogData['shifts'], now: Date): string {
  if (!shifts.length) return 'Operação contínua';
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  for (const s of shifts) {
    if (!s.active) continue;
    if (s.start_time <= s.end_time) {
      if (hhmm >= s.start_time && hhmm < s.end_time) return s.name;
    } else if (hhmm >= s.start_time || hhmm < s.end_time) {
      return s.name;
    }
  }
  return shifts[0]?.name || 'Operação contínua';
}

type TvPeriod = 'today' | '7d' | '30d' | 'month' | 'all';

/** Intervalo de datas (horário de Brasília) do período escolhido na TV. */
function periodRange(p: TvPeriod): { startDate: string; endDate: string } {
  const brt = (d: Date) => new Date(d.getTime() - 3 * 3600000).toISOString().slice(0, 10);
  const now = new Date();
  const today = brt(now);
  const daysAgo = (n: number) => brt(new Date(now.getTime() - n * 86400000));
  switch (p) {
    case 'today':
      return { startDate: today, endDate: today };
    case '7d':
      return { startDate: daysAgo(6), endDate: today };
    case '30d':
      return { startDate: daysAgo(29), endDate: today };
    case 'month':
      return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
    default:
      return { startDate: '', endDate: '' };
  }
}

export function TvProjectionView({ catalog, onExit }: TvProjectionViewProps) {
  const [now, setNow] = useState(() => new Date());
  const [sectorId, setSectorId] = useState('');
  const [includeDemo, setIncludeDemo] = useState(true);
  const [period, setPeriod] = useState<TvPeriod>('all');
  const [refreshSeconds, setRefreshSeconds] = useState(30);
  const [autoSlide, setAutoSlide] = useState(true);
  const [activeSlide, setActiveSlide] = useState<0 | 1>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [overview, setOverview] = useState<IrogFactoryOverview | null>(null);
  const [recentRecords, setRecentRecords] = useState<ProductionRecord[]>([]);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    const { startDate, endDate } = periodRange(period);
    const filters: DashboardFilters = {
      startDate,
      endDate,
      shiftId: '',
      sectorId,
      lineId: '',
      productId: '',
      operatorId: '',
      includeDemo,
    };
    try {
      const [ovRes, recRes] = await Promise.all([
        api.getIrogOverview(filters),
        api.getProductionRecords(filters),
      ]);
      setOverview(ovRes);
      setRecentRecords(recRes.records.slice(0, 6));
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err.message || 'Falha ao atualizar painel TV.');
    } finally {
      setRefreshing(false);
    }
  }, [sectorId, includeDemo, period]);

  useEffect(() => {
    fetchData();
    const id = window.setInterval(fetchData, refreshSeconds * 1000);
    return () => window.clearInterval(id);
  }, [fetchData, refreshSeconds]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!autoSlide) return;
    const id = window.setInterval(() => {
      setActiveSlide((prev) => (prev === 0 ? 1 : 0));
    }, 15000);
    return () => window.clearInterval(id);
  }, [autoSlide]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      // ignore if blocked by iframe policy
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
    ? catalog.sectors.find((s) => s.id === sectorId)?.name || 'Setor'
    : 'Planta Geral (IROG ForteFlex)';

  const f = overview?.factory;
  const mc = overview?.machineCounts;
  const dailyHasIrog = (overview?.charts.dailyIrog ?? []).some((d) => d.irog !== null) && f?.irogPercent !== null;

  return (
    <div className="min-h-screen bg-[#071324] text-slate-100 flex flex-col select-none">
      {/* Header */}
      <header className="px-6 py-4 bg-[#0b1d36] border-b border-slate-700/70 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-5">
          <BrandMark variant="light" size="lg" />
          <div className="hidden sm:block pl-5 border-l border-slate-700">
            <div className="text-xs font-medium text-blue-300">Gestão à Vista · IROG ForteFlex</div>
            <div className="text-sm font-semibold text-white">
              {selectedSectorName} · {currentShiftLabel}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Filtrar setor na TV"
            value={sectorId}
            onChange={(e) => setSectorId(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs bg-[#0f2544] border border-slate-600 rounded-lg text-slate-100"
          >
            <option value="">Todos os setores</option>
            {catalog.sectors.filter((s) => s.active).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            aria-label="Período exibido na TV"
            value={period}
            onChange={(e) => setPeriod(e.target.value as TvPeriod)}
            className="min-h-[38px] px-3 py-1.5 text-xs bg-[#0f2544] border border-slate-600 rounded-lg text-slate-100"
          >
            <option value="today">Hoje</option>
            <option value="7d">Últimos 7 dias</option>
            <option value="30d">Últimos 30 dias</option>
            <option value="month">Mês atual</option>
            <option value="all">Todo o histórico</option>
          </select>

          {overview && overview.demoRecordsCount > 0 && (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 px-2.5 py-1.5 rounded-lg bg-[#0f2544] border border-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDemo}
                onChange={(e) => setIncludeDemo(e.target.checked)}
                className="rounded border-slate-500 text-blue-500"
              />
              <span>Demo</span>
            </label>
          )}

          <div className="inline-flex items-center p-1 bg-[#071324] border border-slate-700 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveSlide(0)}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                activeSlide === 0 ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Visão 1: IROG &amp; Setores
            </button>
            <button
              type="button"
              onClick={() => setActiveSlide(1)}
              className={`px-3 py-1 text-xs font-medium rounded-md cursor-pointer ${
                activeSlide === 1 ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white'
              }`}
            >
              Visão 2: Máquinas &amp; Paradas
            </button>
            <button
              type="button"
              onClick={() => setAutoSlide((v) => !v)}
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
            <option value={15}>15s</option>
            <option value={30}>30s</option>
            <option value={60}>1m</option>
            <option value={300}>5m</option>
          </select>

          <button
            type="button"
            onClick={fetchData}
            className="min-h-[38px] px-3 py-1.5 bg-[#0f2544] hover:bg-[#17345e] border border-slate-600 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={toggleFullscreen}
            className="min-h-[38px] px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span>{isFullscreen ? 'Sair Tela Cheia' : 'Tela Cheia'}</span>
          </button>

          <button
            type="button"
            onClick={handleExit}
            className="min-h-[38px] px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-100 rounded-lg text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Voltar</span>
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

      <main className="flex-1 p-6 flex flex-col gap-6 max-w-[1920px] w-full mx-auto">
        {/* Top IROG KPI Strip */}
        {f && mc && (
          <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
            <div className="bg-blue-700 border border-blue-500 rounded-xl p-5">
              <div className="text-xs font-medium text-blue-100">IROG Geral</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-white">
                {f.irogPercent !== null ? `${f.irogPercent.toFixed(1)}%` : <span className="text-2xl font-sans">Em implantação</span>}
              </div>
              <div className="mt-1.5 text-xs text-blue-100 font-mono">
                {f.irogPercent !== null ? `Meta: ${f.targetIrogPercent !== null ? `${f.targetIrogPercent}%` : 'não definida'}` : 'Aguardando padrões de ciclo'}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Disponibilidade</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-blue-300">
                <TvValue v={f.availabilityPercent} />
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400">
                Sem produção: {fmtMin(Math.max(0, f.plannedTimeMinutes - f.operatingTimeMinutes))}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Desempenho</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-amber-300">
                <TvValue v={f.performancePercent} />
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400">
                {overview?.provisionalStandards ? 'Padrão provisório (ritmo de Out/26)' : `Produzido: ${fmtNum(f.producedQuantity)} kg`}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Qualidade</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-emerald-400">
                <TvValue v={f.qualityPercent} />
              </div>
              <div className="mt-1.5 text-xs font-mono text-red-300">
                Perdas: {fmtNum(f.lossQuantity)} kg
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Máquinas Operando</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-emerald-400">
                {mc.operating} <span className="text-lg text-slate-400">/ {mc.total}</span>
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400">
                Paradas: {mc.stopped} · Manut.: {mc.maintenance}
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
              <div className="text-xs font-medium text-slate-300">Atingimento Volume</div>
              <div className="mt-2 text-3xl lg:text-4xl font-display font-bold font-mono tabular-nums text-white">
                {f.plannedQuantity > 0 ? `${f.goalAttainmentPercent.toFixed(1)}%` : <span className="text-lg font-sans font-semibold text-slate-400">Sem planejamento</span>}
              </div>
              <div className="mt-1.5 text-xs font-mono text-slate-400">
                {f.plannedQuantity > 0 ? `Planejado: ${fmtNum(f.plannedQuantity)} kg` : 'OPs sem quantidade programada'}
              </div>
            </div>
          </section>
        )}

        {/* SLIDE 1: IROG EVOLUÇÃO, SETORES & LINHAS */}
        {overview && activeSlide === 0 && (
          <section className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5">
            <div className="lg:col-span-6 bg-[#0f2544] border border-slate-700/80 rounded-xl p-6 flex flex-col">
              <h2 className="text-lg font-display font-bold text-white mb-1">Evolução Diária dos Indicadores (%)</h2>
              <p className="text-xs text-slate-400 mb-4">{dailyHasIrog ? 'IROG, Disponibilidade e Qualidade' : 'Disponibilidade e Qualidade · IROG em implantação'}</p>
              <div className="flex-1 min-h-[290px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={overview.charts.dailyIrog}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                    <XAxis dataKey="date" tickFormatter={fmtDay} minTickGap={18} tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                    <YAxis domain={PCT_DOMAIN} tickCount={6} tick={{ fontSize: 12, fill: '#cbd5e1' }} unit="%" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#09172b', borderColor: '#334155', color: '#f8fafc' }}
                    />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {dailyHasIrog && <Line type="monotone" dataKey="irog" name="IROG" stroke="#3b82f6" strokeWidth={3} dot={false} connectNulls isAnimationActive={false} />}
                    <Line type="monotone" dataKey="availability" name="Disponibilidade" stroke="#93c5fd" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                    <Line type="monotone" dataKey="quality" name="Qualidade" stroke="#34d399" strokeWidth={2.5} dot={false} connectNulls isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="lg:col-span-6 bg-[#0f2544] border border-slate-700/80 rounded-xl p-6 flex flex-col gap-5">
              <div>
                <h2 className="text-lg font-display font-bold text-white">{dailyHasIrog ? 'IROG por Setor & Linha' : 'Disponibilidade por Setor & Linha'}</h2>
                <p className="text-xs text-slate-400">{dailyHasIrog ? 'Consolidado ponderado por tempo · metas ainda não cadastradas' : 'IROG em implantação: aguardando os padrões de ciclo'}</p>
              </div>
              <div className="space-y-4">
                {overview.sectors.map((sec) => {
                  const h = headline(sec);
                  const val = h.value ?? 0;
                  const target = h.label === 'IROG' ? sec.targetIrogPercent : null;
                  return (
                    <div key={sec.id} className="space-y-1.5">
                      <div className="flex items-baseline justify-between">
                        <span className="text-base font-semibold text-white">{sec.name}</span>
                        <span className="font-mono tabular-nums text-sm">
                          <span className="text-slate-400 mr-2 text-xs">{h.label}</span>
                          <strong className={target === null || val >= target ? 'text-emerald-400' : 'text-amber-300'}>
                            {fmtPct(h.value)}
                          </strong>
                          {target !== null && <span className="text-slate-400 ml-2">(Meta {target}%)</span>}
                        </span>
                      </div>
                      <div className="w-full h-3 bg-[#071324] rounded-full overflow-hidden border border-slate-700">
                        <div
                          className={`h-full rounded-full ${target !== null && val >= target ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, val)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="pt-3 border-t border-slate-700/70 grid grid-cols-2 sm:grid-cols-3 gap-3">
                {overview.lines.slice(0, 6).map((l) => (
                  <div key={l.id} className="p-3 rounded-lg bg-[#09172b] border border-slate-700/70">
                    <div className="text-xs font-mono text-blue-300">{l.code}</div>
                    <div className="text-xl font-mono font-bold text-white mt-0.5"><span className="text-[11px] font-sans font-normal text-slate-400 mr-1">{headline(l).label}</span>{fmtPct(headline(l).value)}</div>
                    <div className="text-[11px] text-slate-400 truncate">{l.name}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* SLIDE 2: MÁQUINAS, PARADAS E ÚLTIMOS APONTAMENTOS */}
        {overview && activeSlide === 1 && (
          <section className="flex-1 flex flex-col gap-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
                <h2 className="text-base font-display font-bold text-white mb-3">
                  Situação das Máquinas
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {overview.machines.slice(0, 9).map((m) => (
                    <div key={m.id} className="p-3 rounded-lg bg-[#09172b] border border-slate-700/80">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-mono font-bold text-blue-300">{m.code}</span>
                        <span
                          className={
                            m.machineStatus === 'operating'
                              ? 'text-emerald-400'
                              : m.machineStatus === 'stopped'
                              ? 'text-red-400'
                              : 'text-amber-300'
                          }
                        >
                          {m.machineStatus === 'operating' ? 'Operando' : m.machineStatus === 'stopped' ? 'Parada' : 'Manut.'}
                        </span>
                      </div>
                      <div className="text-xl font-mono font-bold text-white mt-1"><span className="text-[11px] font-sans font-normal text-slate-400 mr-1">{headline(m).label}</span>{fmtPct(headline(m).value)}</div>
                      <div className="text-[11px] text-slate-400 truncate">{m.name}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl p-5">
                <h2 className="text-base font-display font-bold text-white mb-3">
                  Principais Motivos de Parada (min)
                </h2>
                <div className="h-56">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={overview.charts.downtimeByReason.slice(0, 5)} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e3a5f" />
                      <XAxis type="number" tick={{ fontSize: 12, fill: '#cbd5e1' }} />
                      <YAxis dataKey="reason" type="category" width={160} tick={{ fontSize: 11, fill: '#e2e8f0' }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: '#09172b', borderColor: '#334155', color: '#f8fafc' }}
                      />
                      <Bar dataKey="minutes" name="Minutos" fill="#ef4444" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            <div className="bg-[#0f2544] border border-slate-700/80 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-700/80 flex items-center justify-between">
                <h2 className="text-base font-display font-bold text-white">Últimos Apontamentos</h2>
                <span className="text-xs text-slate-400">Atualização contínua</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-[#09172b] text-xs text-slate-300 border-b border-slate-700/80">
                    <tr>
                      <th className="px-4 py-2.5">Data / Turno</th>
                      <th className="px-4 py-2.5">Setor / Máquina</th>
                      <th className="px-4 py-2.5">Produto</th>
                      <th className="px-4 py-2.5 text-right">Realizado</th>
                      <th className="px-4 py-2.5 text-right">Perdas</th>
                      <th className="px-4 py-2.5 text-right">Parada</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {recentRecords.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-2.5 font-mono tabular-nums text-slate-200">
                          {r.production_date} · {r.shift_name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-100">
                          {r.sector_name} · {r.machine_name || r.line_name}
                        </td>
                        <td className="px-4 py-2.5 text-white font-medium">{r.product_name}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-blue-300">
                          {fmtNum(r.produced_quantity)} {r.unit_of_measure}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-300">
                          {fmtNum(r.loss_quantity)} {r.unit_of_measure}
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

      <footer className="px-6 py-2.5 bg-[#09172b] border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
        <span>
          novo.forteflex · IROG ForteFlex — Gestão à Vista
          {overview?.demoRecordsCount ? ` · Inclui ${overview.demoRecordsCount} registros demonstrativos` : ''}
        </span>
        <span className="font-mono tabular-nums">
          {lastUpdated ? `Última atualização: ${lastUpdated.toLocaleTimeString('pt-BR')}` : 'Carregando...'}
        </span>
      </footer>
    </div>
  );
}
