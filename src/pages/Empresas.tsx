import React, { useState, useEffect, useMemo, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HideableCommissionField } from "../components/HideableCommissionField";
import { 
  Building2, 
  Plus, 
  FileText, 
  ChevronLeft, 
  ChevronRight, 
  TrendingUp, 
  Settings, 
  X, 
  Check, 
  Loader2, 
  Upload, 
  ShoppingBag, 
  ArrowUpRight, 
  Zap,
  LayoutGrid,
  Trash2,
  Sparkles,
  FileSpreadsheet,
  UserCog,
  Truck,
  Target
} from "lucide-react";
import { supabase, logError } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { cn } from "../lib/utils";
import { SearchableClientPicker } from "../components/SearchableClientPicker";
import { PageHeader, Skeleton, useConfirm } from "../components/ui";
import { useModalEsc } from "../hooks/useModalEsc";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { syncQueue } from "../lib/syncQueue";
import { offlineCache, CacheKeys } from "../lib/offlineCache";
import { ajustarFaturamento } from "../lib/faturamento";
import { salvarItensDoPedido } from "../lib/orderItems";
import { isIOSApp, SITE_DOMAIN } from "../lib/iapPolicy";
import { EmptyState } from "../components/ui";
import TourArrow from "../components/TourArrow";
import { OrderDetailModal } from "../components/OrderDetailModal";
import { OrdersTable } from "../components/OrdersTable";
import { OrderCard } from "../components/OrderCard";
import { OrdersViewToggle } from "../components/OrdersViewToggle";
import { useOrdersView } from "../hooks/useOrdersView";
import type { Order as OrderType } from "../types";

// Modal de importação de relatório: carrega sob demanda (puxa o pdfjs junto)
const ImportReportModal = React.lazy(() => import("../components/ImportReportModal"));

