import React, { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Factory, UploadCloud } from 'lucide-react';
import { api } from '../../lib/api';
import type { IniflexImportSummary } from '../../types';

interface Props {
  onImported?: () => void;
}

const fmtKg = (n: number) => `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg`;
const fmtDate = (iso: string) => iso.split('-').reverse().join('/');

async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Importação direta dos relatórios do Iniflex: RPCP622 (produção detalhada) + RPCP019 (perdas e paradas). */
export function IniflexReportImport({ onImported }: Props) {
  const [files, setFiles] = useState<Array<{ name: string; contentBase64: string }>>([]);
  const [preview, setPreview] = useState<IniflexImportSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<IniflexImportSummary | null>(null);

  const handleSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    e.target.value = '';
    if (selected.length === 0) return;
    setError(null);
    setDone(null);
    setPreview(null);
    setLoading(true);
    try {
      const payload = await Promise.all(
        selected.map(async (f) => ({ name: f.name, contentBase64: await fileToBase64(f) }))
      );
      setFiles(payload);
      setPreview(await api.importIniflexReports({ files: payload, commit: false }));
    } catch (err: any) {
      setError(err.message || 'Erro ao ler os relatórios.');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.importIniflexReports({ files, commit: true });
      setDone(res);
      setPreview(null);
      setFiles([]);
      onImported?.();
    } catch (err: any) {
      setError(err.message || 'Erro ao gravar a importação.');
    } finally {
      setLoading(false);
    }
  };

  const s = preview;

  return (
    <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
      <div>
        <h2 className="text-base font-display font-bold text-[#0f2544] flex items-center gap-2">
          <Factory className="w-5 h-5 text-teal-700" />
          Relatórios do ERP Iniflex (RPCP622 + RPCP019)
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Selecione os dois arquivos exportados do Iniflex de uma vez. O <strong>RPCP622</strong> (Análise Detalhada de
          Produção) traz cada apontamento por dia, recurso, item e turno; o <strong>RPCP019</strong> (Controle de Produção
          Diária) complementa com perdas e paradas. Itens e recursos novos são cadastrados automaticamente, e reimportar o
          mesmo período substitui a carga anterior do Iniflex.
        </p>
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {done && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-start gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <span>
            Importação concluída ({done.batchId}): {done.recordsCreated} registros de {fmtDate(done.periodStart)} a{' '}
            {fmtDate(done.periodEnd)}, {fmtKg(done.totalWeightKg)} produzidos. Os dados já estão no Dashboard.
          </span>
        </div>
      )}

      <label className="block border-2 border-dashed border-teal-300 hover:border-teal-600 rounded-xl p-6 text-center cursor-pointer transition-colors bg-teal-50/40">
        <input type="file" accept=".xlsx,.xls" multiple onChange={handleSelect} className="hidden" />
        <UploadCloud className="w-7 h-7 text-teal-700 mx-auto mb-2" />
        <div className="text-sm font-medium text-slate-800">
          {loading ? 'Processando relatórios...' : 'Selecionar RPCP622 e RPCP019 (.xlsx)'}
        </div>
        <p className="text-xs text-slate-500 mt-1">Nada é gravado antes da sua confirmação.</p>
      </label>

      {s && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
            {[
              ['Período', `${fmtDate(s.periodStart)} – ${fmtDate(s.periodEnd)}`],
              ['Produção (peso líquido)', fmtKg(s.totalWeightKg)],
              ['Perdas', fmtKg(s.totalLossKg)],
              ['Paradas', `${s.totalDowntimeMinutes} min`],
              ['Apontamentos lidos', String(s.apontamentos)],
              ['Registros consolidados', String(s.recordsCreated)],
              ['Produtos novos / atualizados', `${s.newProducts.length} / ${s.renamedProducts}`],
              ['Carga anterior substituída', `${s.replacedRecords} registros`],
            ].map(([label, value]) => (
              <div key={label} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                <div className="text-slate-500">{label}</div>
                <div className="font-semibold text-slate-900 font-mono tabular-nums mt-0.5">{value}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-3 py-2">Recurso</th>
                  <th className="px-3 py-2 text-right">Produção</th>
                  <th className="px-3 py-2 text-right">Perdas</th>
                  <th className="px-3 py-2 text-right">Paradas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {s.byLine.map((l) => (
                  <tr key={l.line}>
                    <td className="px-3 py-2">{l.line}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtKg(l.weightKg)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{fmtKg(l.lossKg)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{l.downtimeMinutes} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {s.newProducts.length > 0 && (
            <div className="text-xs text-slate-600">
              <span className="font-semibold">Produtos que serão cadastrados:</span>{' '}
              {s.newProducts.map((p) => `${p.sku} – ${p.name}`).join('; ')}
            </div>
          )}

          {s.warnings.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
              {s.warnings.map((w) => (
                <div key={w} className="flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setPreview(null);
                setFiles([]);
              }}
              className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-medium rounded-lg cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleCommit}
              className="min-h-[40px] px-4 py-2 bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white text-xs font-medium rounded-lg cursor-pointer"
            >
              {loading ? 'Gravando...' : `Confirmar importação de ${s.recordsCreated} registros`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
