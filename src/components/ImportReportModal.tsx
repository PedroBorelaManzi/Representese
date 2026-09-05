import React, { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { X, Upload, Loader2, Check, AlertTriangle, UserPlus, Sparkles, Building } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { cn } from "../lib/utils";
import { SearchableClientPicker } from "./SearchableClientPicker";
import { offlineCache } from "../lib/offlineCache";
import { useModalEsc } from "../hooks/useModalEsc";
import { useFocusTrap } from "../hooks/useFocusTrap";
import {
  parseOrderReportAny,
  pickValue,
  matchClientByCnpjOrName,
  normalizeName,
  orderDateToTimestamp,
  type ParsedReport,
  type ParsedReportRow,
  type MatchStatus,
  type PickedBy,
} from "../lib/reportImporter";

interface ClientLite { id: string; name: string; cnpj?: string | null; city?: string; created_at?: string | null }

interface Props {
  open: boolean;
  onClose: () => void;
  userId?: string;
  clients: ClientLite[];
  categories: string[];
  onImported: () => void;
}

/** Estado de cada linha do relatório na tela de conferência. */
interface RowState {
  include: boolean;
  clientId?: string;
  /** Cadastrar um cliente novo com o nome que veio no relatório. */
  createNew: boolean;
  status: MatchStatus;
  duplicate: boolean;
  /** Quando o nome tinha matriz + filiais, como o sistema escolheu. */
  pickedBy?: PickedBy;
  /** Quantos cadastros existiam com esse mesmo nome. */
  candidateCount: number;
}

const brl = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

export default function ImportReportModal({ open, onClose, userId, clients, categories, onImported }: Props) {
  const [step, setStep] = useState<"upload" | "review">("upload");
  const [category, setCategory] = useState("");
  const [fileName, setFileName] = useState("");
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parsed, setParsed] = useState<ParsedReport | null>(null);
  const [rowStates, setRowStates] = useState<RowState[]>([]);
  /** 0 = última coluna de dinheiro da linha (normalmente o valor total do pedido). */
  const [valueIndex, setValueIndex] = useState(0);

  const reset = () => {
    setStep("upload");
    setCategory("");
    setFileName("");
    setParsed(null);
    setRowStates([]);
    setValueIndex(0);
    setIsParsing(false);
    setIsImporting(false);
  };

  const close = () => {
    if (isImporting) return;
    reset();
    onClose();
  };

  const panelRef = useRef<HTMLDivElement>(null);
  useModalEsc(close, open);
  useFocusTrap(panelRef, open);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!category) {
      toast.error("Escolha primeiro de qual representada é este relatório.");
      e.target.value = "";
      return;
    }
    if (!offlineCache.isOnline()) {
      toast.error("A importação de relatório precisa de internet. Tente novamente quando estiver online.");
      e.target.value = "";
      return;
    }

    setIsParsing(true);
    setFileName(file.name);
    try {
      const result = await parseOrderReportAny(file);
      if (!result.rows.length) {
        toast.error(result.warnings[0] || "Nenhum pedido foi reconhecido neste arquivo.");
        setIsParsing(false);
        e.target.value = "";
        return;
      }

      // Pedidos desta representada que já foram importados antes — não repetir
      const numbers = Array.from(new Set(result.rows.map(r => r.dbOrderNumber || r.orderNumber)));
      const already = new Set<string>();
      for (let i = 0; i < numbers.length; i += 200) {
        const { data } = await supabase
          .from("orders")
          .select("order_number")
          .eq("user_id", userId)
          .eq("category", category)
          .in("order_number", numbers.slice(i, i + 200));
        (data || []).forEach(o => o.order_number && already.add(String(o.order_number)));
      }

      setParsed(result);
      setRowStates(
        result.rows.map(row => {
          const m = matchClientByCnpjOrName(row.clientName, clients, row.cnpj);
          const duplicate = already.has(row.dbOrderNumber || row.orderNumber);
          return {
            include: !duplicate,
            clientId: m.clientId,
            createNew: false,
            status: m.status,
            duplicate,
            pickedBy: m.pickedBy,
            candidateCount: m.candidates.length,
          };
        })
      );
      setStep("review");
      if (result.warnings.length) result.warnings.forEach(w => toast.warning(w));
    } catch (err: any) {
      toast.error("Não consegui ler este arquivo: " + (err?.message || "erro desconhecido"));
    } finally {
      setIsParsing(false);
      e.target.value = "";
    }
  };

  const rows = parsed?.rows || [];

  /** Linhas prontas para importar: incluídas e com destino definido. */
  const readyIdxs = useMemo(
    () => rowStates.map((s, i) => (s.include && (s.clientId || s.createNew) ? i : -1)).filter(i => i >= 0),
    [rowStates]
  );

  const totals = useMemo(() => {
    const value = readyIdxs.reduce((sum, i) => sum + pickValue(rows[i], valueIndex), 0);
    return {
      count: readyIdxs.length,
      value,
      duplicates: rowStates.filter(s => s.duplicate).length,
      pending: rowStates.filter(s => s.include && !s.clientId && !s.createNew).length,
      newClients: new Set(
        rowStates.map((s, i) => (s.include && s.createNew ? normalizeName(rows[i].clientName) : "")).filter(Boolean)
      ).size,
    };
  }, [readyIdxs, rowStates, rows, valueIndex]);

  /** Soma de todas as linhas do relatório — serve para o usuário conferir com o PDF. */
  const grandTotal = useMemo(
    () => rows.reduce((sum, r) => sum + pickValue(r, valueIndex), 0),
    [rows, valueIndex]
  );

  const setRow = (idx: number, patch: Partial<RowState>) =>
    setRowStates(prev => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  /** Marca todas as linhas do mesmo cliente do relatório de uma vez. */
  const applyToSameName = (idx: number, patch: Partial<RowState>) => {
    const target = normalizeName(rows[idx].clientName);
    setRowStates(prev => prev.map((s, i) => (normalizeName(rows[i].clientName) === target ? { ...s, ...patch } : s)));
  };

  const handleImport = async () => {
    if (!readyIdxs.length) return;
    if (!offlineCache.isOnline()) {
      toast.error("Sem internet — a importação precisa estar online.");
      return;
    }
    setIsImporting(true);

    try {
      // 1. Cria os clientes novos (um por nome, mesmo aparecendo em vários pedidos)
      const toCreate = new Map<string, ParsedReportRow>();
      readyIdxs.forEach(i => {
        if (rowStates[i].createNew) {
          const key = normalizeName(rows[i].clientName);
          if (!toCreate.has(key)) toCreate.set(key, rows[i]);
        }
      });

      const createdByName = new Map<string, string>();
      if (toCreate.size) {
        const payload = Array.from(toCreate.values()).map(r => ({
          user_id: userId,
          name: r.clientName,
          city: r.city || null,
          state: r.state && r.state.length === 2 ? r.state : null,
          status: "Ativo",
        }));
        const { data: created, error } = await supabase.from("clients").insert(payload).select("id, name");
        if (error) throw new Error("Erro ao cadastrar os clientes novos: " + error.message);
        (created || []).forEach(c => createdByName.set(normalizeName(c.name), c.id));
      }

      // 2. Monta os pedidos
      const orders = readyIdxs
        .map(i => {
          const row = rows[i];
          const clientId = rowStates[i].createNew
            ? createdByName.get(normalizeName(row.clientName))
            : rowStates[i].clientId;
          if (!clientId) return null;
          return {
            user_id: userId,
            client_id: clientId,
            category,
            value: pickValue(row, valueIndex),
            order_number: row.dbOrderNumber || row.orderNumber,
            source: "report_import",
            file_name: fileName,
            created_at: orderDateToTimestamp(row.date),
            ...(row.notes ? { notes: row.notes } : {}),
            ...(row.paymentTerms ? { payment_terms: row.paymentTerms } : {}),
            ...(row.nfNumber ? { nf_number: row.nfNumber } : {}),
            ...(row.deliverySchedule ? { delivery_schedule: row.deliverySchedule } : {}),
            ...(row.deliveryDateIso ? { delivery_date: row.deliveryDateIso } : {}),
          };
        })
        .filter(Boolean) as any[];

      if (!orders.length) throw new Error("Nenhum pedido pôde ser vinculado a um cliente.");

      // 3. Insere em blocos; ignoreDuplicates evita erro se o mesmo pedido já existir
      let inserted = 0;
      for (let i = 0; i < orders.length; i += 100) {
        const chunk = orders.slice(i, i + 100);
        const { data, error } = await supabase
          .from("orders")
          .upsert(chunk, { onConflict: "user_id,category,order_number", ignoreDuplicates: true })
          .select("id");
        if (error) throw new Error("Erro ao gravar os pedidos: " + error.message);
        inserted += (data || []).length;
      }

      // 4. Atualiza o faturamento acumulado de cada cliente na representada
      const perClient = new Map<string, number>();
      orders.forEach(o => perClient.set(o.client_id, (perClient.get(o.client_id) || 0) + Number(o.value || 0)));
      const ids = Array.from(perClient.keys());
      const { data: currents } = await supabase.from("clients").select("id, faturamento").in("id", ids);
      await Promise.all(
        (currents || []).map(c => {
          const fat = { ...(c.faturamento || {}) };
          fat[category] = Number(fat[category] || 0) + (perClient.get(c.id) || 0);
          return supabase.from("clients").update({ faturamento: fat }).eq("id", c.id).eq("user_id", userId);
        })
      );

      toast.success(
        `${inserted} pedido${inserted === 1 ? "" : "s"} importado${inserted === 1 ? "" : "s"} em ${category}` +
          (toCreate.size ? ` · ${toCreate.size} cliente${toCreate.size === 1 ? "" : "s"} novo${toCreate.size === 1 ? "" : "s"}` : "")
      );
      onImported();
      close();
    } catch (err: any) {
      toast.error(err?.message || "Erro ao importar o relatório.");
    } finally {
      setIsImporting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
        className="absolute inset-0 bg-slate-900/90 backdrop-blur-2xl"
      />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Importar Relatório"
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-zinc-900 p-6 md:p-12 rounded-[40px] md:rounded-[60px] shadow-2xl relative z-10 w-full max-w-6xl h-[88vh] flex flex-col border border-white/10 overflow-hidden outline-none"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600" />

        <div className="flex justify-between items-start mb-6 md:mb-10 gap-4">
          <div className="min-w-0">
            <h3 className="text-2xl md:text-4xl font-black uppercase text-slate-900 dark:text-zinc-100 tracking-tighter">
              Importar Relatório
            </h3>
            <p className="text-slate-400 text-xs md:text-sm font-medium mt-1">
              {step === "upload"
                ? "Envie o relatório de pedidos da fábrica em PDF ou planilha (Excel)."
                : `${rows.length} pedidos lidos de ${fileName}`}
            </p>
          </div>
          <button
            onClick={close}
            disabled={isImporting}
            className="p-3 md:p-4 bg-slate-50 dark:bg-zinc-800 rounded-2xl md:rounded-3xl text-slate-400 hover:text-red-500 transition-all shadow-sm active:scale-90 disabled:opacity-40 shrink-0"
          >
            <X className="w-5 h-5 md:w-6 md:h-6" />
          </button>
        </div>

        {step === "upload" ? (
          <div className="flex-1 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
            <div>
              <label className="text-[9px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">
                De qual representada é este relatório?
              </label>
              <select
                value={category}
                onChange={e => setCategory(e.target.value)}
                className="w-full p-4 md:p-5 bg-slate-50 dark:bg-zinc-950 rounded-3xl font-black uppercase text-sm outline-none border border-slate-100 dark:border-zinc-800 focus:border-emerald-500 transition-all"
              >
                <option value="">Selecione a empresa...</option>
                {categories.filter(c => c && c !== "GERAL").map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              {!categories.filter(c => c && c !== "GERAL").length && (
                <p className="text-[11px] text-amber-600 font-bold mt-2 px-1">
                  Cadastre uma empresa antes de importar um relatório.
                </p>
              )}
            </div>

            <div
              className={cn(
                "flex-1 min-h-[240px] border-4 border-dashed rounded-[32px] md:rounded-[50px] flex flex-col items-center justify-center text-center p-6 md:p-12 transition-all relative overflow-hidden",
                category
                  ? "border-slate-100 dark:border-zinc-800 hover:bg-emerald-50/10 cursor-pointer group"
                  : "border-slate-100 dark:border-zinc-800 opacity-40"
              )}
            >
              <input
                type="file"
                accept=".pdf,.xlsx,.xls"
                disabled={!category || isParsing}
                onChange={handleFile}
                className="absolute inset-0 opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
              />
              <div className="p-8 md:p-12 bg-white dark:bg-zinc-900 rounded-[32px] md:rounded-[44px] shadow-2xl text-emerald-600 mb-6 group-hover:scale-110 transition-all duration-500">
                {isParsing ? <Loader2 className="w-12 h-12 md:w-16 md:h-16 animate-spin" /> : <Upload className="w-12 h-12 md:w-16 md:h-16" />}
              </div>
              <h4 className="text-lg md:text-xl font-black uppercase text-slate-900 dark:text-zinc-100 mb-2 tracking-tight">
                {isParsing ? "Lendo o relatório..." : "Selecione o PDF ou a planilha do relatório"}
              </h4>
              <p className="text-slate-400 text-xs md:text-sm max-w-md font-medium leading-relaxed">
                O sistema lê cliente, data e valor de cada pedido. Você confere tudo na tela seguinte antes de gravar.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            {/* Resumo + escolha da coluna de valor */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="p-4 rounded-3xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">A importar</p>
                <p className="text-xl font-black text-slate-900 dark:text-zinc-100 tabular-nums">{totals.count}</p>
              </div>
              <div className="p-4 rounded-3xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                <p className="text-[8px] font-black text-emerald-600 uppercase tracking-widest mb-1">Valor total</p>
                <p className="text-xl font-black text-emerald-700 dark:text-emerald-400 tabular-nums">{brl(totals.value)}</p>
              </div>
              <div className="p-4 rounded-3xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Já importados</p>
                <p className="text-xl font-black text-slate-500 tabular-nums">{totals.duplicates}</p>
              </div>
              <div className={cn(
                "p-4 rounded-3xl border",
                totals.pending
                  ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/40"
                  : "bg-slate-50 dark:bg-zinc-950 border-slate-100 dark:border-zinc-800"
              )}>
                <p className={cn("text-[8px] font-black uppercase tracking-widest mb-1", totals.pending ? "text-amber-600" : "text-slate-400")}>
                  Sem cliente
                </p>
                <p className={cn("text-xl font-black tabular-nums", totals.pending ? "text-amber-700 dark:text-amber-400" : "text-slate-500")}>
                  {totals.pending}
                </p>
              </div>
            </div>

            {(parsed?.valueColumnCount || 0) > 1 && (
              <div className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-2xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Qual coluna de valor usar</span>
                <div className="flex gap-2">
                  {Array.from({ length: Math.min(parsed?.valueColumnCount || 1, 3) }).map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setValueIndex(i)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all",
                        valueIndex === i
                          ? "bg-emerald-600 text-white shadow"
                          : "bg-white dark:bg-zinc-900 text-slate-500 border border-slate-200 dark:border-zinc-800"
                      )}
                    >
                      {i === 0 ? "Última" : i === 1 ? "Penúltima" : `${i + 1}ª da direita`}
                    </button>
                  ))}
                </div>
                <span className="text-[10px] font-bold text-slate-500 ml-auto tabular-nums">
                  Soma de todas as {rows.length} linhas: <span className="text-slate-900 dark:text-zinc-100">{brl(grandTotal)}</span>
                  <span className="text-slate-400 font-medium"> — confira com o total do PDF</span>
                </span>
              </div>
            )}

            {/* Tabela de conferência */}
            <div className="flex-1 overflow-y-auto custom-scrollbar rounded-3xl border border-slate-100 dark:border-zinc-800">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 dark:bg-zinc-950 text-slate-400 text-[9px] font-black uppercase tracking-widest z-10">
                  <tr>
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-3 py-3">Pedido</th>
                    <th className="px-3 py-3">Data</th>
                    <th className="px-3 py-3">Cliente no relatório</th>
                    <th className="px-3 py-3 min-w-[220px]">Cliente no sistema</th>
                    <th className="px-3 py-3 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                  {rows.map((row, idx) => {
                    const st = rowStates[idx];
                    if (!st) return null;
                    const resolved = !!st.clientId || st.createNew;
                    return (
                      <tr
                        key={`${row.orderNumber}-${idx}`}
                        className={cn(
                          "transition-colors",
                          !st.include ? "opacity-40" : resolved ? "" : "bg-amber-50/40 dark:bg-amber-950/10"
                        )}
                      >
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={st.include}
                            onChange={e => setRow(idx, { include: e.target.checked })}
                            className="w-4 h-4 accent-emerald-600 cursor-pointer"
                          />
                        </td>
                        <td className="px-3 py-2 text-[11px] font-bold text-slate-500 tabular-nums whitespace-nowrap">
                          {row.orderNumber}
                          {st.duplicate && (
                            <span className="ml-2 px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-zinc-800 text-slate-500 text-[8px] font-black uppercase">
                              já importado
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-bold text-slate-600 dark:text-zinc-300 tabular-nums whitespace-nowrap">
                          {row.rawDate}
                        </td>
                        <td className="px-3 py-2 text-[11px] font-bold text-slate-900 dark:text-zinc-100 max-w-[200px] truncate" title={row.clientName}>
                          {row.clientName}
                        </td>
                        <td className="px-3 py-2">
                          {st.createNew ? (
                            <div className="flex items-center gap-2">
                              <span className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 text-[9px] font-black uppercase tracking-wider">
                                <Sparkles className="w-3 h-3" /> Cadastrar novo
                              </span>
                              <button
                                onClick={() => applyToSameName(idx, { createNew: false })}
                                className="text-[9px] font-black text-slate-400 hover:text-slate-700 uppercase"
                              >
                                desfazer
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0">
                                <SearchableClientPicker
                                  clients={clients}
                                  value={st.clientId || ""}
                                  onChange={id => applyToSameName(idx, { clientId: id, createNew: false })}
                                />
                              </div>
                              {!st.clientId && (
                                <button
                                  onClick={() => applyToSameName(idx, { createNew: true, clientId: undefined })}
                                  title="Cadastrar este cliente na carteira"
                                  className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 hover:bg-emerald-100 transition-colors shrink-0"
                                >
                                  <UserPlus className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                          {st.pickedBy && st.clientId && !st.createNew && (
                            <p className="text-[9px] font-bold text-slate-400 mt-1 px-1 flex items-center gap-1">
                              <Building className="w-3 h-3" />
                              {st.pickedBy === "matriz" ? "Matriz escolhida" : "1º cadastro escolhido"}
                              {" · "}{st.candidateCount} cadastros com esse nome
                            </p>
                          )}
                          {!st.clientId && !st.createNew && (
                            <p className="text-[9px] font-bold text-amber-600 mt-1 px-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Cliente não encontrado na carteira
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right text-[12px] font-black text-slate-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
                          {brl(pickValue(row, valueIndex))}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col md:flex-row gap-3 pt-2">
              <button
                disabled={isImporting}
                onClick={reset}
                className="flex-1 py-4 md:py-5 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 rounded-[24px] font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
              >
                Trocar arquivo
              </button>
              <button
                disabled={isImporting || !totals.count}
                onClick={handleImport}
                className="flex-[2] py-4 md:py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[24px] font-black uppercase text-[10px] md:text-xs tracking-widest shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isImporting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Importando...</>
                ) : (
                  <><Check className="w-5 h-5" /> Importar {totals.count} pedidos · {brl(totals.value)}</>
                )}
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
