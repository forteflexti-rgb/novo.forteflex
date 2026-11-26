import React, { useEffect, useMemo, useState } from 'react';
import { FileSpreadsheet, FileText, Download } from 'lucide-react';
import { api } from '../../lib/api';
import {
  exportProductionRecordsToCSV,
  exportReportToPdf,
  exportRowsToExcel,
} from '../../lib/export';
import type {
  CatalogData,
  DashboardFilters,
  DowntimeEvent,
  IrogFactoryOverview,
  LossRecord,
  ProductionRecord,
} from '../../types';

interface AdminReportsViewProps {
  catalog: CatalogData;
}

type ReportId =
  | 'r01_factory_irog'
  | 'r02_sector_irog'
  | 'r03_line_irog'
  | 'r04_machine_irog'
  | 'r05_availability'
  | 'r06_performance'
  | 'r07_quality'
  | 'r08_downtime_reasons'
  | 'r09_planned_vs_unplanned'
  | 'r10_losses'
  | 'r11_by_shift'
  | 'r12_by_operator'
  | 'r13_by_product_op'
  | 'r14_goals_adherence';

const REPORT_CATALOG: Array<{ id: ReportId; title: string; subtitle: string }> = [
  { id: 'r01_factory_irog', title: '01. IROG Geral da Fábrica', subtitle: 'Consolidado executivo ponderado por tempo padrão' },
  { id: 'r02_sector_irog', title: '02. IROG por Setor', subtitle: 'Disponibilidade, Desempenho, Qualidade e IROG por área' },
  { id: 'r03_line_irog', title: '03. IROG por Linha de Produção', subtitle: 'Comparativo de desempenho entre linhas' },
  { id: 'r04_machine_irog', title: '04. IROG por Máquina / Recurso', subtitle: 'Ranking e status individual de equipamentos' },
  { id: 'r05_availability', title: '05. Disponibilidade por Máquina', subtitle: 'Tempo disponível efetivo vs paradas não programadas' },
  { id: 'r06_performance', title: '06. Desempenho por Máquina', subtitle: 'Minutos padrão ganhos vs tempo em operação' },
  { id: 'r07_quality', title: '07. Qualidade por Máquina', subtitle: 'Produção aprovada, total produzido e refugos' },
  { id: 'r08_downtime_reasons', title: '08. Paradas por Motivo e Tempo Perdido', subtitle: 'Pareto de interrupções e ocorrências' },
  { id: 'r09_planned_vs_unplanned', title: '09. Paradas Programadas vs Não Programadas', subtitle: 'Impacto na disponibilidade do IROG' },
  { id: 'r10_losses', title: '10. Perdas por Motivo, Produto e Setor', subtitle: 'Detalhamento completo de refugos e retrabalhos' },
  { id: 'r11_by_shift', title: '11. Produção e IROG por Turno', subtitle: 'Resultado consolidado entre turnos operacionais' },
  { id: 'r12_by_operator', title: '12. Produção por Operador', subtitle: 'Apontamentos, volumes aprovados e perdas por funcionário' },
  { id: 'r13_by_product_op', title: '13. Produção por Produto / Ordem (OP)', subtitle: 'Volumes fabricados por item e ordem de produção' },
  { id: 'r14_goals_adherence', title: '14. Metas vs Realizado (Aderência)', subtitle: 'Comparativo frente às metas de IROG e volume' },
];

function fmtPct(v: number | null): string {
  return v === null ? 'Incompleto' : `${v.toFixed(1)}%`;
}

