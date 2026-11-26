import React, { useCallback, useEffect, useState } from 'react';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Database,
  ArrowRightLeft,
  Download,
  Server,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../lib/api';
import {
  downloadImportTemplateExcel,
  exportImportErrorsToExcel,
  parseSpreadsheetFile,
} from '../../lib/export';
import type {
  ImportBatch,
  ImportEntityType,
  ImportValidationRow,
  IntegrationLog,
  IntegrationSettings,
  IntegrationStatus,
} from '../../types';

const ENTITY_OPTIONS: Array<{ value: ImportEntityType; label: string; hint: string }> = [
  { value: 'production', label: '1. Apontamentos de Produção', hint: 'Chave: Data + Turno + Operador + Linha + SKU' },
  { value: 'losses', label: '2. Perdas e Refugos', hint: 'loss_date, shift_code, sector_code, product_sku, quantity' },
  { value: 'downtimes', label: '3. Paradas de Máquina', hint: 'machine_code, shift_code, reason, duration_minutes' },
  { value: 'products', label: '4. Produtos (SKU)', hint: 'sku, name, category, unit_of_measure' },
  { value: 'machines', label: '5. Máquinas e Recursos', hint: 'sector_code, line_code, code, name, theoretical_capacity_per_hour' },
  { value: 'lines', label: '6. Linhas de Produção', hint: 'sector_code, code, name, capacity_per_hour' },
  { value: 'sectors', label: '7. Setores Industriais', hint: 'code, name, description' },
  { value: 'cycle_times', label: '8. Tempos de Ciclo Padrão', hint: 'machine_code, product_sku, theoretical_capacity_per_hour' },
];

const INTEGRATION_STATUS_LABELS: Record<IntegrationStatus, string> = {
  not_configured: 'Não configurada',
  awaiting_credentials: 'Aguardando credenciais Projedata',
  awaiting_network: 'Aguardando liberação VPN / Oracle AWS Virginia',
  configured: 'Configurada (Somente Leitura)',
  connected: 'Conectada',
  connection_error: 'Erro de conexão',
};

