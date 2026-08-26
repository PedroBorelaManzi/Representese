import { useUpload } from '../contexts/UploadContext';
import React, { useState, useEffect, useMemo } from "react";
import { Plus, Search, FileText, Upload, Loader2, ShoppingBag, Trash2, ArrowUpRight, TrendingUp, DollarSign, Calendar, ChevronRight, X, Sparkles, Navigation, UserCog, UserPlus, ChevronLeft, Truck } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { posthog } from "../lib/posthog";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { processOrderFile } from "../lib/orderProcessor";
import { getHighPrecisionCoordinates } from "../lib/geminiGeocoding";
import { cn } from "../lib/utils";
import { ajustarFaturamento } from "../lib/faturamento";
import { salvarItensDoPedido } from "../lib/orderItems";
import { PageHeader, useConfirm } from "../components/ui";
import { InlineEditField } from "../components/InlineEditField";
import { OrderDetailModal } from "../components/OrderDetailModal";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Client, Order } from "../types";
import { normalizar, type ItemExtraido } from "../lib/orderExtractionCore";

interface BatchResult {
  file: File;
  client: string;
  category: string;
  value: number;
  needsNewClient: boolean;
  clientId?: string;
  address?: string;
  cnpj?: string;
  items?: ItemExtraido[];
  paymentTerms?: string;
}

interface AnalysisResult {
  client: string;
  cnpj?: string;
  address?: string;
  category?: string;
  value?: number;
  status?: string;
  items?: ItemExtraido[];
  paymentTerms?: string;
}

