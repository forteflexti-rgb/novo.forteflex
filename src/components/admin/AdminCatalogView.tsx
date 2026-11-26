import React, { useState } from 'react';
import { Plus, Power, AlertCircle, CheckCircle2, Trash2, Info } from 'lucide-react';
import { api } from '../../lib/api';
import type { CatalogData, MachineStatus } from '../../types';

interface AdminCatalogViewProps {
  catalog: CatalogData;
  onCatalogUpdated: () => void;
}

type CatalogTab =
  | 'sectors'
  | 'lines'
  | 'machines'
  | 'stages'
  | 'products'
  | 'cycles'
  | 'orders'
  | 'shifts'
  | 'calendars'
  | 'reasons'
  | 'irog_goals'
  | 'goals';

export function AdminCatalogView({ catalog, onCatalogUpdated }: AdminCatalogViewProps) {
  const [tab, setTab] = useState<CatalogTab>('sectors');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Sector
  const [secCode, setSecCode] = useState('');
  const [secName, setSecName] = useState('');
  const [secDesc, setSecDesc] = useState('');

  // Line
  const [lineSectorId, setLineSectorId] = useState(catalog.sectors[0]?.id || '');
  const [lineCode, setLineCode] = useState('');
  const [lineName, setLineName] = useState('');
  const [lineCapacity, setLineCapacity] = useState('200');

  // Machine
  const [macSectorId, setMacSectorId] = useState(catalog.sectors[0]?.id || '');
  const [macLineId, setMacLineId] = useState('');
  const [macCode, setMacCode] = useState('');
  const [macName, setMacName] = useState('');
  const [macType, setMacType] = useState('Extrusora');
  const [macCap, setMacCap] = useState('220');
  const [macUnit, setMacUnit] = useState('kg');

  // Stage
  const [stgSectorId, setStgSectorId] = useState(catalog.sectors[0]?.id || '');
  const [stgCode, setStgCode] = useState('');
  const [stgName, setStgName] = useState('');

  // Product
  const [prodSku, setProdSku] = useState('');
  const [prodName, setProdName] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodUom, setProdUom] = useState('kg');

  // Cycle Standard
  const [cycProductId, setCycProductId] = useState(catalog.products[0]?.id || '');
  const [cycMachineId, setCycMachineId] = useState(catalog.machines[0]?.id || '');
  const [cycStageId, setCycStageId] = useState('');
  const [cycCapPerHour, setCycCapPerHour] = useState('220');

  // Order
  const [ordNum, setOrdNum] = useState('');
  const [ordProdId, setOrdProdId] = useState(catalog.products[0]?.id || '');
  const [ordSecId, setOrdSecId] = useState(catalog.sectors[0]?.id || '');
  const [ordLineId, setOrdLineId] = useState('');
  const [ordMacId, setOrdMacId] = useState('');
  const [ordQty, setOrdQty] = useState('2000');

  // Shift
  const [shiftCode, setShiftCode] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('06:00');
  const [shiftEnd, setShiftEnd] = useState('14:00');
  const [shiftBreak, setShiftBreak] = useState('30');

  // Calendar
  const [calDate, setCalDate] = useState(new Date().toISOString().slice(0, 10));
  const [calType, setCalType] = useState<'workday' | 'holiday' | 'planned_stop'>('holiday');
  const [calMinutes, setCalMinutes] = useState('0');
  const [calDesc, setCalDesc] = useState('');

  // Reasons
  const [dtCode, setDtCode] = useState('');
  const [dtName, setDtName] = useState('');
  const [dtCategory, setDtCategory] = useState('Mecânica');
  const [dtIsPlanned, setDtIsPlanned] = useState(false);

  const [lrCode, setLrCode] = useState('');
  const [lrName, setLrName] = useState('');
  const [lrCategory, setLrCategory] = useState('Refugo');

  // IROG Goals
  const [igScope, setIgScope] = useState<'factory' | 'sector' | 'line' | 'machine'>('sector');
  const [igSectorId, setIgSectorId] = useState(catalog.sectors[0]?.id || '');
  const [igLineId, setIgLineId] = useState(catalog.lines[0]?.id || '');
  const [igMachineId, setIgMachineId] = useState(catalog.machines[0]?.id || '');
  const [igIrog, setIgIrog] = useState('78');
  const [igDisp, setIgDisp] = useState('90');
  const [igDesemp, setIgDesemp] = useState('90');
  const [igQual, setIgQual] = useState('97');

  // Production Goals
  const [goalSectorId, setGoalSectorId] = useState(catalog.sectors[0]?.id || '');
  const [goalPeriod, setGoalPeriod] = useState<'daily' | 'monthly'>('daily');
  const [goalTarget, setGoalTarget] = useState('1500');
  const [goalMaxLoss, setGoalMaxLoss] = useState('3.0');

  const clearFeedback = () => {
    setError(null);
    setFeedback(null);
  };

  const tabs: { id: CatalogTab; label: string }[] = [
    { id: 'sectors', label: 'Setores' },
    { id: 'lines', label: 'Linhas' },
    { id: 'machines', label: 'Máquinas' },
    { id: 'stages', label: 'Operações' },
    { id: 'products', label: 'Produtos' },
    { id: 'cycles', label: 'Ciclos Padrão' },
    { id: 'orders', label: 'Ordens (OP)' },
    { id: 'shifts', label: 'Turnos' },
    { id: 'calendars', label: 'Calendário' },
    { id: 'reasons', label: 'Motivos Parada/Perda' },
    { id: 'irog_goals', label: 'Metas IROG' },
    { id: 'goals', label: 'Metas Volume' },
  ];

  const runAction = async (fn: () => Promise<any>, successMsg: string) => {
    clearFeedback();
    try {
      await fn();
      setFeedback(successMsg);
      onCatalogUpdated();
    } catch (err: any) {
      setError(err.message || 'Erro ao executar operação.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-base font-display font-bold text-[#0f2544]">
            Cadastros Industriais &amp; Parâmetros IROG ForteFlex
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Hierarquia completa de Fábrica, Setores, Linhas, Máquinas, Operações, Ciclos Padrão, Turnos, Calendário e Motivos.
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createSector({ code: secCode, name: secName, description: secDesc });
                setSecCode('');
                setSecName('');
                setSecDesc('');
              }, 'Setor cadastrado.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo setor</h3>
            <input
              type="text"
              required
              value={secCode}
              onChange={(e) => setSecCode(e.target.value)}
              placeholder="Código (ex.: INJ)"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={secName}
              onChange={(e) => setSecName(e.target.value)}
              placeholder="Nome do setor"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={secDesc}
              onChange={(e) => setSecDesc(e.target.value)}
              placeholder="Descrição"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
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
                        onClick={() => runAction(() => api.updateSector(s.id, { active: !s.active }), 'Setor atualizado.')}
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

      {/* LINHAS */}
      {tab === 'lines' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createLine({
                  sector_id: lineSectorId,
                  code: lineCode,
                  name: lineName,
                  capacity_per_hour: Number(lineCapacity),
                });
                setLineCode('');
                setLineName('');
              }, 'Linha cadastrada.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova linha de produção</h3>
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
            <input
              type="text"
              required
              value={lineCode}
              onChange={(e) => setLineCode(e.target.value)}
              placeholder="Código (ex.: EXT-03)"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={lineName}
              onChange={(e) => setLineName(e.target.value)}
              placeholder="Nome da linha"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="number"
              value={lineCapacity}
              onChange={(e) => setLineCapacity(e.target.value)}
              placeholder="Capacidade/h"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
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
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{l.capacity_per_hour}</td>
                    <td className={`px-4 py-3 text-xs font-semibold ${l.active ? 'text-emerald-700' : 'text-slate-400'}`}>
                      {l.active ? 'Ativa' : 'Inativa'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.updateLine(l.id, { active: !l.active }), 'Linha atualizada.')}
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

      {/* MÁQUINAS / RECURSOS */}
      {tab === 'machines' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createMachine({
                  sector_id: macSectorId,
                  line_id: macLineId || null,
                  code: macCode,
                  name: macName,
                  resource_type: macType,
                  theoretical_capacity_per_hour: macCap ? Number(macCap) : null,
                  capacity_unit: macUnit,
                });
                setMacCode('');
                setMacName('');
              }, 'Máquina/recurso cadastrado.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova máquina / recurso</h3>
            <select
              value={macSectorId}
              onChange={(e) => setMacSectorId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {catalog.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={macLineId}
              onChange={(e) => setMacLineId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Sem linha específica</option>
              {catalog.lines
                .filter((l) => l.sector_id === macSectorId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </option>
                ))}
            </select>
            <input
              type="text"
              required
              value={macCode}
              onChange={(e) => setMacCode(e.target.value)}
              placeholder="Código (ex.: M-EXT-03)"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={macName}
              onChange={(e) => setMacName(e.target.value)}
              placeholder="Nome do equipamento"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="text"
                value={macType}
                onChange={(e) => setMacType(e.target.value)}
                placeholder="Tipo (Extrusora...)"
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                value={macCap}
                onChange={(e) => setMacCap(e.target.value)}
                placeholder="Cap. teórica/h"
                className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <select
              value={macUnit}
              onChange={(e) => setMacUnit(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="kg">kg/h</option>
              <option value="un">un/h</option>
              <option value="m">m/h</option>
            </select>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar máquina</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código / Máquina</th>
                  <th className="px-4 py-3">Setor / Linha</th>
                  <th className="px-4 py-3 text-right">Cap. Nominal</th>
                  <th className="px-4 py-3">Situação</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.machines.map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3">
                      <div className="font-mono font-semibold text-[#0f2544]">{m.code}</div>
                      <div className="font-medium text-slate-900">{m.name}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      <div>{m.sector_name}</div>
                      <div>{m.line_name || '—'}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">
                      {m.theoretical_capacity_per_hour ? `${m.theoretical_capacity_per_hour} ${m.capacity_unit}/h` : 'Não informada'}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={m.status}
                        onChange={(e) =>
                          runAction(
                            () => api.updateMachine(m.id, { status: e.target.value as MachineStatus }),
                            `Status de ${m.code} atualizado.`
                          )
                        }
                        className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                      >
                        <option value="operating">Operando</option>
                        <option value="stopped">Parada</option>
                        <option value="maintenance">Manutenção</option>
                        <option value="idle">Ociosa</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.updateMachine(m.id, { active: !m.active }), 'Máquina atualizada.')}
                        className="text-slate-700 hover:underline cursor-pointer"
                      >
                        {m.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OPERAÇÕES / ETAPAS */}
      {tab === 'stages' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createStage({ sector_id: stgSectorId || null, code: stgCode, name: stgName });
                setStgCode('');
                setStgName('');
              }, 'Operação cadastrada.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova operação / etapa produtiva</h3>
            <select
              value={stgSectorId}
              onChange={(e) => setStgSectorId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Geral (todos setores)</option>
              {catalog.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              required
              value={stgCode}
              onChange={(e) => setStgCode(e.target.value)}
              placeholder="Código (ex.: OP-EXT)"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={stgName}
              onChange={(e) => setStgName(e.target.value)}
              placeholder="Nome da etapa"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Adicionar etapa</span>
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Operação / Etapa</th>
                  <th className="px-4 py-3">Setor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.stages.map((st) => (
                  <tr key={st.id}>
                    <td className="px-4 py-3 font-mono font-medium">{st.code}</td>
                    <td className="px-4 py-3 font-medium text-slate-900">{st.name}</td>
                    <td className="px-4 py-3 text-slate-600">{st.sector_name || 'Geral'}</td>
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
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
              }, 'Produto cadastrado.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo produto</h3>
            <input
              type="text"
              required
              value={prodSku}
              onChange={(e) => setProdSku(e.target.value)}
              placeholder="Código SKU"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={prodName}
              onChange={(e) => setProdName(e.target.value)}
              placeholder="Descrição do produto"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={prodCategory}
              onChange={(e) => setProdCategory(e.target.value)}
              placeholder="Categoria"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
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
                        onClick={() => runAction(() => api.updateProduct(p.id, { active: !p.active }), 'Produto atualizado.')}
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

      {/* CICLOS PADRÃO */}
      {tab === 'cycles' && (
        <div className="space-y-4">
          <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-center gap-2 text-xs text-blue-900">
            <Info className="w-4 h-4 text-blue-600 shrink-0" />
            <span>
              Alterações de tempo de ciclo ou capacidade teórica preservam o histórico em <span className="font-mono">parameter_history</span> sem alterar cálculos fechados anteriormente.
            </span>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(
                  () =>
                    api.createCycleStandard({
                      product_id: cycProductId,
                      machine_id: cycMachineId,
                      stage_id: cycStageId || null,
                      theoretical_capacity_per_hour: Number(cycCapPerHour),
                    }),
                  'Ciclo padrão salvo e versionado.'
                );
              }}
              className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
            >
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Definir ciclo padrão</h3>
              <select
                value={cycMachineId}
                onChange={(e) => setCycMachineId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
              <select
                value={cycProductId}
                onChange={(e) => setCycProductId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.sku} — {p.name}
                  </option>
                ))}
              </select>
              <select
                value={cycStageId}
                onChange={(e) => setCycStageId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Etapa padrão</option>
                {catalog.stages.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Capacidade teórica / hora *</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={cycCapPerHour}
                  onChange={(e) => setCycCapPerHour(e.target.value)}
                  className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <button
                type="submit"
                className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
              >
                Salvar ciclo padrão
              </button>
            </form>

            <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                  <tr>
                    <th className="px-4 py-3">Máquina</th>
                    <th className="px-4 py-3">Produto</th>
                    <th className="px-4 py-3 text-right">Cap. Teórica/h</th>
                    <th className="px-4 py-3 text-right">Ciclo (min/un)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {catalog.cycleStandards.map((cs) => (
                    <tr key={cs.id}>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {cs.machine_code} — {cs.machine_name}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {cs.product_name} ({cs.product_sku})
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold">
                        {cs.theoretical_capacity_per_hour}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                        {cs.cycle_time_minutes.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ORDENS DE PRODUÇÃO */}
      {tab === 'orders' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createOrder({
                  order_number: ordNum,
                  product_id: ordProdId,
                  sector_id: ordSecId,
                  line_id: ordLineId || null,
                  machine_id: ordMacId || null,
                  planned_quantity: Number(ordQty),
                });
                setOrdNum('');
              }, 'Ordem de Produção criada.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova Ordem de Produção (OP)</h3>
            <input
              type="text"
              required
              value={ordNum}
              onChange={(e) => setOrdNum(e.target.value)}
              placeholder="Número OP (ex.: OP-2026-0110)"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <select
              value={ordSecId}
              onChange={(e) => setOrdSecId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {catalog.sectors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <select
              value={ordLineId}
              onChange={(e) => setOrdLineId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Linha opcional</option>
              {catalog.lines
                .filter((l) => l.sector_id === ordSecId)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code}
                  </option>
                ))}
            </select>
            <select
              value={ordMacId}
              onChange={(e) => setOrdMacId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="">Máquina opcional</option>
              {catalog.machines
                .filter((m) => m.sector_id === ordSecId)
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code}
                  </option>
                ))}
            </select>
            <select
              value={ordProdId}
              onChange={(e) => setOrdProdId(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              {catalog.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input
              type="number"
              required
              min="1"
              value={ordQty}
              onChange={(e) => setOrdQty(e.target.value)}
              placeholder="Quantidade planejada"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Cadastrar OP
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">OP</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Setor / Máquina</th>
                  <th className="px-4 py-3 text-right">Planejado</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="px-4 py-3 font-mono font-semibold text-[#0f2544]">{o.order_number}</td>
                    <td className="px-4 py-3">{o.product_name}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {o.sector_name} {o.machine_name ? `· ${o.machine_name}` : ''}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-medium">{o.planned_quantity}</td>
                    <td className="px-4 py-3 uppercase font-mono text-slate-700">{o.status}</td>
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
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createShift({
                  code: shiftCode,
                  name: shiftName,
                  start_time: shiftStart,
                  end_time: shiftEnd,
                  break_minutes: Number(shiftBreak || 0),
                });
                setShiftCode('');
                setShiftName('');
              }, 'Turno cadastrado.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo turno</h3>
            <input
              type="text"
              required
              value={shiftCode}
              onChange={(e) => setShiftCode(e.target.value)}
              placeholder="Código (ex.: T4)"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              required
              value={shiftName}
              onChange={(e) => setShiftName(e.target.value)}
              placeholder="Nome do turno"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <div className="grid grid-cols-3 gap-2">
              <input
                type="time"
                required
                value={shiftStart}
                onChange={(e) => setShiftStart(e.target.value)}
                className="w-full min-h-[40px] px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="time"
                required
                value={shiftEnd}
                onChange={(e) => setShiftEnd(e.target.value)}
                className="w-full min-h-[40px] px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="number"
                value={shiftBreak}
                onChange={(e) => setShiftBreak(e.target.value)}
                placeholder="Int.(m)"
                className="w-full min-h-[40px] px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Adicionar turno
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Código</th>
                  <th className="px-4 py-3">Turno</th>
                  <th className="px-4 py-3">Horário / Intervalo</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.shifts.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-mono font-medium">{s.code}</td>
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {s.start_time}–{s.end_time} (intervalo: {s.break_minutes || 0} min)
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.updateShift(s.id, { active: !s.active }), 'Turno atualizado.')}
                        className="text-xs font-medium text-slate-700 hover:underline cursor-pointer"
                      >
                        {s.active ? 'Desativar' : 'Ativar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CALENDÁRIO INDUSTRIAL */}
      {tab === 'calendars' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(async () => {
                await api.createCalendar({
                  calendar_date: calDate,
                  day_type: calType,
                  available_minutes: Number(calMinutes),
                  description: calDesc,
                });
                setCalDesc('');
              }, 'Exceção de calendário registrada.');
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Exceção de Calendário</h3>
            <input
              type="date"
              required
              value={calDate}
              onChange={(e) => setCalDate(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <select
              value={calType}
              onChange={(e) => setCalType(e.target.value as any)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="holiday">Feriado / Sem expediente</option>
              <option value="planned_stop">Parada programada geral</option>
              <option value="workday">Dia útil especial / hora extra</option>
            </select>
            <input
              type="number"
              value={calMinutes}
              onChange={(e) => setCalMinutes(e.target.value)}
              placeholder="Minutos disponíveis"
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="text"
              value={calDesc}
              onChange={(e) => setCalDesc(e.target.value)}
              placeholder="Descrição (ex.: Manutenção subestação)"
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Adicionar ao calendário
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Data</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3 text-right">Min. Disponíveis</th>
                  <th className="px-4 py-3">Descrição</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.calendars.map((c) => (
                  <tr key={c.id}>
                    <td className="px-4 py-3 font-mono">{c.calendar_date}</td>
                    <td className="px-4 py-3 font-medium">{c.day_type}</td>
                    <td className="px-4 py-3 text-right font-mono">{c.available_minutes}</td>
                    <td className="px-4 py-3 text-slate-600">{c.description || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.deleteCalendar(c.id), 'Registro removido.')}
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MOTIVOS DE PARADA E PERDA */}
      {tab === 'reasons' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Motivos de Parada (IROG)</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await api.createDowntimeReason({
                    code: dtCode,
                    name: dtName,
                    category: dtCategory,
                    is_planned: dtIsPlanned,
                    counts_for_availability: !dtIsPlanned,
                  });
                  setDtCode('');
                  setDtName('');
                }, 'Motivo de parada cadastrado.');
              }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-2.5"
            >
              <input
                type="text"
                required
                value={dtCode}
                onChange={(e) => setDtCode(e.target.value)}
                placeholder="Código (ex.: PAR-10)"
                className="min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                value={dtName}
                onChange={(e) => setDtName(e.target.value)}
                placeholder="Nome do motivo"
                className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <select
                value={dtCategory}
                onChange={(e) => setDtCategory(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="Mecânica">Mecânica</option>
                <option value="Elétrica">Elétrica</option>
                <option value="Setup">Setup</option>
                <option value="Operacional">Operacional</option>
                <option value="Material">Material</option>
                <option value="Preventiva">Preventiva</option>
                <option value="Qualidade">Qualidade</option>
              </select>
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer px-2">
                <input
                  type="checkbox"
                  checked={dtIsPlanned}
                  onChange={(e) => setDtIsPlanned(e.target.checked)}
                />
                <span>Parada programada (exclui do IROG)</span>
              </label>
              <button
                type="submit"
                className="sm:col-span-2 min-h-[38px] bg-blue-600 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Cadastrar motivo de parada
              </button>
            </form>

            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {catalog.downtimeReasons.map((r) => (
                <div key={r.id} className="py-2 flex items-center justify-between gap-2">
                  <div>
                    <span className="font-mono font-semibold text-[#0f2544] mr-2">{r.code}</span>
                    <span className="font-medium text-slate-900">{r.name}</span>
                    <span className="text-slate-500 ml-2">({r.category})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      runAction(
                        () =>
                          api.updateDowntimeReason(r.id, {
                            is_planned: !r.is_planned,
                            counts_for_availability: r.is_planned,
                          }),
                        'Classificação IROG atualizada.'
                      )
                    }
                    className={`px-2 py-1 rounded text-[11px] font-semibold cursor-pointer ${
                      r.is_planned ? 'bg-slate-100 text-slate-700' : 'bg-red-50 text-red-700'
                    }`}
                  >
                    {r.is_planned ? 'Programada' : 'Reduz Disp.'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Motivos de Perda e Refugo</h3>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAction(async () => {
                  await api.createLossReason({ code: lrCode, name: lrName, category: lrCategory });
                  setLrCode('');
                  setLrName('');
                }, 'Motivo de perda cadastrado.');
              }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-2.5"
            >
              <input
                type="text"
                required
                value={lrCode}
                onChange={(e) => setLrCode(e.target.value)}
                placeholder="Código"
                className="min-h-[38px] px-3 py-1.5 text-xs font-mono border border-slate-300 rounded-lg"
              />
              <input
                type="text"
                required
                value={lrName}
                onChange={(e) => setLrName(e.target.value)}
                placeholder="Descrição da perda"
                className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg"
              />
              <select
                value={lrCategory}
                onChange={(e) => setLrCategory(e.target.value)}
                className="min-h-[38px] px-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-white"
              >
                <option value="Refugo">Refugo</option>
                <option value="Retrabalho">Retrabalho</option>
                <option value="Matéria-prima">Matéria-prima</option>
                <option value="Setup">Setup</option>
                <option value="Operacional">Operacional</option>
                <option value="Qualidade">Qualidade</option>
              </select>
              <button
                type="submit"
                className="sm:col-span-3 min-h-[38px] bg-blue-600 text-white text-xs font-medium rounded-lg cursor-pointer"
              >
                Cadastrar motivo de perda
              </button>
            </form>

            <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto text-xs">
              {catalog.lossReasons.map((r) => (
                <div key={r.id} className="py-2 flex items-center justify-between">
                  <div>
                    <span className="font-mono font-semibold text-[#0f2544] mr-2">{r.code}</span>
                    <span className="font-medium text-slate-900">{r.name}</span>
                  </div>
                  <span className="text-red-700 font-semibold">{r.category}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* METAS IROG */}
      {tab === 'irog_goals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(
                () =>
                  api.createIrogGoal({
                    scope_level: igScope,
                    sector_id: igScope === 'sector' ? igSectorId : null,
                    line_id: igScope === 'line' ? igLineId : null,
                    machine_id: igScope === 'machine' ? igMachineId : null,
                    target_irog_percent: Number(igIrog),
                    target_availability_percent: Number(igDisp),
                    target_performance_percent: Number(igDesemp),
                    target_quality_percent: Number(igQual),
                    max_loss_percent: 3,
                  }),
                'Meta IROG salva.'
              );
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova Meta IROG</h3>
            <select
              value={igScope}
              onChange={(e) => setIgScope(e.target.value as any)}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="factory">Fábrica Geral</option>
              <option value="sector">Setor</option>
              <option value="line">Linha</option>
              <option value="machine">Máquina</option>
            </select>
            {igScope === 'sector' && (
              <select
                value={igSectorId}
                onChange={(e) => setIgSectorId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {igScope === 'line' && (
              <select
                value={igLineId}
                onChange={(e) => setIgLineId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.lines.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.code} — {l.name}
                  </option>
                ))}
              </select>
            )}
            {igScope === 'machine' && (
              <select
                value={igMachineId}
                onChange={(e) => setIgMachineId(e.target.value)}
                className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {catalog.machines.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.code} — {m.name}
                  </option>
                ))}
              </select>
            )}
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div>
                <label className="block text-slate-600 mb-1">Meta IROG %</label>
                <input
                  type="number"
                  step="0.1"
                  value={igIrog}
                  onChange={(e) => setIgIrog(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Meta Disp. %</label>
                <input
                  type="number"
                  step="0.1"
                  value={igDisp}
                  onChange={(e) => setIgDisp(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Meta Desemp. %</label>
                <input
                  type="number"
                  step="0.1"
                  value={igDesemp}
                  onChange={(e) => setIgDesemp(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1">Meta Qualid. %</label>
                <input
                  type="number"
                  step="0.1"
                  value={igQual}
                  onChange={(e) => setIgQual(e.target.value)}
                  className="w-full min-h-[38px] px-2.5 font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Salvar Meta IROG
            </button>
          </form>

          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-3">Nível / Escopo</th>
                  <th className="px-4 py-3 text-right">IROG</th>
                  <th className="px-4 py-3 text-right">Disp.</th>
                  <th className="px-4 py-3 text-right">Desemp.</th>
                  <th className="px-4 py-3 text-right">Qualid.</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {catalog.irogGoals.map((g) => (
                  <tr key={g.id}>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {g.scope_level === 'factory'
                        ? 'Fábrica Geral'
                        : g.sector_name || g.line_name || g.machine_name}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-[#0f2544]">
                      {g.target_irog_percent}%
                    </td>
                    <td className="px-4 py-3 text-right font-mono">{g.target_availability_percent}%</td>
                    <td className="px-4 py-3 text-right font-mono">{g.target_performance_percent}%</td>
                    <td className="px-4 py-3 text-right font-mono">{g.target_quality_percent}%</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.deleteIrogGoal(g.id), 'Meta removida.')}
                        className="text-red-600 hover:underline cursor-pointer"
                      >
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* METAS DE VOLUME */}
      {tab === 'goals' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              runAction(
                () =>
                  api.createGoal({
                    sector_id: goalSectorId,
                    period_type: goalPeriod,
                    target_quantity: Number(goalTarget),
                    max_loss_percent: Number(goalMaxLoss),
                  }),
                'Meta de produção cadastrada.'
              );
            }}
            className="bg-white border border-slate-200 rounded-xl p-5 space-y-3.5 h-fit"
          >
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Nova meta de volume</h3>
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
            <select
              value={goalPeriod}
              onChange={(e) => setGoalPeriod(e.target.value as 'daily' | 'monthly')}
              className="w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="daily">Meta diária</option>
              <option value="monthly">Meta mensal</option>
            </select>
            <input
              type="number"
              required
              min="1"
              value={goalTarget}
              onChange={(e) => setGoalTarget(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <input
              type="number"
              step="0.1"
              value={goalMaxLoss}
              onChange={(e) => setGoalMaxLoss(e.target.value)}
              className="w-full min-h-[40px] px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
            />
            <button
              type="submit"
              className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer"
            >
              Salvar meta
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
                    <td className="px-4 py-3 font-medium text-slate-900">{g.sector_name}</td>
                    <td className="px-4 py-3 text-slate-700">{g.period_type === 'daily' ? 'Diária' : 'Mensal'}</td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-[#0f2544]">
                      {g.target_quantity}
                    </td>
                    <td className="px-4 py-3 text-right font-mono tabular-nums">{g.max_loss_percent}%</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => runAction(() => api.deleteGoal(g.id), 'Meta removida.')}
                        className="p-1.5 text-slate-400 hover:text-red-600 rounded-md cursor-pointer"
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
