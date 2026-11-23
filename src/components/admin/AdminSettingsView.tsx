import React, { useEffect, useState } from 'react';
import { Database, Trash2, RotateCcw, CheckCircle2, AlertCircle, Server } from 'lucide-react';
import { api } from '../../lib/api';
import { AdminPortalSettings } from './AdminPortalSettings';

export function AdminSettingsView() {
  const [health, setHealth] = useState<{
    status: string;
    platform: string;
    database: string;
    supabaseConfigured: boolean;
  } | null>(null);
  const [demoCount, setDemoCount] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = async () => {
    try {
      const [h, recs] = await Promise.all([api.health(), api.getProductionRecords({ includeDemo: true })]);
      setHealth(h);
      setDemoCount(recs.records.filter((r) => r.is_demo).length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const handleClearDemo = async () => {
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await api.clearDemoData();
      setFeedback(`${res.removed} registro(s) demonstrativo(s) removido(s). O painel agora exibe apenas dados reais lançados pela equipe.`);
      await loadInfo();
    } catch (err: any) {
      setError(err.message || 'Erro ao remover dados demonstrativos.');
    } finally {
      setBusy(false);
    }
  };

  const handleRestoreDemo = async () => {
    setBusy(true);
    setFeedback(null);
    setError(null);
    try {
      const res = await api.restoreDemoData();
      setFeedback(`${res.created} registro(s) demonstrativo(s) disponíveis para testes.`);
      await loadInfo();
    } catch (err: any) {
      setError(err.message || 'Erro ao restaurar dados demonstrativos.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {feedback && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2.5 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-center gap-2.5 text-sm text-red-800">
          <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Identidade Visual, Logotipo e Textos do Portal (Restrito a Administradores) */}
      <AdminPortalSettings />

      {/* Demo Data Governance */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Database className="w-5 h-5 text-[#0f2544] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">
              Controle de Dados Demonstrativos
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Para validação imediata dos gráficos, a plataforma inicia com registros marcados explicitamente como demonstrativos. Quando iniciar a operação real na fábrica, remova-os com um clique sem afetar usuários, setores ou produtos cadastrados.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="text-sm text-slate-800">
            Registros demonstrativos ativos no banco:{' '}
            <strong className="font-mono tabular-nums text-[#0f2544]">{demoCount}</strong>
          </div>

          <div className="flex flex-wrap gap-2.5">
            {demoCount > 0 ? (
              <button
                type="button"
                disabled={busy}
                onClick={handleClearDemo}
                className="min-h-[40px] px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remover todos os dados demonstrativos</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={busy}
                onClick={handleRestoreDemo}
                className="min-h-[40px] px-4 py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-medium rounded-lg inline-flex items-center gap-2 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restaurar massa demonstrativa</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Infrastructure & Supabase / Vercel Readiness */}
      <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-start gap-3">
          <Server className="w-5 h-5 text-[#0f2544] shrink-0 mt-0.5" />
          <div>
            <h2 className="text-base font-display font-bold text-[#0f2544]">
              Infraestrutura, Supabase e Hospedagem Vercel
            </h2>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">
              Configuração técnica do ambiente de persistência e prontidão para deploy em produção.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="text-xs text-slate-500">Banco de dados ativo neste servidor</div>
            <div className="font-medium text-slate-900 mt-1">
              SQLite Relacional (persistência local em disco)
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Autenticação via bcrypt + JWT com controle de perfil em todas as rotas.
            </div>
          </div>

          <div className="p-4 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="text-xs text-slate-500">Integração Supabase (PostgreSQL + RLS)</div>
            <div className="font-medium text-slate-900 mt-1">
              {health?.supabaseConfigured
                ? 'Variáveis VITE_SUPABASE_URL e ANON_KEY configuradas'
                : 'Pronto para conexão (variáveis de ambiente não definidas)'}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              Script SQL completo com 9 tabelas e políticas RLS disponível em <span className="font-mono">supabase/schema.sql</span>.
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
