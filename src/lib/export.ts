import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ProductionRecord } from '../types';

/** Exporta linhas genéricas para Excel (relatórios gerenciais). */
export function exportRowsToExcel(
  rows: Record<string, string | number | boolean | null | undefined>[],
  sheetName: string,
  filename: string
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
  XLSX.writeFile(workbook, filename);
}

/** Relatório em PDF (A4 paisagem) com cabeçalho, filtros aplicados e origem dos dados. */
export function exportReportToPdf(params: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
  /** Rodapé com a origem dos dados (ex.: "Iniflex RPCP622/RPCP019 + lançamentos manuais"). */
  sourceNote?: string;
}) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  doc.setFillColor(15, 37, 68);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 54, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(14);
  doc.text(`novo.forteflex · IROG ForteFlex — ${params.title}`, 32, 26);
  doc.setFontSize(9);
  doc.setTextColor(203, 213, 225);
  doc.text(`${params.subtitle} · Gerado em ${new Date().toLocaleString('pt-BR')}`, 32, 42);

  autoTable(doc, {
    startY: 68,
    head: [params.columns],
    body: params.rows,
    styles: { fontSize: 8, cellPadding: 5, textColor: [15, 23, 42] },
    headStyles: { fillColor: [15, 37, 68], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    didDrawPage: () => {
      if (!params.sourceNote) return;
      const h = doc.internal.pageSize.getHeight();
      doc.setFontSize(7.5);
      doc.setTextColor(100, 116, 139);
      doc.text(`Origem dos dados: ${params.sourceNote}`, 32, h - 18);
    },
  });

  doc.save(params.filename);
}

export function exportProductionRecordsToExcel(records: ProductionRecord[], filename = 'novoforteflex-producao.xlsx') {
  const rows = records.map((r) => ({
    Data: r.production_date,
    Turno: r.shift_name || r.shift_id,
    Funcionário: r.operator_name || r.operator_id,
    Setor: r.sector_name || r.sector_id,
    Linha: r.line_name || r.line_id,
    Produto: r.product_name || r.product_id,
    SKU: r.product_sku || '',
    Planejado: r.planned_quantity,
    Produzido: r.produced_quantity,
    Aprovado: r.approved_quantity,
    Perdas: r.loss_quantity,
    Unidade: r.unit_of_measure,
    'Houve Parada': r.has_downtime ? 'Sim' : 'Não',
    'Tempo Parada (min)': r.total_downtime_minutes,
    'Motivo Parada': r.downtime_reason || '',
    Observações: r.notes || '',
    Origem: r.is_demo ? 'Demonstrativo' : 'Produção Real',
    'Criado em': new Date(r.created_at).toLocaleString('pt-BR'),
  }));

  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Produção');
  XLSX.writeFile(workbook, filename);
}

export function exportProductionRecordsToCSV(records: ProductionRecord[], filename = 'novoforteflex-producao.csv') {
  const headers = [
    'Data',
    'Turno',
    'Funcionario',
    'Setor',
    'Linha',
    'Produto',
    'SKU',
    'Planejado',
    'Produzido',
    'Aprovado',
    'Perdas',
    'Unidade',
    'Houve_Parada',
    'Tempo_Parada_Min',
    'Motivo_Parada',
    'Observacoes',
    'Origem',
  ];

  const escapeCsv = (val: unknown) => {
    const str = String(val ?? '').replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines = [
    headers.join(';'),
    ...records.map((r) =>
      [
        r.production_date,
        r.shift_name || '',
        r.operator_name || '',
        r.sector_name || '',
        r.line_name || '',
        r.product_name || '',
        r.product_sku || '',
        r.planned_quantity,
        r.produced_quantity,
        r.approved_quantity,
        r.loss_quantity,
        r.unit_of_measure,
        r.has_downtime ? 'Sim' : 'Nao',
        r.total_downtime_minutes,
        r.downtime_reason || '',
        r.notes || '',
        r.is_demo ? 'Demonstrativo' : 'Real',
      ]
        .map(escapeCsv)
        .join(';')
    ),
  ];

  const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadImportTemplateExcel() {
  const sampleRows = [
    {
      production_date: new Date().toISOString().slice(0, 10),
      shift_code: 'T1',
      operator_username: 'carlos.silva',
      sector_code: 'EXT',
      line_code: 'EXT-01',
      product_sku: 'FF-PEBD-040',
      planned_quantity: 1600,
      produced_quantity: 1580,
      approved_quantity: 1550,
      loss_quantity: 30,
      total_downtime_minutes: 15,
      downtime_reason: 'Troca de tela / filtro',
      notes: 'Exemplo de linha para importação',
    },
  ];
  const worksheet = XLSX.utils.json_to_sheet(sampleRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Modelo_Importacao');
  XLSX.writeFile(workbook, 'modelo-importacao-novoforteflex.xlsx');
}

export async function parseSpreadsheetFile(file: File): Promise<Record<string, any>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    throw new Error('Planilha vazia.');
  }
  const sheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: '' });
}
