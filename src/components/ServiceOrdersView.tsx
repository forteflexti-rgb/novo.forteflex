import React, { useEffect, useState, useMemo } from 'react';
import {
  LifeBuoy,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  AlertOctagon,
  MessageSquare,
  Send,
  User,
  Phone,
  Shield,
  Tag,
  X,
  FileText,
  RefreshCw,
  Sliders,
  Check,
  Building2,
  Cpu,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api } from '../lib/api';
import type {
  CatalogData,
  ServiceOrder,
  ServiceOrderCategory,
  ServiceOrderPriority,
  ServiceOrderStatus,
  ServiceOrderSummary,
} from '../types';

interface ServiceOrdersViewProps {
  catalog: CatalogData;
}

const CATEGORY_MAP: Record<ServiceOrderCategory, { label: string; icon: string }> = {
  hardware: { label: 'Hardware & Equipamentos', icon: '💻' },
  systems_erp: { label: 'Sistemas & ERP', icon: '📊' },
  network_internet: { label: 'Redes & Conexão', icon: '🌐' },
  printers_labels: { label: 'Impressoras & Etiquetas', icon: '🖨️' },
  access_passwords: { label: 'Acessos & Senhas', icon: '🔑' },
  telephony: { label: 'Telefonia / Ramais', icon: '📞' },
  other: { label: 'Outros Chamados', icon: '🛠️' },
};

const PRIORITY_BADGES: Record<ServiceOrderPriority, { label: string; className: string; bg: string }> = {
  critical: { label: 'Crítica (Linha Parada)', className: 'text-red-700 bg-red-50 border-red-200 animate-pulse', bg: 'bg-red-600' },
  high: { label: 'Alta', className: 'text-orange-700 bg-orange-50 border-orange-200', bg: 'bg-orange-500' },
  medium: { label: 'Média', className: 'text-amber-700 bg-amber-50 border-amber-200', bg: 'bg-amber-500' },
  low: { label: 'Baixa', className: 'text-slate-700 bg-slate-100 border-slate-200', bg: 'bg-slate-400' },
};