export function AdminReportsView({ catalog }: AdminReportsViewProps) {
  const [selectedReport, setSelectedReport] = useState<ReportId>('r01_factory_irog');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sectorId, setSectorId] = useState('');
  const [includeDemo, setIncludeDemo] = useState(true);

  const [overview, setOverview] = useState<IrogFactoryOverview | null>(null);
  const [records, setRecords] = useState<ProductionRecord[]>([]);
  const [downtimes, setDowntimes] = useState<DowntimeEvent[]>([]);
  const [losses, setLosses] = useState<LossRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

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

    // Paradas e perdas vêm sem filtro da API: aplica aqui o mesmo período e setor dos demais relatórios.
    const inPeriod = (date: string | null | undefined) =>
      !!date && (!startDate || date >= startDate) && (!endDate || date <= endDate);
    const inSector = (id: string | null | undefined) => !sectorId || id === sectorId;

    setLoading(true);
    setLoadError(null);
    Promise.all([
      api.getIrogOverview(filters),
      api.getProductionRecords(filters),
      api.getDowntimes(),
      api.getLosses({ includeDemo }),
    ])
      .then(([ovRes, recRes, dtRes, lsRes]) => {
        setOverview(ovRes);
        setRecords(recRes.records);
        setDowntimes(
          dtRes.downtimes.filter((d) => inPeriod(d.production_date ?? d.start_at?.slice(0, 10)) && inSector(d.sector_id)),
        );
        setLosses(lsRes.losses.filter((l) => inPeriod(l.loss_date) && inSector(l.sector_id)));
      })
      .catch((err) => setLoadError(err?.message || 'Erro ao carregar os dados do relatório.'))
      .finally(() => setLoading(false));
  }, [startDate, endDate, sectorId, includeDemo]);

  const tableData = useMemo((): { columns: string[]; rows: (string | number)[][] } => {
    if (!overview) return { columns: [], rows: [] };

    switch (selectedReport) {
      case 'r01_factory_irog': {
        const f = overview.factory;
        return {
          columns: ['Unidade', 'Disponibilidade', 'Desempenho', 'Qualidade', 'IROG', 'Planejado', 'Produzido', 'Aprovado', 'Perdas', 'Paradas (min)'],
          rows: [[
            f.name,
            fmtPct(f.availabilityPercent),
            fmtPct(f.performancePercent),
            fmtPct(f.qualityPercent),
            fmtPct(f.irogPercent),
            f.plannedQuantity,
            f.producedQuantity,
            f.approvedQuantity,
            f.lossQuantity,
            f.downtimeMinutes,
          ]],
        };
      }
      case 'r02_sector_irog':
        return {
          columns: ['Setor', 'Disp.', 'Desemp.', 'Qual.', 'IROG', 'Meta IROG', 'Planejado', 'Produzido', 'Perdas'],
          rows: overview.sectors.map((s) => [
            s.name,
            fmtPct(s.availabilityPercent),
            fmtPct(s.performancePercent),
            fmtPct(s.qualityPercent),
            fmtPct(s.irogPercent),
            s.targetIrogPercent !== null ? `${s.targetIrogPercent}%` : '—',
            s.plannedQuantity,
            s.producedQuantity,
            s.lossQuantity,
          ]),
        };
      case 'r03_line_irog':
        return {
          columns: ['Código', 'Linha', 'Setor', 'Disp.', 'Desemp.', 'Qual.', 'IROG', 'Produzido'],
          rows: overview.lines.map((l) => [
            l.code || '—',
            l.name,
            l.sectorName || '—',
            fmtPct(l.availabilityPercent),
            fmtPct(l.performancePercent),
            fmtPct(l.qualityPercent),
            fmtPct(l.irogPercent),
            l.producedQuantity,
          ]),
        };
      case 'r04_machine_irog':
        return {
          columns: ['Código', 'Máquina', 'Setor', 'Status', 'Disp.', 'Desemp.', 'Qual.', 'IROG', 'Paradas (min)'],
          rows: overview.machines.map((m) => [
            m.code || '—',
            m.name,
            m.sectorName || '—',
            m.machineStatus || 'operating',
            fmtPct(m.availabilityPercent),
            fmtPct(m.performancePercent),
            fmtPct(m.qualityPercent),
            fmtPct(m.irogPercent),
            m.downtimeMinutes,
          ]),
        };
      case 'r05_availability':
        return {
          columns: ['Máquina', 'Tempo Disp. Efetivo (min)', 'Parada Não Prog. (min)', 'Tempo Operação (min)', 'Disponibilidade'],
          rows: overview.machines.map((m) => [
            `${m.code} — ${m.name}`,
            m.memory.effectivePlannedTimeMinutes,
            m.memory.unplannedDowntimeMinutes,
            m.memory.operatingTimeMinutes,
            fmtPct(m.availabilityPercent),
          ]),
        };
      case 'r06_performance':
        return {
          columns: ['Máquina', 'Tempo Operação (min)', 'Min. Padrão Ganhos', 'Produzido', 'Desempenho'],
          rows: overview.machines.map((m) => [
            `${m.code} — ${m.name}`,
            m.memory.operatingTimeMinutes,
            m.memory.standardEarnedMinutes ?? 'Incompleto',
            m.producedQuantity,
            fmtPct(m.performancePercent),
          ]),
        };
      case 'r07_quality':
        return {
          columns: ['Máquina', 'Produzido', 'Aprovado', 'Perdas', 'Qualidade'],
          rows: overview.machines.map((m) => [
            `${m.code} — ${m.name}`,
            m.producedQuantity,
            m.approvedQuantity,
            m.lossQuantity,
            fmtPct(m.qualityPercent),
          ]),
        };
      case 'r08_downtime_reasons':
        return {
          columns: ['Motivo da Parada', 'Categoria', 'Ocorrências', 'Tempo Total (min)'],
          rows: overview.charts.downtimeByReason.map((d) => [d.reason, d.category, d.occurrences, d.minutes]),
        };
      case 'r09_planned_vs_unplanned':
        return {
          columns: ['Máquina', 'Motivo', 'Classificação', 'Duração (min)', 'Status'],
          rows: downtimes.map((d) => [
            d.machine_name || '—',
            d.reason,
            d.is_planned ? 'Programada (Excluída)' : 'Não Programada (Reduz Disp.)',
            d.duration_minutes,
            d.status === 'open' ? 'Aberta' : 'Encerrada',
          ]),
        };
      case 'r10_losses':
        return {
          columns: ['Data', 'Setor', 'Máquina', 'Produto', 'Categoria', 'Motivo', 'Quantidade'],
          rows: losses.map((l) => [
            l.loss_date,
            l.sector_name || '—',
            l.machine_name || '—',
            l.product_name || '—',
            l.category,
            l.reason_name,
            `${l.quantity} ${l.unit_of_measure}`,
          ]),
        };
      case 'r11_by_shift':
        return {
          columns: ['Turno', 'Disp.', 'Desemp.', 'Qual.', 'IROG', 'Planejado', 'Realizado'],
          rows: overview.charts.byShift.map((s) => [
            s.name,
            fmtPct(s.availability),
            fmtPct(s.performance),
            fmtPct(s.quality),
            fmtPct(s.irog),
            s.planned,
            s.realized,
          ]),
        };
      case 'r12_by_operator': {
        const map = new Map<string, { planned: number; produced: number; approved: number; loss: number; count: number }>();
        for (const r of records) {
          const name = r.operator_name || r.operator_id;
          const e = map.get(name) || { planned: 0, produced: 0, approved: 0, loss: 0, count: 0 };
          e.planned += r.planned_quantity;
          e.produced += r.produced_quantity;
          e.approved += r.approved_quantity;
          e.loss += r.loss_quantity;
          e.count += 1;
          map.set(name, e);
        }
        return {
          columns: ['Operador', 'Apontamentos', 'Planejado', 'Produzido', 'Aprovado', 'Perdas'],
          rows: Array.from(map.entries()).map(([name, v]) => [name, v.count, v.planned, v.produced, v.approved, v.loss]),
        };
      }
      case 'r13_by_product_op': {
        const map = new Map<string, { sku: string; op: string; planned: number; produced: number; approved: number; loss: number }>();
        for (const r of records) {
          const key = `${r.product_name}|${r.order_number || 'Avulso'}`;
          const e = map.get(key) || {
            sku: r.product_sku || '',
            op: r.order_number || 'Avulso',
            planned: 0,
            produced: 0,
            approved: 0,
            loss: 0,
          };
          e.planned += r.planned_quantity;
          e.produced += r.produced_quantity;
          e.approved += r.approved_quantity;
          e.loss += r.loss_quantity;
          map.set(key, e);
        }
        return {
          columns: ['Produto', 'SKU', 'OP', 'Planejado', 'Produzido', 'Aprovado', 'Perdas'],
          rows: Array.from(map.entries()).map(([key, v]) => [
            key.split('|')[0],
            v.sku,
            v.op,
            v.planned,
            v.produced,
            v.approved,
            v.loss,
          ]),
        };
      }
      case 'r14_goals_adherence':
        return {
          columns: ['Setor', 'IROG Real', 'Meta IROG', 'Desvio (p.p.)', 'Volume Planejado', 'Volume Realizado', 'Atingimento %'],
          rows: overview.sectors.map((s) => [
            s.name,
            fmtPct(s.irogPercent),
            s.targetIrogPercent !== null ? `${s.targetIrogPercent}%` : '—',
            s.irogDeviationPercent !== null ? `${s.irogDeviationPercent > 0 ? '+' : ''}${s.irogDeviationPercent}%` : '—',
            s.plannedQuantity,
            s.producedQuantity,
            `${s.goalAttainmentPercent.toFixed(1)}%`,
          ]),
        };
      default:
        return { columns: [], rows: [] };
    }
  }, [overview, selectedReport, downtimes, losses, records]);

  const currentMeta = REPORT_CATALOG.find((r) => r.id === selectedReport)!;

  /** Filtros aplicados (vai no PDF, no Excel e na tela). */
  const filterSummary = useMemo(() => {
    const period = startDate || endDate ? `Período: ${startDate || 'início'} a ${endDate || 'hoje'}` : 'Período: todos os dados';
    const sector = sectorId ? catalog.sectors.find((s) => s.id === sectorId)?.name ?? sectorId : 'todos os setores';
    return `${period} · Setor: ${sector} · ${includeDemo ? 'com' : 'sem'} dados demonstrativos`;
  }, [startDate, endDate, sectorId, includeDemo, catalog.sectors]);

  /** Origem dos registros usados (exigência: relatórios mostram de onde vêm os dados). */
  const dataOrigin = useMemo(() => {
    const count = new Map<string, number>();
    for (const r of records) {
      const src = r.source ?? (r.is_demo ? 'demo' : 'manual');
      count.set(src, (count.get(src) ?? 0) + 1);
    }
    const label: Record<string, string> = {
      iniflex_report: 'Iniflex (relatórios RPCP622/RPCP019)',
      iniflex_api: 'Iniflex (API)',
      manual: 'lançamentos manuais',
      demo: 'DEMONSTRATIVOS (não reais)',
    };
    const parts = [...count].map(([s, n]) => `${n} ${label[s] ?? s}`);
    const irog = overview ? ` · IROG: ${overview.factory.recordsCount} apontamentos brutos, cálculo ${overview.factory.status === 'complete' ? 'completo' : overview.factory.status === 'partial' ? 'parcial' : 'pendente'}` : '';
    return `${parts.length ? parts.join(', ') : 'nenhum registro de produção'}${irog}`;
  }, [records, overview]);

  const handleExportExcel = () => {
    const jsonRows = tableData.rows.map((row) => {
      const obj: Record<string, string | number> = {};
      tableData.columns.forEach((col, i) => {
        obj[col] = row[i];
      });
      return obj;
    });
    // Última linha da planilha: filtros e origem dos dados
    jsonRows.push({ [tableData.columns[0] ?? 'Info']: `${filterSummary} · Origem: ${dataOrigin}` });
    exportRowsToExcel(jsonRows, currentMeta.title, `${selectedReport}-irog-forteflex.xlsx`);
  };

  const handleExportPdf = () => {
    exportReportToPdf({
      title: currentMeta.title,
      subtitle: `${currentMeta.subtitle} · ${filterSummary}`,
      columns: tableData.columns,
      rows: tableData.rows,
      filename: `${selectedReport}-irog-forteflex.pdf`,
      sourceNote: dataOrigin,
    });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">
              Relatórios Gerenciais IROG ForteFlex (14 Modelos)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Selecione um dos 14 relatórios executivos ou operacionais com exportação real em Excel (.xlsx), PDF (.pdf) e CSV.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={tableData.rows.length === 0}
              onClick={handleExportExcel}
              className="min-h-[40px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Exportar Excel (.xlsx)</span>
            </button>
            <button
              type="button"
              disabled={tableData.rows.length === 0}
              onClick={handleExportPdf}
              className="min-h-[40px] px-4 py-2 bg-[#0f2544] hover:bg-[#17345e] disabled:bg-slate-300 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <FileText className="w-4 h-4" />
              <span>Exportar PDF (.pdf)</span>
            </button>
            <button
              type="button"
              disabled={records.length === 0}
              onClick={() => exportProductionRecordsToCSV(records, 'apontamentos-irog-forteflex.csv')}
              className="min-h-[40px] px-3.5 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>CSV Bruto</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-3 border-t border-slate-100">
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">Modelo de Relatório *</label>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value as ReportId)}
              className="w-full min-h-[38px] px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white"
            >
              {REPORT_CATALOG.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </div>
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
        </div>

        <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
          <input
            type="checkbox"
            checked={includeDemo}
            onChange={(e) => setIncludeDemo(e.target.checked)}
            className="rounded border-slate-300 text-blue-600"
          />
          <span>Incluir registros demonstrativos</span>
        </label>
      </div>

      {/* Report Table Preview */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-display font-bold text-[#0f2544]">{currentMeta.title}</h3>
          <p className="text-xs text-slate-500">{currentMeta.subtitle}</p>
          <p className="text-[11px] text-slate-500 mt-1">
            {filterSummary} · Origem: {dataOrigin}
          </p>
        </div>

        {loadError && (
          <div role="alert" className="mx-5 my-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {loadError}
          </div>
        )}

        {loading ? (
          <div className="h-48 animate-pulse bg-slate-50" />
        ) : tableData.rows.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Nenhum dado encontrado para este relatório nos filtros selecionados.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  {tableData.columns.map((col) => (
                    <th key={col} className="px-4 py-2.5 whitespace-nowrap">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {tableData.rows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    {row.map((cell, cIdx) => (
                      <td
                        key={cIdx}
                        className={`px-4 py-2.5 ${
                          typeof cell === 'number' || String(cell).endsWith('%') ? 'font-mono tabular-nums' : ''
                        }`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
