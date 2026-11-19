import React, { useCallback, useEffect, useState } from 'react';
import { Pencil, Search, AlertCircle, X, Save, PlusCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { CatalogData, ProductionRecord } from '../types';

interface MyRecordsViewProps {
  catalog: CatalogData;
  onGoToEntry: () => void;
}

export function MyRecordsView({ catalog, onGoToEntry }: MyRecordsViewProps) {
  const { user } = useAuth();
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [editing, setEditing] = useState<ProductionRecord | null>(null);
  const [editPlanned, setEditPlanned] = useState('');
  const [editProduced, setEditProduced] = useState('');
  const [editApproved, setEditApproved] = useState('');
  const [editLoss, setEditLoss] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProductionRecords();
      setRecords(res.records);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar registros.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const filtered = records.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      (r.product_name || '').toLowerCase().includes(q) ||
      (r.sector_name || '').toLowerCase().includes(q) ||
      (r.line_name || '').toLowerCase().includes(q) ||
      r.production_date.includes(q)
    );
  });

  const openEdit = (rec: ProductionRecord) => {
    setEditing(rec);
    setEditPlanned(String(rec.planned_quantity));
    setEditProduced(String(rec.produced_quantity));
    setEditApproved(String(rec.approved_quantity));
    setEditLoss(String(rec.loss_quantity));
    setEditNotes(rec.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setSavingEdit(true);
    setError(null);
    try {
      await api.updateProductionRecord(editing.id, {
        planned_quantity: Number(editPlanned),
        produced_quantity: Number(editProduced),
        approved_quantity: Number(editApproved),
        loss_quantity: Number(editLoss),
        notes: editNotes,
      });
      setEditing(null);
      await loadRecords();
    } catch (err: any) {
      setError(err.message || 'Não foi possível atualizar o registro.');
    } finally {
      setSavingEdit(false);
    }
  };

  const canEdit = Boolean(user?.permissions.can_edit_own_records);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-display font-bold text-[#0f2544]">Meus Registros de Produção</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Histórico individual vinculado ao seu usuário ({catalog.sectors.length} setores cadastrados).
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar produto, linha ou data..."
              className="min-h-[40px] pl-9 pr-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
            />
          </div>
          <button
            type="button"
            onClick={onGoToEntry}
            className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <PlusCircle className="w-4 h-4" />
            <span>Novo lançamento</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <p className="text-sm font-medium text-slate-700">Nenhum registro encontrado para seu usuário.</p>
            <p className="text-xs text-slate-500">Utilize o formulário de registro de produção para iniciar seus apontamentos.</p>
            <button
              type="button"
              onClick={onGoToEntry}
              className="mt-2 min-h-[42px] px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Registrar primeira produção</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Data / Turno</th>
                  <th className="px-4 py-3">Setor / Linha</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Planejado</th>
                  <th className="px-4 py-3 text-right">Produzido</th>
                  <th className="px-4 py-3 text-right">Aprovado</th>
                  <th className="px-4 py-3 text-right">Perdas</th>
                  <th className="px-4 py-3 text-right">Parada</th>
                  {canEdit && <th className="px-4 py-3 text-right">Ações</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((rec) => {
                  const isOwn = rec.operator_id === user?.id || rec.created_by === user?.id;
                  return (
                    <tr key={rec.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono tabular-nums text-slate-900">{rec.production_date}</div>
                        <div className="text-xs text-slate-500">
                          {rec.shift_name}
                          {rec.is_demo ? ' · Demonstração' : ''}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900">{rec.sector_name}</div>
                        <div className="text-xs text-slate-500">{rec.line_name}</div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="text-slate-900">{rec.product_name}</div>
                        <div className="text-xs font-mono text-slate-500">{rec.product_sku}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {rec.planned_quantity} {rec.unit_of_measure}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-slate-900">
                        {rec.produced_quantity} {rec.unit_of_measure}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 font-medium">
                        {rec.approved_quantity} {rec.unit_of_measure}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">
                        {rec.loss_quantity} {rec.unit_of_measure}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                        {rec.has_downtime ? `${rec.total_downtime_minutes} min` : '—'}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3 text-right">
                          {isOwn ? (
                            <button
                              type="button"
                              onClick={() => openEdit(rec)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-50 rounded-md cursor-pointer"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Editar</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-400">Somente leitura</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-display font-bold text-[#0f2544]">Editar meu lançamento</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {editing.production_date} · {editing.product_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Planejado</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editPlanned}
                    onChange={(e) => setEditPlanned(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Produzido</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editProduced}
                    onChange={(e) => setEditProduced(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Aprovado</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editApproved}
                    onChange={(e) => setEditApproved(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Perdas</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={editLoss}
                    onChange={(e) => setEditLoss(e.target.value)}
                    className="w-full min-h-[42px] px-3 py-2 text-sm font-mono tabular-nums border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Observações</label>
                <textarea
                  rows={3}
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="min-h-[42px] px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="min-h-[42px] px-5 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg inline-flex items-center gap-2 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>{savingEdit ? 'Salvando...' : 'Salvar alterações'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