export default function PedidosPage() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { drafts, setDraft, clearDraft } = useUpload();
  const manualDraft = drafts["manual_order"] || { file: null, category: "", value: "", isOpen: false, clientId: "" };
  
  const selectedFile = manualDraft.file;
  const selectedCategory = manualDraft.category;
  const orderValue = manualDraft.value;
  const isManualModalOpen = manualDraft.isOpen;
  const selectedClient = (manualDraft as { clientId?: string }).clientId || "";

  const setSelectedFile = (file: File | null) => setDraft("manual_order", { file });
  const setSelectedCategory = (category: string) => setDraft("manual_order", { category });
  const setOrderValue = (value: string) => setDraft("manual_order", { value });
  const setIsManualModalOpen = (isOpen: boolean) => setDraft("manual_order", { isOpen });
  const setSelectedClient = (clientId: string) => setDraft("manual_order", { clientId } as any);
  
  const [orders, setOrders] = useState<Order[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  const [isSaving, setIsSaving] = useState(false);
  const [isAnalyzingManual, setIsAnalyzingManual] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [showNewClientForm, setShowNewClientForm] = useState(false);
  const [showClientPicker, setShowClientPicker] = useState(false);
  const [clientPickerSearch, setClientPickerSearch] = useState("");
  const [manualClientName, setManualClientName] = useState("");
  const [manualClientCnpj, setManualClientCnpj] = useState("");
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [isProcessingBatch, setIsProcessingBatch] = useState(false);
  const [viewDate] = useState(new Date());
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  useEffect(() => { if (user) { loadData();  } }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: o } = await supabase.from("orders").select("*, client:clients(id, name, cnpj, city, state)").eq("user_id", user?.id).order("created_at", { ascending: false });
      const { data: c } = await supabase.from("clients").select("id, name, cnpj").eq("user_id", user?.id).order("name");
      setOrders((o as Order[]) || []); 
      setClients((c as Client[]) || []);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setLoading(false);
    }
  };

  const registerNewClient = async (name: string, cnpj: string, address: string) => {
    const cleanCnpj = cnpj ? cnpj.replace(/\D/g, "") : "";
    const cleanName = name?.trim();
    if (cleanCnpj) {
      const { data: existing } = await supabase.from("clients").select("id").eq("cnpj", cleanCnpj).eq("user_id", user?.id).maybeSingle();
      if (existing) return existing;
    }
    if (cleanName) {
      const { data: existingName } = await supabase.from("clients").select("id").eq("name", cleanName).eq("user_id", user?.id).maybeSingle();
      if (existingName) return existingName;
    }
    let lat = -23.5505, lng = -46.6333;
    if (address) { try { const coords = await getHighPrecisionCoordinates(address, name, cnpj); if (coords) { lat = coords.lat; lng = coords.lng; } } catch (e) {} }
    const { data, error } = await supabase.from("clients").insert([{ user_id: user?.id, name: cleanName, cnpj: cleanCnpj, address: address || "", lat, lng, status: "Ativo" }]).select().single();
    if (error) throw error; loadData(); return data;
  };

  const handleManualFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setSelectedFile(file); setIsAnalyzingManual(true);
    setShowClientPicker(false); setClientPickerSearch("");
    try {
      const result = await processOrderFile(file, clients.map(c => c.name), settings.categories || []);
      if (result.status === "ready") {
        setAnalysisResult(result); setOrderValue(result.value?.toString() || "");
        const cleanResCnpj = result.cnpj?.replace(/\D/g, "");
        const cleanResName = result.client?.trim().toLowerCase();
        const match = clients.find(c => {
          const clientCnpj = c.cnpj?.replace(/\D/g, "");
          const clientName = c.name?.trim().toLowerCase();
          return (cleanResCnpj && clientCnpj === cleanResCnpj) || (clientName && clientName === cleanResName);
        });
        // Sem "Desconhecido" da IA virando nome de cliente novo por descuido.
        setManualClientName(result.client && result.client !== "Desconhecido" ? result.client : "");
        setManualClientCnpj(result.cnpj || "");
        if (match) {
          setSelectedClient(match.id); setShowNewClientForm(false);
        } else if (cleanResCnpj?.length === 14) {
          // CNPJ de 14 dígitos que não bateu em nenhum cliente cadastrado é
          // prova de que esse CNPJ realmente não existe ainda — vai direto
          // pro cadastro de cliente novo, já preenchido: confirmar o pedido
          // cria o cliente e liga o pedido a ele na mesma hora, sem precisar
          // procurar algo que não existe.
          setSelectedClient(""); setShowClientPicker(false); setShowNewClientForm(true);
        } else {
          // Sem CNPJ pra provar que é novo, abre a busca na lista em vez de
          // já cair em "cliente novo" — pode ser cliente já cadastrado que a
          // IA só não reconheceu a grafia.
          setSelectedClient(""); setShowNewClientForm(false); setShowClientPicker(true);
        }
        if (result.category) {
          const catMatch = (settings.categories || []).find((cat: string) => cat.toLowerCase().includes(result.category.toLowerCase()));
          if (catMatch) setSelectedCategory(catMatch);
        }
      }
    } catch (err) {} finally { setIsAnalyzingManual(false); }
  };

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!user || !selectedCategory || !orderValue || !selectedFile) return;
    if (showNewClientForm && !manualClientName.trim()) { toast.error("Informe o nome do cliente."); return; }
    if (!showNewClientForm && !selectedClient) { toast.error("Selecione um cliente."); return; }
    setIsSaving(true);
    try {
      let cid = selectedClient;
      if (showNewClientForm) {
        const n = await registerNewClient(manualClientName.trim(), manualClientCnpj || "", analysisResult?.address || "");
        if (n) cid = n.id;
      } else if (cid && analysisResult?.cnpj) {
        // Mem\u00f3ria de cliente: documento trouxe um CNPJ e o cadastro escolhido
        // ainda n\u00e3o tinha nenhum \u2014 grava agora, sem perguntar de novo. \u00c9 o
        // que faz o PR\u00d3XIMO pedido desse cliente j\u00e1 vir reconhecido sozinho.
        // S\u00f3 quando est\u00e1 vazio: nunca sobrescreve um CNPJ j\u00e1 cadastrado.
        const escolhido = clients.find(c => c.id === cid);
        const cleanCnpj = analysisResult.cnpj.replace(/\D/g, "");
        if (escolhido && !escolhido.cnpj && cleanCnpj.length === 14) {
          await supabase.from("clients").update({ cnpj: cleanCnpj }).eq("id", cid).eq("user_id", user.id);
        }
      }
      const cleanName = selectedFile.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");
      const formattedName = `${selectedCategory}___VALOR_${orderValue}___${cleanName}`;
      const path = `${user.id}/${cid}/${formattedName}`;
      await supabase.storage.from("client_vault").upload(path, selectedFile, { upsert: true });
      const { data: orderRow } = await supabase.from("orders").upsert([{
        user_id: user.id, client_id: cid, category: selectedCategory, value: parseFloat(orderValue),
        file_name: formattedName, file_path: path,
        payment_terms: analysisResult?.paymentTerms || null,
      }], { onConflict: "client_id,file_path" }).select("id, created_at").single();
      const { data: clientData } = await supabase.from("clients").select("faturamento").eq("id", cid).single();
      if (clientData) {
        const updatedFat = ajustarFaturamento(clientData.faturamento, selectedCategory, parseFloat(orderValue));
        await supabase.from("clients").update({ faturamento: updatedFat }).eq("id", cid).eq("user_id", user?.id);
      }
      if (orderRow && analysisResult?.items?.length) {
        await salvarItensDoPedido(supabase, {
          userId: user.id, orderId: orderRow.id, clientId: cid, category: selectedCategory,
          orderDate: orderRow.created_at, items: analysisResult.items,
        });
      }
      setIsManualModalOpen(false); loadData();
      toast.success("Pedido registrado com sucesso!");
      posthog.capture('order_logged', { category: selectedCategory });
      clearDraft("manual_order");
      setShowNewClientForm(false); setShowClientPicker(false); setClientPickerSearch("");
      setManualClientName(""); setManualClientCnpj(""); setAnalysisResult(null);
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro desconhecido'); } finally { setIsSaving(false); }
  };

  const handleBatchUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); setIsProcessingBatch(true);
    for (const file of files) {
      try {
        const res = await processOrderFile(file, clients.map(c => c.name), settings.categories || []);
        const cleanResCnpj = res.cnpj?.replace(/\D/g, "");
        const cleanResName = res.client?.trim().toLowerCase();
        const match = clients.find(c => {
          const clientCnpj = c.cnpj?.replace(/\D/g, "");
          const clientName = c.name?.trim().toLowerCase();
          return (cleanResCnpj && clientCnpj === cleanResCnpj) || (clientName && clientName === cleanResName);
        });
        setBatchResults(prev => [...prev, { file, client: res.client, category: res.category || "Outros", value: res.value || 0, needsNewClient: !match, clientId: match?.id, address: res.address, cnpj: res.cnpj, items: res.items, paymentTerms: res.paymentTerms }]);
      } catch (err) {} 
    }
    setIsProcessingBatch(false);
  };

  const confirmBatchOrder = async (res: BatchResult) => {
    try {
      let cid = res.clientId;
      if (res.needsNewClient) { const n = await registerNewClient(res.client, res.cnpj || "", res.address || ""); if (n) cid = n.id; }
      const cleanName = res.file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");
      const formattedName = `${res.category}___VALOR_${res.value}___${cleanName}`;
      const path = `${user?.id}/${cid}/${formattedName}`;
      await supabase.storage.from("client_vault").upload(path, res.file, { upsert: true });
      const { data: orderRow } = await supabase.from("orders").upsert([{
        user_id: user?.id, client_id: cid, category: res.category, value: res.value,
        file_name: formattedName, file_path: path,
        payment_terms: res.paymentTerms || null,
      }], { onConflict: "client_id,file_path" }).select("id, created_at").single();
      const { data: clientData } = await supabase.from("clients").select("faturamento").eq("id", cid).single();
      if (clientData) {
        const updatedFat = ajustarFaturamento(clientData.faturamento, res.category, res.value);
        await supabase.from("clients").update({ faturamento: updatedFat }).eq("id", cid);
      }
      if (orderRow && user && res.items?.length) {
        await salvarItensDoPedido(supabase, {
          userId: user.id, orderId: orderRow.id, clientId: cid || null, category: res.category,
          orderDate: orderRow.created_at, items: res.items,
        });
      }
      setBatchResults(prev => prev.filter(item => item.file !== res.file)); loadData();
      toast.success("Pedido em lote processado!");
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro desconhecido'); }
  };

  const handleDeleteOrder = async (order: Order) => {
    if (!(await confirm({ title: 'Excluir pedido', message: 'Deseja realmente excluir este pedido?' }))) return;
    try {
      if (order.file_path) await supabase.storage.from("client_vault").remove([order.file_path]);
      const { error } = await supabase.from("orders").delete().eq("id", order.id).eq("user_id", user?.id);
      if (error) throw error;
      if (order.client_id) {
        const { data: clientData } = await supabase.from("clients").select("faturamento").eq("id", order.client_id).single();
        if (clientData) {
          const updatedFat = ajustarFaturamento(clientData.faturamento, order.category, -(order.value || 0));
          await supabase.from("clients").update({ faturamento: updatedFat }).eq("id", order.client_id).eq("user_id", user?.id);
        }
      }
      toast.success("Pedido excluído!");
      loadData();
    } catch (err) { toast.error(err instanceof Error ? err.message : 'Erro desconhecido'); }
  };

  /** Área "Entregas" no card: entrega/NF editáveis direto, sem abrir o pedido. */
  const patchOrder = (orderId: string, patch: Partial<Order>) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  };

  const saveOrderField = (order: Order, field: keyof Order) => async (rawValue: string) => {
    const { error } = await supabase.from("orders").update({ [field]: rawValue || null }).eq("id", order.id);
    if (error) throw error;
    patchOrder(order.id, { [field]: rawValue || null } as Partial<Order>);
  };

  const monthlyOrders = useMemo(() => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    return orders.filter(o => {
      if (!o.created_at) return false;
      const d = new Date(o.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [orders, viewDate]);

  const filteredOrders = useMemo(() => {
    return monthlyOrders.filter(o => o.client?.name?.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [monthlyOrders, searchTerm]);

  /** Clientes que batem com a busca do seletor manual (nome ou CNPJ), sem
   *  acento/caixa. Lista cheia quando a busca está vazia. */
  const clientesParaEscolher = useMemo(() => {
    const termo = normalizar(clientPickerSearch.trim());
    if (!termo) return clients;
    return clients.filter((c) => normalizar(c.name || "").includes(termo) || (c.cnpj || "").includes(termo.replace(/\D/g, "")));
  }, [clients, clientPickerSearch]);

  const stats = useMemo(() => [
    { label: "Faturamento Total", val: monthlyOrders.reduce((a,b)=>a+(b.value||0),0), icon: DollarSign, color: "text-emerald-600", bg: "bg-emerald-50", suffix: "BRL" },
    { label: "Total de Pedidos", val: monthlyOrders.length, icon: ShoppingBag, color: "text-emerald-600", bg: "bg-emerald-50", suffix: "Pedidos" },
    { label: "Ticket Médio", val: monthlyOrders.length > 0 ? (monthlyOrders.reduce((a,b)=>a+(b.value||0),0) / monthlyOrders.length) : 0, icon: TrendingUp, color: "text-amber-600", bg: "bg-amber-50", suffix: "BRL" },
  ], [monthlyOrders]);

  return (
    <div className="h-full flex flex-col gap-6 md:gap-10 pb-20 overflow-x-hidden">
      <PageHeader
        icon={ShoppingBag}
        className="mb-0 lg:mb-0"
        title="Pedidos"
        subtitle="Faturamento e registros via IA"
        actions={
          <button
            onClick={() => setIsBatchModalOpen(true)}
            className="px-5 py-3 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-all shadow-sm flex items-center gap-2 active:scale-95 whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Lote IA
          </button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {stats.map((item, i) => (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            key={i} 
            className="p-6 md:p-8 bg-white dark:bg-zinc-900 rounded-[32px] md:rounded-[40px] border border-slate-100 dark:border-zinc-850 shadow-sm group"
          >
             <div className="flex items-center justify-between mb-4">
                <div className={cn("p-2 md:p-3 rounded-xl md:rounded-2xl group-hover:scale-110 transition-transform", item.bg)}>
                   <item.icon className={cn("w-4 h-4 md:w-5 md:h-5", item.color)} />
                </div>
                <ArrowUpRight className="w-4 h-4 text-slate-200" />
             </div>
             <div>
                <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{item.label}</p>
                <div className="flex items-baseline gap-2">
                   <p className="text-lg md:text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter tabular-nums">
                      {typeof item.val === 'number' && item.suffix === 'BRL' ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(item.val) : item.val}
                   </p>
                   {item.suffix !== 'BRL' && <span className="text-[8px] md:text-[10px] font-black text-slate-300 uppercase tracking-widest">{item.suffix}</span>}
                </div>
             </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white dark:bg-zinc-950 rounded-[32px] md:rounded-[48px] border border-slate-100 dark:border-zinc-850 shadow-sm overflow-hidden flex flex-col flex-1">
        <div className="p-4 md:p-8 border-b border-slate-50 dark:border-zinc-850 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/30 dark:bg-zinc-950/20">
          <div className="relative group flex-1 max-w-md">
            <Search className="absolute left-5 md:left-6 top-1/2 -translate-y-1/2 w-4 h-4 md:w-5 md:h-5 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar registros..." 
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-12 md:pl-14 pr-6 md:pr-8 py-3.5 md:py-5 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl md:rounded-[28px] text-[10px] md:text-xs font-black uppercase tracking-widest text-slate-900 dark:text-zinc-100 outline-none transition-all placeholder:text-slate-300 shadow-sm"
            />
          </div>
          
          <div className="flex items-center gap-3">
             <div className="h-10 md:h-14 px-4 md:px-6 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl md:rounded-2xl flex items-center gap-2 md:gap-3 shadow-sm">
                <span className="text-[8px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest">Total:</span>
                <span className="text-xs md:text-sm font-black text-slate-900 dark:text-zinc-100">{filteredOrders.length}</span>
             </div>
          </div>
        </div>

        <div className="hidden md:block flex-1 overflow-x-auto custom-scrollbar">
           <div className="min-w-[900px]">
              <div className="grid grid-cols-12 px-10 py-6 border-b border-slate-50 dark:border-zinc-850 bg-slate-50/10 dark:bg-zinc-900 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                 <div className="col-span-4">Cliente</div>
                 <div className="col-span-3">Empresa</div>
                 <div className="col-span-2 text-center">Data</div>
                 <div className="col-span-2 text-right">Valor</div>
                 <div className="col-span-1 text-right">Ações</div>
              </div>

              <div className="divide-y divide-slate-50 dark:divide-zinc-850">
                {filteredOrders.length === 0 ? (
                  <div className="py-20 text-center flex flex-col items-center justify-center gap-4 opacity-50">
                     <ShoppingBag className="w-12 h-12 text-slate-200" />
                     <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Nenhum registro encontrado</p>
                  </div>
                ) : (
                  filteredOrders.map((order, i) => (
                    <motion.div 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      key={order.id} 
                      className="grid grid-cols-12 px-10 py-8 hover:bg-slate-50 dark:hover:bg-zinc-900/40 transition-all group items-center"
                    >
                       <div className="col-span-4 flex items-center gap-5">
                          <div className={cn(
                            "w-12 h-12 rounded-xl border flex items-center justify-center text-sm font-black uppercase shadow-sm",
                            i % 2 === 0 ? "bg-white dark:bg-zinc-800 border-slate-100 dark:border-zinc-700 text-slate-300" : "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-100 dark:border-emerald-900/40 text-emerald-600"
                          )}>
                             {order.client?.name?.charAt(0)}
                          </div>
                          <div className="min-w-0">
                             <Link to={`/dashboard/clientes/${order.client_id}`} className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate hover:text-emerald-600 transition-colors flex items-center gap-2 group/link">
                                {order.client?.name || "Cliente Desconhecida"}
                                <ArrowUpRight className="w-3.5 h-3.5 opacity-0 group-hover/link:opacity-100 transition-all" />
                             </Link>
                             <div className="flex items-center gap-2 mt-1">
                                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">{order.client?.cnpj || "N/A"}</span>
                                {order.intake_link_label && (
                                   <span title={`Enviado pelo link "${order.intake_link_label}"`} className="flex items-center gap-1 px-2 py-0.5 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-100 dark:border-cyan-900/40 rounded-lg text-[7px] font-black text-cyan-600 uppercase tracking-widest">
                                      <UserCog className="w-2.5 h-2.5" />
                                      {order.intake_link_label}
                                   </span>
                                )}
                             </div>
                          </div>
                       </div>

                       <div className="col-span-3">
                          <span className="px-4 py-1.5 bg-slate-900 dark:bg-zinc-800 text-white text-[9px] font-black uppercase tracking-widest rounded-xl w-fit">
                             {order.category}
                          </span>
                       </div>

                       <div className="col-span-2 text-center text-[10px] font-black text-slate-400 uppercase tracking-tighter flex flex-col items-center">
                          <Calendar className="w-4 h-4 mb-1 text-slate-200" />
                          {new Date(order.created_at).toLocaleDateString('pt-BR')}
                       </div>

                       <div className="col-span-2 text-right">
                          <p className="text-base font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter tabular-nums">
                             {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.value)}
                          </p>
                       </div>

                       <div className="col-span-1 text-right flex justify-end gap-2">
                          <button onClick={() => setSelectedOrder(order)} className="p-3 bg-white dark:bg-zinc-800 rounded-xl text-slate-200 hover:text-emerald-600 transition-all shadow-sm border border-slate-50 dark:border-zinc-700" title="Ver detalhes do pedido">
                             <Truck className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleDeleteOrder(order)} className="p-3 bg-white dark:bg-zinc-800 rounded-xl text-slate-200 hover:text-red-500 transition-all shadow-sm border border-slate-50 dark:border-zinc-700">
                             <Trash2 className="w-4 h-4" />
                          </button>
                       </div>

                       <div className="col-span-12 mt-4 pt-4 border-t border-slate-50 dark:border-zinc-800/50 flex items-center gap-8 text-[9px] font-black text-slate-400 uppercase tracking-widest">
                          <div className="flex items-center gap-2">
                             <span>Entrega:</span>
                             <InlineEditField type="date" value={order.delivery_date} onSave={saveOrderField(order, "delivery_date")} label="Data de entrega" />
                          </div>
                          <div className="flex items-center gap-2">
                             <span>NF:</span>
                             <InlineEditField type="text" value={order.nf_number} onSave={saveOrderField(order, "nf_number")} label="Número da NF" placeholder="NF" />
                          </div>
                          <div className="flex items-start gap-2 flex-1 min-w-0 normal-case">
                             <span className="shrink-0 uppercase pt-1">Obs:</span>
                             <InlineEditField type="textarea" value={order.notes} onSave={saveOrderField(order, "notes")} label="Observações do pedido" placeholder="Nenhuma observação" className="flex-1" />
                          </div>
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
               <ShoppingBag className="w-12 h-12 text-slate-200" />
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Nenhum registro encontrado</p>
            </div>
          ) : (
            filteredOrders.map((order, i) => (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                key={order.id} 
                className="bg-white dark:bg-zinc-900 p-5 rounded-[28px] border border-slate-100 dark:border-zinc-800 shadow-sm flex flex-col gap-4 active:scale-[0.98] transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-900/40 flex items-center justify-center text-xs font-black text-emerald-600 flex-shrink-0">
                    {order.client?.name?.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <Link to={'/dashboard/clientes/' + order.client_id} className="text-xs font-black text-slate-900 dark:text-zinc-100 uppercase truncate block">
                      {order.client?.name || "Cliente Desconhecida"}
                    </Link>
                    <p className="text-[7px] font-black text-slate-400 uppercase tracking-widest mt-0.5">{order.client?.cnpj || "N/A"}</p>
                  </div>
                  <button onClick={() => handleDeleteOrder(order)} className="p-2.5 bg-red-50 dark:bg-red-950/20 text-red-500 rounded-lg">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                {order.intake_link_label && (
                  <span title={`Enviado pelo link "${order.intake_link_label}"`} className="flex items-center gap-1 w-fit px-2 py-0.5 bg-cyan-50 dark:bg-cyan-500/10 border border-cyan-100 dark:border-cyan-900/40 rounded-lg text-[7px] font-black text-cyan-600 uppercase tracking-widest">
                    <UserCog className="w-2.5 h-2.5" />
                    {order.intake_link_label}
                  </span>
                )}

                <div className="flex items-center justify-between pt-3 border-t border-slate-50 dark:border-zinc-800/50">
                  <div className="flex flex-col gap-1">
                    <span className="text-[6px] font-black text-slate-400 uppercase tracking-widest leading-none">Categoria</span>
                    <span className="text-[9px] font-black text-slate-900 dark:text-zinc-100 uppercase">{order.category}</span>
                  </div>
                  <div className="text-right flex flex-col gap-1">
                    <span className="text-[6px] font-black text-emerald-500 uppercase tracking-widest leading-none">Valor Bruto</span>
                    <span className="text-xs font-black text-slate-900 dark:text-zinc-100 tracking-tighter">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(order.value)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[7px] font-black text-slate-400 uppercase tracking-widest">
                  <div className="flex items-center gap-1">
                    <Calendar className="w-2.5 h-2.5" />
                    {order.created_at ? new Date(order.created_at).toLocaleDateString('pt-BR') : ""}
                  </div>
                  <div className="flex items-center gap-1">
                    <Navigation className="w-2.5 h-2.5" />
                    {order.client?.city || "N/A"}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-50 dark:border-zinc-800/50">
                  <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    <span>Entrega:</span>
                    <InlineEditField type="date" value={order.delivery_date} onSave={saveOrderField(order, "delivery_date")} label="Data de entrega" />
                  </div>
                  <div className="flex items-center gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                    <span>NF:</span>
                    <InlineEditField type="text" value={order.nf_number} onSave={saveOrderField(order, "nf_number")} label="Número da NF" placeholder="NF" />
                  </div>
                  <button onClick={() => setSelectedOrder(order)} className="p-2 bg-slate-50 dark:bg-zinc-800 rounded-lg text-slate-400 shrink-0" title="Ver detalhes do pedido">
                    <Truck className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-start gap-1.5 text-[8px] font-black text-slate-400 uppercase tracking-widest">
                  <span className="shrink-0 pt-1">Obs:</span>
                  <InlineEditField type="textarea" value={order.notes} onSave={saveOrderField(order, "notes")} label="Observações do pedido" placeholder="Nenhuma observação" className="flex-1 normal-case font-medium" />
                </div>
              </motion.div>
            ))
          )}
        </div>
      </div>

      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={patchOrder}
        commissions={settings?.commissions || {}}
      />

      <AnimatePresence>
        {isManualModalOpen && (
           <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsManualModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
              <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="bg-white dark:bg-zinc-900 rounded-[32px] md:rounded-[56px] border border-slate-200 dark:border-zinc-800 shadow-2xl w-full max-w-xl relative z-[5001] overflow-hidden">
                 <div className="p-6 md:p-10 border-b dark:border-zinc-850 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-950/20">
                    <div>
                       <h3 className="text-xl md:text-2xl font-black uppercase tracking-tighter">Novo Pedido</h3>
                       <p className="text-[8px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">Sincronização Manual</p>
                    </div>
                    <button onClick={() => setIsManualModalOpen(false)} className="p-3 md:p-4 bg-white dark:bg-zinc-800 rounded-2xl text-slate-300 hover:text-red-500 transition-all"><X className="w-5 h-5 md:w-6 md:h-6" /></button>
                 </div>
                 
                 <form onSubmit={handleManualSubmit} className="p-6 md:p-10 space-y-6 md:space-y-8">
                    <div className="relative group">
                       <input 
                         type="file" 
                         onChange={handleManualFileChange} 
                         className="absolute inset-0 opacity-0 cursor-pointer z-10" 
                       />
                       <div className="border-4 border-dashed border-slate-100 dark:border-zinc-850 rounded-[32px] md:rounded-[40px] p-8 md:p-12 text-center group-hover:bg-slate-50 dark:group-hover:bg-zinc-950 transition-all flex flex-col items-center gap-4 md:gap-6">
                          <div className="p-4 md:p-6 bg-white dark:bg-zinc-900 rounded-[24px] md:rounded-[32px] shadow-xl text-emerald-600">
                             <Upload className="w-6 h-6 md:w-8 md:h-8" />
                          </div>
                          <p className="text-[8px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest">{selectedFile ? selectedFile.name : "Solte o arquivo aqui"}</p>
                       </div>
                    </div>

                    {selectedFile && !isAnalyzingManual && (
                       <div className="space-y-3 md:space-y-4">
                          <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Cliente</label>

                          {selectedClient && !showNewClientForm && !showClientPicker ? (
                             <div className="flex items-center justify-between p-4 md:p-6 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-900/40 rounded-[20px] md:rounded-[28px]">
                                <span className="text-[10px] md:text-xs font-black text-emerald-700 dark:text-emerald-400 uppercase tracking-widest truncate">
                                   {clients.find(c => c.id === selectedClient)?.name || "Cliente selecionado"}
                                </span>
                                <button type="button" onClick={() => { setShowClientPicker(true); setSelectedClient(""); }} className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 hover:text-slate-600 shrink-0 ml-3">Trocar</button>
                             </div>
                          ) : showNewClientForm ? (
                             <div className="space-y-3">
                                <button type="button" onClick={() => { setShowNewClientForm(false); setShowClientPicker(true); }} className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase text-emerald-600">
                                   <ChevronLeft className="w-3.5 h-3.5" /> Escolher da lista de clientes
                                </button>
                                <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                   Cliente novo — confirmar o pedido já cadastra e liga o pedido a ele.
                                </p>
                                <input
                                  type="text"
                                  value={manualClientName}
                                  onChange={e => setManualClientName(e.target.value)}
                                  placeholder="Nome do cliente novo"
                                  className="w-full p-4 md:p-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[20px] md:rounded-[24px] text-xs md:text-sm font-bold outline-none"
                                />
                                <input
                                  type="text"
                                  value={manualClientCnpj}
                                  onChange={e => setManualClientCnpj(e.target.value)}
                                  placeholder="CNPJ (opcional)"
                                  className="w-full p-4 md:p-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[20px] md:rounded-[24px] text-xs md:text-sm font-bold outline-none"
                                />
                             </div>
                          ) : (
                             <div className="space-y-2">
                                <div className="relative">
                                   <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                                   <input
                                     type="text"
                                     value={clientPickerSearch}
                                     onChange={e => setClientPickerSearch(e.target.value)}
                                     placeholder="Buscar cliente por nome ou CNPJ"
                                     className="w-full pl-11 pr-4 py-4 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[20px] text-xs md:text-sm font-bold outline-none"
                                   />
                                </div>
                                <div className="max-h-40 overflow-y-auto rounded-[20px] border border-slate-100 dark:border-zinc-800 divide-y divide-slate-50 dark:divide-zinc-850">
                                   {clientesParaEscolher.length === 0 ? (
                                     <p className="p-4 text-[10px] font-bold text-slate-400 text-center uppercase">Nenhum cliente encontrado</p>
                                   ) : (
                                     // Sem busca digitada, limita a exibição pra não travar com
                                     // carteiras grandes — é só limite de EXIBIÇÃO: digitando, o
                                     // filtro roda na lista inteira, não só nesses primeiros.
                                     (clientPickerSearch.trim() ? clientesParaEscolher : clientesParaEscolher.slice(0, 50)).map(c => (
                                       <button
                                         key={c.id}
                                         type="button"
                                         onClick={() => { setSelectedClient(c.id); setShowClientPicker(false); setClientPickerSearch(""); }}
                                         className="w-full text-left px-4 py-3 text-xs font-bold text-slate-700 dark:text-zinc-200 hover:bg-emerald-50/60 dark:hover:bg-emerald-500/5 transition-colors truncate"
                                       >
                                         {c.name}
                                       </button>
                                     ))
                                   )}
                                </div>
                                {!clientPickerSearch.trim() && clientesParaEscolher.length > 50 && (
                                  <p className="text-[9px] font-bold text-slate-400 text-center uppercase">
                                    Mostrando os 50 primeiros de {clientesParaEscolher.length} — digite pra encontrar outro
                                  </p>
                                )}
                                <button type="button" onClick={() => { setShowClientPicker(false); setShowNewClientForm(true); }} className="flex items-center gap-1.5 text-[8px] md:text-[9px] font-black uppercase text-slate-400 hover:text-emerald-600 transition-colors">
                                   <UserPlus className="w-3.5 h-3.5" /> Cliente novo
                                </button>
                             </div>
                          )}
                       </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 md:gap-6">
                       <div className="space-y-3 md:space-y-4">
                          <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Representada</label>
                          <select 
                            value={selectedCategory} 
                            onChange={e=>setSelectedCategory(e.target.value)} 
                            required 
                            className="w-full p-4 md:p-6 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[20px] md:rounded-[28px] text-[8px] md:text-[10px] font-black uppercase tracking-widest outline-none"
                          >
                             <option value="">SELECIONAR</option>
                             {Array.from(new Set(settings.categories || [])).map((c: string)=>(<option key={c} value={c}>{c}</option>))}
                          </select>
                       </div>
                       <div className="space-y-3 md:space-y-4">
                          <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest px-2">Valor</label>
                          <div className="relative">
                             <input 
                               type="text" 
                               value={orderValue} 
                               onChange={e=>setOrderValue(e.target.value)} 
                               required 
                               className="w-full p-4 md:p-6 pl-10 md:pl-14 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[20px] md:rounded-[28px] text-lg md:text-xl font-black text-emerald-600 outline-none"
                             />
                             <div className="absolute left-4 md:left-6 top-1/2 -translate-y-1/2 text-[10px] md:text-xs font-black text-slate-300">R$</div>
                          </div>
                       </div>
                    </div>

                    <button 
                      disabled={isSaving} 
                      className="w-full py-5 md:py-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[24px] md:rounded-[32px] font-black uppercase text-[10px] md:text-xs tracking-widest shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-3 md:gap-4 disabled:opacity-50"
                    >
                       {isSaving ? <Loader2 className="w-5 h-5 md:w-6 md:h-6 animate-spin" /> : <Plus className="w-5 h-5 md:w-6 md:h-6" />}
                       {isSaving ? "Sincronizando..." : "Efetivar Registro"}
                    </button>
                 </form>
              </motion.div>
           </div>
         )}
       </AnimatePresence>

      <AnimatePresence>
        {isBatchModalOpen && (
           <div className="fixed inset-0 z-[6000] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsBatchModalOpen(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 rounded-[32px] md:rounded-[56px] border border-slate-200 dark:border-zinc-800 shadow-2xl w-full max-w-6xl max-h-[90vh] relative z-[6001] overflow-hidden flex flex-col">
                 <div className="p-8 md:p-12 border-b dark:border-zinc-850 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-950/20">
                    <div>
                       <h3 className="text-xl md:text-3xl font-black uppercase tracking-tighter">Processamento Lote</h3>
                       <p className="text-[8px] md:text-[10px] font-black text-emerald-600 uppercase tracking-widest mt-1">IA Ativa</p>
                    </div>
                    <button onClick={() => setIsBatchModalOpen(false)} className="p-4 md:p-6 bg-white dark:bg-zinc-900 rounded-xl md:rounded-2xl text-slate-300 hover:text-red-500 transition-all"><X className="w-6 h-6 md:w-8 md:h-8" /></button>
                 </div>

                 <div className="flex-1 overflow-y-auto p-6 md:p-12 custom-scrollbar">
                    {batchResults.length === 0 ? (
                       <div className="h-60 md:h-96 border-4 border-dashed border-slate-100 dark:border-zinc-850 rounded-[32px] md:rounded-[56px] flex flex-col items-center justify-center relative group">
                          <input type="file" multiple onChange={handleBatchUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                          <div className="p-6 md:p-10 bg-white dark:bg-zinc-900 rounded-[24px] md:rounded-[48px] shadow-xl text-emerald-600 mb-6">
                             <Sparkles className="w-10 h-10 md:w-16 md:h-16" />
                          </div>
                          <p className="text-sm md:text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Múltiplos Arquivos</p>
                          <p className="text-[7px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">{isProcessingBatch ? "Aguarde, processando..." : "PDF, JPG, PNG"}</p>
                       </div>
                    ) : (
                       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 pb-12">
                         {batchResults.map((r, i) => (
                           <motion.div 
                             initial={{ opacity: 0, scale: 0.95 }}
                             animate={{ opacity: 1, scale: 1 }}
                             key={i} 
                             className="p-6 md:p-10 bg-slate-50 dark:bg-zinc-950/20 rounded-[32px] md:rounded-[48px] border border-slate-100 dark:border-zinc-850 flex flex-col gap-6 md:gap-8"
                           >
                              <div className="flex items-center gap-4">
                                 <div className="p-3 md:p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm">
                                    <FileText className="w-6 h-6 md:w-8 md:h-8 text-emerald-600" />
                                 </div>
                                 <div className="min-w-0 flex-1">
                                    <p className="text-[7px] md:text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Cliente</p>
                                    <h4 className="text-[10px] md:text-sm font-black text-slate-900 dark:text-zinc-100 uppercase truncate">{r.client}</h4>
                                 </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3 md:gap-4">
                                 <div className="p-4 md:p-5 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-50 dark:border-zinc-850">
                                    <p className="text-[6px] md:text-[7px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Empresa</p>
                                    <p className="text-[8px] md:text-[10px] font-black text-slate-900 dark:text-zinc-100 uppercase truncate">{r.category}</p>
                                 </div>
                                 <div className="p-4 md:p-5 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-slate-50 dark:border-zinc-850">
                                    <p className="text-[6px] md:text-[7px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">Valor</p>
                                    <p className="text-[8px] md:text-[10px] font-black text-emerald-600 tabular-nums">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(r.value)}</p>
                                 </div>
                              </div>

                              <button 
                                onClick={() => confirmBatchOrder(r)}
                                className="w-full py-4 md:py-5 bg-emerald-600 text-white rounded-[20px] md:rounded-[28px] font-black uppercase text-[8px] md:text-[10px] tracking-widest shadow-lg active:scale-95 transition-all flex items-center justify-center gap-2 md:gap-3"
                              >
                                 <Plus className="w-3.5 h-3.5 md:w-4 md:h-4" />
                                 Efetivar
                              </button>
                           </motion.div>
                         ))}
                       </div>
                    )}
                 </div>

                 {isProcessingBatch && (
                    <div className="p-6 md:p-10 bg-emerald-600 flex items-center justify-center gap-4 md:gap-6">
                       <Loader2 className="w-6 h-6 md:w-8 md:h-8 text-white animate-spin" />
                       <div className="flex flex-col">
                          <p className="text-white font-black uppercase tracking-widest text-[10px] md:text-sm">IA Digitalizando...</p>
                       </div>
                    </div>
                 )}
              </motion.div>
           </div>
         )}
       </AnimatePresence>
    </div>
  );
}
