import React, { useCallback, useEffect, useState } from 'react';
import { Download, FileSpreadsheet, Trash2, Eye, X, AlertCircle, FilterX } from 'lucide-react';
import { api } from '../../lib/api';
import { exportProductionRecordsToCSV, exportProductionRecordsToExcel } from '../../lib/export';
import type { CatalogData, DashboardFilters, ProductionRecord } from '../../types';

interface AdminRecordsViewProps {
  catalog: CatalogData;
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

export function AdminRecordsView({ catalog }: AdminRecordsViewProps) {
  const [filters, setFilters] = useState<DashboardFilters>(DEFAULT_FILTERS);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ProductionRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.getProductionRecords(filters);
      setRecords(res.records);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar registros.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await api.deleteProductionRecord(id);
      if (selected?.id === id) setSelected(null);
      await loadRecords();
    } catch (err: any) {
      setError(err.message || 'Erro ao excluir registro.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">
              Consulta Geral de Lançamentos ({records.length})
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Auditoria completa de apontamentos por data, turno, funcionário, setor e produto.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={records.length === 0}
              onClick={() => exportProductionRecordsToExcel(records)}
              className="min-h-[38px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel</span>
            </button>
            <button
              type="button"
              disabled={records.length === 0}
              onClick={() => exportProductionRecordsToCSV(records)}
              className="min-h-[38px] px-3.5 py-1.5 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-4 h-4" />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 pt-2 border-t border-slate-100">
          <input
            type="date"
            value={filters.startDate}
            onChange={(e) => setFilters((p) => ({ ...p, startDate: e.target.value }))}
            className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            aria-label="Data inicial"
          />
          <input
            type="date"
            value={filters.endDate}
            onChange={(e) => setFilters((p) => ({ ...p, endDate: e.target.value }))}
            className="min-h-[38px] px-2.5 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            aria-label="Data final"
          />
          <select
            value={filters.sectorId}
            onChange={(e) => setFilters((p) => ({ ...p, sectorId: e.target.value }))}
            className="min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Todos os setores</option>
            {catalog.sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filters.shiftId}
            onChange={(e) => setFilters((p) => ({ ...p, shiftId: e.target.value }))}
            className="min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Todos os turnos</option>
            {catalog.shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={filters.operatorId}
            onChange={(e) => setFilters((p) => ({ ...p, operatorId: e.target.value }))}
            className="min-h-[38px] px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="">Todos os funcionários</option>
            {catalog.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="min-h-[38px] px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <FilterX className="w-3.5 h-3.5" />
            <span>Limpar</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-10 bg-slate-100 rounded animate-pulse" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            Nenhum registro de produção encontrado com os critérios selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Data / Turno</th>
                  <th className="px-4 py-3">Funcionário</th>
                  <th className="px-4 py-3">Setor / Linha</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3 text-right">Planejado</th>
                  <th className="px-4 py-3 text-right">Realizado</th>
                  <th className="px-4 py-3 text-right">Perdas</th>
                  <th className="px-4 py-3 text-right">Parada</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="font-mono tabular-nums text-slate-900">{r.production_date}</div>
                      <div className="text-xs text-slate-500">
                        {r.shift_name}
                        {r.is_demo ? ' · Demonstração' : ''}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">{r.operator_name}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.sector_name}</div>
                      <div className="text-xs text-slate-500">{r.line_name}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-slate-900">{r.product_name}</div>
                      <div className="text-xs font-mono text-slate-500">{r.product_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                      {r.planned_quantity} {r.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#0f2544]">
                      {r.produced_quantity} {r.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-red-700">
                      {r.loss_quantity} {r.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {r.has_downtime ? `${r.total_downtime_minutes} min` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className="p-1.5 text-slate-500 hover:text-blue-700 rounded-md cursor-pointer"
                        title="Detalhes"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === r.id}
                        onClick={() => handleDelete(r.id)}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer ml-1"
                        title="Excluir registro"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-xl p-6 space-y-5">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-display font-bold text-[#0f2544]">
                  Detalhes do Lançamento
                </h3>
                <p className="text-xs text-slate-500 mt-0.5 font-mono">
                  {selected.production_date} · {selected.shift_name} · {selected.is_demo ? 'Demonstrativo' : 'Real'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-xs text-slate-500">Funcionário responsável</div>
                <div className="font-medium text-slate-900">{selected.operator_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Setor / Linha</div>
                <div className="font-medium text-slate-900">
                  {selected.sector_name} · {selected.line_name}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Produto</div>
                <div className="font-medium text-slate-900">{selected.product_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Criado por / em</div>
                <div className="text-xs text-slate-700">
                  {selected.created_by_name} · {new Date(selected.created_at).toLocaleString('pt-BR')}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-3 p-4 bg-slate-50 rounded-lg text-center">
              <div>
                <div className="text-xs text-slate-500">Planejado</div>
                <div className="font-mono tabular-nums font-bold text-slate-900 mt-0.5">
                  {selected.planned_quantity}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Produzido</div>
                <div className="font-mono tabular-nums font-bold text-blue-700 mt-0.5">
                  {selected.produced_quantity}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Aprovado</div>
                <div className="font-mono tabular-nums font-bold text-emerald-700 mt-0.5">
                  {selected.approved_quantity}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Perdas</div>
                <div className="font-mono tabular-nums font-bold text-red-700 mt-0.5">
                  {selected.loss_quantity}
                </div>
              </div>
            </div>

            {selected.has_downtime && (
              <div className="p-3.5 rounded-lg bg-red-50/70 border border-red-200 text-sm space-y-1">
                <div className="font-semibold text-red-900">
                  Parada de {selected.total_downtime_minutes} minutos — {selected.downtime_reason}
                </div>
                {selected.downtime_description && (
                  <p className="text-xs text-red-800">{selected.downtime_description}</p>
                )}
              </div>
            )}

            {(selected.notes || selected.additional_notes) && (
              <div className="text-sm space-y-2">
                {selected.notes && (
                  <div>
                    <div className="text-xs font-medium text-slate-500">Observações</div>
                    <p className="text-slate-700 mt-0.5">{selected.notes}</p>
                  </div>
                )}
                {selected.additional_notes && (
                  <div>
                    <div className="text-xs font-medium text-slate-500">Observações adicionais</div>
                    <p className="text-slate-700 mt-0.5">{selected.additional_notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
