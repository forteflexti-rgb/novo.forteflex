import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, AlertCircle, RotateCcw, Save, Clock, Wrench } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import type { CatalogData, ProductionRecord } from '../types';

const DOWNTIME_REASONS = [
  'Setup / troca de ferramenta ou clichê',
  'Troca de tela / filtro',
  'Ajuste mecânico / faca',
  'Manutenção corretiva elétrica',
  'Manutenção preventiva programada',
  'Falta de matéria-prima / bobina',
  'Queda ou oscilação de energia',
  'Limpeza e higienização de linha',
  'Aguardando controle de qualidade',
  'Outro motivo',
];

interface ProductionFormProps {
  catalog: CatalogData;
  onRecordSaved?: (record: ProductionRecord) => void;
}

export function ProductionForm({ catalog, onRecordSaved }: ProductionFormProps) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const today = new Date().toISOString().slice(0, 10);

  const defaultSectorId = useMemo(() => {
    if (user?.sector_id && catalog.sectors.some((s) => s.id === user.sector_id && s.active)) {
      return user.sector_id;
    }
    return catalog.sectors[0]?.id || '';
  }, [user, catalog.sectors]);

  const [productionDate, setProductionDate] = useState(today);
  const [shiftId, setShiftId] = useState(catalog.shifts[0]?.id || '');
  const [operatorId, setOperatorId] = useState(user?.id || '');
  const [sectorId, setSectorId] = useState(defaultSectorId);
  const [lineId, setLineId] = useState('');
  const [productId, setProductId] = useState(catalog.products[0]?.id || '');

  const [plannedQty, setPlannedQty] = useState('');
  const [producedQty, setProducedQty] = useState('');
  const [approvedQty, setApprovedQty] = useState('');
  const [lossQty, setLossQty] = useState('0');
  const [unitOfMeasure, setUnitOfMeasure] = useState(catalog.products[0]?.unit_of_measure || 'kg');

  const [hasDowntime, setHasDowntime] = useState(false);
  const [downtimeMinutes, setDowntimeMinutes] = useState('');
  const [downtimeReason, setDowntimeReason] = useState(DOWNTIME_REASONS[0]);
  const [customReason, setCustomReason] = useState('');
  const [downtimeDescription, setDowntimeDescription] = useState('');

  const [notes, setNotes] = useState('');
  const [additionalNotes, setAdditionalNotes] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedRecord, setSavedRecord] = useState<ProductionRecord | null>(null);

  const availableLines = useMemo(
    () => catalog.lines.filter((l) => l.sector_id === sectorId && l.active),
    [catalog.lines, sectorId]
  );

  useEffect(() => {
    if (availableLines.length > 0 && !availableLines.some((l) => l.id === lineId)) {
      setLineId(availableLines[0].id);
    } else if (availableLines.length === 0) {
      setLineId('');
    }
  }, [availableLines, lineId]);

  useEffect(() => {
    const prod = catalog.products.find((p) => p.id === productId);
    if (prod) {
      setUnitOfMeasure(prod.unit_of_measure);
    }
  }, [productId, catalog.products]);

  const handleProducedOrLossChange = (nextProduced: string, nextLoss: string) => {
    setProducedQty(nextProduced);
    setLossQty(nextLoss);
    const p = Number(nextProduced);
    const l = Number(nextLoss);
    if (Number.isFinite(p) && Number.isFinite(l) && p >= 0 && l >= 0 && p >= l) {
      setApprovedQty(String(Number((p - l).toFixed(2))));
    }
  };

  const resetForm = () => {
    setProductionDate(today);
    setShiftId(catalog.shifts[0]?.id || '');
    setOperatorId(user?.id || '');
    setSectorId(defaultSectorId);
    setProductId(catalog.products[0]?.id || '');
    setPlannedQty('');
    setProducedQty('');
    setApprovedQty('');
    setLossQty('0');
    setHasDowntime(false);
    setDowntimeMinutes('');
    setDowntimeReason(DOWNTIME_REASONS[0]);
    setCustomReason('');
    setDowntimeDescription('');
    setNotes('');
    setAdditionalNotes('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedRecord(null);

    if (!productionDate || !shiftId || !sectorId || !lineId || !productId) {
      setError('Preencha todos os campos obrigatórios da seção 01. Identificação.');
      return;
    }

    const planned = Number(plannedQty);
    const produced = Number(producedQty);
    const approved = Number(approvedQty);
    const loss = Number(lossQty || 0);

    if (!Number.isFinite(planned) || planned <= 0) {
      setError('Informe uma quantidade planejada maior que zero.');
      return;
    }
    if (!Number.isFinite(produced) || produced < 0 || !Number.isFinite(approved) || approved < 0 || !Number.isFinite(loss) || loss < 0) {
      setError('As quantidades produzida, aprovada e de perdas devem ser valores válidos não negativos.');
      return;
    }
    if (approved > produced) {
      setError('A quantidade aprovada não pode ser maior que a quantidade produzida.');
      return;
    }

    const finalReason = downtimeReason === 'Outro motivo' ? customReason.trim() : downtimeReason;
    if (hasDowntime) {
      const dtMin = Number(downtimeMinutes);
      if (!Number.isFinite(dtMin) || dtMin <= 0) {
        setError('Informe o tempo total de parada em minutos (maior que zero).');
        return;
      }
      if (!finalReason) {
        setError('Selecione ou descreva o motivo da parada.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.createProductionRecord({
        production_date: productionDate,
        shift_id: shiftId,
        operator_id: isAdmin ? operatorId : undefined,
        sector_id: sectorId,
        line_id: lineId,
        product_id: productId,
        planned_quantity: planned,
        produced_quantity: produced,
        approved_quantity: approved,
        loss_quantity: loss,
        unit_of_measure: unitOfMeasure,
        has_downtime: hasDowntime,
        total_downtime_minutes: hasDowntime ? Number(downtimeMinutes) : 0,
        downtime_reason: hasDowntime ? finalReason : undefined,
        downtime_description: hasDowntime ? downtimeDescription : undefined,
        notes,
        additional_notes: additionalNotes,
      });

      setSavedRecord(res.record);
      onRecordSaved?.(res.record);
      resetForm();
    } catch (err: any) {
      setError(err.message || 'Erro ao salvar o registro de produção.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {savedRecord && (
        <div
          role="status"
          className="bg-white border border-emerald-300 rounded-xl p-6 space-y-4"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h2 className="text-base font-display font-bold text-emerald-900">
                Registro de produção salvo com sucesso
              </h2>
              <p className="text-sm text-emerald-700 mt-0.5">
                Lançamento gravado no banco de dados em{' '}
                <span className="font-mono tabular-nums">
                  {new Date(savedRecord.created_at).toLocaleString('pt-BR')}
                </span>{' '}
                por <span className="font-medium">{savedRecord.created_by_name}</span>.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t border-emerald-100 text-sm">
            <div>
              <div className="text-xs text-slate-500">Setor / Linha</div>
              <div className="font-medium text-slate-900 mt-0.5">
                {savedRecord.sector_name} · {savedRecord.line_name}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Produto</div>
              <div className="font-medium text-slate-900 mt-0.5">{savedRecord.product_name}</div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Produzido / Aprovado</div>
              <div className="font-mono tabular-nums font-semibold text-emerald-700 mt-0.5">
                {savedRecord.produced_quantity} / {savedRecord.approved_quantity} {savedRecord.unit_of_measure}
              </div>
            </div>
            <div>
              <div className="text-xs text-slate-500">Perdas / Parada</div>
              <div className="font-mono tabular-nums font-semibold text-slate-900 mt-0.5">
                {savedRecord.loss_quantity} {savedRecord.unit_of_measure} · {savedRecord.total_downtime_minutes} min
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-red-50 border border-red-200 flex items-start gap-3 text-sm text-red-800"
        >
          <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SEÇÃO 1: IDENTIFICAÇÃO */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <h2 className="text-base font-display font-bold text-[#0f2544]">01. Identificação</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Dados operacionais de turno, equipe, setor e produto fabricado.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label htmlFor="prod-date" className="block text-sm font-medium text-slate-700 mb-1.5">
                Data da produção *
              </label>
              <input
                id="prod-date"
                type="date"
                required
                value={productionDate}
                onChange={(e) => setProductionDate(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-sm font-mono bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="prod-shift" className="block text-sm font-medium text-slate-700 mb-1.5">
                Turno *
              </label>
              <select
                id="prod-shift"
                required
                value={shiftId}
                onChange={(e) => setShiftId(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {catalog.shifts.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.start_time}–{s.end_time})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-operator" className="block text-sm font-medium text-slate-700 mb-1.5">
                Funcionário responsável *
              </label>
              {isAdmin ? (
                <select
                  id="prod-operator"
                  value={operatorId}
                  onChange={(e) => setOperatorId(e.target.value)}
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                >
                  {(catalog.operators || []).filter((o) => o.is_active).map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="prod-operator"
                  type="text"
                  readOnly
                  value={user?.full_name || ''}
                  className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-700 cursor-not-allowed"
                />
              )}
            </div>

            <div>
              <label htmlFor="prod-sector" className="block text-sm font-medium text-slate-700 mb-1.5">
                Setor *
              </label>
              <select
                id="prod-sector"
                required
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {catalog.sectors.filter((s) => s.active).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="prod-line" className="block text-sm font-medium text-slate-700 mb-1.5">
                Linha de produção *
              </label>
              <select
                id="prod-line"
                required
                value={lineId}
                onChange={(e) => setLineId(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {availableLines.length === 0 ? (
                  <option value="">Nenhuma linha ativa neste setor</option>
                ) : (
                  availableLines.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.code} — {l.name}
                    </option>
                  ))
                )}
              </select>
            </div>

            <div>
              <label htmlFor="prod-product" className="block text-sm font-medium text-slate-700 mb-1.5">
                Produto produzido *
              </label>
              <select
                id="prod-product"
                required
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
                className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                {catalog.products.filter((p) => p.active).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {/* SEÇÃO 2: DADOS DE PRODUÇÃO */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <h2 className="text-base font-display font-bold text-[#0f2544]">02. Dados de Produção</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Informe volumes planejados, efetivamente produzidos, aprovados e perdas/refugos.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label htmlFor="qty-planned" className="block text-sm font-medium text-slate-700 mb-1.5">
                Qtd. planejada *
              </label>
              <input
                id="qty-planned"
                type="number"
                step="0.01"
                min="0.01"
                required
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
                placeholder="0"
                className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="qty-produced" className="block text-sm font-medium text-slate-700 mb-1.5">
                Qtd. produzida *
              </label>
              <input
                id="qty-produced"
                type="number"
                step="0.01"
                min="0"
                required
                value={producedQty}
                onChange={(e) => handleProducedOrLossChange(e.target.value, lossQty)}
                placeholder="0"
                className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>

            <div>
              <label htmlFor="qty-loss" className="block text-sm font-medium text-slate-700 mb-1.5">
                Perdas / refugos *
              </label>
              <input
                id="qty-loss"
                type="number"
                step="0.01"
                min="0"
                required
                value={lossQty}
                onChange={(e) => handleProducedOrLossChange(producedQty, e.target.value)}
                placeholder="0"
                className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-600/20 focus:border-red-600"
              />
            </div>

            <div>
              <label htmlFor="qty-approved" className="block text-sm font-medium text-slate-700 mb-1.5">
                Qtd. aprovada *
              </label>
              <input
                id="qty-approved"
                type="number"
                step="0.01"
                min="0"
                required
                value={approvedQty}
                onChange={(e) => setApprovedQty(e.target.value)}
                placeholder="0"
                className="w-full min-h-[48px] px-3.5 py-2.5 text-base font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-600/20 focus:border-emerald-600"
              />
            </div>

            <div>
              <label htmlFor="qty-uom" className="block text-sm font-medium text-slate-700 mb-1.5">
                Unidade
              </label>
              <select
                id="qty-uom"
                value={unitOfMeasure}
                onChange={(e) => setUnitOfMeasure(e.target.value)}
                className="w-full min-h-[48px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              >
                <option value="kg">kg (Quilogramas)</option>
                <option value="un">un (Unidades)</option>
                <option value="m">m (Metros)</option>
                <option value="bob">bob (Bobinas)</option>
                <option value="cx">cx (Caixas)</option>
              </select>
            </div>
          </div>
        </section>

        {/* SEÇÃO 3: PARADAS */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5 pb-3 border-b border-slate-100">
            <div>
              <h2 className="text-base font-display font-bold text-[#0f2544]">03. Paradas</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Registre interrupções mecânicas, elétricas, setups ou faltas de material durante o turno.
              </p>
            </div>

            <div className="inline-flex items-center p-1 bg-slate-100 rounded-lg shrink-0" role="group" aria-label="Houve parada?">
              <button
                type="button"
                onClick={() => setHasDowntime(false)}
                className={`min-h-[38px] px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  !hasDowntime ? 'bg-white text-[#0f2544] shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Não houve parada
              </button>
              <button
                type="button"
                onClick={() => setHasDowntime(true)}
                className={`min-h-[38px] px-4 py-1.5 text-sm font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  hasDowntime ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Houve parada
              </button>
            </div>
          </div>

          {hasDowntime ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="dt-minutes" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Tempo total de parada (minutos) *
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    id="dt-minutes"
                    type="number"
                    min="1"
                    required={hasDowntime}
                    value={downtimeMinutes}
                    onChange={(e) => setDowntimeMinutes(e.target.value)}
                    placeholder="ex.: 35"
                    className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-sm font-mono tabular-nums bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="dt-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Motivo da parada *
                </label>
                <div className="relative">
                  <Wrench className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    id="dt-reason"
                    value={downtimeReason}
                    onChange={(e) => setDowntimeReason(e.target.value)}
                    className="w-full min-h-[46px] pl-10 pr-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  >
                    {DOWNTIME_REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {downtimeReason === 'Outro motivo' && (
                <div className="sm:col-span-2">
                  <label htmlFor="dt-custom-reason" className="block text-sm font-medium text-slate-700 mb-1.5">
                    Especifique o motivo *
                  </label>
                  <input
                    id="dt-custom-reason"
                    type="text"
                    required
                    value={customReason}
                    onChange={(e) => setCustomReason(e.target.value)}
                    placeholder="Descreva objetivamente o motivo da parada"
                    className="w-full min-h-[46px] px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <label htmlFor="dt-desc" className="block text-sm font-medium text-slate-700 mb-1.5">
                  Descrição da ocorrência
                </label>
                <textarea
                  id="dt-desc"
                  rows={2}
                  value={downtimeDescription}
                  onChange={(e) => setDowntimeDescription(e.target.value)}
                  placeholder="Detalhes técnicos, peça afetada ou ação corretiva realizada..."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Operação contínua registrada sem paradas neste lançamento. Caso tenha ocorrido interrupção, selecione "Houve parada" acima.
            </p>
          )}
        </section>

        {/* SEÇÃO 4: OBSERVAÇÕES */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-7">
          <div className="mb-5 pb-3 border-b border-slate-100">
            <h2 className="text-base font-display font-bold text-[#0f2544]">04. Observações</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Anotações de qualidade, passagem de turno ou ocorrências relevantes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="prod-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
                Observações do turno
              </label>
              <textarea
                id="prod-notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações gerais da produção..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
            <div>
              <label htmlFor="prod-add-notes" className="block text-sm font-medium text-slate-700 mb-1.5">
                Observações adicionais
              </label>
              <textarea
                id="prod-add-notes"
                rows={3}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
                placeholder="Informações complementares, lote de matéria-prima, OP..."
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600"
              />
            </div>
          </div>
        </section>

        {/* SEÇÃO 5: FINALIZAÇÃO */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          <div className="text-xs text-slate-500">
            Responsável registrado automaticamente: <span className="font-medium text-slate-800">{user?.full_name}</span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[48px] px-5 py-2.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-medium text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-4 h-4" />
              <span>Limpar formulário</span>
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="min-h-[48px] px-7 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{submitting ? 'Salvando registro...' : 'Salvar registro'}</span>
            </button>
          </div>
        </section>
      </form>
    </div>
  );
}
