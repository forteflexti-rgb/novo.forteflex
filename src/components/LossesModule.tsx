import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, AlertCircle, Save } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { CatalogData, LossRecord } from '../types';

interface LossesModuleProps {
  catalog: CatalogData;
}

export function LossesModule({ catalog }: LossesModuleProps) {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  const [losses, setLosses] = useState<LossRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [lossDate, setLossDate] = useState(today);
  const [shiftId, setShiftId] = useState(catalog.shifts[0]?.id || '');
  const [sectorId, setSectorId] = useState(user?.sector_id || catalog.sectors[0]?.id || '');
  const [lineId, setLineId] = useState('');
  const [machineId, setMachineId] = useState('');
  const [productId, setProductId] = useState(catalog.products[0]?.id || '');
  const [orderId, setOrderId] = useState('');
  const [reasonId, setReasonId] = useState(catalog.lossReasons[0]?.id || '');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const availableLines = useMemo(
    () => catalog.lines.filter((l) => l.active && l.sector_id === sectorId),
    [catalog.lines, sectorId]
  );

  const availableMachines = useMemo(
    () =>
      catalog.machines.filter(
        (m) => m.active && m.sector_id === sectorId && (!lineId || !m.line_id || m.line_id === lineId)
      ),
    [catalog.machines, sectorId, lineId]
  );

  useEffect(() => {
    if (availableLines.length > 0 && !availableLines.some((l) => l.id === lineId)) {
      setLineId(availableLines[0].id);
    } else if (availableLines.length === 0) {
      setLineId('');
    }
  }, [availableLines, lineId]);

  useEffect(() => {
    if (availableMachines.length > 0 && !availableMachines.some((m) => m.id === machineId)) {
      setMachineId(availableMachines[0].id);
    } else if (availableMachines.length === 0) {
      setMachineId('');
    }
  }, [availableMachines, machineId]);

  const loadLosses = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getLosses({ includeDemo: true });
      setLosses(res.losses);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar perdas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLosses();
  }, [loadLosses]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    const qty = Number(quantity);
    if (!lossDate || !shiftId || !sectorId || !productId || !Number.isFinite(qty) || qty <= 0) {
      setError('Preencha data, turno, setor, produto e quantidade maior que zero.');
      return;
    }

    const prod = catalog.products.find((p) => p.id === productId);
    const reason = catalog.lossReasons.find((r) => r.id === reasonId);

    setSubmitting(true);
    try {
      await api.createLoss({
        loss_date: lossDate,
        shift_id: shiftId,
        sector_id: sectorId,
        line_id: lineId || null,
        machine_id: machineId || null,
        product_id: productId,
        production_order_id: orderId || null,
        reason_id: reason?.id || null,
        category: reason?.category || 'Refugo',
        reason_name: reason?.name || 'Perda registrada manualmente',
        quantity: qty,
        unit_of_measure: prod?.unit_of_measure || 'kg',
        notes,
      });
      setFeedback('Perda / refugo registrado com sucesso.');
      setQuantity('');
      setNotes('');
      await loadLosses();
    } catch (err: any) {
      setError(err.message || 'Erro ao registrar perda.');
    } finally {
      setSubmitting(false);
    }
  };

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const l of losses) {
      map.set(l.category, (map.get(l.category) || 0) + Number(l.quantity || 0));
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [losses]);

  const canRegister = user?.role !== 'operator' || user.permissions.can_register_losses !== false;

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

      {/* Category Summary Strip */}
      {byCategory.length > 0 && (
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {byCategory.map(([cat, total]) => (
            <div key={cat} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="text-xs text-slate-500">{cat}</div>
              <div className="mt-1 text-xl font-display font-bold font-mono tabular-nums text-red-700">
                {new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(total)}
              </div>
            </div>
          ))}
        </section>
      )}

      {canRegister && (
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 space-y-5">
          <div className="pb-3 border-b border-slate-100 flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <div>
              <h2 className="text-base font-display font-bold text-[#0f2544]">Lançamento de Perdas e Refugos</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Registre refugos, retrabalhos, perdas de setup ou matéria-prima vinculados à máquina, produto e motivo.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Data *</label>
              <input
                type="date"
                required
                value={lossDate}
                onChange={(e) => setLossDate(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
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
              <label className="block text-xs font-medium text-slate-700 mb-1">Setor *</label>
              <select
                required
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.sectors.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Linha / Máquina</label>
              <select
                value={machineId}
                onChange={(e) => setMachineId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Sem máquina específica</option>
                {availableMachines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Produto *</label>
              <select
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.products.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Motivo / Categoria *</label>
              <select
                required
                value={reasonId}
                onChange={(e) => setReasonId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.lossReasons.filter((r) => r.active).map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.category}] {r.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Ordem de Produção</label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Opcional</option>
                {catalog.orders
                  .filter((o) => o.sector_id === sectorId)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.order_number}
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Quantidade perdida *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="ex.: 18.5"
                className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-3">
              <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Detalhes da ocorrência, lote ou causa operacional..."
                className="w-full min-h-[42px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>

            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[42px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{submitting ? 'Salvando...' : 'Registrar Perda'}</span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Losses History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-display font-bold text-[#0f2544]">Histórico de Perdas e Refugos</h3>
        </div>

        {loading ? (
          <div className="p-6 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded" />
            ))}
          </div>
        ) : losses.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Nenhuma perda registrada até o momento.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Data / Turno</th>
                  <th className="px-4 py-2.5">Setor / Máquina</th>
                  <th className="px-4 py-2.5">Produto</th>
                  <th className="px-4 py-2.5">Categoria / Motivo</th>
                  <th className="px-4 py-2.5 text-right">Quantidade</th>
                  <th className="px-4 py-2.5">Responsável</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {losses.map((l) => (
                  <tr key={l.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-700">
                      {l.loss_date} · {l.shift_name}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{l.sector_name}</div>
                      <div className="text-slate-500">{l.machine_name || l.line_name || '—'}</div>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-medium text-slate-900">{l.product_name}</div>
                      {l.order_number && <div className="font-mono text-slate-500">{l.order_number}</div>}
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="font-semibold text-red-700">{l.category}</div>
                      <div className="text-slate-600">{l.reason_name}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums font-bold text-red-700">
                      {l.quantity} {l.unit_of_measure}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{l.recorded_by_name}</td>
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
