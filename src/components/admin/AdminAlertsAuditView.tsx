import React, { useCallback, useEffect, useState } from 'react';
import { Bell, ShieldCheck, History, AlertTriangle, CheckCircle2, Plus } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import type { AuditLogEntry, IrogActiveAlert, IrogAlertRule, ParameterHistoryEntry } from '../../types';

export function AdminAlertsAuditView() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const canViewAudit = user?.role === 'admin' || user?.role === 'director';

  const [tab, setTab] = useState<'alerts' | 'rules' | 'history' | 'audit'>('alerts');
  const [rules, setRules] = useState<IrogAlertRule[]>([]);
  const [activeAlerts, setActiveAlerts] = useState<IrogActiveAlert[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [paramHistory, setParamHistory] = useState<ParameterHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleType, setNewRuleType] = useState('machine_irog_below_goal');
  const [newRuleThreshold, setNewRuleThreshold] = useState('70');

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const al = await api.getAlerts(true);
      setRules(al.rules);
      setActiveAlerts(al.activeAlerts);
      if (canViewAudit) {
        const au = await api.getAuditLogs();
        setAuditLogs(au.logs);
        setParamHistory(au.parameterHistory);
      }
    } finally {
      setLoading(false);
    }
  }, [canViewAudit]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRuleName.trim()) return;
    await api.createAlertRule({
      alert_type: newRuleType,
      name: newRuleName,
      threshold_value: Number(newRuleThreshold),
      comparison: newRuleType.includes('above') ? 'gt' : 'lt',
    });
    setNewRuleName('');
    setFeedback('Regra de alerta criada.');
    await loadAll();
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-display font-bold text-[#0f2544]">
            Alertas Operacionais, Versionamento e Auditoria
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Monitoramento automático de desvios IROG, falhas de dados e trilha imutável de alterações.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg text-xs">
          <button
            type="button"
            onClick={() => setTab('alerts')}
            className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
              tab === 'alerts' ? 'bg-white text-[#0f2544] shadow-sm' : 'text-slate-600'
            }`}
          >
            Alertas Ativos ({activeAlerts.length})
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setTab('rules')}
              className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                tab === 'rules' ? 'bg-white text-[#0f2544] shadow-sm' : 'text-slate-600'
              }`}
            >
              Regras de Alerta
            </button>
          )}
          {canViewAudit && (
            <>
              <button
                type="button"
                onClick={() => setTab('history')}
                className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                  tab === 'history' ? 'bg-white text-[#0f2544] shadow-sm' : 'text-slate-600'
                }`}
              >
                Histórico de Parâmetros
              </button>
              <button
                type="button"
                onClick={() => setTab('audit')}
                className={`px-3 py-1.5 rounded-md font-medium cursor-pointer ${
                  tab === 'audit' ? 'bg-white text-[#0f2544] shadow-sm' : 'text-slate-600'
                }`}
              >
                Logs de Auditoria
              </button>
            </>
          )}
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{feedback}</span>
        </div>
      )}

      {loading ? (
        <div className="h-48 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : (
        <>
          {/* ACTIVE ALERTS */}
          {tab === 'alerts' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <Bell className="w-4 h-4 text-[#0f2544]" />
                <h3 className="text-sm font-display font-bold text-[#0f2544]">
                  Desvios Detectados em Tempo Real ({activeAlerts.length})
                </h3>
              </div>
              {activeAlerts.length === 0 ? (
                <div className="p-8 text-center text-xs text-emerald-700">
                  Nenhum desvio crítico ou alerta ativo no momento.
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {activeAlerts.map((a) => (
                    <div key={a.id} className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-start gap-2.5">
                        <AlertTriangle
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            a.severity === 'critical' ? 'text-red-600' : 'text-amber-600'
                          }`}
                        />
                        <div>
                          <div className="font-semibold text-slate-900">
                            {a.ruleName} · {a.entityName}
                          </div>
                          <div className="text-slate-600 mt-0.5">{a.message}</div>
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-right shrink-0">
                        <span className={a.severity === 'critical' ? 'text-red-700 font-bold' : 'text-amber-700 font-bold'}>
                          Atual: {a.currentValue}
                        </span>
                        <span className="text-slate-400 ml-2">Meta/Limite: {a.thresholdValue}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* RULES CONFIG */}
          {tab === 'rules' && isAdmin && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <form onSubmit={handleCreateRule} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit">
                <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova regra de alerta</h3>
                <input
                  type="text"
                  required
                  value={newRuleName}
                  onChange={(e) => setNewRuleName(e.target.value)}
                  placeholder="Nome do alerta"
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <select
                  value={newRuleType}
                  onChange={(e) => setNewRuleType(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="machine_irog_below_goal">IROG Máquina abaixo de (%)</option>
                  <option value="sector_irog_below_goal">IROG Setor abaixo de (%)</option>
                  <option value="downtime_above_limit">Paradas acima de (min)</option>
                  <option value="loss_above_limit">Perda acima de (%)</option>
                </select>
                <input
                  type="number"
                  step="0.1"
                  required
                  value={newRuleThreshold}
                  onChange={(e) => setNewRuleThreshold(e.target.value)}
                  placeholder="Valor limite"
                  className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="w-full min-h-[40px] bg-blue-600 text-white text-xs font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Adicionar regra</span>
                </button>
              </form>

              <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-3">Regra</th>
                      <th className="px-4 py-3">Tipo</th>
                      <th className="px-4 py-3 text-right">Limite</th>
                      <th className="px-4 py-3 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rules.map((r) => (
                      <tr key={r.id}>
                        <td className="px-4 py-3 font-medium text-slate-900">{r.name}</td>
                        <td className="px-4 py-3 font-mono text-slate-500">{r.alert_type}</td>
                        <td className="px-4 py-3 text-right font-mono font-semibold">{r.threshold_value}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await api.updateAlertRule(r.id, { enabled: !r.enabled });
                              await loadAll();
                            }}
                            className={`px-2 py-1 rounded font-semibold cursor-pointer ${
                              r.enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {r.enabled ? 'Ativo' : 'Pausado'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* PARAMETER HISTORY */}
          {tab === 'history' && canViewAudit && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <History className="w-4 h-4 text-[#0f2544]" />
                <h3 className="text-sm font-display font-bold text-[#0f2544]">
                  Histórico de Parâmetros (Ciclos, Capacidades e Metas)
                </h3>
              </div>
              {paramHistory.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">Nenhuma alteração de parâmetro registrada ainda.</div>
              ) : (
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                    <tr>
                      <th className="px-4 py-2.5">Data</th>
                      <th className="px-4 py-2.5">Entidade / Campo</th>
                      <th className="px-4 py-2.5">Valor Anterior</th>
                      <th className="px-4 py-2.5">Novo Valor</th>
                      <th className="px-4 py-2.5">Alterado por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {paramHistory.map((ph) => (
                      <tr key={ph.id}>
                        <td className="px-4 py-2.5 font-mono text-slate-600">
                          {new Date(ph.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-2.5 font-mono">
                          {ph.entity_type} · {ph.field_name}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-500">{ph.old_value || '—'}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-[#0f2544]">{ph.new_value}</td>
                        <td className="px-4 py-2.5 text-slate-700">{ph.changed_by_name || 'Sistema'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* AUDIT LOGS */}
          {tab === 'audit' && canViewAudit && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-[#0f2544]" />
                <h3 className="text-sm font-display font-bold text-[#0f2544]">
                  Trilha de Auditoria (Audit Logs)
                </h3>
              </div>
              <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                    <tr>
                      <th className="px-4 py-2.5">Timestamp</th>
                      <th className="px-4 py-2.5">Usuário</th>
                      <th className="px-4 py-2.5">Ação</th>
                      <th className="px-4 py-2.5">Tabela / ID</th>
                      <th className="px-4 py-2.5">Detalhes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((log) => (
                      <tr key={log.id}>
                        <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('pt-BR')}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">{log.actor_name}</td>
                        <td className="px-4 py-2.5 font-mono font-semibold text-blue-700">{log.action}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">
                          {log.entity_type} {log.entity_id ? `(${log.entity_id})` : ''}
                        </td>
                        <td className="px-4 py-2.5 font-mono text-slate-500 max-w-xs truncate">{log.details || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
