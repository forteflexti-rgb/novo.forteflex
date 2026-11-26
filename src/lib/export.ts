import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { ImportEntityType, ImportValidationRow, ProductionRecord } from '../types';

export function exportProductionRecordsToExcel(records: ProductionRecord[], filename = 'novoforteflex-producao.xlsx') {
  const rows = records.map((r) => ({
    Data: r.production_date,
    Turno: r.shift_name || r.shift_id,
    Funcionário: r.operator_name || r.operator_id,
    Setor: r.sector_name || r.sector_id,
    Linha: r.line_name || r.line_id,
    Máquina: r.machine_name || '—',
    OP: r.order_number || '—',
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

export function exportReportToPdf(params: {
  title: string;
  subtitle: string;
  columns: string[];
  rows: (string | number)[][];
  filename: string;
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
    styles: {
      fontSize: 8,
      cellPadding: 5,
      textColor: [15, 23, 42],
    },
    headStyles: {
      fillColor: [15, 37, 68],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252],
    },
  });

  doc.save(params.filename);
}

export function exportProductionRecordsToCSV(records: ProductionRecord[], filename = 'novoforteflex-producao.csv') {
  const headers = [
    'Data',
    'Turno',
    'Funcionario',
    'Setor',
    'Linha',
    'Maquina',
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
        r.machine_name || '',
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

export function downloadImportTemplateExcel(entityType: ImportEntityType = 'production') {
  const today = new Date().toISOString().slice(0, 10);
  const templates: Record<ImportEntityType, Record<string, any>[]> = {
    production: [
      {
        production_date: today,
        shift_code: 'T1',
        operator_username: 'carlos.silva',
        sector_code: 'EXT',
        line_code: 'EXT-01',
        machine_code: 'M-EXT-01',
        product_sku: 'FF-PEBD-040',
        planned_quantity: 1600,
        produced_quantity: 1580,
        approved_quantity: 1550,
        loss_quantity: 30,
        total_downtime_minutes: 15,
        downtime_reason: 'Troca de tela / filtro',
        notes: 'Exemplo de apontamento de produção',
      },
    ],
    losses: [
      {
        loss_date: today,
        shift_code: 'T1',
        sector_code: 'EXT',
        product_sku: 'FF-PEBD-040',
        category: 'Refugo',
        reason_name: 'Apara de borda / refugo de início',
        quantity: 22.5,
        notes: 'Exemplo de lançamento de perda',
      },
    ],
    downtimes: [
      {
        machine_code: 'M-EXT-01',
        shift_code: 'T1',
        reason: 'Troca de tela / filtro',
        category: 'Operacional',
        duration_minutes: 25,
        description: 'Troca preventiva durante turno',
      },
    ],
    products: [
      {
        sku: 'FF-PEAD-050',
        name: 'Filme Técnico PEAD 50 micras',
        category: 'Filmes Técnicos',
        unit_of_measure: 'kg',
        target_cycle_minutes: 0.35,
      },
    ],
    machines: [
      {
        sector_code: 'EXT',
        line_code: 'EXT-01',
        code: 'M-EXT-03',
        name: 'Extrusora Balão 03',
        resource_type: 'Extrusora',
        theoretical_capacity_per_hour: 230,
        capacity_unit: 'kg',
      },
    ],
    lines: [
      {
        sector_code: 'EXT',
        code: 'EXT-03',
        name: 'Linha Extrusão 03',
        capacity_per_hour: 230,
      },
    ],
    sectors: [
      {
        code: 'REB',
        name: 'Rebobinamento',
        description: 'Setor de corte e rebobinamento de bobinas',
      },
    ],
    cycle_times: [
      {
        machine_code: 'M-EXT-01',
        product_sku: 'FF-PEBD-040',
        theoretical_capacity_per_hour: 225,
      },
    ],
  };

  const worksheet = XLSX.utils.json_to_sheet(templates[entityType] || templates.production);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, `Modelo_${entityType}`);
  XLSX.writeFile(workbook, `modelo-${entityType}-novoforteflex.xlsx`);
}

export function exportImportErrorsToExcel(rows: ImportValidationRow[], entityType: ImportEntityType) {
  const errRows = rows
    .filter((r) => r.status === 'error' || r.status === 'duplicate')
    .map((r) => ({
      Linha: r.rowIndex,
      Status: r.status === 'duplicate' ? 'Duplicado' : 'Erro',
      Motivos: r.messages.join('; '),
      ...(r.raw || {}),
    }));
  if (errRows.length === 0) return;
  exportRowsToExcel(errRows, 'Erros_Importacao', `erros-importacao-${entityType}.xlsx`);
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
