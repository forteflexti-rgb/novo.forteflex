/**
 * Leitura da planilha "IROG_Padroes_Producao_Engenharia.xlsx" (aba "Padrões") preenchida pela engenharia.
 * Função pura: recebe as linhas já lidas (array de objetos por cabeçalho) e devolve os padrões válidos
 * e os erros por linha. Nada é gravado aqui.
 */

export interface SheetStandard {
  line: number; // linha da planilha (1 = cabeçalho)
  machine_id: string;
  product_id: string | null;
  stage_id: string | null;
  standard_type: 'rate_per_hour' | 'cycle_seconds';
  value: number;
  unit: string;
  valid_from: string; // AAAA-MM-DD
  source: string;
  notes: string;
  label: string; // máquina · produto, para a prévia
}

export interface SheetParseResult {
  standards: SheetStandard[];
  errors: Array<{ line: number; label: string; message: string }>;
  blank: number; // linhas sem valor oficial (continuam pendentes)
}

const COL = {
  machine: 'Máquina',
  step: 'Etapa',
  product: 'Produto',
  unit: 'Unidade',
  type: 'Tipo (CAPACIDADE ou CICLO)',
  value: 'Valor oficial',
  validFrom: 'Vigente a partir de (dd/mm/aaaa)',
  source: 'Origem / responsável',
  notes: 'Observações',
  resourceId: 'resource_id',
  productId: 'product_id',
  stepId: 'step_id',
} as const;

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v)).trim();

/** Aceita dd/mm/aaaa, aaaa-mm-dd ou número serial do Excel. */
export function parseSheetDate(v: unknown): string | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  const s = str(v);
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, dd, mm, yyyy] = m;
    const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
    return Number.isNaN(Date.parse(`${iso}T00:00:00Z`)) || new Date(`${iso}T00:00:00Z`).getUTCDate() !== Number(dd) ? null : iso;
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return Number.isNaN(Date.parse(`${s}T00:00:00Z`)) ? null : s;
  return null;
}

/** "1.234,5" (pt-BR), "1234.5" ou número → número. */
export function parseSheetNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = str(v).replace(/\s/g, '');
  if (!s) return null;
  const normalized = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

export function parseStandardsSheet(rows: Array<Record<string, unknown>>): SheetParseResult {
  const standards: SheetStandard[] = [];
  const errors: SheetParseResult['errors'] = [];
  let blank = 0;
  const seen = new Set<string>();

  rows.forEach((r, i) => {
    const line = i + 2;
    const label = `${str(r[COL.machine])} · ${str(r[COL.product]) || 'todos os produtos'}`;
    const typeRaw = str(r[COL.type]).toUpperCase();
    const valueRaw = r[COL.value];
    if (!typeRaw && str(valueRaw) === '') {
      blank++;
      return;
    }
    const err = (message: string) => errors.push({ line, label, message });

    const machineId = str(r[COL.resourceId]);
    if (!machineId) return err('Coluna oculta resource_id vazia: use a planilha gerada pelo sistema, sem apagar colunas.');

    const type = typeRaw.startsWith('CAP') ? 'rate_per_hour' : typeRaw.startsWith('CIC') ? 'cycle_seconds' : null;
    if (!type) return err('Tipo deve ser CAPACIDADE ou CICLO.');

    const value = parseSheetNumber(valueRaw);
    if (value === null || value <= 0) return err('Valor oficial deve ser um número maior que zero.');

    const unit = str(r[COL.unit]).toLowerCase();
    if (!unit) return err('Unidade vazia.');

    const validFrom = parseSheetDate(r[COL.validFrom]);
    if (!validFrom) return err('Data de vigência inválida (use dd/mm/aaaa).');

    const source = str(r[COL.source]);
    if (!source) return err('Origem / responsável é obrigatório.');

    const notes = str(r[COL.notes]);
    const allProducts = /VALE PARA TODOS/i.test(notes);
    const productId = allProducts ? null : str(r[COL.productId]) || null;
    const stageId = str(r[COL.stepId]) || null;

    const key = `${machineId}|${productId ?? '*'}|${stageId ?? '*'}|${unit}|${validFrom}`;
    if (seen.has(key)) return err('Linha repetida (mesma máquina, produto, etapa, unidade e vigência).');
    seen.add(key);

    standards.push({
      line,
      machine_id: machineId,
      product_id: productId,
      stage_id: stageId,
      standard_type: type,
      value,
      unit,
      valid_from: validFrom,
      source,
      notes,
      label: allProducts ? `${str(r[COL.machine])} · todos os produtos (${str(r[COL.step]) || 'qualquer etapa'})` : label,
    });
  });

  return { standards, errors, blank };
}
