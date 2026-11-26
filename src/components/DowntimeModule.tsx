import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Play, Square, Clock, AlertCircle, CheckCircle2, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { CatalogData, DowntimeRecord } from '../types';

interface DowntimeModuleProps {
  catalog: CatalogData;
  onCatalogUpdated?: () => void;
}

function formatElapsed(startIso: string | null, nowMs: number): string {
  if (!startIso) return '00:00';
  const diffSec = Math.max(0, Math.floor((nowMs - new Date(startIso).getTime()) / 1000));
  const h = Math.floor(diffSec / 3600);
  const m = Math.floor((diffSec % 3600) / 60);
  const s = diffSec % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function DowntimeModule({ catalog, onCatalogUpdated }: DowntimeModuleProps) {
  const { user } = useAuth();
  const [downtimes, setDowntimes] = useState<DowntimeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const activeMachines = useMemo(() => catalog.machines.filter((m) => m.active), [catalog.machines]);
  const [mode, setMode] = useState<'open' | 'closed'>('open');
  const [machineId, setMachineId] = useState(activeMachines[0]?.id || '');
  const [shiftId, setShiftId] = useState(catalog.shifts[0]?.id || '');
  const [reasonId, setReasonId] = useState(catalog.downtimeReasons[0]?.id || '');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [filterMachineId, setFilterMachineId] = useState('');

  const loadDowntimes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getDowntimes(filterMachineId ? { machineId: filterMachineId } : undefined);
      setDowntimes(res.downtimes);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar paradas.');
    } finally {
      setLoading(false);
    }
  }, [filterMachineId]);

  useEffect(() => {
    loadDowntimes();
  }, [loadDowntimes]);

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    if (!machineId || !shiftId || !reasonId) {
      setError('Selecione máquina, turno e motivo da parada.');
      return;
    }
    if (mode === 'closed' && (!durationMinutes || Number(durationMinutes) <= 0)) {
      setError('Informe a duração em minutos (> 0) para registrar uma parada concluída.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.createDowntime({
        machine_id: machineId,
        shift_id: shiftId,
        reason_id: reasonId,
        duration_minutes: mode === 'closed' ? Number(durationMinutes) : undefined,
        description,
        mode,
      });
      setFeedback(
        res.status === 'open'
          ? 'Parada iniciada. A máquina foi sinalizada como parada até o encerramento.'
          : 'Parada concluída registrada e contabilizada nos indicadores IROG.'
      );
      setDurationMinutes('');
      setDescription('');
      await loadDowntimes();
      onCatalogUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar parada.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseStop = async (dt: DowntimeRecord) => {
    setError(null);
    setFeedback(null);
    try {
      const res = await api.closeDowntime(dt.id);
      setFeedback(`Parada encerrada com duração apurada de ${res.duration_minutes} minuto(s). Máquina retornada à operação.`);
      await loadDowntimes();
      onCatalogUpdated?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao encerrar parada.');
    }
  };

  const openStops = downtimes.filter((d) => d.status === 'open');
  const closedStops = downtimes.filter((d) => d.status === 'closed');
  const canRegister = user?.role !== 'operator' || user.permissions.can_register_downtime !== false;

  return (
    <div className="space-y-6">
      {feedback && (
        <div role="status" className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div role="alert" className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Open / Active Downtimes */}
      {openStops.length > 0 && (
        <section className="bg-white border border-red-300 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-display font-bold text-red-900">
                Paradas em Aberto ({openStops.length})
              </h2>
              <p className="text-xs text-red-700 mt-0.5">
                Máquinas atualmente paradas aguardando retorno à operação.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {openStops.map((dt) => (
              <div
                key={dt.id}
                className="p-4 rounded-lg bg-red-50/70 border border-red-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="text-sm font-bold text-red-950">
                    {dt.machine_code} — {dt.machine_name}
                  </div>
                  <div className="text-xs text-red-800">
                    {dt.reason} · <span className="font-medium">{dt.sector_name}</span> ({dt.shift_name})
                  </div>
                  <div className="text-xs font-mono tabular-nums text-red-700">
                    Decorrido: <strong>{formatElapsed(dt.start_at, nowMs)}</strong>
                  </div>
                </div>

                {canRegister && (
                  <button
                    type="button"
                    onClick={() => handleCloseStop(dt)}
                    className="min-h-[42px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>Encerrar Parada</span>
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Registration Form */}
      {canRegister && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-display font-bold text-[#0f2544]">Registrar Parada de Máquina</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Inicie uma parada em tempo real ou lance uma ocorrência já finalizada para apuração do IROG.
              </p>
            </div>

            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setMode('open')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  mode === 'open' ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Iniciar Parada Agora
              </button>
              <button
                type="button"
                onClick={() => setMode('closed')}
                className={`px-3.5 py-1.5 text-xs font-medium rounded-md cursor-pointer whitespace-nowrap ${
                  mode === 'closed' ? 'bg-[#0f2544] text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Lançar Parada Concluída
              </button>
            </div>
          </div>

          <form onSubmit={handleCreate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Máquina / Recurso *</label>
              <select
                required
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {activeMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name} ({m.sector_name})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Turno *</label>
              <select
                required
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.shifts.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Motivo da Parada *</label>
              <select
                required
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.downtimeReasons.filter((r) => r.active).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code} — {r.name} ({r.is_planned ? 'Planejada' : 'Não planejada'})
                  </option>
                ))}
              </select>
            </div>

            {mode === 'closed' ? (
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Duração (minutos) *</label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="number"
                    min="1"
                    required
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    placeholder="ex.: 40"
                    className="w-full min-h-[42px] pl-9 pr-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            ) : (
              <div className="flex items-end">
                <div className="w-full min-h-[42px] px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Cronômetro inicia no momento do envio.</span>
                </div>
              </div>
            )}

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">Observações técnicas</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva a causa raiz, componente ou chamado de manutenção..."
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className={`w-full min-h-[42px] px-4 py-2 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer ${
                  mode === 'open' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {mode === 'open' ? <Play className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                <span>{submitting ? 'Gravando...' : mode === 'open' ? 'Iniciar Parada' : 'Registrar Parada'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* History Table */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Histórico de Paradas</h3>
            <p className="text-xs text-slate-500">
              Classificação de impacto na Disponibilidade do IROG (paradas programadas excluídas do tempo disponível).
            </p>
          </div>
          <select
            value={filterMachineId}
            onChange={(e) => setFilterMachineId(e.target.value)}
            className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Todas as máquinas</option>
            {catalog.machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : closedStops.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Nenhuma parada concluída encontrada.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Máquina / Setor</th>
                  <th className="px-4 py-2.5">Motivo / Categoria</th>
                  <th className="px-4 py-2.5">Classificação IROG</th>
                  <th className="px-4 py-2.5">Turno</th>
                  <th className="px-4 py-2.5 text-right">Duração</th>
                  <th className="px-4 py-2.5">Registrado por</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {closedStops.map((dt) => (
                  <tr key={dt.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">
                        {dt.machine_code ? `${dt.machine_code} — ${dt.machine_name}` : dt.line_name || 'Geral'}
                      </div>
                      <div className="text-slate-500">{dt.sector_name}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{dt.reason}</div>
                      {dt.description && <div className="text-slate-500">{dt.description}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={dt.is_planned ? 'text-slate-600 font-medium' : 'text-red-700 font-semibold'}>
                        {dt.is_planned ? 'Programada (Excluída)' : 'Não programada (Reduz Disp.)'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{dt.shift_name || '—'}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-[#0f2544]">
                      {dt.duration_minutes} min
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{dt.recorded_by_name || 'Sistema'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
