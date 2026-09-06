import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, FileText, Loader2, Truck, Hash, Receipt, CreditCard, CalendarDays, CalendarClock, StickyNote, Package, Scissors, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { cn } from "../lib/utils";
import { InlineEditField } from "./InlineEditField";
import { CommissionValue } from "./CommissionValue";
import { PdfViewerModal } from "./PdfViewerModal";
import { NfCommissionStatusDot, type NfCommissionStatus } from "./NfCommissionStatusDot";
import { OrderSplitPanel, valorDeQtd } from "./OrderSplitPanel";
import type { Order, OrderInstallment, OrderItem } from "../types";

interface OrderDetailModalProps {
  order: Order | null;
  isOpen: boolean;
  onClose: () => void;
  /** O card/tabela que abriu o modal já tem o pedido na tela — em vez de
   *  recarregar a lista inteira, só repassa o que mudou pra ele atualizar
   *  localmente. */
  onUpdated: (orderId: string, patch: Partial<Order>) => void;
  /** `settings.commissions` — percentual configurado por empresa representada,
   *  mesmo usado na tela de Comissões, só pra mostrar quanto cada parcela
   *  vale de comissão (informativo, não grava nada). */
  commissions: Record<string, number>;
  /** Chamado depois de um desmembramento confirmado — o pedido novo não dá
   *  pra "patchear" na lista existente (onUpdated só edita uma linha), então
   *  quem abriu o modal recarrega tudo (mesma função já usada depois de
   *  outras mutações na página, ex. `onImported` do ImportReportModal). */
  onOrderCreated?: () => void;
}

const formatBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);
const toDateInputValue = (v: string | null | undefined) => (v ? String(v).match(/^\d{4}-\d{2}-\d{2}/)?.[0] || "" : "");