const STATUS_BADGES: Record<ServiceOrderStatus, { label: string; className: string }> = {
  open: { label: 'Aberto', className: 'text-sky-700 bg-sky-50 border-sky-200' },
  in_progress: { label: 'Em Atendimento', className: 'text-purple-700 bg-purple-50 border-purple-200' },
  waiting: { label: 'Aguardando Peça / Terceiro', className: 'text-amber-700 bg-amber-50 border-amber-200' },
  completed: { label: 'Concluído', className: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  cancelled: { label: 'Cancelado', className: 'text-slate-500 bg-slate-100 border-slate-200' },
};

export function ServiceOrdersView({ catalog }: ServiceOrdersViewProps) {
  const { user } = useAuth();
  const isAdminOrTI =
    user?.role === 'admin' ||
    (user?.role as any) === 'ti' ||
    user?.username === 'ti' ||
    user?.sector_id === 'sec-ti';

  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [summary, setSummary] = useState<ServiceOrderSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modais
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<ServiceOrder | null>(null);
  const [showTISettingsModal, setShowTISettingsModal] = useState(false);

  // Form de Novo Chamado
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCategory, setNewCategory] = useState<ServiceOrderCategory>('hardware');
  const [newPriority, setNewPriority] = useState<ServiceOrderPriority>('medium');
  const [newSectorId, setNewSectorId] = useState<string>(user?.sector_id || catalog.sectors[0]?.id || '');
  const [newLineOrLocation, setNewLineOrLocation] = useState('');
  const [createSubmitting, setCreateSubmitting] = useState(false);

  // Atendimento / Notas
  const [newNoteContent, setNewNoteContent] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [solutionText, setSolutionText] = useState('');
  const [statusUpdating, setStatusUpdating] = useState(false);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [resOrders, resSummary] = await Promise.all([
        api.getServiceOrders(),
        api.getServiceOrdersSummary(),
      ]);
      setOrders(resOrders.orders);
      setSummary(resSummary.summary);
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (statusFilter !== 'all' && o.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && o.priority !== priorityFilter) return false;
      if (categoryFilter !== 'all' && o.category !== categoryFilter) return false;
      if (sectorFilter !== 'all' && o.sector_id !== sectorFilter) return false;
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchNum = o.ticket_number.toLowerCase().includes(q);
        const matchTitle = o.title.toLowerCase().includes(q);
        const matchDesc = o.description.toLowerCase().includes(q);
        const matchReq = (o.requester_name || '').toLowerCase().includes(q);
        if (!matchNum && !matchTitle && !matchDesc && !matchReq) return false;
      }
      return true;
    });
  }, [orders, statusFilter, priorityFilter, categoryFilter, sectorFilter, searchTerm]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newDescription.trim() || !newSectorId) {
      alert('Preencha título, descrição e setor para abrir o chamado.');
      return;
    }

    setCreateSubmitting(true);
    try {
      await api.createServiceOrder({
        title: newTitle.trim(),
        description: newDescription.trim(),
        category: newCategory,
        priority: newPriority,
        sector_id: newSectorId,
        line_or_location: newLineOrLocation.trim() || undefined,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setNewLineOrLocation('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar chamado.');
    } finally {
      setCreateSubmitting(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !newNoteContent.trim()) return;

    setNoteSubmitting(true);
    try {
      const res = await api.addServiceOrderNote(selectedOrder.id, newNoteContent.trim());
      setSelectedOrder((prev) => (prev ? { ...prev, notes: res.notes } : null));
      setNewNoteContent('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao adicionar apontamento.');
    } finally {
      setNoteSubmitting(false);
    }
  };

  const handleUpdateStatus = async (newStatus: ServiceOrderStatus, solution?: string) => {
    if (!selectedOrder) return;
    setStatusUpdating(true);
    try {
      const res = await api.updateServiceOrder(selectedOrder.id, {
        status: newStatus,
        solution: solution || selectedOrder.solution || undefined,
        assigned_to_id: selectedOrder.assigned_to_id || user?.id,
      });
      setSelectedOrder(res.order);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar status.');
    } finally {
      setStatusUpdating(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!selectedOrder || !user) return;
    setStatusUpdating(true);
    try {
      const res = await api.updateServiceOrder(selectedOrder.id, {
        assigned_to_id: user.id,
        status: selectedOrder.status === 'open' ? 'in_progress' : selectedOrder.status,
      });
      setSelectedOrder(res.order);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao assumir chamado.');
    } finally {
      setStatusUpdating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Emergency Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center text-teal-800">
                <LifeBuoy className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-display font-bold text-slate-900">
                  Central de Chamados e Ordens de Serviço (TI)
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  Canal corporativo unificado para solicitações técnicas, suporte industrial, redes e sistemas da Forteflex.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowTISettingsModal(true)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Plantão &amp; Contatos TI</span>
            </button>

            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm inline-flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Abrir Nova OS</span>
            </button>
          </div>
        </div>

        {/* Emergency Notice Pill */}
        <div className="mt-4 pt-3.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-600">
            <Phone className="w-4 h-4 text-teal-700 shrink-0" />
            <span>
              <strong>Suporte de TI &amp; Automação:</strong> Ramal <span className="font-mono font-semibold">204 / 205</span> | WhatsApp de Emergência Industrial: <span className="font-semibold text-slate-900">(11) 98765-4321</span>
            </span>
          </div>
          <div className="text-[11px] text-slate-500">
            Linha parada ou falha de apontamento? Selecione prioridade <strong>Crítica</strong> para atendimento imediato.
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-slate-500">Total de Chamados</div>
            <div className="text-2xl font-bold font-display text-slate-900 mt-1">{summary.total}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Histórico da base</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-sky-700 font-medium">Abertos</div>
            <div className="text-2xl font-bold font-display text-sky-800 mt-1">{summary.open}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Aguardando início</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-purple-700 font-medium">Em Atendimento</div>
            <div className="text-2xl font-bold font-display text-purple-800 mt-1">{summary.in_progress}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Técnico alocado</div>
          </div>

          <div className={`border rounded-xl p-4 shadow-sm transition-colors ${
            summary.critical > 0 ? 'bg-red-50/60 border-red-300' : 'bg-white border-slate-200'
          }`}>
            <div className={`text-xs font-semibold ${summary.critical > 0 ? 'text-red-700' : 'text-slate-500'}`}>
              Críticos / Linha Parada
            </div>
            <div className={`text-2xl font-bold font-display mt-1 ${summary.critical > 0 ? 'text-red-700' : 'text-slate-900'}`}>
              {summary.critical}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Prioridade máxima</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-emerald-700 font-medium">Concluídos no Mês</div>
            <div className="text-2xl font-bold font-display text-emerald-800 mt-1">{summary.completed_this_month}</div>
            <div className="text-[11px] text-slate-400 mt-0.5">Demandas entregues</div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <div className="text-xs text-slate-500">Tempo Médio (SLA)</div>
            <div className="text-2xl font-bold font-display text-slate-900 mt-1">
              {summary.avg_resolution_hours} <span className="text-xs font-normal text-slate-500">horas</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">Da abertura ao fim</div>
          </div>
        </div>
      )}

      {/* Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por protocolo (ex.: OS-2026-0001), assunto, solicitante ou detalhe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
            >
              <option value="all">Todos os Status</option>
              <option value="open">Abertos</option>
              <option value="in_progress">Em Atendimento</option>
              <option value="waiting">Aguardando Peça</option>
              <option value="completed">Concluídos</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
            >
              <option value="all">Todas as Prioridades</option>
              <option value="critical">Crítica (Linha Parada)</option>
              <option value="high">Alta</option>
              <option value="medium">Média</option>
              <option value="low">Baixa</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
            >
              <option value="all">Todas as Categorias</option>
              {Object.entries(CATEGORY_MAP).map(([cat, info]) => (
                <option key={cat} value={cat}>
                  {info.icon} {info.label}
                </option>
              ))}
            </select>

            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 cursor-pointer"
            >
              <option value="all">Todos os Setores</option>
              {catalog.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadData}
              title="Atualizar lista"
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-200 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Orders List / Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
        {loading && orders.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-sm">Carregando ordens de serviço...</div>
        ) : filteredOrders.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <LifeBuoy className="w-6 h-6" />
            </div>
            <div className="text-sm font-semibold text-slate-700">Nenhuma ordem de serviço encontrada</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {searchTerm || statusFilter !== 'all'
                ? 'Nenhum chamado atende aos filtros selecionados. Tente limpar os filtros para ver mais resultados.'
                : 'Não há solicitações ativas no momento. Clique no botão acima para registrar uma nova OS para o time de TI.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4">Protocolo / Prioridade</th>
                  <th className="py-3 px-4">Demanda &amp; Localização</th>
                  <th className="py-3 px-4">Setor</th>
                  <th className="py-3 px-4">Solicitante</th>
                  <th className="py-3 px-4">Técnico TI</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredOrders.map((ord) => {
                  const pri = PRIORITY_BADGES[ord.priority] || PRIORITY_BADGES.medium;
                  const sta = STATUS_BADGES[ord.status] || STATUS_BADGES.open;
                  const cat = CATEGORY_MAP[ord.category] || CATEGORY_MAP.other;

                  return (
                    <tr
                      key={ord.id}
                      onClick={() => setSelectedOrder(ord)}
                      className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-mono font-bold text-slate-900">{ord.ticket_number}</div>
                        <div className="mt-1">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${pri.className}`}
                          >
                            {pri.label}
                          </span>
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs sm:max-w-md">
                        <div className="font-semibold text-slate-900 line-clamp-1">{ord.title}</div>
                        <div className="text-slate-500 text-[11px] line-clamp-1 mt-0.5">{ord.description}</div>
                        {ord.line_or_location && (
                          <div className="text-[10px] text-teal-700 font-medium mt-1">
                            Local: {ord.line_or_location}
                          </div>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-800">{ord.sector_name || 'Geral'}</div>
                        <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                          <span>{cat.icon}</span>
                          <span>{cat.label}</span>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="font-medium text-slate-900">{ord.requester_name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {new Date(ord.created_at).toLocaleDateString('pt-BR')} às{' '}
                          {new Date(ord.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        {ord.assigned_to_name ? (
                          <div className="inline-flex items-center gap-1.5 font-medium text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                            <User className="w-3 h-3 text-teal-700" />
                            <span>{ord.assigned_to_name}</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic text-[11px]">Não atribuído</span>
                        )}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium border ${sta.className}`}
                        >
                          {sta.label}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedOrder(ord);
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-teal-800 bg-teal-50 hover:bg-teal-100 rounded-lg border border-teal-200 transition-colors cursor-pointer"
                        >
                          Atender / Ver
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Nova Ordem de Serviço */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
                  <LifeBuoy className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Abertura de Chamado / Ordem de Serviço</h3>
                  <p className="text-[11px] text-slate-500">Demandas direcionadas diretamente à Equipe de TI da Forteflex.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título / Assunto da Demanda *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex.: Falha na balança de expedição ou leitor de código de barras parou"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Categoria *</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as ServiceOrderCategory)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {Object.entries(CATEGORY_MAP).map(([cat, info]) => (
                      <option key={cat} value={cat}>
                        {info.icon} {info.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prioridade / Urgência *</label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as ServiceOrderPriority)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="low">Baixa (Dúvidas ou melhorias)</option>
                    <option value="medium">Média (Impacto parcial)</option>
                    <option value="high">Alta (Impacto produtivo significativo)</option>
                    <option value="critical">Crítica (Linha Parada / Emergência)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Setor Solicitante *</label>
                  <select
                    value={newSectorId}
                    onChange={(e) => setNewSectorId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {catalog.sectors.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Linha / Máquina / Local (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ex.: Extrusora 01, Mesa CS-02"
                    value={newLineOrLocation}
                    onChange={(e) => setNewLineOrLocation(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Descrição Detalhada do Problema *
                </label>
                <textarea
                  rows={4}
                  required
                  placeholder="Descreva o que está ocorrendo, se há mensagens de erro na tela e se a máquina está impedida de operar..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full p-3 text-xs border border-slate-300 rounded-lg"
                />
              </div>

              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  O chamado será registrado com protocolo único e notificado à equipe técnica de TI para priorização imediata.
                </span>
              </div>

              <div className="flex justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createSubmitting}
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg shadow-sm"
                >
                  {createSubmitting ? 'Registrando...' : 'Registrar Chamado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalhes e Atendimento Técnico da OS */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="px-2.5 py-1 rounded bg-slate-900 text-white font-mono font-bold text-xs">
                  {selectedOrder.ticket_number}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{selectedOrder.title}</h3>
                  <div className="text-[11px] text-slate-500">
                    Aberto por <strong>{selectedOrder.requester_name}</strong> em{' '}
                    {new Date(selectedOrder.created_at).toLocaleString('pt-BR')}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Badges Info Bar */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Status Atual</div>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded-full font-semibold border ${
                      STATUS_BADGES[selectedOrder.status]?.className || ''
                    }`}
                  >
                    {STATUS_BADGES[selectedOrder.status]?.label}
                  </span>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Prioridade</div>
                  <span
                    className={`inline-block mt-1 px-2 py-0.5 rounded-full font-semibold border ${
                      PRIORITY_BADGES[selectedOrder.priority]?.className || ''
                    }`}
                  >
                    {PRIORITY_BADGES[selectedOrder.priority]?.label}
                  </span>
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Setor / Local</div>
                  <div className="font-semibold text-slate-900 mt-1">{selectedOrder.sector_name}</div>
                  {selectedOrder.line_or_location && (
                    <div className="text-[10px] text-slate-500">{selectedOrder.line_or_location}</div>
                  )}
                </div>

                <div>
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Técnico Responsável</div>
                  <div className="font-semibold text-slate-900 mt-1">
                    {selectedOrder.assigned_to_name || 'Nenhum alocado'}
                  </div>
                </div>
              </div>

              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">
                  Descrição da Solicitação
                </h4>
                <div className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl text-xs text-slate-700 leading-relaxed whitespace-pre-line">
                  {selectedOrder.description}
                </div>
              </div>

              {/* Solution if completed */}
              {selectedOrder.status === 'completed' && selectedOrder.solution && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Parecer Técnico de Encerramento</span>
                  </div>
                  <p className="text-xs text-emerald-800 leading-relaxed whitespace-pre-line">
                    {selectedOrder.solution}
                  </p>
                  {selectedOrder.closed_at && (
                    <div className="text-[10px] text-emerald-600 pt-1">
                      Concluído em: {new Date(selectedOrder.closed_at).toLocaleString('pt-BR')}
                    </div>
                  )}
                </div>
              )}

              {/* Actions for TI / Admins */}
              {isAdminOrTI && selectedOrder.status !== 'completed' && selectedOrder.status !== 'cancelled' && (
                <div className="p-4 bg-teal-50/50 border border-teal-200 rounded-xl space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-950 uppercase tracking-wide">
                      Ações do Técnico de TI
                    </span>
                    {!selectedOrder.assigned_to_id && (
                      <button
                        type="button"
                        onClick={handleAssignToMe}
                        disabled={statusUpdating}
                        className="px-3 py-1 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg cursor-pointer"
                      >
                        Assumir este Chamado
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {selectedOrder.status === 'open' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('in_progress')}
                        disabled={statusUpdating}
                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer"
                      >
                        Iniciar Atendimento
                      </button>
                    )}

                    {selectedOrder.status === 'in_progress' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('waiting')}
                        disabled={statusUpdating}
                        className="px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg cursor-pointer"
                      >
                        Marcar Aguardando Peça / Terceiro
                      </button>
                    )}

                    {selectedOrder.status === 'waiting' && (
                      <button
                        type="button"
                        onClick={() => handleUpdateStatus('in_progress')}
                        disabled={statusUpdating}
                        className="px-3 py-1.5 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg cursor-pointer"
                      >
                        Retomar Atendimento
                      </button>
                    )}
                  </div>

                  {/* Completion box */}
                  <div className="pt-2 border-t border-teal-200/60 space-y-2">
                    <label className="block text-xs font-semibold text-teal-950">
                      Solução Técnica / Parecer para Conclusão
                    </label>
                    <textarea
                      rows={2}
                      placeholder="Descreva o procedimento executado para solucionar o problema e fechar a OS..."
                      value={solutionText}
                      onChange={(e) => setSolutionText(e.target.value)}
                      className="w-full p-2.5 text-xs bg-white border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      disabled={statusUpdating || !solutionText.trim()}
                      onClick={() => handleUpdateStatus('completed', solutionText.trim())}
                      className="px-4 py-2 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg inline-flex items-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Encerrar e Concluir OS</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Technical Notes / Histórico de Interações */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-teal-700" />
                  <span>Histórico de Apontamentos Técnicos ({selectedOrder.notes.length})</span>
                </h4>

                <div className="space-y-2.5">
                  {selectedOrder.notes.length === 0 ? (
                    <div className="text-xs text-slate-400 italic p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      Nenhum apontamento adicionado ainda. Use o campo abaixo para registrar atualizações técnicas.
                    </div>
                  ) : (
                    selectedOrder.notes.map((note) => (
                      <div key={note.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-slate-900">{note.author_name}</span>
                          <span className="text-slate-400">
                            {new Date(note.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-line">{note.content}</p>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Note Input */}
                {selectedOrder.status !== 'completed' && (
                  <form onSubmit={handleAddNote} className="flex gap-2 pt-1">
                    <input
                      type="text"
                      placeholder="Adicionar atualização técnica ou mensagem de acompanhamento..."
                      value={newNoteContent}
                      onChange={(e) => setNewNoteContent(e.target.value)}
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-1 focus:ring-teal-600 focus:border-teal-600"
                    />
                    <button
                      type="submit"
                      disabled={noteSubmitting || !newNoteContent.trim()}
                      className="px-3.5 py-2 text-xs font-semibold bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 text-white rounded-lg inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Enviar</span>
                    </button>
                  </form>
                )}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Fechar Visualização
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Configurações e Contatos da Área de TI */}
      {showTISettingsModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden my-8 animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Shield className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Configurações &amp; Diretrizes da Área de TI</h3>
                  <p className="text-[11px] text-slate-500">Parâmetros de atendimento, SLAs e contatos de emergência.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowTISettingsModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 text-xs">
              {/* Canais Oficiais */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Canais Oficiais de Suporte Técnico
                </h4>
                <div className="space-y-2 text-slate-700">
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span>Ramal Interno de TI:</span>
                    <strong className="font-mono text-slate-900">Ramal 204 ou 205</strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span>E-mail Corporativo:</span>
                    <strong className="font-mono text-slate-900">ti@forteflex.com.br</strong>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                    <span>Plantão Emergencial Fábrica:</span>
                    <strong className="font-mono text-teal-700">(11) 98765-4321 (WhatsApp)</strong>
                  </div>
                </div>
              </div>

              {/* SLA de Atendimento */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
                  Prazos de Atendimento (SLA Padrão)
                </h4>
                <div className="grid grid-cols-2 gap-2 text-slate-700">
                  <div className="p-2.5 bg-red-50 border border-red-200 rounded-lg">
                    <div className="font-bold text-red-800">Crítica (Linha Parada)</div>
                    <div className="text-[11px] text-red-700 mt-0.5">Até 30 minutos</div>
                  </div>
                  <div className="p-2.5 bg-orange-50 border border-orange-200 rounded-lg">
                    <div className="font-bold text-orange-800">Alta Prioridade</div>
                    <div className="text-[11px] text-orange-700 mt-0.5">Até 4 horas úteis</div>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="font-bold text-amber-800">Média Prioridade</div>
                    <div className="text-[11px] text-amber-700 mt-0.5">Até 24 horas</div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                    <div className="font-bold text-slate-800">Baixa Prioridade</div>
                    <div className="text-[11px] text-slate-700 mt-0.5">Até 48 horas</div>
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-teal-50 border border-teal-200 rounded-lg text-teal-900 text-[11px] space-y-1">
                <div className="font-bold">Acesso do Usuário de TI:</div>
                <div>
                  O usuário <strong>ti@forteflex.com.br</strong> tem autonomia completa para triar, alocar técnicos, registrar soluções e emitir relatórios de manutenção.
                </div>
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowTISettingsModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-teal-700 hover:bg-teal-800 rounded-lg"
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
