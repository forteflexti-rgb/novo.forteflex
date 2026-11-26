/**
 * Abas de parâmetros que destravam o IROG: Ciclos Padrão (capacidade/ciclo por recurso × produto × etapa)
 * e Calendário (grade semanal de turnos por recurso + exceções).
 * Nenhum campo numérico vem preenchido: todo valor é informado por quem cadastra, com origem.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, FileUp, Info, Trash2, Wand2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../../lib/api';
import type { CalendarExceptionRow, StandardRow, WeeklyCalendarRow } from '../../lib/irog/catalogApi';
import { parseStandardsSheet, type SheetParseResult } from '../../lib/irog/standardsSheet';
import type { CatalogData } from '../../types';

const input = 'w-full min-h-[40px] px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white';
const label = 'block text-xs font-medium text-slate-700 mb-1';
const today = () => new Date(Date.now() - 3 * 3600000).toISOString().slice(0, 10);
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const UNITS = ['kg', 'mil', 'mt', 'un'];

function useFeedback() {
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const run = async (fn: () => Promise<unknown>, msg: string, after?: () => void) => {
    setError(null);
    setOk(null);
    try {
      await fn();
      setOk(msg);
      after?.();
    } catch (e: any) {
      setError(e?.message || 'Erro ao salvar.');
    }
  };
  const banner = (
    <>
      {error && (
        <div role="alert" className="p-3 rounded-lg bg-red-50 border border-red-200 flex items-center gap-2 text-xs text-red-800">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {error}
        </div>
      )}
      {ok && (
        <div role="status" className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-xs text-emerald-800">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {ok}
        </div>
      )}
    </>
  );
  return { run, banner };
}

// =============================================================================
// CICLOS PADRÃO
// =============================================================================
type Coverage = Awaited<ReturnType<typeof api.getStandardCoverage>>;

export function CycleStandardsTab({ catalog, onSaved }: { catalog: CatalogData; onSaved: () => void }) {
  const { run, banner } = useFeedback();
  const [standards, setStandards] = useState<StandardRow[]>([]);
  const [coverage, setCoverage] = useState<Coverage>([]);
  const [loading, setLoading] = useState(true);

  const [machineId, setMachineId] = useState('');
  const [productId, setProductId] = useState('');
  const [stageId, setStageId] = useState('');
  const [type, setType] = useState<'rate_per_hour' | 'cycle_seconds'>('rate_per_hour');
  const [value, setValue] = useState('');
  const [unit, setUnit] = useState('');
  const [validFrom, setValidFrom] = useState(today());
  const [source, setSource] = useState('');
  const [notes, setNotes] = useState('');
  const [sheet, setSheet] = useState<(SheetParseResult & { file: string }) | null>(null);

  const readSheet = async (file: File | undefined) => {
    if (!file) return;
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const ws = wb.Sheets['Padrões'];
      if (!ws) throw new Error('A planilha não tem a aba "Padrões". Use o arquivo IROG_Padroes_Producao_Engenharia.xlsx.');
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
      setSheet({ ...parseStandardsSheet(rows), file: file.name });
    } catch (e: any) {
      setSheet(null);
      await run(async () => Promise.reject(e), '');
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([api.getStandards(), api.getStandardCoverage()]);
      setStandards(s);
      setCoverage(c);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const machineName = useMemo(() => new Map(catalog.machines.map((m) => [m.id, `${m.code} — ${m.name}`])), [catalog.machines]);
  const productName = useMemo(() => new Map(catalog.products.map((p) => [p.id, p.name])), [catalog.products]);
  const stageName = useMemo(() => new Map(catalog.stages.map((s) => [s.id, `${s.code} - ${s.name}`])), [catalog.stages]);
  const missing = coverage.filter((c) => !c.hasStandard || c.unitMismatch);
  const covered = coverage.length - missing.length;

  const fillFrom = (c: Coverage[number]) => {
    setMachineId(c.resource_id);
    setProductId(c.product_id ?? '');
    setStageId(c.step_id ?? '');
    setUnit(c.unit);
    setValue('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onProduct = (id: string) => {
    setProductId(id);
    const p = catalog.products.find((x) => x.id === id);
    if (p && !unit) setUnit(p.unit_of_measure.toLowerCase());
  };

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    run(
      () =>
        api.createCycleStandard({
          machine_id: machineId,
          product_id: productId || null,
          stage_id: stageId || null,
          standard_type: type,
          value,
          unit,
          valid_from: validFrom,
          source,
          notes,
        }),
      'Padrão produtivo salvo. O IROG dos dias cobertos passa a ser calculado.',
      () => {
        setValue('');
        setNotes('');
        load();
        onSaved();
      },
    );
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          A <strong>performance</strong> do IROG depende deste cadastro: capacidade por hora ou ciclo em segundos, por recurso, produto e etapa,
          na <strong>mesma unidade do apontamento</strong> do Iniflex. Nenhum valor é sugerido pelo sistema. Para mudar um padrão, encerre a
          vigência do atual e cadastre o novo: o histórico fica preservado.
        </span>
      </div>
      {banner}

      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Importar planilha da engenharia</h3>
            <p className="text-xs text-slate-500">
              Arquivo <span className="font-mono">IROG_Padroes_Producao_Engenharia.xlsx</span> preenchido. Linhas em branco continuam pendentes.
            </p>
          </div>
          <label className="inline-flex items-center gap-2 px-3.5 min-h-[40px] rounded-lg border border-slate-300 text-sm text-slate-700 cursor-pointer hover:bg-slate-50">
            <FileUp className="w-4 h-4" />
            Selecionar planilha
            <input
              type="file"
              accept=".xlsx"
              className="hidden"
              onChange={(e) => {
                readSheet(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {sheet && (
          <div className="space-y-3">
            <p className="text-xs text-slate-700">
              <strong>{sheet.file}</strong>: {sheet.standards.length} padrão(ões) prontos para importar · {sheet.errors.length} linha(s) com erro ·{' '}
              {sheet.blank} em branco
            </p>
            {sheet.errors.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800 space-y-1">
                {sheet.errors.map((e) => (
                  <div key={e.line}>
                    Linha {e.line} ({e.label}): {e.message}
                  </div>
                ))}
              </div>
            )}
            {sheet.standards.length > 0 && (
              <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 text-xs">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    {sheet.standards.map((s) => (
                      <tr key={s.line}>
                        <td className="px-3 py-1.5 text-slate-500 font-mono">{s.line}</td>
                        <td className="px-3 py-1.5">{s.label}</td>
                        <td className="px-3 py-1.5 text-right font-mono">
                          {s.value.toLocaleString('pt-BR')} {s.standard_type === 'rate_per_hour' ? `${s.unit}/h` : `s/${s.unit}`}
                        </td>
                        <td className="px-3 py-1.5 font-mono">{s.valid_from}</td>
                        <td className="px-3 py-1.5 text-slate-600">{s.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={sheet.standards.length === 0 || sheet.errors.length > 0}
                onClick={() =>
                  run(() => api.importStandards(sheet.standards), `${sheet.standards.length} padrão(ões) importados da planilha.`, () => {
                    setSheet(null);
                    load();
                    onSaved();
                  })
                }
                className="min-h-[40px] px-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white text-sm font-medium rounded-lg cursor-pointer disabled:cursor-not-allowed"
              >
                Importar {sheet.standards.length} padrão(ões)
              </button>
              <button type="button" onClick={() => setSheet(null)} className="min-h-[40px] px-4 border border-slate-300 text-sm rounded-lg cursor-pointer">
                Cancelar
              </button>
            </div>
            {sheet.errors.length > 0 && (
              <p className="text-xs text-red-700">Corrija as linhas com erro na planilha e selecione de novo: a importação é feita só com o arquivo todo válido.</p>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form onSubmit={save} className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit">
          <h3 className="text-sm font-display font-bold text-[#0f2544]">Novo padrão produtivo</h3>
          <div>
            <label className={label}>Máquina / recurso *</label>
            <select required value={machineId} onChange={(e) => setMachineId(e.target.value)} className={input}>
              <option value="">Selecione…</option>
              {catalog.machines.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.code} — {m.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Produto</label>
            <select value={productId} onChange={(e) => onProduct(e.target.value)} className={input}>
              <option value="">Todos os produtos deste recurso</option>
              {catalog.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Etapa</label>
            <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={input}>
              <option value="">Qualquer etapa</option>
              {catalog.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code} - {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={label}>Tipo *</label>
              <select value={type} onChange={(e) => setType(e.target.value as any)} className={input}>
                <option value="rate_per_hour">Capacidade por hora</option>
                <option value="cycle_seconds">Ciclo (segundos por unidade)</option>
              </select>
            </div>
            <div>
              <label className={label}>Unidade *</label>
              <select required value={unit} onChange={(e) => setUnit(e.target.value)} className={input}>
                <option value="">Selecione…</option>
                {UNITS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className={label}>{type === 'rate_per_hour' ? `Capacidade (${unit || 'unidade'} por hora) *` : `Segundos por ${unit || 'unidade'} *`}</label>
            <input type="number" step="any" min="0" required value={value} onChange={(e) => setValue(e.target.value)} className={`${input} font-mono`} />
          </div>
          <div>
            <label className={label}>Vigente a partir de *</label>
            <input type="date" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={`${input} font-mono`} />
          </div>
          <div>
            <label className={label}>Origem do valor *</label>
            <input
              type="text"
              required
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Ex.: Cronoanálise Engenharia 11/2026"
              className={input}
            />
          </div>
          <div>
            <label className={label}>Observações</label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
          <button type="submit" className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer">
            Salvar padrão
          </button>
        </form>

        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-3">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Falta cadastrar (combinações apontadas no Iniflex)</h3>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                {loading ? '…' : `${covered} de ${coverage.length} com padrão`}
              </span>
            </div>
            <div className="max-h-[360px] overflow-y-auto">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600 sticky top-0">
                  <tr>
                    <th className="px-4 py-2.5">Recurso</th>
                    <th className="px-4 py-2.5">Produto</th>
                    <th className="px-4 py-2.5">Etapa</th>
                    <th className="px-4 py-2.5">UN</th>
                    <th className="px-4 py-2.5 text-right">Apont.</th>
                    <th className="px-4 py-2.5 text-right">kg</th>
                    <th className="px-4 py-2.5 text-right"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {missing.map((c) => (
                    <tr key={`${c.resource_id}|${c.product_id}|${c.step_id}|${c.unit}`}>
                      <td className="px-4 py-2.5 font-medium text-slate-900">{machineName.get(c.resource_id) ?? c.resource_id}</td>
                      <td className="px-4 py-2.5 text-slate-700">{c.product_id ? productName.get(c.product_id) ?? c.product_id : '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{c.step_id ? stageName.get(c.step_id) ?? c.step_id : '—'}</td>
                      <td className="px-4 py-2.5 font-mono">
                        {c.unit}
                        {c.unitMismatch && <span className="ml-1 text-amber-700">(padrão em outra unidade)</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.events}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{c.weightKg.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button type="button" onClick={() => fillFrom(c)} className="inline-flex items-center gap-1 text-blue-700 hover:underline cursor-pointer">
                          <Wand2 className="w-3.5 h-3.5" />
                          Preencher
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!loading && missing.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-500">
                        Todas as combinações apontadas têm padrão vigente.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200">
              <h3 className="text-sm font-display font-bold text-[#0f2544]">Padrões cadastrados</h3>
            </div>
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Recurso</th>
                  <th className="px-4 py-2.5">Produto / etapa</th>
                  <th className="px-4 py-2.5 text-right">Padrão</th>
                  <th className="px-4 py-2.5">Vigência</th>
                  <th className="px-4 py-2.5">Origem</th>
                  <th className="px-4 py-2.5 text-right"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {standards.map((s) => {
                  const ended = !!s.valid_to && s.valid_to < today();
                  return (
                    <tr key={s.id} className={ended ? 'text-slate-400' : ''}>
                      <td className="px-4 py-2.5 font-medium">{machineName.get(s.resource_id) ?? s.resource_id}</td>
                      <td className="px-4 py-2.5">
                        {s.product_id ? productName.get(s.product_id) ?? s.product_id : 'Todos os produtos'}
                        <div className="text-slate-500">{s.step_id ? stageName.get(s.step_id) ?? s.step_id : 'Qualquer etapa'}</div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {Number(s.value).toLocaleString('pt-BR')} {s.standard_type === 'rate_per_hour' ? `${s.unit}/h` : `s/${s.unit}`}
                      </td>
                      <td className="px-4 py-2.5 font-mono">
                        {s.valid_from}
                        {s.valid_to ? ` → ${s.valid_to}` : ' → atual'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{s.source}</td>
                      <td className="px-4 py-2.5 text-right">
                        {!s.valid_to && (
                          <button
                            type="button"
                            onClick={() => run(() => api.endCycleStandard(s.id, today()), 'Vigência encerrada.', () => { load(); onSaved(); })}
                            className="text-amber-700 hover:underline cursor-pointer"
                          >
                            Encerrar vigência
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {!loading && standards.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                      Nenhum padrão cadastrado: a performance do IROG fica pendente.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// CALENDÁRIO
// =============================================================================
export function CalendarTab({ catalog, onSaved }: { catalog: CatalogData; onSaved: () => void }) {
  const { run, banner } = useFeedback();
  const [weekly, setWeekly] = useState<WeeklyCalendarRow[]>([]);
  const [exceptions, setExceptions] = useState<CalendarExceptionRow[]>([]);

  const [machines, setMachines] = useState<string[]>([]);
  const [days, setDays] = useState<number[]>([]);
  const [shiftId, setShiftId] = useState('');
  const [minutes, setMinutes] = useState('');
  const [validFrom, setValidFrom] = useState(today());

  const [exMachine, setExMachine] = useState('');
  const [exDate, setExDate] = useState(today());
  const [exShift, setExShift] = useState('');
  const [exKind, setExKind] = useState<'holiday' | 'planned_stop' | 'extra_shift'>('holiday');
  const [exMinutes, setExMinutes] = useState('');
  const [exReason, setExReason] = useState('');

  const load = useCallback(async () => {
    const r = await api.getCalendarSetup();
    setWeekly(r.weekly);
    setExceptions(r.exceptions);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const shiftById = useMemo(() => new Map(catalog.shifts.map((s) => [s.id, s])), [catalog.shifts]);
  const machineName = useMemo(() => new Map(catalog.machines.map((m) => [m.id, `${m.code} — ${m.name}`])), [catalog.machines]);

  /** Duração do turno cadastrado, menos o intervalo — só usada se a pessoa clicar para aplicar. */
  const shiftLength = (() => {
    const s: any = shiftId ? shiftById.get(shiftId) : null;
    if (!s) return null;
    const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    let d = toMin(s.end_time) - toMin(s.start_time);
    if (d <= 0) d += 1440;
    return d - Number(s.break_minutes ?? 0);
  })();

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const byMachine = useMemo(() => {
    const m = new Map<string, WeeklyCalendarRow[]>();
    for (const r of weekly) {
      if (!m.has(r.resource_id)) m.set(r.resource_id, []);
      m.get(r.resource_id)!.push(r);
    }
    return m;
  }, [weekly]);

  return (
    <div className="space-y-4">
      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 flex items-start gap-2 text-xs text-blue-900">
        <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <span>
          A <strong>disponibilidade</strong> do IROG depende do tempo programado de cada recurso. Cadastre a grade semanal (quais turnos cada
          máquina trabalha em cada dia da semana) e, abaixo, as exceções: feriados, paradas programadas e turnos extras.
        </span>
      </div>
      {banner}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () => api.createWeeklyCalendar({ machine_ids: machines, weekdays: days, shift_id: shiftId, planned_minutes: minutes, valid_from: validFrom }),
              'Grade semanal salva.',
              () => {
                load();
                onSaved();
              },
            );
          }}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
        >
          <h3 className="text-sm font-display font-bold text-[#0f2544]">Grade semanal de turnos</h3>
          <div>
            <label className={label}>Máquinas / recursos *</label>
            <div className="max-h-40 overflow-y-auto border border-slate-300 rounded-lg p-2 space-y-1">
              {catalog.machines.map((m) => (
                <label key={m.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={machines.includes(m.id)} onChange={() => setMachines(toggle(machines, m.id))} />
                  {m.code} — {m.name}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Dias da semana *</label>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map((d, i) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(toggle(days, i))}
                  className={`px-2.5 py-1.5 text-xs rounded-md border cursor-pointer ${
                    days.includes(i) ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-300 text-slate-700'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={label}>Turno *</label>
            <select required value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={input}>
              <option value="">Selecione…</option>
              {catalog.shifts.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={label}>Minutos programados por turno *</label>
            <input type="number" min="1" max="1440" required value={minutes} onChange={(e) => setMinutes(e.target.value)} className={`${input} font-mono`} />
            {shiftLength !== null && (
              <button type="button" onClick={() => setMinutes(String(shiftLength))} className="mt-1 text-xs text-blue-700 hover:underline cursor-pointer">
                Usar a duração do turno cadastrado ({shiftLength} min, já descontado o intervalo)
              </button>
            )}
          </div>
          <div>
            <label className={label}>Vigente a partir de *</label>
            <input type="date" required value={validFrom} onChange={(e) => setValidFrom(e.target.value)} className={`${input} font-mono`} />
          </div>
          <button type="submit" className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer">
            Salvar grade
          </button>
        </form>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="text-sm font-display font-bold text-[#0f2544]">Grade por recurso</h3>
          </div>
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Recurso</th>
                {WEEKDAYS.map((d) => (
                  <th key={d} className="px-2 py-2.5 text-center">
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {catalog.machines.map((m) => {
                const rows = byMachine.get(m.id) ?? [];
                return (
                  <tr key={m.id}>
                    <td className="px-4 py-2.5 font-medium text-slate-900 whitespace-nowrap">
                      {m.code}
                      {rows.length === 0 && <div className="text-amber-700 font-normal">sem calendário</div>}
                    </td>
                    {WEEKDAYS.map((_, w) => {
                      const cell = rows.filter((r) => r.weekday === w);
                      return (
                        <td key={w} className="px-2 py-2 text-center align-top">
                          {cell.map((r) => (
                            <div key={r.id} className="group flex items-center justify-center gap-0.5 font-mono">
                              <span title={`${shiftById.get(r.shift_id)?.name ?? r.shift_id} · desde ${r.valid_from}`}>
                                {shiftById.get(r.shift_id)?.code ?? '?'}:{r.planned_minutes}
                              </span>
                              <button
                                type="button"
                                aria-label="Remover turno da grade"
                                onClick={() => run(() => api.deleteWeeklyCalendar(r.id), 'Turno removido da grade.', () => { load(); onSaved(); })}
                                className="opacity-0 group-hover:opacity-100 text-red-600 cursor-pointer"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-100">Cada célula: turno:minutos programados.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(
              () =>
                api.createCalendarException({
                  resource_id: exMachine || null,
                  exception_date: exDate,
                  shift_id: exShift || null,
                  kind: exKind,
                  minutes: exMinutes,
                  reason: exReason,
                }),
              'Exceção de calendário registrada.',
              () => {
                setExReason('');
                setExMinutes('');
                load();
                onSaved();
              },
            );
          }}
          className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 h-fit"
        >
          <h3 className="text-sm font-display font-bold text-[#0f2544]">Exceção de calendário</h3>
          <select value={exMachine} onChange={(e) => setExMachine(e.target.value)} className={input}>
            <option value="">Toda a fábrica</option>
            {catalog.machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.name}
              </option>
            ))}
          </select>
          <input type="date" required value={exDate} onChange={(e) => setExDate(e.target.value)} className={`${input} font-mono`} />
          <select value={exKind} onChange={(e) => setExKind(e.target.value as any)} className={input}>
            <option value="holiday">Feriado / sem expediente</option>
            <option value="planned_stop">Parada programada (manutenção preventiva…)</option>
            <option value="extra_shift">Turno extra</option>
          </select>
          <select value={exShift} onChange={(e) => setExShift(e.target.value)} className={input}>
            <option value="">Dia inteiro</option>
            {catalog.shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <div>
            <label className={label}>{exKind === 'extra_shift' ? 'Minutos do turno extra *' : 'Minutos (vazio = o período inteiro)'}</label>
            <input type="number" min="0" value={exMinutes} required={exKind === 'extra_shift'} onChange={(e) => setExMinutes(e.target.value)} className={`${input} font-mono`} />
          </div>
          <input type="text" required value={exReason} onChange={(e) => setExReason(e.target.value)} placeholder="Motivo (ex.: Natal, manutenção da subestação)" className={input} />
          <button type="submit" className="w-full min-h-[42px] bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg cursor-pointer">
            Registrar exceção
          </button>
        </form>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 font-semibold text-slate-600">
              <tr>
                <th className="px-4 py-2.5">Data</th>
                <th className="px-4 py-2.5">Escopo</th>
                <th className="px-4 py-2.5">Tipo</th>
                <th className="px-4 py-2.5 text-right">Minutos</th>
                <th className="px-4 py-2.5">Motivo</th>
                <th className="px-4 py-2.5 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {exceptions.map((x) => (
                <tr key={x.id}>
                  <td className="px-4 py-2.5 font-mono">{x.exception_date}</td>
                  <td className="px-4 py-2.5">
                    {x.resource_id ? machineName.get(x.resource_id) ?? x.resource_id : 'Toda a fábrica'}
                    {x.shift_id && <div className="text-slate-500">{shiftById.get(x.shift_id)?.name}</div>}
                  </td>
                  <td className="px-4 py-2.5">{x.kind === 'holiday' ? 'Feriado' : x.kind === 'planned_stop' ? 'Parada programada' : 'Turno extra'}</td>
                  <td className="px-4 py-2.5 text-right font-mono">{x.minutes ?? 'todo'}</td>
                  <td className="px-4 py-2.5 text-slate-600">{x.reason}</td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => run(() => api.deleteCalendarException(x.id), 'Exceção removida.', () => { load(); onSaved(); })}
                      className="text-red-600 hover:underline cursor-pointer"
                    >
                      Remover
                    </button>
                  </td>
                </tr>
              ))}
              {exceptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-500">
                    Nenhuma exceção cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