export function OrderDetailModal({ order, isOpen, onClose, onUpdated, commissions, onOrderCreated }: OrderDetailModalProps) {
  const [installments, setInstallments] = useState<OrderInstallment[]>([]);
  const [loadingInstallments, setLoadingInstallments] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [splitting, setSplitting] = useState(false);

  useEffect(() => {
    if (!isOpen || !order) { setInstallments([]); return; }
    let cancelled = false;
    setLoadingInstallments(true);
    (async () => {
      const { data } = await supabase
        .from("order_installments")
        .select("*")
        .eq("order_id", order.id)
        .order("installment_number");
      if (cancelled) return;
      setInstallments((data as OrderInstallment[]) || []);
      setLoadingInstallments(false);
    })();
    return () => { cancelled = true; };
    // Reconsulta cada vez que o modal abre pra um pedido — inclusive depois
    // de editar payment_terms/valor/datas aqui dentro, que regeneram as
    // parcelas no banco (ver reloadInstallments abaixo).
  }, [isOpen, order?.id]);

  useEffect(() => {
    if (!isOpen || !order) { setItems([]); setSplitting(false); return; }
    let cancelled = false;
    setLoadingItems(true);
    (async () => {
      const { data } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", order.id)
        .order("product_name");
      if (cancelled) return;
      setItems((data as OrderItem[]) || []);
      setLoadingItems(false);
    })();
    return () => { cancelled = true; };
  }, [isOpen, order?.id]);

  if (!order) return null;

  const reloadInstallments = async () => {
    const { data } = await supabase.from("order_installments").select("*").eq("order_id", order.id).order("installment_number");
    setInstallments((data as OrderInstallment[]) || []);
  };

  const reloadItems = async () => {
    const { data } = await supabase.from("order_items").select("*").eq("order_id", order.id).order("product_name");
    setItems((data as OrderItem[]) || []);
  };

  const handleSplitDone = async (novoValor: number) => {
    onUpdated(order.id, { value: novoValor });
    await Promise.all([reloadItems(), reloadInstallments()]);
    onOrderCreated?.();
    setSplitting(false);
  };

  /** Soma real dos itens que sobraram e grava em `orders.value` — o UPDATE
   *  na coluna já dispara sozinho o trigger que recalcula as parcelas. */
  const recalcOrderValue = async () => {
    const { data } = await supabase.from("order_items").select("total_value").eq("order_id", order.id);
    const novoValor = (data || []).reduce((sum, r: any) => sum + (Number(r.total_value) || 0), 0);
    const { error } = await supabase.from("orders").update({ value: novoValor }).eq("id", order.id);
    if (error) { toast.error("Erro ao recalcular o valor do pedido."); return; }
    onUpdated(order.id, { value: novoValor });
    await reloadInstallments();
  };

  const saveItemQuantity = async (item: OrderItem, rawQty: string) => {
    const qty = Math.max(1, Math.round(parseFloat(rawQty)) || 1);
    if (qty === item.quantity) return;
    const novoTotal = item.unit_value != null ? item.unit_value * qty : valorDeQtd(item, qty);
    const { error } = await supabase.from("order_items").update({ quantity: qty, total_value: novoTotal }).eq("id", item.id);
    if (error) { toast.error("Erro ao salvar a quantidade."); return; }
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, quantity: qty, total_value: novoTotal } : i)));
    await recalcOrderValue();
  };

  const deleteItem = async (item: OrderItem) => {
    const { error } = await supabase.from("order_items").delete().eq("id", item.id);
    if (error) { toast.error("Erro ao remover o item."); return; }
    setItems((prev) => prev.filter((i) => i.id !== item.id));
    await recalcOrderValue();
  };

  /** Campos que alimentam o trigger de regeneração de parcelas — depois de
   *  gravar, busca as parcelas de novo em vez de confiar no estado antigo. */
  const REGENERATING_FIELDS = new Set(["value", "payment_terms", "invoice_date", "created_at"]);

  const saveField = async (field: keyof Order, rawValue: string) => {
    const value: string | number | null = field === "value" ? parseFloat(rawValue) || 0 : rawValue || null;
    const patch: Partial<Order> = field === "created_at" && value ? { created_at: new Date(`${value}T12:00:00`).toISOString() } : { [field]: value } as Partial<Order>;

    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    if (error) throw error;
    onUpdated(order.id, patch);
    if (REGENERATING_FIELDS.has(field)) await reloadInstallments();
  };

  const saveNfStatus = async (status: NfCommissionStatus) => {
    const { error } = await supabase.from("orders").update({ nf_commission_status: status }).eq("id", order.id);
    if (error) { toast.error("Erro ao atualizar status da NF."); return; }
    onUpdated(order.id, { nf_commission_status: status });
  };

  const saveInstallment = async (installment: OrderInstallment, field: "due_date" | "value", rawValue: string) => {
    const value = field === "value" ? parseFloat(rawValue) || 0 : rawValue;
    const { error } = await supabase.from("order_installments").update({ [field]: value }).eq("id", installment.id);
    if (error) throw error;
    setInstallments((prev) => prev.map((i) => (i.id === installment.id ? { ...i, [field]: value } : i)));
  };

  const openFile = async () => {
    if (!order.file_path) return;
    const { data, error } = await supabase.storage.from("client_vault").createSignedUrl(order.file_path, 60 * 60);
    if (error || !data) { toast.error("Não foi possível abrir o arquivo."); return; }
    setPdfPreview({ url: data.signedUrl, name: order.file_name || "pedido" });
  };

  const pct = Number(commissions[order.category] ?? 0);
  const inputCls = "w-full bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-bold text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400";

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="relative z-10 w-full max-w-2xl max-h-[88vh] overflow-y-auto custom-scrollbar bg-white dark:bg-zinc-900 rounded-[32px] shadow-2xl border border-slate-100 dark:border-zinc-800"
          >
            <div className="sticky top-0 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md px-6 md:px-8 py-6 border-b border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-4 z-10">
              <div className="min-w-0">
                <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest mb-1">{order.category}</p>
                <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate">{order.client?.name || "Cliente desconhecido"}</h3>
                <p className="text-xs font-bold text-slate-400 mt-1 tabular-nums">{formatBRL(order.value)}</p>
              </div>
              <button onClick={onClose} className="p-2.5 bg-slate-50 dark:bg-zinc-800 rounded-2xl text-slate-400 hover:text-red-500 transition-all shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><CalendarDays className="w-3 h-3" /> Data do pedido</label>
                  <input type="date" defaultValue={toDateInputValue(order.created_at)} onBlur={(e) => e.target.value && saveField("created_at", e.target.value).catch((err) => toast.error(err.message))} className={inputCls} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><Truck className="w-3 h-3" /> Data de entrega</label>
                  <input type="date" defaultValue={toDateInputValue(order.delivery_date)} onBlur={(e) => saveField("delivery_date", e.target.value).catch((err) => toast.error(err.message))} className={inputCls} />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><Hash className="w-3 h-3" /> Nº da NF</label>
                  <div className="flex items-center gap-2">
                    <NfCommissionStatusDot status={order.nf_commission_status} onChange={saveNfStatus} />
                    <input type="text" defaultValue={order.nf_number || ""} onBlur={(e) => saveField("nf_number", e.target.value).catch((err) => toast.error(err.message))} placeholder="Nº da nota fiscal" className={cn(inputCls, "flex-1")} />
                  </div>
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><Receipt className="w-3 h-3" /> Data de faturamento</label>
                  <input type="date" defaultValue={toDateInputValue(order.invoice_date)} onBlur={(e) => saveField("invoice_date", e.target.value).catch((err) => toast.error(err.message))} className={inputCls} />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><CalendarClock className="w-3 h-3" /> Agenda da entrega</label>
                  <input
                    type="text"
                    defaultValue={order.delivery_schedule || ""}
                    onBlur={(e) => saveField("delivery_schedule", e.target.value).catch((err) => toast.error(err.message))}
                    placeholder='Ex.: "Manhã, portão B" ou "14h com o motorista"'
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><CreditCard className="w-3 h-3" /> Condição de pagamento</label>
                  <input
                    type="text"
                    defaultValue={order.payment_terms || ""}
                    onBlur={(e) => saveField("payment_terms", e.target.value).then(() => toast.success("Parcelas recalculadas.")).catch((err) => toast.error(err.message))}
                    placeholder='Ex.: "30/60/90" — vazio ou "à vista" = pagamento único'
                    className={inputCls}
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5"><StickyNote className="w-3 h-3" /> Observações</label>
                  <textarea
                    defaultValue={order.notes || ""}
                    onBlur={(e) => saveField("notes", e.target.value).catch((err) => toast.error(err.message))}
                    placeholder="Aparece direto no card, sem precisar abrir o pedido"
                    rows={2}
                    className={cn(inputCls, "resize-none")}
                  />
                </div>
              </div>

              {!loadingItems && items.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                      <Package className="w-3 h-3" /> Itens do pedido
                    </p>
                    {!splitting && (
                      <button
                        onClick={() => setSplitting(true)}
                        className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-emerald-600 hover:text-emerald-700"
                      >
                        <Scissors className="w-3 h-3" /> Desmembrar pedido
                      </button>
                    )}
                  </div>

                  {splitting ? (
                    <OrderSplitPanel
                      order={order}
                      items={items}
                      userId={order.user_id}
                      onCancel={() => setSplitting(false)}
                      onDone={handleSplitDone}
                    />
                  ) : (
                    <div className="rounded-2xl border border-slate-100 dark:border-zinc-800 overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-400">
                          <tr>
                            <th className="text-left font-black uppercase tracking-widest px-4 py-2.5">Produto</th>
                            <th className="text-right font-black uppercase tracking-widest px-4 py-2.5">Qtd.</th>
                            <th className="text-right font-black uppercase tracking-widest px-4 py-2.5">Total</th>
                            <th className="px-2 py-2.5 w-8" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                          {items.map((item) => (
                            <tr key={item.id} className="text-slate-700 dark:text-zinc-300">
                              <td className="px-4 py-2 font-bold max-w-[220px] truncate" title={item.product_name}>{item.product_name}</td>
                              <td className="px-4 py-2 text-right">
                                <input
                                  type="number"
                                  min={1}
                                  defaultValue={item.quantity}
                                  onBlur={(e) => saveItemQuantity(item, e.target.value)}
                                  className="w-16 text-right bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-zinc-700 focus:border-emerald-400 focus:bg-white dark:focus:bg-zinc-900 rounded-lg px-2 py-1 tabular-nums outline-none transition-colors"
                                />
                              </td>
                              <td className="px-4 py-2 text-right font-black tabular-nums">{formatBRL(Number(item.total_value) || 0)}</td>
                              <td className="px-2 py-2 text-right">
                                <button onClick={() => deleteItem(item)} className="p-1 text-slate-300 hover:text-red-500 transition-colors" title="Remover item">
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Parcelas e comissão</p>
                  {pct > 0 && <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">{pct}% de comissão</p>}
                </div>
                <div className="rounded-2xl border border-slate-100 dark:border-zinc-800 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-zinc-800/50 text-slate-400">
                      <tr>
                        <th className="text-left font-black uppercase tracking-widest px-4 py-2.5">Parcela</th>
                        <th className="text-left font-black uppercase tracking-widest px-4 py-2.5">Vencimento</th>
                        <th className="text-right font-black uppercase tracking-widest px-4 py-2.5">Valor</th>
                        <th className="text-right font-black uppercase tracking-widest px-4 py-2.5">Comissão</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-zinc-800">
                      {loadingInstallments ? (
                        <tr><td colSpan={4} className="px-4 py-6 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-slate-300" /></td></tr>
                      ) : installments.length === 0 ? (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-slate-400">Sem parcelas.</td></tr>
                      ) : (
                        installments.map((inst) => (
                          <tr key={inst.id} className="text-slate-700 dark:text-zinc-300">
                            <td className="px-4 py-2 font-black">{inst.installment_number}/{installments.length}</td>
                            <td className="px-4 py-2">
                              <InlineEditField type="date" value={inst.due_date} onSave={(v) => saveInstallment(inst, "due_date", v)} label={`Vencimento da parcela ${inst.installment_number}`} />
                            </td>
                            <td className="px-4 py-2 text-right">
                              <InlineEditField type="currency" value={inst.value} onSave={(v) => saveInstallment(inst, "value", v)} label={`Valor da parcela ${inst.installment_number}`} className="justify-end" />
                            </td>
                            <td className="px-4 py-2 text-right font-black text-emerald-600 tabular-nums">
                              <CommissionValue>{formatBRL((Number(inst.value) || 0) * (pct / 100))}</CommissionValue>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {order.file_path && (
                <button onClick={openFile} className="w-full flex items-center justify-center gap-2 py-3.5 bg-slate-50 dark:bg-zinc-800 hover:bg-slate-100 dark:hover:bg-zinc-700 rounded-2xl text-xs font-black text-slate-600 dark:text-zinc-300 uppercase tracking-widest transition-all">
                  <FileText className="w-4 h-4" /> Ver arquivo do pedido
                </button>
              )}
            </div>
          </motion.div>
        </div>
      )}

      <PdfViewerModal isOpen={!!pdfPreview} onClose={() => setPdfPreview(null)} url={pdfPreview?.url ?? null} fileName={pdfPreview?.name} />
    </AnimatePresence>
  );
}
