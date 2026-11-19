import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Download, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { exportProductionRecordsToCSV, exportProductionRecordsToExcel } from '../../lib/export';
import type { CatalogData, DashboardFilters, DashboardSummary, ProductionRecord } from '../../types';

interface AdminReportsViewProps {
  catalog: CatalogData;
}

export function AdminReportsView({ catalog }: AdminReportsViewProps) {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [includeDemo, setIncludeDemo] = useState(true);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

    setLoading(true);
    Promise.all([api.getDashboardSummary(filters), api.getProductionRecords(filters)])
      .then(([sumRes, recRes]) => {
        setSummary(sumRes);
        setRecords(recRes.records);
      })
      .finally(() => setLoading(false));
  }, [startDate, endDate, sectorId, includeDemo]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">Relatórios Gerenciais</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Consolidação por setor, operador e motivos de parada com exportação direta para Excel ou CSV.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={records.length === 0}
              onClick={() => exportProductionRecordsToExcel(records, 'relatorio-gerencial-novoforteflex.xlsx')}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Baixar Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={records.length === 0}
              onClick={() => exportProductionRecordsToCSV(records, 'relatorio-gerencial-novoforteflex.csv')}
              className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Baixar CSV</span>
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-4 py-2 bg-[#0f2544] hover:bg-[#17345e] text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Imprimir / PDF</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs text-slate-600 mb-1">Data inicial</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Data final</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-600 mb-1">Setor</label>
            <select
              value={sectorId}
              onChange={(e) => setSectorId(e.target.value)}
              className="w-full min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Todos os setores</option>
              {catalog.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end pb-2">
            <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDemo}
                onChange={(e) => setIncludeDemo(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              <span>Incluir dados demonstrativos</span>
            </label>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : summary ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Consolidado por Setor */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Consolidado por Setor</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left">Setor</th>
                  <th className="px-4 py-2.5 text-right">Planejado</th>
                  <th className="px-4 py-2.5 text-right">Realizado</th>
                  <th className="px-4 py-2.5 text-right">Atingimento</th>
                  <th className="px-4 py-2.5 text-right">Perdas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.charts.bySector.map((row) => {
                  const pct = row.planned > 0 ? (row.realized / row.planned) * 100 : 0;
                  return (
                    <tr key={row.name}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{row.name}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">{row.planned}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums font-semibold text-[#0f2544]">
                        {row.realized}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono tabular-nums font-medium ${
                          pct >= 95 ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {pct.toFixed(1)}%
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-700">{row.losses}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Consolidado por Funcionário */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Desempenho por Funcionário</h3>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-2.5 text-left">Funcionário</th>
                  <th className="px-4 py-2.5 text-right">Produzido</th>
                  <th className="px-4 py-2.5 text-right">Aprovado</th>
                  <th className="px-4 py-2.5 text-right">Perdas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {summary.charts.byEmployee.map((row) => (
                  <tr key={row.name}>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{row.name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-[#0f2544] font-semibold">
                      {row.realized}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700">{row.approved}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-700">{row.losses}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