export function AdminImportsView() {
  const [entityType, setEntityType] = useState<ImportEntityType>('production');
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [previewRows, setPreviewRows] = useState<ImportValidationRow[]>([]);
  const [filename, setFilename] = useState('');
  const [sourceType, setSourceType] = useState<'excel' | 'csv'>('excel');
  const [validating, setValidating] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Projedata / Iniflex state
  const [projSettings, setProjSettings] = useState<IntegrationSettings | null>(null);
  const [projLogs, setProjLogs] = useState<IntegrationLog[]>([]);
  const [hasToken, setHasToken] = useState(false);
  const [projStatus, setProjStatus] = useState<IntegrationStatus>('awaiting_credentials');
  const [projBaseUrl, setProjBaseUrl] = useState('');
  const [projInterfaces, setProjInterfaces] = useState<string[]>([
    'EXP_AP_PRODUCAO_V1',
    'EXP_AP_PERDA_V1',
    'EXP_AP_PARADA_V1',
  ]);
  const [savingProj, setSavingProj] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [impRes, projRes] = await Promise.all([
        api.getImportBatches(),
        api.getProjedataIntegration(),
      ]);
      setBatches(impRes.batches);
      if (projRes.settings) {
        setProjSettings(projRes.settings);
        setProjStatus(projRes.settings.status);
        setProjBaseUrl(projRes.settings.api_base_url || '');
        setProjInterfaces(projRes.settings.enabled_interfaces || []);
      }
      setProjLogs(projRes.logs || []);
      setHasToken(projRes.hasBackendTokenConfigured);
    } catch {
      // ignore initial error
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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
      const res = await api.validateImportRows(parsed, entityType);
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
        entity_type: entityType,
        rows: previewRows,
      });
      setFeedback(
        `Lote ${res.batchId} processado: ${res.imported} registro(s) importado(s), ${res.duplicates} duplicado(s) ignorado(s), ${res.errors} erro(s).`
      );
      setPreviewRows([]);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Erro ao confirmar importação.');
    } finally {
      setCommitting(false);
    }
  };

  const handleSaveProjedata = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    setSavingProj(true);
    try {
      await api.updateProjedataIntegration({
        status: projStatus,
        api_base_url: projBaseUrl || null,
        enabled_interfaces: projInterfaces,
      });
      setFeedback('Configuração estrutural Projedata / Iniflex salva com sucesso.');
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Erro ao atualizar integração Projedata.');
    } finally {
      setSavingProj(false);
    }
  };

  const toggleInterface = (iface: string) => {
    setProjInterfaces((prev) =>
      prev.includes(iface) ? prev.filter((i) => i !== iface) : [...prev, iface]
    );
  };

  const validCount = previewRows.filter((r) => r.status === 'valid').length;
  const dupCount = previewRows.filter((r) => r.status === 'duplicate').length;
  const errCount = previewRows.filter((r) => r.status === 'error').length;
  const selectedEntityMeta = ENTITY_OPTIONS.find((o) => o.value === entityType)!;

  return (
    <div className="space-y-6">
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

      {/* 8-TYPE SPREADSHEET IMPORT */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">
              Importação em Lote (Excel / CSV — 8 Entidades)
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Validação prévia, prevenção de duplicidades e exportação de linhas com erro para reprocessamento.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value as ImportEntityType);
                setPreviewRows([]);
              }}
              className="min-h-[40px] px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg bg-white"
            >
              {ENTITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => downloadImportTemplateExcel(entityType)}
              className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Baixar modelo ({entityType}.xlsx)</span>
            </button>
          </div>
        </div>

        <label className="block border-2 border-dashed border-slate-300 hover:border-blue-500 rounded-xl p-8 text-center cursor-pointer transition-colors bg-slate-50/50">
          <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
          <UploadCloud className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <div className="text-sm font-medium text-slate-800">
            {validating
              ? 'Validando registros...'
              : `Selecionar arquivo (.xlsx ou .csv) para ${selectedEntityMeta.label}`}
          </div>
          <p className="text-xs text-slate-500 mt-1">{selectedEntityMeta.hint}</p>
        </label>

        {previewRows.length > 0 && (
          <div className="space-y-4 pt-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="text-xs text-slate-700 space-x-3 font-mono tabular-nums">
                <span>
                  Arquivo: <strong>{filename}</strong>
                </span>
                <span className="text-emerald-700 font-semibold">{validCount} válidos</span>
                <span className="text-amber-700 font-semibold">{dupCount} duplicados</span>
                <span className="text-red-700 font-semibold">{errCount} erros</span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(errCount > 0 || dupCount > 0) && (
                  <button
                    type="button"
                    onClick={() => exportImportErrorsToExcel(previewRows, entityType)}
                    className="min-h-[38px] px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Exportar erros (.xlsx)</span>
                  </button>
                )}
                <button
                  type="button"
                  disabled={validCount === 0 || committing}
                  onClick={handleCommit}
                  className="min-h-[38px] px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
                >
                  {committing ? 'Gravando...' : `Importar ${validCount} válido(s)`}
                </button>
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-3 py-2.5">Linha</th>
                    <th className="px-3 py-2.5">Data / Código</th>
                    <th className="px-3 py-2.5">Chave / SKU</th>
                    <th className="px-3 py-2.5 text-right">Qtd / Valor</th>
                    <th className="px-3 py-2.5">Validação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {previewRows.map((row) => (
                    <tr key={row.rowIndex}>
                      <td className="px-3 py-2 font-mono">{row.rowIndex}</td>
                      <td className="px-3 py-2 font-mono">
                        {row.production_date || row.sector_code || row.machine_code || '—'}
                      </td>
                      <td className="px-3 py-2 font-mono">
                        {row.product_sku || row.line_code || row.notes || '—'}
                      </td>
                      <td className="px-3 py-2 text-right font-mono tabular-nums">
                        {row.produced_quantity || row.planned_quantity || '—'}
                      </td>
                      <td className="px-3 py-2">
                        {row.status === 'valid' ? (
                          <span className="text-emerald-700 font-semibold">Válido</span>
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

      {/* PROJEDATA / INIFLEX INTEGRATION (READ-ONLY PREPARED ARCHITECTURE) */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <ArrowRightLeft className="w-5 h-5 text-[#0f2544] shrink-0 mt-0.5" />
            <div>
              <h3 className="text-base font-display font-bold text-[#0f2544]">
                Integração ERP Iniflex — API Projedata (Somente Leitura)
              </h3>
              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                Estrutura preparada para leitura das visões oficiais <span className="font-mono">EXP_AP_PRODUCAO_V1</span>,{' '}
                <span className="font-mono">EXP_AP_PERDA_V1</span> e <span className="font-mono">EXP_AP_PARADA_V1</span>.
                O banco Oracle do Iniflex reside em nuvem privada AWS Virginia e exige credenciais e relay VPN autorizados — nunca acesso direto ou simulado.
              </p>
              <a
                href={projSettings?.docs_url || 'https://projedata-api.apidog.io/'}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:underline mt-1.5"
              >
                <span>Documentação oficial Projedata API</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
          <div className="text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg whitespace-nowrap">
            {INTEGRATION_STATUS_LABELS[projStatus]}
          </div>
        </div>

        <form onSubmit={handleSaveProjedata} className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 border-t border-slate-100">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Status da integração</label>
            <select
              value={projStatus}
              onChange={(e) => setProjStatus(e.target.value as IntegrationStatus)}
              className="w-full min-h-[40px] px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              {Object.entries(INTEGRATION_STATUS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-700 mb-1">
              URL Base da API / Relay Seguro (somente backend lê tokens de ambiente)
            </label>
            <input
              type="url"
              value={projBaseUrl}
              onChange={(e) => setProjBaseUrl(e.target.value)}
              placeholder="https://api-relay.forteflex.interno/projedata/v1"
              className="w-full min-h-[40px] px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-medium text-slate-700 mb-1.5">Interfaces habilitadas (somente leitura)</div>
            <div className="flex flex-wrap gap-4 text-xs text-slate-700">
              {['EXP_AP_PRODUCAO_V1', 'EXP_AP_PERDA_V1', 'EXP_AP_PARADA_V1'].map((iface) => (
                <label key={iface} className="inline-flex items-center gap-1.5 cursor-pointer font-mono">
                  <input
                    type="checkbox"
                    checked={projInterfaces.includes(iface)}
                    onChange={() => toggleInterface(iface)}
                  />
                  <span>{iface}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-end justify-between gap-2">
            <div className="text-[11px] text-slate-500 flex items-center gap-1">
              <Server className="w-3.5 h-3.5 shrink-0" />
              <span>{hasToken ? 'PROJEDATA_API_TOKEN definido' : 'Sem token no servidor'}</span>
            </div>
            <button
              type="submit"
              disabled={savingProj}
              className="min-h-[38px] px-4 py-1.5 bg-[#0f2544] hover:bg-[#17345e] text-white text-xs font-medium rounded-lg cursor-pointer whitespace-nowrap"
            >
              {savingProj ? 'Salvando...' : 'Salvar configuração'}
            </button>
          </div>
        </form>

        {projLogs.length > 0 && (
          <div className="border-t border-slate-100 pt-3">
            <div className="text-xs font-semibold text-[#0f2544] mb-2">Logs recentes da camada de integração</div>
            <div className="space-y-1 text-xs text-slate-600 max-h-36 overflow-y-auto">
              {projLogs.slice(0, 6).map((l) => (
                <div key={l.id} className="flex items-center justify-between gap-2 py-1 border-b border-slate-50">
                  <span>
                    <strong className="font-mono">{l.interface_name}</strong> — {l.message}
                  </span>
                  <span className="font-mono text-[11px] text-slate-400 shrink-0">
                    {new Date(l.created_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* IMPORT HISTORY */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Database className="w-4 h-4 text-[#0f2544]" />
          <h3 className="text-sm font-display font-bold text-[#0f2544]">Histórico de Lotes Importados</h3>
        </div>
        {batches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">Nenhum lote de importação processado até o momento.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Data</th>
                  <th className="px-4 py-2.5">Entidade / Origem</th>
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
                      {(b.entity_type || 'production').toUpperCase()} · {b.source_type.toUpperCase()} · {b.filename}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{b.imported_by_name}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">{b.total_rows}</td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {b.imported_rows}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums text-amber-700">{b.duplicate_rows}</td>
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
