import React, { useCallback, useEffect, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Database,
  ArrowRightLeft,
} from 'lucide-react';
import { api } from '../../lib/api';
import { downloadImportTemplateExcel, parseSpreadsheetFile } from '../../lib/export';
import type { ImportBatch, ImportValidationRow } from '../../types';

export function AdminImportsView() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [previewRows, setPreviewRows] = useState<ImportValidationRow[]>([]);
  const [filename, setFilename] = useState('');
  const [sourceType, setSourceType] = useState<'excel' | 'csv'>('excel');
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadBatches = useCallback(async () => {
    try {
      const res = await api.getImportBatches();
      setBatches(res.batches);
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    loadBatches();
  }, [loadBatches]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    setFeedback(null);
    setValidating(true);
    setFilename(file.name);
    setSourceType(file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'excel');

    try {
      const parsed = await parseSpreadsheetFile(file);
      const res = await api.validateImportRows(parsed);
      setPreviewRows(res.rows);
    } catch (err: any) {
      setError(err.message || 'Erro ao ler ou validar a planilha.');
      setPreviewRows([]);
    } finally {
      setValidating(false);
      e.target.value = '';
    }
  };

  const handleCommit = async () => {
    if (previewRows.length === 0) return;
    setCommitting(true);
    setError(null);
    try {
      const res = await api.commitImportRows({
        filename,
        source_type: sourceType,
        rows: previewRows,
      });
      setFeedback(
        `Lote ${res.batchId} processado: ${res.imported} registro(s) importado(s), ${res.duplicates} duplicado(s) ignorado(s), ${res.errors} erro(s).`
      );
      setPreviewRows([]);
      await loadBatches();
    } catch (err: any) {
      setError(err.message || 'Erro ao confirmar importação.');
    } finally {
      setCommitting(false);
    }
  };

  const validCount = previewRows.filter((r) => r.status === 'valid').length;
  const dupCount = previewRows.filter((r) => r.status === 'duplicate').length;
  const errCount = previewRows.filter((r) => r.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Spreadsheet Import Section */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">
              Importação de Planilhas (Excel / CSV)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Validação automática contra setores, linhas, SKUs e detecção de duplicidades antes da gravação.
            </p>
          </div>
          <button
            type="button"
            onClick={downloadImportTemplateExcel}
            className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>Baixar modelo padrão (.xlsx)</span>
          </button>
        </div>

        {feedback && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{feedback}</span>
          </div>
        )}

        {error && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-800">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <label className="block border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileUpload}
            className="hidden"
          />
          <UploadCloud className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-800">
            {validating ? 'Validando registros...' : 'Clique para selecionar um arquivo Excel (.xlsx) ou CSV'}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Chave de duplicidade verificada: Data + Turno + Operador + Linha + Produto SKU.
          </p>
        </label>

        {previewRows.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-700 space-x-3 font-mono tabular-nums">
                <span>Arquivo: <strong>{filename}</strong></span>
                <span className="text-emerald-700 font-semibold">{validCount} válidos</span>
                <span className="text-amber-700 font-semibold">{dupCount} duplicados</span>
                <span className="text-red-700 font-semibold">{errCount} erros</span>
              </div>
              <button
                type="button"
                disabled={validCount === 0 || committing}
                onClick={handleCommit}
                className="min-h-[40px] px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
              >
                {committing ? 'Gravando...' : `Importar ${validCount} registro(s) válido(s)`}
              </button>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-3 py-2.5">Linha</th>
                    <th className="px-3 py-2.5">Data / Turno</th>
                    <th className="px-3 py-2.5">Operador</th>
                    <th className="px-3 py-2.5">Setor / Linha / SKU</th>
                    <th className="px-3 py-2.5 text-right">Plan. / Prod.</th>
                    <th className="px-3 py-2.5">Validação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row) => (
                    <tr key={row.rowIndex}>
                      <td className="px-3 py-2 font-mono">{row.rowIndex}</td>
                      <td className="px-3 py-2 font-mono">
                        {row.production_date} · {row.shift_code}
                      </td>
                      <td className="px-3 py-2 font-mono">{row.operator_username}</td>
                      <td className="px-3 py-2 font-mono">
                        {row.sector_code} / {row.line_code} / {row.product_sku}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.planned_quantity} / {row.produced_quantity}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === 'valid' ? (
                          <span className="text-emerald-700 font-semibold">Válido para importação</span>
                        ) : row.status === 'duplicate' ? (
                          <span className="text-amber-700 font-semibold">{row.messages.join('; ')}</span>
                        ) : (
                          <span className="text-red-700 font-semibold">{row.messages.join('; ')}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* ERP Iniflex (Projedata) Architecture Preparation */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="w-5 h-5 text-[#0f2544] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-display font-bold text-[#0f2544]">
                Integração ERP Iniflex (Projedata) — Arquitetura Preparada
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Conforme planejamento da Etapa 1, a conexão em tempo real com o ERP Iniflex não está ativada nesta fase. A estrutura de banco, validação de chaves e histórico de lotes já está preparada para receber sincronização via API REST/Webhook.
              </p>
            </div>
          </div>
          <span className="text-xs font-medium text-amber-800 whitespace-nowrap shrink-0 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Aguardando credenciais ERP</span>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2 border-t border-slate-100 text-xs">
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="font-semibold text-[#0f2544] mb-1">Mapeamento de Cadastros</div>
            <p className="text-slate-600 leading-relaxed">
              Centro de Trabalho Iniflex → <span className="font-mono">sectors / production_lines</span>; Item/SKU → <span className="font-mono">products.sku</span>.
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="font-semibold text-[#0f2544] mb-1">Prevenção de Duplicidade</div>
            <p className="text-slate-600 leading-relaxed">
              Chave composta auditada na tabela <span className="font-mono">import_batches</span> antes da inserção em <span className="font-mono">production_records</span>.
            </p>
          </div>
          <div className="p-3.5 bg-slate-50 rounded-lg border border-slate-200/70">
            <div className="font-semibold text-[#0f2544] mb-1">Fluxo Futuro de Sincronização</div>
            <p className="text-slate-600 leading-relaxed">
              Ordens de Produção (OP) importadas como planejado e apontamentos exportados ou validados via fila assíncrona.
            </p>
          </div>
        </div>
      </section>

      {/* Import History */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#0f2544]" />
          <h3 className="text-sm font-display font-bold text-[#0f2544]">Histórico de Importações</h3>
        </div>
        {batches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Nenhum lote de importação processado até o momento.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Origem / Arquivo</th>
                  <th className="px-4 py-2.5">Responsável</th>
                  <th className="px-4 py-2.5 text-right">Total</th>
                  <th className="px-4 py-2.5 text-right">Importados</th>
                  <th className="px-4 py-2.5 text-right">Duplicados</th>
                  <th className="px-4 py-2.5 text-right">Erros</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batches.map((b) => (
                  <tr key={b.id}>
                    <td className="px-4 py-2.5 font-mono tabular-nums text-slate-700">
                      {new Date(b.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {b.source_type.toUpperCase()} · {b.filename}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{b.imported_by_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.total_rows}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {b.imported_rows}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700">
                      {b.duplicate_rows}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-700">{b.error_rows}</td>
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
