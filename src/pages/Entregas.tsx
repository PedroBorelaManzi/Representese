import React, { useEffect, useMemo, useState } from "react";
import { Search, Truck, Loader2, Settings2, Check, Clock } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { PageHeader } from "../components/ui";
import { InlineEditField } from "../components/InlineEditField";
import { OrderDetailModal } from "../components/OrderDetailModal";
import type { Order } from "../types";

const formatBRL = (n: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n || 0);

/** Área "Entregas" — mesma lista de pedidos de Pedidos.tsx/Empresas.tsx, só
 *  que com foco no acompanhamento pós-venda: entrega, NF e faturamento,
 *  todos editáveis direto na tabela, sem precisar abrir o pedido. Clicar no
 *  nome do pedido (não nas outras colunas) abre o OrderDetailModal, que é
 *  onde ficam a condição de pagamento e as parcelas/comissão. */
export default function EntregasPage() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const companies = useMemo(() => (settings?.categories || []).filter((c) => c && c.trim()), [settings?.categories]);
  const [configOpen, setConfigOpen] = useState(false);
  const [draftDeliveryDays, setDraftDeliveryDays] = useState<Record<string, string>>({});
  const [savingConfig, setSavingConfig] = useState(false);

  useEffect(() => {
    if (configOpen) {
      const draft: Record<string, string> = {};
      companies.forEach((c) => {
        const dias = settings?.delivery_lead_days?.[c];
        draft[c] = dias ? String(dias) : "";
      });
      setDraftDeliveryDays(draft);
    }
  }, [configOpen, companies, settings?.delivery_lead_days]);

  const saveDeliveryConfig = async () => {
    setSavingConfig(true);
    try {
      const merged = { ...(settings?.delivery_lead_days || {}) };
      companies.forEach((c) => {
        const parsed = parseInt(draftDeliveryDays[c], 10);
        if (draftDeliveryDays[c]?.trim() && isFinite(parsed) && parsed > 0) {
          merged[c] = parsed;
        } else {
          delete merged[c];
        }
      });
      await updateSettings({ delivery_lead_days: merged });
      toast.success("Prazos de entrega salvos!");
      setConfigOpen(false);
    } catch {
      toast.error("Erro ao salvar os prazos de entrega.");
    } finally {
      setSavingConfig(false);
    }
  };

  useEffect(() => { if (user) loadData(); }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from("orders")
        .select("*, client:clients(id, name, cnpj, city, state)")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });
      setOrders((data as Order[]) || []);
    } finally {
      setLoading(false);
    }
  };

  const patchOrder = (orderId: string, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  };

  const saveOrderField = (order: Order, field: keyof Order) => async (rawValue: string) => {
    const value: string | number | null = field === "value" ? parseFloat(rawValue) || 0 : rawValue || null;
    const { error } = await supabase.from("orders").update({ [field]: value }).eq("id", order.id);
    if (error) throw error;
    patchOrder(order.id, { [field]: value } as Partial<Order>);
  };

  const filteredOrders = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    if (!termo) return orders;
    return orders.filter(
      (o) => o.client?.name?.toLowerCase().includes(termo) || o.category?.toLowerCase().includes(termo) || o.nf_number?.toLowerCase().includes(termo)
    );
  }, [orders, searchTerm]);

  return (
    <div className="h-full flex flex-col gap-6 md:gap-10 pb-20 overflow-x-hidden">
      <PageHeader
        icon={Truck}
        className="mb-0 lg:mb-0"
        title="Entregas"
        subtitle="Entrega, NF e faturamento de cada pedido"
        actions={
          <button
            onClick={() => setConfigOpen(true)}
            className="px-4 py-2.5 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all flex items-center gap-2"
          >
            <Settings2 className="w-4 h-4" />
            Configurar entregas
          </button>
        }
      />

      <div className="bg-white dark:bg-zinc-950 rounded-[32px] md:rounded-[48px] border border-slate-100 dark:border-zinc-850 shadow-sm overflow-hidden flex flex-col flex-1">
        <div className="p-4 md:p-8 border-b border-slate-50 dark:border-zinc-850 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30 dark:bg-zinc-950/20">
          <div className="relative group flex-1 max-w-md">
            <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar por cliente, empresa ou NF..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-12 md:pl-14 pr-6 md:pr-8 py-3.5 md:py-5 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl md:rounded-[28px] text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-zinc-100 outline-none transition-all placeholder:text-slate-300 shadow-sm"
            />
          </div>
          <div className="h-10 md:h-14 px-4 md:px-6 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl md:rounded-2xl flex items-center gap-2 md:gap-3 shadow-sm">
            <span className="text-[8px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total:</span>
            <span className="text-xs md:text-sm font-black text-slate-900 dark:text-zinc-100">{filteredOrders.length}</span>
          </div>
        </div>

        {loading ? (
          <div className="py-20 flex items-center justify-center"><Loader2 className="w-6 h-6 animate-spin text-slate-300" /></div>
        ) : (
          <>
            <div className="hidden md:block flex-1 overflow-x-auto custom-scrollbar">
              <div className="min-w-[1000px]">
                <div className="grid grid-cols-12 px-8 py-6 border-b border-slate-50 dark:border-zinc-850 bg-slate-50/10 dark:bg-zinc-900 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <div className="col-span-3">Pedido</div>
                  <div className="col-span-2">Data</div>
                  <div className="col-span-2">Data de entrega</div>
                  <div className="col-span-2 text-right">Valor</div>
                  <div className="col-span-1">Nº NF</div>
                  <div className="col-span-2">Data de faturamento</div>
                </div>
                <div className="divide-y divide-slate-50 dark:divide-zinc-850">
                  {filteredOrders.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center justify-center gap-4 opacity-50">
                      <Truck className="w-12 h-12 text-slate-200" />
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Nenhum pedido encontrado</p>
                    </div>
                  ) : (
                    filteredOrders.map((order, i) => (
                      <motion.div
                        key={order.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: Math.min(i * 0.03, 0.6) }}
                        className="grid grid-cols-12 px-8 py-5 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-all items-center"
                      >
                        <button onClick={() => setSelectedOrder(order)} className="col-span-3 text-left min-w-0 pr-2 group">
                          <p className="text-xs font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate group-hover:text-emerald-600 transition-colors">
                            {order.client?.name || "Cliente desconhecido"}
                          </p>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate mt-0.5">{order.category}</p>
                        </button>
                        <div className="col-span-2 text-xs">
                          <InlineEditField type="date" value={order.created_at} onSave={saveOrderField(order, "created_at")} label="Data do pedido" />
                        </div>
                        <div className="col-span-2 text-xs">
                          <InlineEditField type="date" value={order.delivery_date} onSave={saveOrderField(order, "delivery_date")} label="Data de entrega" />
                        </div>
                        <div className="col-span-2 text-xs text-right">
                          <InlineEditField type="currency" value={order.value} onSave={saveOrderField(order, "value")} label="Valor do pedido" className="justify-end" />
                        </div>
                        <div className="col-span-1 text-xs">
                          <InlineEditField type="text" value={order.nf_number} onSave={saveOrderField(order, "nf_number")} label="Número da NF" placeholder="NF" />
                        </div>
                        <div className="col-span-2 text-xs">
                          <InlineEditField type="date" value={order.invoice_date} onSave={saveOrderField(order, "invoice_date")} label="Data de faturamento" />
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="md:hidden flex-1 overflow-y-auto p-4 space-y-4 pb-12">
              {filteredOrders.length === 0 ? (
                <div className="py-16 text-center flex flex-col items-center justify-center gap-4 opacity-50">
                  <Truck className="w-12 h-12 text-slate-200" />
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Nenhum pedido encontrado</p>
                </div>
              ) : (
                filteredOrders.map((order, i) => (
                  <motion.div
                    key={order.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.6) }}
                    className="bg-white dark:bg-zinc-900 p-5 rounded-[28px] border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col gap-3"
                  >
                    <button onClick={() => setSelectedOrder(order)} className="text-left">
                      <p className="text-xs font-black text-slate-900 dark:text-zinc-100 uppercase truncate">{order.client?.name || "Cliente desconhecido"}</p>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{order.category} · {formatBRL(order.value)}</p>
                    </button>
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-50 dark:border-zinc-800">
                      <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Data</p>
                        <InlineEditField type="date" value={order.created_at} onSave={saveOrderField(order, "created_at")} label="Data do pedido" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Entrega</p>
                        <InlineEditField type="date" value={order.delivery_date} onSave={saveOrderField(order, "delivery_date")} label="Data de entrega" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Nº NF</p>
                        <InlineEditField type="text" value={order.nf_number} onSave={saveOrderField(order, "nf_number")} label="Número da NF" placeholder="NF" />
                      </div>
                      <div>
                        <p className="text-[8px] font-black text-slate-300 uppercase tracking-widest mb-1">Faturamento</p>
                        <InlineEditField type="date" value={order.invoice_date} onSave={saveOrderField(order, "invoice_date")} label="Data de faturamento" />
                      </div>
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={patchOrder}
        commissions={settings?.commissions || {}}
      />

      {/* Painel de configuração: prazo de entrega padrão por empresa */}
      <AnimatePresence>
        {configOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setConfigOpen(false)}
              className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40"
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.98 }}
              className="fixed inset-x-4 top-1/2 -translate-y-1/2 md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[460px] max-h-[80vh] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl z-50 flex flex-col overflow-hidden border border-slate-200 dark:border-zinc-800"
            >
              <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800">
                <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Prazo de entrega padrão</h3>
                <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 mt-0.5">
                  Em dias, a partir da data do pedido. Pedido novo dessa empresa já nasce com a data de entrega
                  calculada sozinha — em branco, fica pra você preencher manualmente em cada pedido.
                </p>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                {companies.length === 0 ? (
                  <div className="text-center py-8 text-sm font-bold text-slate-400 dark:text-zinc-500">
                    Nenhuma empresa representada cadastrada ainda.
                    <br />
                    Cadastre na aba Empresas.
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {companies.map((c) => (
                      <div key={c} className="flex items-center gap-3">
                        <div className="flex-1 text-sm font-bold text-slate-700 dark:text-zinc-200 truncate">{c}</div>
                        <div className="relative w-28">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            placeholder="—"
                            value={draftDeliveryDays[c] ?? ""}
                            onChange={(e) =>
                              setDraftDeliveryDays((prev) => ({ ...prev, [c]: e.target.value }))
                            }
                            className="w-full pl-3 pr-8 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl text-sm font-black text-right outline-none focus:ring-2 focus:ring-emerald-500"
                          />
                          <Clock className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800 flex gap-3">
                <button
                  onClick={() => setConfigOpen(false)}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest text-slate-500 dark:text-zinc-400 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={saveDeliveryConfig}
                  disabled={savingConfig || companies.length === 0}
                  className="flex-1 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
