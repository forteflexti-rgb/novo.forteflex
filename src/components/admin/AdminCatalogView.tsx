import React, { useState } from 'react';
import { Plus, Power, AlertCircle, CheckCircle2, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import type { CatalogData } from '../../types';

interface AdminCatalogViewProps {
  catalog: CatalogData;
  onCatalogUpdated: () => void;
}

type CatalogTab = 'sectors' | 'lines' | 'products' | 'shifts' | 'goals';

export function AdminCatalogView({ catalog, onCatalogUpdated }: AdminCatalogViewProps) {
  const [tab, setTab] = useState<CatalogTab>('sectors');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sector form
  const [secCode, setSecCode] = useState('');
  const [secName, setSecName] = useState('');
  const [secDesc, setSecDesc] = useState('');

  // Line form
  const [lineSectorId, setLineSectorId] = useState(catalog.sectors[0]?.id || '');
  const [lineCode, setLineCode] = useState('');
  const [lineName, setLineName] = useState('');
  const [lineCapacity, setLineCapacity] = useState('200');

  // Product form
  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodUom, setProdUom] = useState('kg');

  // Shift form
  const [shiftCode, setShiftCode] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('06:00');
  const [shiftEnd, setShiftEnd] = useState('14:00');

  // Goal form
  const [goalSectorId, setGoalSectorId] = useState(catalog.sectors[0]?.id || '');
  const [goalPeriod, setGoalPeriod] = useState<'daily' | 'monthly'>('daily');
  const [goalTarget, setGoalTarget] = useState('1500');
  const [goalMaxLoss, setGoalMaxLoss] = useState('3.0');

  const clearFeedback = () => {
    setError(null);
    setFeedback(null);
  };

  const handleAddSector = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    try {
      await api.createSector({ code: secCode, name: secName, description: secDesc });
      setSecCode('');
      setSecName('');
      setSecDesc('');
      setFeedback('Setor cadastrado.');
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    try {
      await api.createLine({
        sector_id: lineSectorId,
        code: lineCode,
        name: lineName,
        capacity_per_hour: Number(lineCapacity),
      });
      setLineCode('');
      setLineName('');
      setFeedback('Linha de produção cadastrada.');
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    try {
      await api.createProduct({
        sku: prodSku,
        name: prodName,
        category: prodCategory,
        unit_of_measure: prodUom,
        target_cycle_minutes: 0.4,
      });
      setProdSku('');
      setProdName('');
      setProdCategory('');
      setFeedback('Produto cadastrado.');
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    try {
      await api.createShift({
        code: shiftCode,
        name: shiftName,
        start_time: shiftStart,
        end_time: shiftEnd,
      });
      setShiftCode('');
      setShiftName('');
      setFeedback('Turno cadastrado.');
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    clearFeedback();
    try {
      await api.createGoal({
        sector_id: goalSectorId,
        period_type: goalPeriod,
        target_quantity: Number(goalTarget),
        max_loss_percent: Number(goalMaxLoss),
      });
      setFeedback('Meta de produção cadastrada.');
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const tabs: { id: CatalogTab; label: string }[] = [
    { id: 'sectors', label: 'Setores' },
    { id: 'lines', label: 'Linhas de Produção' },
    { id: 'products', label: 'Produtos' },
    { id: 'shifts', label: 'Turnos' },
    { id: 'goals', label: 'Metas de Produção' },
  ];

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-display font-bold text-[#0f2544]">Cadastros Industriais</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Gerencie setores, linhas, produtos, turnos e metas utilizados nos apontamentos e indicadores.
          </p>
        </div>

        <div className="flex flex-wrap gap-1 p-1 bg-slate-100 rounded-lg">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                clearFeedback();
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                tab === t.id ? 'bg-white text-[#0f2544] shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
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

      {/* SETORES */}
      {tab === 'sectors' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleAddSector} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo setor</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código *</label>
              <input
                type="text"
                required
                value={secCode}
                onChange={(e) => setSecCode(e.target.value)}
                placeholder="ex.: INJ"
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome do setor *</label>
              <input
                type="text"
                required
                value={secName}
                onChange={(e) => setSecName(e.target.value)}
                placeholder="ex.: Injeção Plástica"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Descrição</label>
              <input
                type="text"
                value={secDesc}
                onChange={(e) => setSecDesc(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar setor</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Nome</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.sectors.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">{s.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{s.name}</div>
                      {s.description && <div className="text-xs text-slate-500">{s.description}</div>}
                    </td>
                    <td className={`px-4 py-3 text-xs font-semibold ${s.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {s.active ? 'Ativo' : 'Inativo'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateSector(s.id, { active: !s.active });
                          onCatalogUpdated();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{s.active ? 'Desativar' : 'Ativar'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* LINHAS DE PRODUÇÃO */}
      {tab === 'lines' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleAddLine} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova linha de produção</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Setor *</label>
              <select
                value={lineSectorId}
                onChange={(e) => setLineSectorId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código *</label>
              <input
                type="text"
                required
                value={lineCode}
                onChange={(e) => setLineCode(e.target.value)}
                placeholder="ex.: EXT-03"
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome da linha *</label>
              <input
                type="text"
                required
                value={lineName}
                onChange={(e) => setLineName(e.target.value)}
                placeholder="ex.: Extrusora Multicamada 03"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Capacidade / hora</label>
              <input
                type="number"
                value={lineCapacity}
                onChange={(e) => setLineCapacity(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar linha</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Linha / Setor</th>
                  <th className="px-4 py-3 text-right">Cap./h</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.lines.map((l) => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">{l.code}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{l.name}</div>
                      <div className="text-xs text-slate-500">{l.sector_name}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">{l.capacity_per_hour}</td>
                    <td className={`px-4 py-3 text-xs font-semibold ${l.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {l.active ? 'Ativa' : 'Inativa'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateLine(l.id, { active: !l.active });
                          onCatalogUpdated();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{l.active ? 'Desativar' : 'Ativar'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRODUTOS */}
      {tab === 'products' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleAddProduct} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo produto</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código SKU *</label>
              <input
                type="text"
                required
                value={prodSku}
                onChange={(e) => setProdSku(e.target.value)}
                placeholder="ex.: FF-PEAD-030"
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Descrição do produto *</label>
              <input
                type="text"
                required
                value={prodName}
                onChange={(e) => setProdName(e.target.value)}
                placeholder="ex.: Filme Técnico PEAD 30µm"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Categoria *</label>
              <input
                type="text"
                required
                value={prodCategory}
                onChange={(e) => setProdCategory(e.target.value)}
                placeholder="ex.: Filmes Técnicos"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unidade padrão</label>
              <select
                value={prodUom}
                onChange={(e) => setProdUom(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="kg">kg</option>
                <option value="un">un</option>
                <option value="m">m</option>
                <option value="bob">bob</option>
              </select>
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar produto</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Produto / Categoria</th>
                  <th className="px-4 py-3">Unidade</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.products.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">{p.sku}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="text-xs text-slate-500">{p.category}</div>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-700">{p.unit_of_measure}</td>
                    <td className={`px-4 py-3 text-xs font-semibold ${p.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {p.active ? 'Ativo' : 'Inativo'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateProduct(p.id, { active: !p.active });
                          onCatalogUpdated();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{p.active ? 'Desativar' : 'Ativar'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TURNOS */}
      {tab === 'shifts' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleAddShift} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo turno</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Código *</label>
              <input
                type="text"
                required
                value={shiftCode}
                onChange={(e) => setShiftCode(e.target.value)}
                placeholder="ex.: T4"
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Nome do turno *</label>
              <input
                type="text"
                required
                value={shiftName}
                onChange={(e) => setShiftName(e.target.value)}
                placeholder="ex.: Turno Especial Fim de Semana"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Início *</label>
                <input
                  type="time"
                  required
                  value={shiftStart}
                  onChange={(e) => setShiftStart(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Término *</label>
                <input
                  type="time"
                  required
                  value={shiftEnd}
                  onChange={(e) => setShiftEnd(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar turno</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Turno</th>
                  <th className="px-4 py-3">Horário</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.shifts.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono font-medium text-slate-900">{s.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{s.name}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-slate-600">
                      {s.start_time} – {s.end_time}
                    </td>
                    <td className={`px-4 py-3 text-xs font-semibold ${s.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {s.active ? 'Ativo' : 'Inativo'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.updateShift(s.id, { active: !s.active });
                          onCatalogUpdated();
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{s.active ? 'Desativar' : 'Ativar'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* METAS DE PRODUÇÃO */}
      {tab === 'goals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form onSubmit={handleAddGoal} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova meta de produção</h3>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Setor *</label>
              <select
                value={goalSectorId}
                onChange={(e) => setGoalSectorId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Periodicidade *</label>
              <select
                value={goalPeriod}
                onChange={(e) => setGoalPeriod(e.target.value as 'daily' | 'monthly')}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="daily">Meta diária</option>
                <option value="monthly">Meta mensal</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Quantidade meta *</label>
              <input
                type="number"
                required
                min="1"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Limite máximo de perda (%)</label>
              <input
                type="number"
                step="0.1"
                value={goalMaxLoss}
                onChange={(e) => setGoalMaxLoss(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Salvar meta</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Setor</th>
                  <th className="px-4 py-3">Periodicidade</th>
                  <th className="px-4 py-3 text-right">Meta Qtd.</th>
                  <th className="px-4 py-3 text-right">Perda Máx.</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.goals.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{g.sector_name}</div>
                      {g.line_name && <div className="text-xs text-slate-500">{g.line_name}</div>}
                    </td>
                    <td className="px-4 py-3 text-slate-700">{g.period_type === 'daily' ? 'Diária' : 'Mensal'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#0f2544]">
                      {g.target_quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-700">
                      {g.max_loss_percent}%
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={async () => {
                          await api.deleteGoal(g.id);
                          onCatalogUpdated();
                        }}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
                        title="Remover meta"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
