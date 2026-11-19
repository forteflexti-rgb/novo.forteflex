import * as XLSX from 'xlsx';
import type { ProductionRecord } from '../types';

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