export default function EmpresasPage() {
  const { user } = useAuth();
  const { settings, updateSettings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [allOrders, setAllOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [showUpsellModal, setShowUpsellModal] = useState(false);

  // Veio do checklist "Primeiros passos" do Início pedindo pra já abrir o
  // modal de cadastro e/ou apontar o botão certo — limpa o state logo em
  // seguida pra não repetir num back/reload desta página.
  const [tourTarget, setTourTarget] = useState<string | null>(null);
  useEffect(() => {
    const state = location.state as { openAddCompany?: boolean; tourTarget?: string } | null;
    if (state?.openAddCompany) {
      if (isLimitExceeded) setShowUpsellModal(true);
      else setIsAddModalOpen(true);
    }
    if (state?.tourTarget) setTourTarget(state.tourTarget);
    if (state?.openAddCompany || state?.tourTarget) {
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state]);
  const currentPlan = settings.plan_id ? (settings.plan_id === 'premium' ? 'profissional' : settings.plan_id) : 'exclusivo';
  const companyLimit = currentPlan === 'exclusivo' ? 1 : (currentPlan === 'profissional' ? 5 : Infinity);
  const isLimitExceeded = (settings.categories || []).length >= companyLimit;
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isImportReportOpen, setIsImportReportOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [viewDate, setViewDate] = useState(new Date());
  const [managingCompany, setManagingCompany] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDeliveryDays, setEditDeliveryDays] = useState("");
  const [editCommissionPct, setEditCommissionPct] = useState("");
  const [editCommissionMode, setEditCommissionMode] = useState<'fixed' | 'per_product'>('fixed');
  const [selectedFiles, setSelectedFiles] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderType | null>(null);
  const [ordersView, setOrdersView] = useOrdersView();
  const [showGoalsConfig, setShowGoalsConfig] = useState(false);
  const [draftGoals, setDraftGoals] = useState<Record<string, string>>({});
  const [savingGoals, setSavingGoals] = useState(false);

  const upsellPanelRef = useRef<HTMLDivElement>(null);
  const addCompanyPanelRef = useRef<HTMLDivElement>(null);
  const uploadPanelRef = useRef<HTMLDivElement>(null);
  const manageCompanyPanelRef = useRef<HTMLDivElement>(null);
  useModalEsc(() => setShowUpsellModal(false), showUpsellModal);
  useFocusTrap(upsellPanelRef, showUpsellModal);
  useModalEsc(() => setIsAddModalOpen(false), isAddModalOpen);
  useFocusTrap(addCompanyPanelRef, isAddModalOpen);
  useModalEsc(() => { if (!isUploading) setIsUploadModalOpen(false); }, isUploadModalOpen);
  useFocusTrap(uploadPanelRef, isUploadModalOpen);
  useModalEsc(() => setManagingCompany(null), !!managingCompany);
  useFocusTrap(manageCompanyPanelRef, !!managingCompany);

  const formatCurrency = (val: any) => {
    const num = Number(val) || 0;
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(num);
  };

  useEffect(() => {
    if (user) loadOrders();
  }, [user]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      if (!offlineCache.isOnline()) {
         setAllOrders((offlineCache.get(CacheKeys.ORDERS) as any[]) || []);
         setClients((offlineCache.get(CacheKeys.CLIENTS) as any[]) || []);
         setLoading(false);
         return;
      }
      const { data, error } = await supabase
        .from("orders")
        .select("*, client:clients(id, name, cnpj, city, state)")
        .eq("user_id", user?.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      offlineCache.set(CacheKeys.ORDERS, data);
      setAllOrders(data || []);

      // cnpj e created_at são usados na importação de relatório para escolher a
      // matriz (CNPJ 0001) quando o mesmo nome tem matriz e filiais cadastradas
      const { data: c } = await supabase
        .from("clients")
        .select("id, name, cnpj, created_at")
        .eq("user_id", user?.id)
        .order("name");
      if (c) offlineCache.set(CacheKeys.CLIENTS, c);
      setClients(c || []);
    } catch (err) {
      setAllOrders((offlineCache.get(CacheKeys.ORDERS) as any[]) || []);
      setClients((offlineCache.get(CacheKeys.CLIENTS) as any[]) || []);
    } finally {
      setLoading(false);
    }
  };

  /** Área "Entregas" no card: entrega/NF editáveis direto, sem abrir o pedido. */
  const patchOrder = (orderId: string, patch: Partial<OrderType>) => {
    setAllOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, ...patch } : o)));
  };

  const saveOrderField = (order: any, field: keyof OrderType) => async (rawValue: string) => {
    let value: string | number | null;
    if (field === "value") value = parseFloat(rawValue) || 0;
    else if (field === "delivery_pct") value = Math.min(100, Math.max(0, Math.round(parseFloat(rawValue) || 0)));
    else value = rawValue || null;
    const { error } = await supabase.from("orders").update({ [field]: value }).eq("id", order.id);
    if (error) throw error;
    patchOrder(order.id, { [field]: value } as Partial<OrderType>);
  };

  useEffect(() => {
    if (showGoalsConfig) {
      const draft: Record<string, string> = {};
      (settings.categories || []).forEach((c: string) => {
        const goal = settings.monthly_goals?.[c];
        draft[c] = goal ? String(goal) : "";
      });
      setDraftGoals(draft);
    }
  }, [showGoalsConfig, settings.categories, settings.monthly_goals]);

  const handleSaveGoals = async () => {
    setSavingGoals(true);
    try {
      const merged = { ...(settings.monthly_goals || {}) };
      Object.entries(draftGoals).forEach(([name, raw]) => {
        const clean = String(raw).replace(/\./g, "").replace(",", ".");
        const parsed = parseFloat(clean);
        if (raw && !isNaN(parsed) && parsed > 0) merged[name] = parsed;
        else delete merged[name];
      });
      await updateSettings({ monthly_goals: merged });
      toast.success("Metas salvas!");
      setShowGoalsConfig(false);
    } catch {
      toast.error("Erro ao salvar as metas.");
    } finally {
      setSavingGoals(false);
    }
  };

  const nextMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() + 1);
    setViewDate(d);
  };

  const prevMonth = () => {
    const d = new Date(viewDate);
    d.setMonth(d.getMonth() - 1);
    setViewDate(d);
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
    if (address) {
      try {
        const { getHighPrecisionCoordinates } = await import("../lib/geminiGeocoding");
        const coords = await getHighPrecisionCoordinates(address, name, cnpj);
        if (coords) { lat = coords.lat; lng = coords.lng; }
      } catch (e) {}
    }

    const newPayload: any = { 
        user_id: user?.id, 
        name: cleanName, 
        cnpj: cleanCnpj, 
        address: address || "", 
        lat, 
        lng, 
        status: "Ativo" 
    };
    
    if (!offlineCache.isOnline()) {
       newPayload.id = crypto.randomUUID();
       syncQueue.enqueue('clients', 'INSERT', newPayload);
       const cached = (offlineCache.get(CacheKeys.CLIENTS) as any[]) || [];
       offlineCache.set(CacheKeys.CLIENTS, [...cached, newPayload]);
       setClients([...cached, newPayload] as any[]);
       // Offline, invalidateQueries sozinho não bastaria: a query de clientes
       // devolve o próprio cache antigo quando está offline (não tem como
       // buscar de novo do servidor), então o novo cliente precisa entrar
       // direto nesse cache pra Clientes/Mapa mostrarem na hora.
       queryClient.setQueryData(["clients", user?.id], (old: any[] = []) => [...(old || []), newPayload]);
       return newPayload;
    }

    const { data, error } = await supabase
      .from("clients")
      .insert([newPayload])
      .select()
      .single();

    if (error) throw error;
    loadOrders();
    // Clientes/Mapa leem de um cache do react-query com staleTime infinito
    // ("sync manual") — sem isso, o cliente recém-criado só apareceria lá
    // depois de uma sincronização manual, mesmo já existindo no banco.
    queryClient.invalidateQueries({ queryKey: ["clients"] });
    return data;
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (selectedFiles.length + files.length > 10) {
      toast.error("Você pode enviar no máximo 10 pedidos por vez.");
      return;
    }

    const newFiles = files.map(file => ({
      file,
      client: "Identificando...",
      category: "",
      value: 0,
      status: 'processing',
      cnpj: "",
      address: ""
    }));

    setSelectedFiles(prev => [...prev, ...newFiles]);

    for (let i = 0; i < newFiles.length; i++) {
      const file = newFiles[i].file;
      try {
        const { processOrderFile } = await import("../lib/orderProcessor");
        const res = await processOrderFile(file, clients.map(c => c.name), settings.categories || []);
        
        // Match client by CNPJ or Name immediately
        const cleanResCnpj = res.cnpj?.replace(/\D/g, "");
        const cleanResName = res.client?.trim().toLowerCase();
        
        const match = clients.find(c => {
          const clientCnpj = c.cnpj?.replace(/\D/g, "");
          const clientName = c.name?.trim().toLowerCase();
          return (cleanResCnpj && clientCnpj === cleanResCnpj) || (clientName && clientName === cleanResName);
        });

        // Sem match: o seletor de cliente do card só lista quem já existe, então
        // um cliente novo ficava com o campo em branco até o "Enviar Pedidos" do
        // lote inteiro rodar — parecia que nada tinha acontecido. Cadastra e já
        // seleciona aqui, assim que a leitura termina, com o mesmo nome/CNPJ que
        // a IA leu (editável depois, como qualquer outro cliente).
        let autoClientId: string | null = null;
        let autoClientName = match ? match.name : (res.client || "Desconhecido");
        if (!match) {
          const usableName = res.client && res.client !== "Desconhecido" ? res.client.trim() : "";
          const usableCnpj = (res.cnpj || "").replace(/\D/g, "");
          if (usableName || usableCnpj.length === 14) {
            try {
              const created = await registerNewClient(usableName || "Cliente sem nome", res.cnpj || "", res.address || "");
              if (created) {
                autoClientId = created.id;
                autoClientName = created.name || autoClientName;
                setClients(prev => prev.some((c: any) => c.id === created.id) ? prev : [...prev, created]);
              }
            } catch (err) {
              // Falhou o cadastro automático (ex.: sem internet no meio do
              // upload): cai pro fluxo manual de sempre — seletor vazio, usuário
              // escolhe ou cadastra na mão.
            }
          }
        }

        setSelectedFiles(prev => prev.map(item =>
          item.file === file ? {
            ...item,
            client: autoClientName,
            clientId: match ? match.id : autoClientId,
            isNewClient: !match && !!autoClientId,
            needsClientInfo: !match && !autoClientId,
            category: res.category || "",
            value: res.value || 0,
            status: 'ready',
            cnpj: res.cnpj || "",
            address: res.address || "",
            items: res.items || [],
            paymentTerms: res.paymentTerms || ""
          } : item
        ));
      } catch (err) {
        setSelectedFiles(prev => prev.map(item => 
          item.file === file ? { ...item, status: 'error', client: "Erro na leitura" } : item
        ));
      }
    }
  };

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index));
  };

  const handleProcessUpload = async () => {
    if (selectedFiles.length === 0) return;
    setIsUploading(true);
    let successCount = 0;

    for (const item of selectedFiles) {
      if (item.status === 'processing') continue;
      
      try {
        const cleanResCnpj = item.cnpj?.replace(/\D/g, "");
        const cleanResName = item.client?.trim().toLowerCase();
        
        let match = clients.find(c => {
          const clientCnpj = c.cnpj?.replace(/\D/g, "");
          const clientName = c.name?.trim().toLowerCase();
          return (cleanResCnpj && clientCnpj === cleanResCnpj) || (clientName && clientName === cleanResName);
        });

        let cid = item.clientId || match?.id;
        if (!cid && (item.cnpj || item.client)) {
          const n = await registerNewClient(item.client, item.cnpj, item.address || "");
          if (n) cid = n.id;
        }

        if (!cid) throw new Error("Não foi possível identificar ou cadastrar o cliente.");

        const cleanName = item.file.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");
        const formattedName = (item.category || 'GERAL') + "___VALOR_" + item.value + "___" + cleanName;
        const path = user?.id + "/" + cid + "/" + formattedName;

        const orderPayload = { 
          id: crypto.randomUUID(),
          user_id: user?.id, 
          client_id: cid, 
          category: item.category || 'GERAL', 
          value: parseFloat(item.value), 
          file_name: formattedName,
          file_path: path,
          payment_terms: item.paymentTerms || null,
          created_at: new Date().toISOString()
        };

        if (!offlineCache.isOnline()) {
           syncQueue.enqueue('orders', 'INSERT', orderPayload);
           const cachedOrders = (offlineCache.get(CacheKeys.ORDERS) as any[]) || [];
           const fullOrder = { ...orderPayload, client: clients.find(c => c.id === cid) };
           offlineCache.set(CacheKeys.ORDERS, [fullOrder, ...cachedOrders]);
           
           const cachedClients = (offlineCache.get(CacheKeys.CLIENTS) as any[]) || [];
           const clientIndex = cachedClients.findIndex(c => c.id === cid);
           if (clientIndex >= 0) {
              const catKey = item.category || 'GERAL';
              const updatedFat = ajustarFaturamento(cachedClients[clientIndex].faturamento, catKey, parseFloat(item.value));
              syncQueue.enqueue('clients', 'UPDATE', { faturamento: updatedFat }, cid);
              cachedClients[clientIndex].faturamento = updatedFat;
              offlineCache.set(CacheKeys.CLIENTS, cachedClients);
           }
        } else {
           await supabase.storage.from("client_vault").upload(path, item.file, { upsert: true });
           await supabase.from("orders").upsert([orderPayload], { onConflict: "client_id,file_path" });

           if (item.items?.length && user) {
             await salvarItensDoPedido(supabase, {
               userId: user.id, orderId: orderPayload.id, clientId: cid, category: item.category || 'GERAL',
               orderDate: orderPayload.created_at, items: item.items,
             });
           }

           const { data: clientData } = await supabase.from("clients").select("faturamento").eq("id", cid).single();
           if (clientData) {
             const updatedFat = ajustarFaturamento(clientData.faturamento, item.category || 'GERAL', parseFloat(item.value));
             await supabase.from("clients").update({ faturamento: updatedFat }).eq("id", cid).eq("user_id", user?.id);
           }
        }
        successCount++;
      } catch (err: any) {
        console.error("Erro ao processar arquivo:", item.file.name, err);
        logError(err, `Empresas.handleBulkUpload:${item.file.name}`);
        toast.error("Erro no arquivo " + item.file.name + ": " + err.message);
      }
    }

    if (successCount > 0) {
      toast.success(successCount + " pedidos processados com sucesso!");
      loadOrders();
      setSelectedFiles([]);
      setIsUploadModalOpen(false);
    }
    setIsUploading(false);
  };

  const monthlyOrders = useMemo(() => {
    const month = viewDate.getMonth();
    const year = viewDate.getFullYear();
    return (allOrders || []).filter(o => {
      if (!o || !o.created_at) return false;
      const d = new Date(o.created_at);
      return d.getMonth() === month && d.getFullYear() === year;
    });
  }, [allOrders, viewDate]);

  const combinedCategories = useMemo(() => {
    const catsMap = new Map<string, string>();
    if (settings?.categories) {
      settings.categories.forEach((cat: string) => {
        if (cat && cat.trim()) {
          const trimmed = cat.trim();
          catsMap.set(trimmed.toUpperCase(), trimmed);
        }
      });
    }
    if (Array.isArray(allOrders)) {
      allOrders.forEach(o => { 
        if (o && o.category && o.category.trim()) {
          const trimmed = o.category.trim();
          const key = trimmed.toUpperCase();
          if (!catsMap.has(key)) catsMap.set(key, trimmed);
        }
      });
    }
    return Array.from(catsMap.values());
  }, [allOrders, settings?.categories]);

  const catTotals = useMemo(() => {
    // Garantir que estamos calculando APENAS sobre pedidos que realmente existem no banco
    // e têm arquivos válidos (já filtrados no loadOrders)
    const currentMonthly = monthlyOrders || [];
    return combinedCategories.reduce((acc: any, cat: string) => {
      acc[cat] = currentMonthly
        .filter(o => o && o.category && o.category.toLowerCase() === cat.toLowerCase())
        .reduce((sum, o) => sum + (Number(o.value) || 0), 0);
      return acc;
    }, {});
  }, [combinedCategories, monthlyOrders]);

  const filteredOrders = useMemo(() => {
    const currentMonthly = monthlyOrders || [];
    if (selectedCategory === "all") return currentMonthly;
    return currentMonthly.filter(o => o && o.category && o.category.toLowerCase() === selectedCategory.toLowerCase());
  }, [selectedCategory, monthlyOrders]);



  const totalGeral = useMemo(() => (filteredOrders || []).reduce((sum, o) => sum + (Number(o.value) || 0), 0), [filteredOrders]);

  const ordersToday = useMemo(() => {
    const today = new Date().toLocaleDateString("en-CA");
    return (allOrders || []).filter(o => o && o.created_at && o.created_at.startsWith(today)).length;
  }, [allOrders]);

  const handleUpdateCompany = async () => {
    if (!managingCompany || !editName.trim()) return;
    try {
      const newName = editName.trim();
      const updatedCategories = settings.categories.map((c: string) => c === managingCompany ? newName : c);

      // Prazo de entrega padrão (dias) — em branco remove a configuração
      // (volta a ficar sem prazo padrão, preenchimento manual). Troca de
      // nome da empresa migra a chave junto, senão a configuração "perdia"
      // o vínculo silenciosamente.
      const updatedDeliveryDays = { ...(settings.delivery_lead_days || {}) };
      delete updatedDeliveryDays[managingCompany];
      const parsedDays = parseInt(editDeliveryDays, 10);
      if (editDeliveryDays.trim() && isFinite(parsedDays) && parsedDays > 0) {
        updatedDeliveryDays[newName] = parsedDays;
      }

      // % de comissão fixo + modo (fixo/por produto) — mesma migração de
      // chave no rename que já vale pra prazo de entrega. Em modo "por
      // produto" nunca grava valor fixo nenhum (nem o que já estava
      // configurado antes de trocar de modo) — as duas coisas juntas
      // conflitam, por isso o campo fica desabilitado nesse modo.
      const updatedCommissions = { ...(settings.commissions || {}) };
      delete updatedCommissions[managingCompany];
      const parsedPct = parseFloat(editCommissionPct.replace(',', '.'));
      if (editCommissionMode === 'fixed' && editCommissionPct.trim() && isFinite(parsedPct) && parsedPct > 0) {
        updatedCommissions[newName] = Math.max(0, Math.min(100, parsedPct));
      }
      const updatedCommissionMode = { ...(settings.commission_mode || {}) };
      delete updatedCommissionMode[managingCompany];
      if (editCommissionMode === 'per_product') {
        updatedCommissionMode[newName] = 'per_product';
      }

      await updateSettings({
        categories: updatedCategories,
        delivery_lead_days: updatedDeliveryDays,
        commissions: updatedCommissions,
        commission_mode: updatedCommissionMode,
      });
      if (!offlineCache.isOnline()) {
         allOrders.filter(o => o.category === managingCompany).forEach(o => {
            syncQueue.enqueue('orders', 'UPDATE', { category: editName.trim() }, o.id);
         });
         const newOrders = allOrders.map(o => o.category === managingCompany ? { ...o, category: editName.trim() } : o);
         offlineCache.set(CacheKeys.ORDERS, newOrders);
         setAllOrders(newOrders);
      } else {
         await supabase.from("orders").update({ category: editName.trim() }).eq("user_id", user?.id).eq("category", managingCompany);
         loadOrders();
      }
      toast.success("Empresa atualizada!");
      setManagingCompany(null);
    } catch (err) {
      toast.error("Erro ao atualizar.");
    }
  };

  const handleDeleteCompany = async (name: string) => {
    if (!(await confirm({ title: 'Excluir empresa', message: `Deseja realmente excluir a empresa ${name}?` }))) return;
    try {
      const updatedCategories = settings.categories.filter((c: string) => c !== name);
      await updateSettings({ categories: updatedCategories });
      toast.success("Empresa removida.");
      setManagingCompany(null);
    } catch (err) {
      toast.error("Erro ao remover.");
    }
  };

  const addCategory = async () => {
    const trimmedCat = newCat.trim();
    if (!trimmedCat) {
      toast.error("Por favor, digite o nome da empresa.");
      return;
    }
    try {
      const currentCategories = settings.categories || [];
      if (currentCategories.some((c: string) => c.toLowerCase() === trimmedCat.toLowerCase())) {
        toast.error("Empresa \"" + trimmedCat + "\" já está cadastrada.");
        return;
      }
      await updateSettings({ categories: [...currentCategories, trimmedCat] });
      toast.success("Empresa \"" + trimmedCat + "\" cadastrada com sucesso!");
      setIsAddModalOpen(false);
      setNewCat("");
      loadOrders();
    } catch (err) {
      toast.error("Erro ao cadastrar.");
    }
  };

  return (
    <div className="flex flex-col gap-4 lg:gap-10 pb-20 overflow-x-hidden">
      <PageHeader
        icon={Building2}
        className="mb-0 lg:mb-0"
        title="Empresas & Pedidos"
        subtitle="Faturamento por representada"
        actions={
          <>
            <div className="flex items-center gap-2 bg-white dark:bg-zinc-900 px-3 py-1.5 rounded-2xl border border-slate-100 dark:border-zinc-800 shadow-sm">
              <button onClick={prevMonth} aria-label="Mês anterior" className="p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-90">
                <ChevronLeft className="w-4 h-4 text-slate-400" />
              </button>
              <div className="text-[10px] font-black uppercase text-emerald-600 tracking-widest min-w-[110px] text-center">
                {viewDate.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
              </div>
              <button onClick={nextMonth} aria-label="Próximo mês" className="p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-lg transition-all active:scale-90">
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <button onClick={() => setShowGoalsConfig(true)} className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-sm active:scale-95 whitespace-nowrap">
              <Target className="w-4 h-4 text-emerald-600" />
              Configurar Meta
            </button>

            <button onClick={() => setIsImportReportOpen(true)} className="flex items-center gap-2 px-5 py-3 bg-white dark:bg-zinc-900 hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-700 dark:text-zinc-200 border border-slate-200 dark:border-zinc-800 rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-sm active:scale-95 whitespace-nowrap">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              Importar Relatório
            </button>

            <button data-tour="enviar-pedidos" onClick={() => setIsUploadModalOpen(true)} className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all shadow-lg shadow-emerald-600/25 active:scale-95 whitespace-nowrap">
              <Upload className="w-4 h-4" />
              Enviar Pedidos
            </button>
          </>
        }
      />

      <React.Suspense fallback={null}>
        {isImportReportOpen && (
          <ImportReportModal
            open={isImportReportOpen}
            onClose={() => setIsImportReportOpen(false)}
            userId={user?.id}
            clients={clients}
            categories={combinedCategories}
            onImported={loadOrders}
          />
        )}
      </React.Suspense>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
        <div className="bg-white dark:bg-zinc-900 p-5 sm:p-6 lg:p-8 rounded-[32px] md:rounded-[40px] border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none hover:ring-emerald-300 transition-all group">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="p-2 sm:p-2.5 lg:p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl md:rounded-3xl group-hover:scale-110 transition-transform flex-shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[7px] sm:text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Faturamento Mês</p>
              <h2 className="text-base sm:text-lg lg:text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight truncate">{totalGeral === 0 ? <span className="text-slate-400 font-medium text-lg">Aguardando vendas</span> : formatCurrency(totalGeral)}</h2>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 sm:p-6 lg:p-8 rounded-[32px] md:rounded-[40px] border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none hover:ring-emerald-300 transition-all group">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="p-2 sm:p-2.5 lg:p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-2xl md:rounded-3xl group-hover:rotate-12 transition-transform flex-shrink-0">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-emerald-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[7px] sm:text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pedidos Mês</p>
              <h2 className="text-base sm:text-lg lg:text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">{filteredOrders.length}</h2>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-zinc-900 p-5 sm:p-6 lg:p-8 rounded-[32px] md:rounded-[40px] border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none hover:ring-emerald-300 transition-all group">
          <div className="flex items-center gap-4 md:gap-5">
            <div className="p-2 sm:p-2.5 lg:p-3 bg-amber-50 dark:bg-amber-950/20 rounded-2xl md:rounded-3xl group-hover:scale-90 transition-transform flex-shrink-0">
              <Zap className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-[7px] sm:text-[9px] lg:text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Pedidos Hoje</p>
              <h2 className="text-base sm:text-lg lg:text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">{ordersToday}</h2>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-10">
        <div className="md:col-span-4 flex flex-col gap-3 sm:gap-4 w-full">
          <div className="flex items-center justify-between px-2 md:px-4">
             <h3 className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Suas empresas</h3>
          </div>
          
          <div className="grid grid-cols-2 md:flex md:flex-col gap-3 w-full">
            {/* "Nova Empresa" é ação secundária: borda tracejada em vez de
                competir em verde sólido com o filtro "Todas as Empresas" */}
            <button onClick={() => isLimitExceeded ? setShowUpsellModal(true) : setIsAddModalOpen(true)} className="w-full text-left p-4 sm:p-5 rounded-3xl border-2 border-dashed border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/10 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 hover:border-emerald-400 flex items-center justify-between group mb-2 md:mb-4 transition-all active:scale-95 col-span-2 md:col-span-1">
              <span className="text-[10px] sm:text-xs lg:text-[13px] font-black uppercase tracking-tight">Nova Empresa</span>
              <Plus className="w-4 h-4 sm:w-5 h-5 group-hover:rotate-90 transition-transform" />
            </button>

            <button 
              onClick={() => setSelectedCategory("all")}
              className={cn("w-full text-left p-4 sm:p-5 lg:p-7 rounded-[30px] md:rounded-[35px] border transition-all relative group overflow-hidden active:scale-[0.98] col-span-2 md:col-span-1",
                selectedCategory === "all" 
                  ? "bg-emerald-600 border-emerald-600 text-white shadow-[0_0_24px_rgba(16,185,129,0.35)] dark:border-emerald-500/50"
                  : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 hover:border-emerald-200 ring-1 ring-slate-200/80 shadow-none hover:ring-emerald-300 transition-all"
              )}
            >
              <div className="flex items-center justify-between mb-2">
                <h4 className={cn("text-[9px] sm:text-[11px] lg:text-[12px] font-black uppercase tracking-widest", selectedCategory === "all" ? "text-emerald-100" : "text-emerald-500")}>Todas</h4>
                <LayoutGrid className="w-4 h-4 md:w-5 md:h-5 opacity-40 group-hover:scale-110 transition-transform" />
              </div>
              <div className="flex items-end justify-between">
                <p className="text-lg sm:text-xl lg:text-2xl font-black tracking-tighter">Todas as Empresas</p>
              </div>
            </button>

            <div className="grid grid-cols-2 md:flex md:flex-col gap-3 col-span-2 md:col-span-1 md:pt-6 md:border-t border-slate-50 dark:border-zinc-800/50 w-full">
              {combinedCategories.map(cat => (
                <div
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={cn("cursor-pointer w-full text-left p-4 sm:p-5 lg:p-6 rounded-[28px] md:rounded-[32px] border transition-all relative group overflow-hidden active:scale-[0.98]",
                    selectedCategory === cat
                      ? "bg-slate-900 dark:bg-zinc-900 border-slate-900 text-white shadow-xl scale-[1.02] dark:border-emerald-500/50 dark:shadow-[0_0_15px_rgba(16,185,129,0.3)]" 
                      : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 text-slate-900 dark:text-zinc-100 hover:border-emerald-200"
                  )}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[10px] sm:text-[12px] lg:text-[13px] font-black uppercase tracking-tight truncate max-w-[120px] md:max-w-none">{cat}</h4>
                    <button 
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        setManagingCompany(cat);
                        setEditName(cat);
                        setEditDeliveryDays(String(settings?.delivery_lead_days?.[cat] ?? ""));
                        setEditCommissionPct(String(settings?.commissions?.[cat] ?? ""));
                        setEditCommissionMode(settings?.commission_mode?.[cat] === 'per_product' ? 'per_product' : 'fixed');
                      }} 
                      className="p-1.5 md:p-2 hover:bg-white/20 rounded-full transition-all relative z-20"
                    >
                      <Settings className="w-3.5 h-3.5 md:w-4 md:h-4 opacity-30 group-hover:rotate-45 transition-transform" />
                    </button>
                  </div>
                  <p className="text-sm sm:text-base lg:text-lg font-black tracking-tighter">{(catTotals[cat] || 0) === 0 ? <span className="text-slate-400 font-medium text-sm">Sem vendas</span> : formatCurrency(catTotals[cat] || 0)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="md:col-span-8">
          <div className="flex items-center justify-between gap-3 mb-4 px-1">
            <h3 className="text-[9px] md:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">Pedidos do período</h3>
            <OrdersViewToggle value={ordersView} onChange={setOrdersView} />
          </div>

          {ordersView === "list" && !loading && !(filteredOrders.length === 0 && allOrders.length === 0) ? (
            <div className="pb-20">
              <OrdersTable
                orders={filteredOrders}
                onSelectOrder={setSelectedOrder}
                saveField={saveOrderField as any}
                emptyLabel="Nenhum pedido identificado neste período."
              />
            </div>
          ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6 pb-20">
              {loading ? (
                 <>
                   {Array.from({ length: 4 }).map((_, i) => (
                     <div key={i} className="p-6 rounded-[32px] border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 space-y-4">
                       <div className="flex items-center gap-3">
                         <Skeleton className="w-12 h-12 rounded-2xl shrink-0" />
                         <div className="flex-1 space-y-2">
                           <Skeleton className="h-4 w-1/2" />
                           <Skeleton className="h-3 w-1/3" />
                         </div>
                       </div>
                       <Skeleton className="h-3 w-full" />
                       <Skeleton className="h-3 w-2/3" />
                     </div>
                   ))}
                 </>
              ) : filteredOrders.length === 0 ? (
                allOrders.length === 0 ? (
                  <div className="col-span-full border-4 border-dashed border-slate-100 dark:border-zinc-800 rounded-[32px] md:rounded-[48px]">
                    <EmptyState
                      icon={ShoppingBag}
                      title="Nenhum pedido ainda"
                      description="Envie a foto ou o PDF de um pedido e a IA extrai cliente, empresa e valor automaticamente."
                      actionLabel="Lançar primeiro pedido →"
                      onAction={() => setIsUploadModalOpen(true)}
                    />
                  </div>
                ) : (
                  <div className="col-span-full h-60 md:h-80 border-4 border-dashed border-slate-100 dark:border-zinc-800 rounded-[32px] md:rounded-[48px] flex flex-col items-center justify-center text-slate-300">
                    <ShoppingBag className="w-12 h-12 md:w-20 md:h-20 mb-4 md:mb-6 opacity-5" />
                    <p className="font-black uppercase text-[9px] md:text-[11px] tracking-[0.3em] text-center opacity-40 leading-relaxed px-6">Nenhum Pedido <br/> Identificado Neste Período</p>
                  </div>
                )
              ) : (
                filteredOrders.map(order => (
                  <OrderCard key={order.id} order={order} onSelectOrder={setSelectedOrder} saveField={saveOrderField as any} />
                ))
              )}
          </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showUpsellModal && (
           <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowUpsellModal(false)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
              <motion.div ref={upsellPanelRef} role="dialog" aria-modal="true" aria-label="Limite de Empresas" tabIndex={-1} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-[40px] md:rounded-[56px] shadow-2xl relative z-10 w-full max-w-md border border-white/20 text-center space-y-6 outline-none">
                 <div className="w-16 h-16 rounded-3xl bg-amber-500/10 flex items-center justify-center mx-auto text-amber-500 animate-pulse">
                    <Zap className="w-8 h-8" />
                 </div>
                 <h3 className="text-xl md:text-2xl font-black uppercase text-slate-900 dark:text-zinc-100 tracking-tighter">Limite de Empresas</h3>
                 <p className="text-xs text-slate-500 dark:text-zinc-400 leading-relaxed font-bold uppercase tracking-wider">
                    {isIOSApp()
                      ? (currentPlan === 'exclusivo'
                          ? `Seu plano Exclusivo permite 1 empresa. Planos maiores cabem mais — você pode trocar de plano em ${SITE_DOMAIN} pelo navegador.`
                          : `Seu plano Profissional permite 5 empresas. O plano Master não tem limite — você pode trocar de plano em ${SITE_DOMAIN} pelo navegador.`)
                      : (currentPlan === 'exclusivo'
                          ? "Você já atingiu o limite de suas empresas com o seu plano Exclusivo (limite: 1 empresa). Para cadastrar mais empresas, você deve fazer o upgrade para o plano Profissional."
                          : "Você já atingiu o limite de suas empresas com o seu plano Profissional (limite: 5 empresas). Para cadastrar mais empresas, você deve fazer o upgrade para o plano Master.")
                    }
                 </p>
                 <div className="space-y-3 pt-2">
                    {!isIOSApp() && (
                      <button
                         onClick={() => { setShowUpsellModal(false); navigate('/dashboard/order-bump'); }}
                         className="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-[24px] font-black uppercase tracking-widest text-[10px] md:text-xs shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                         <Sparkles className="w-4 h-4" /> Dê um Upgrade no seu Plano
                      </button>
                    )}
                    <button
                       onClick={() => setShowUpsellModal(false)}
                       className="w-full py-4 bg-slate-50 hover:bg-slate-100 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-slate-500 dark:text-zinc-400 rounded-[24px] font-black uppercase tracking-widest text-[9px] md:text-[10px] transition-all"
                    >
                       {isIOSApp() ? 'Entendi' : 'Talvez mais tarde'}
                    </button>
                 </div>
              </motion.div>
           </div>
        )}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsAddModalOpen(false)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
             <motion.div ref={addCompanyPanelRef} role="dialog" aria-modal="true" aria-label="Nova Empresa" tabIndex={-1} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-zinc-900 p-8 md:p-12 rounded-[40px] md:rounded-[56px] shadow-2xl relative z-10 w-full max-w-sm border border-white/20 outline-none">
                <div className="flex justify-between items-center mb-8 md:mb-10">
                   <h3 className="text-xl md:text-2xl font-black uppercase text-slate-900 dark:text-zinc-100 tracking-tighter">Nova Empresa</h3>
                   <button onClick={() => setIsAddModalOpen(false)} className="text-slate-300 hover:text-slate-900 transition-colors"><X/></button>
                </div>
                <div className="space-y-6">
                   <div>
                     <label className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Razão Social / Fantasia</label>
                     <input placeholder="EX: COZIMAX" value={newCat} onChange={e => setNewCat(e.target.value)} className="w-full p-5 md:p-6 bg-slate-50 dark:bg-zinc-850 rounded-[24px] md:rounded-[28px] font-black uppercase text-sm outline-none border border-slate-100 dark:border-zinc-800 focus:border-emerald-500 transition-all shadow-inner" />
                   </div>
                   <button data-tour="cadastro-empresa" onClick={addCategory} className="w-full py-5 md:py-6 bg-emerald-600 text-white rounded-[24px] md:rounded-[32px] font-black uppercase tracking-widest text-[10px] md:text-xs shadow-xl hover:bg-emerald-700 transition-all active:scale-95">Efetivar Cadastro</button>
                </div>
             </motion.div>
          </div>
        )}

        {isUploadModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => !isUploading && setIsUploadModalOpen(false)} className="absolute inset-0 bg-slate-900/90 backdrop-blur-2xl" />
             <motion.div ref={uploadPanelRef} role="dialog" aria-modal="true" aria-label="Enviar Pedidos" tabIndex={-1} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} className="bg-white dark:bg-zinc-900 p-6 md:p-14 rounded-[40px] md:rounded-[70px] shadow-2xl relative z-10 w-full max-w-5xl h-[85vh] flex flex-col border border-white/10 overflow-hidden outline-none">
                <div className="absolute top-0 left-0 w-full h-2 bg-emerald-600" />
                <div className="flex justify-between items-center mb-8 md:mb-14">
                   <div>
                      <h3 className="text-2xl md:text-4xl font-black uppercase text-slate-900 dark:text-zinc-100 tracking-tighter mb-1">ENVIAR PEDIDOS</h3>
                   </div>
                   <button onClick={() => !isUploading && setIsUploadModalOpen(false)} className="p-3 md:p-5 bg-slate-50 dark:bg-zinc-800 rounded-2xl md:rounded-3xl text-slate-400 hover:text-red-500 transition-all shadow-sm active:scale-90"><X className="w-6 h-6 md:w-7 md:h-7"/></button>
                </div>

                <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                  {selectedFiles.length === 0 ? (
                    <div className="flex-1 border-4 border-dashed border-slate-100 dark:border-zinc-800 rounded-[32px] md:rounded-[60px] flex flex-col items-center justify-center text-center p-6 md:p-16 hover:bg-emerald-50/10 transition-all cursor-pointer group relative overflow-hidden">
                      <input 
                        type="file" 
                        multiple 
                        accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv" 
                        onChange={handleFileSelect}
                        className="absolute inset-0 opacity-0 cursor-pointer z-10"
                      />
                      <div className="p-8 md:p-14 bg-white dark:bg-zinc-900 rounded-[32px] md:rounded-[50px] shadow-2xl text-emerald-600 mb-6 md:mb-10 group-hover:scale-110 transition-all duration-500">
                        <Upload className="w-12 h-12 md:w-20 md:h-20" />
                      </div>
                      <h4 className="text-xl md:text-2xl font-black uppercase text-slate-900 dark:text-zinc-100 mb-2 md:mb-4 tracking-tight">ENVIAR PEDIDOS</h4>
                      <p className="text-slate-400 text-sm md:text-lg max-w-sm font-medium leading-relaxed italic mx-auto">
                        arraste ou selecione os seus pedidos aqui, para enviarmos para o sistema, você pode enviar até 10 pedidos por vez.
                      </p>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col gap-6 overflow-hidden">
                      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 border-b border-slate-100 dark:border-zinc-800 text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/50 dark:bg-zinc-900/50">
                        <div className="col-span-3">Arquivo</div>
                        <div className="col-span-3">Cliente (IA)</div>
                        <div className="col-span-3">Representada</div>
                        <div className="col-span-2">Valor</div>
                        <div className="col-span-1 text-right"></div>
                      </div>

                      <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-3 pt-2">
                        {selectedFiles.map((item, idx) => (
                          <motion.div 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={idx} 
                            className="grid grid-cols-12 gap-4 items-center p-4 md:p-6 bg-white dark:bg-zinc-950 rounded-2xl md:rounded-[32px] border border-slate-100 dark:border-zinc-800 group hover:shadow-lg transition-all"
                          >
                            <div className="col-span-12 md:col-span-3 flex items-center gap-3">
                              <div className="p-2 bg-slate-50 dark:bg-zinc-900 rounded-lg">
                                <FileText className="w-4 h-4 text-emerald-600" />
                              </div>
                              <p className="text-[10px] font-bold text-slate-900 dark:text-zinc-100 uppercase truncate" title={item.file.name}>{item.file.name}</p>
                            </div>

                            {/* Cliente */}
                            <div className="col-span-12 md:col-span-3">
                              <SearchableClientPicker 
                                clients={clients}
                                value={item.clientId || ""}
                                onChange={(id) => {
                                  const client = clients.find(c => c.id === id);
                                  setSelectedFiles(prev => prev.map((it, i) => i === idx ? {
                                    ...it,
                                    clientId: id,
                                    client: client ? client.name : it.client,
                                  } : it));
                                }}
                              />
                              {item.isNewClient && (
                                <div className="mt-1 flex items-center gap-1.5 px-2">
                                  <Sparkles className="w-3 h-3 text-emerald-500" />
                                  <span className="text-[8px] font-black text-emerald-600 uppercase tracking-widest">Cliente novo — já cadastrado e selecionado</span>
                                </div>
                              )}
                              {item.needsClientInfo && (
                                <div className="mt-1 flex items-center gap-1.5 px-2">
                                  <span className="text-[8px] font-black text-amber-500 uppercase tracking-widest">Sem nome nem CNPJ pra cadastrar sozinho — selecione um cliente</span>
                                </div>
                              )}
                            </div>

                            <div className="col-span-12 md:col-span-3">
                              <select 
                                value={item.category}
                                onChange={e => setSelectedFiles(prev => prev.map((it, i) => i === idx ? {...it, category: e.target.value} : it))}
                                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-emerald-500"
                              >
                                <option value="">SELECIONAR...</option>
                                {settings.categories?.filter(c => c !== 'GERAL').map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}

                              </select>
                            </div>

                            <div className="col-span-9 md:col-span-2 relative">
                              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[8px] font-black text-slate-400">R$</span>
                              <input 
                                type="number"
                                value={item.value}
                                onChange={e => setSelectedFiles(prev => prev.map((it, i) => i === idx ? {...it, value: e.target.value} : it))}
                                className="w-full bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl pl-8 pr-3 py-2 text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              />
                              <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none opacity-20">
                                <Settings className="w-3 h-3" />
                              </div>
                            </div>

                            <div className="col-span-3 md:col-span-1 text-right">
                              {item.status === 'processing' ? (
                                <Loader2 className="w-4 h-4 animate-spin text-emerald-600 ml-auto" />
                              ) : (
                                <button onClick={() => removeFile(idx)} className="p-2 hover:bg-red-50 dark:hover:bg-red-950/20 text-slate-300 hover:text-red-500 transition-all rounded-lg ml-auto">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>

                            <div className="col-span-12 flex items-center gap-3">
                              <span className="text-[8px] font-black text-slate-300 uppercase tracking-widest whitespace-nowrap">Pagamento</span>
                              <input
                                type="text"
                                value={item.paymentTerms || ""}
                                onChange={e => setSelectedFiles(prev => prev.map((it, i) => i === idx ? { ...it, paymentTerms: e.target.value } : it))}
                                placeholder="Ex.: 30/60/90, ou à vista"
                                className="flex-1 bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl px-3 py-2 text-[10px] font-black uppercase outline-none focus:ring-1 focus:ring-emerald-500"
                              />
                            </div>
                          </motion.div>
                        ))}
                      </div>

                      <div className="flex flex-col md:flex-row gap-4 pt-4 border-t dark:border-zinc-800">
                        <button 
                          disabled={isUploading}
                          onClick={() => setSelectedFiles([])}
                          className="flex-1 py-4 md:py-6 bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 rounded-[20px] md:rounded-[32px] font-black uppercase text-[10px] md:text-xs tracking-widest transition-all disabled:opacity-50"
                        >
                          Limpar Tudo
                        </button>
                        <button 
                          disabled={isUploading}
                          onClick={handleProcessUpload}
                          className="flex-[2] py-4 md:py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[20px] md:rounded-[32px] font-black uppercase text-[10px] md:text-xs tracking-widest shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3 disabled:opacity-50"
                        >
                          {isUploading ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Processando com IA...
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-5 h-5" />
                              Enviar para o Sistema
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
             </motion.div>
          </div>
        )}
      
        {managingCompany && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setManagingCompany(null)} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
             <motion.div ref={manageCompanyPanelRef} role="dialog" aria-modal="true" aria-label="Gerenciar Empresa" tabIndex={-1} initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} className="bg-white dark:bg-zinc-900 p-8 md:p-10 rounded-[32px] md:rounded-[48px] shadow-2xl relative z-10 w-full max-w-sm border border-white/20 outline-none">
                <div className="flex justify-between items-center mb-6 md:mb-8">
                   <h3 className="text-lg md:text-xl font-black uppercase text-slate-900 dark:text-zinc-100 tracking-tighter">Gerenciar Empresa</h3>
                   <button onClick={() => setManagingCompany(null)} className="text-slate-300 hover:text-slate-900 transition-colors"><X/></button>
                </div>
                <div className="space-y-6">
                   <div>
                     <label className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Nome da Empresa</label>
                     <input value={editName} onChange={e => setEditName(e.target.value)} className="w-full p-4 md:p-5 bg-slate-50 dark:bg-zinc-850 rounded-2xl md:rounded-3xl font-black uppercase text-sm outline-none border border-slate-100 dark:border-zinc-800" />
                   </div>
                   <div>
                     <label className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Comissão</label>
                     <div className="flex items-center gap-2 mb-3">
                       <button
                         type="button"
                         onClick={() => setEditCommissionMode('fixed')}
                         className={cn(
                           "flex-1 px-3 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-colors",
                           editCommissionMode === 'fixed' ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500"
                         )}
                       >
                         Valor fixo
                       </button>
                       <button
                         type="button"
                         onClick={() => setEditCommissionMode('per_product')}
                         className={cn(
                           "flex-1 px-3 py-2.5 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-colors",
                           editCommissionMode === 'per_product' ? "bg-emerald-600 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-400 dark:text-zinc-500"
                         )}
                       >
                         Por produto
                       </button>
                     </div>
                     <HideableCommissionField>
                       {() => (
                         <input
                           type="text"
                           inputMode="decimal"
                           value={editCommissionMode === 'per_product' ? '' : editCommissionPct}
                           onChange={e => setEditCommissionPct(e.target.value)}
                           disabled={editCommissionMode === 'per_product'}
                           placeholder={editCommissionMode === 'fixed' ? "% que vale pra todos os produtos" : "Sem valor fixo — cada produto tem o seu"}
                           className="w-full p-4 md:p-5 bg-slate-50 dark:bg-zinc-850 rounded-2xl md:rounded-3xl font-black text-sm outline-none border border-slate-100 dark:border-zinc-800 disabled:opacity-40 disabled:cursor-not-allowed"
                         />
                       )}
                     </HideableCommissionField>
                     {editCommissionMode === 'per_product' && (
                       <p className="text-[8px] md:text-[9px] font-medium text-slate-400 mt-2 leading-relaxed">
                         Configure o % de cada produto (ou de um grupo inteiro) na aba Produtos.
                       </p>
                     )}
                   </div>
                   <div>
                     <label className="text-[8px] md:text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Prazo de entrega padrão (dias)</label>
                     <input
                       type="number"
                       min={1}
                       value={editDeliveryDays}
                       onChange={e => setEditDeliveryDays(e.target.value)}
                       placeholder="Em branco = sem prazo padrão"
                       className="w-full p-4 md:p-5 bg-slate-50 dark:bg-zinc-850 rounded-2xl md:rounded-3xl font-black text-sm outline-none border border-slate-100 dark:border-zinc-800"
                     />
                     <p className="text-[8px] md:text-[9px] font-medium text-slate-400 mt-2 leading-relaxed">
                       Usado pra pré-preencher a data de entrega de um pedido novo dessa empresa. Deixe em branco se preferir preencher a data manualmente em cada pedido.
                     </p>
                   </div>
                   <div className="flex flex-col gap-3">
                     <button onClick={handleUpdateCompany} className="w-full py-4 md:py-5 bg-emerald-600 text-white rounded-[20px] md:rounded-[24px] font-black uppercase tracking-widest text-[9px] md:text-[10px]">Salvar Alterações</button>
                     <button onClick={() => handleDeleteCompany(managingCompany)} className="w-full py-4 md:py-5 bg-red-50 text-red-600 hover:bg-red-100 rounded-[20px] md:rounded-[24px] font-black uppercase tracking-widest text-[9px] md:text-[10px]">Excluir Empresa</button>
                   </div>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>

      {tourTarget && <TourArrow targetId={tourTarget} label="Clique aqui" />}

      <OrderDetailModal
        order={selectedOrder}
        isOpen={!!selectedOrder}
        onClose={() => setSelectedOrder(null)}
        onUpdated={patchOrder}
        commissions={settings?.commissions || {}}
        onOrderCreated={loadOrders}
      />

      <AnimatePresence>
        {showGoalsConfig && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowGoalsConfig(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }} className="relative z-10 w-full max-w-md max-h-[80vh] flex flex-col bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-800 overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100">Meta mensal por empresa</h3>
                  <p className="text-xs font-bold text-slate-400 dark:text-zinc-500 mt-0.5">Em branco = sem meta pra essa empresa</p>
                </div>
                <button onClick={() => setShowGoalsConfig(false)} className="p-2 hover:bg-slate-50 dark:hover:bg-zinc-800 rounded-full transition-colors shrink-0">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-4">
                {(settings.categories || []).length === 0 ? (
                  <div className="text-center py-8 text-sm font-bold text-slate-400 dark:text-zinc-500">
                    Nenhuma empresa representada cadastrada ainda.
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {(settings.categories || []).map((c: string) => (
                      <div key={c} className="flex items-center gap-3">
                        <span className="flex-1 text-sm font-bold text-slate-700 dark:text-zinc-200 truncate">{c}</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={draftGoals[c] ?? ""}
                          onChange={(e) => setDraftGoals((prev) => ({ ...prev, [c]: e.target.value }))}
                          placeholder="Ex: 50.000"
                          className="w-32 text-sm font-black border border-slate-100 dark:border-zinc-800 bg-slate-50 dark:bg-zinc-950 rounded-2xl px-4 py-2.5 outline-none text-right focus:ring-2 focus:ring-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-slate-100 dark:border-zinc-800">
                <button onClick={handleSaveGoals} disabled={savingGoals || (settings.categories || []).length === 0} className="w-full py-3 rounded-2xl text-xs font-black uppercase tracking-widest bg-emerald-600 text-white hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
                  {savingGoals ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Salvar metas
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

