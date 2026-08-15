import React, { useState, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  User,
  MapPin,
  Phone,
  Mail,
  Calendar,
  ArrowLeft,
  FileText,
  Download,
  Eye,
  Trash2,
  Plus,
  X,
  Loader2,
  HardDrive,
  Upload,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  PhoneCall
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { useUpload } from "../contexts/UploadContext";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { processOrderFile } from "../lib/orderProcessor";
import { syncQueue } from "../lib/syncQueue";
import { offlineCache, CacheKeys } from "../lib/offlineCache";
import { Client, Order } from "../types";
import { computeCompanyCycles, cycleLabel, type CompanyCycle } from "../lib/purchaseCycle";
import { computeClientAlerts, type AlertLike } from "../lib/clientAlerts";
import { TrendingUp, Clock3 } from "lucide-react";
import ClientFollowupModal from "../components/ClientFollowupModal";
import ClientFollowupHistory from "../components/ClientFollowupHistory";
import { PdfViewerModal } from "../components/PdfViewerModal";
import { getClientFollowupStatus, type ClientFollowupStatus } from "../lib/followupService";
import { useConfirm } from "../components/ui";

import { toTitleCase } from "../lib/utils";

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export default function ClientDetails() {
  const { id } = useParams();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { drafts, setDraft, clearDraft } = useUpload();
  const navigate = useNavigate();
  const confirm = useConfirm();
  
  const draft = drafts[id || ""] || { file: null, category: "", value: "", isOpen: false };
  const currentFile = draft.file;
  
  const [client, setClient] = useState<Client | null>(null);
  const [files, setFiles] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  
  const [notes, setNotes] = useState("");
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  /** Empresas que aparecem em qualquer pedido do usuário — não só nos deste cliente. */
  const [userCategories, setUserCategories] = useState<string[]>([]);
  
  const [uploadValue, setUploadValue] = useState(draft.value || "");
  const [uploadCategory, setUploadCategory] = useState(draft.category || "");
  const [isFollowupModalOpen, setIsFollowupModalOpen] = useState(false);
  const [followupStatus, setFollowupStatus] = useState<ClientFollowupStatus | null>(null);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);

  const initializedRef = useRef(false);

  // Ciclo de compra: descobre o ritmo por empresa a partir do histórico de pedidos
  const purchaseCycles = useMemo<CompanyCycle[]>(() => {
    const orders = files
      .filter((f) => f.created_at)
      .map((f) => ({ category: f.category || "GERAL", value: f.value, created_at: f.created_at }));
    return computeCompanyCycles(orders).filter((c) => c.status !== "observando" || c.purchases > 0);
  }, [files]);

  /* Status de inatividade vindo da MESMA fonte da lista de clientes: os pedidos
     reais, com os limiares que o usuário configurou. O badge daqui era um
     "Ativo no Radar" fixo no código — um cliente aberto pela aba "Alerta"
     aparecia como ativo. */
  const alertaAtual = useMemo<AlertLike | undefined>(() => {
    if (!client?.id) return undefined;
    const pedidos = files
      .filter((f) => f.created_at)
      .map((f) => ({
        client_id: client.id,
        created_at: f.created_at as string,
        category: f.category,
      }));
    const mapa = computeClientAlerts(
      [{ id: client.id, name: client.name }],
      pedidos,
      {
        alerta: settings.alerta_days || 30,
        critico: settings.critico_days || 45,
        inativo: settings.inativo_days || 90,
      },
      settings.categories || []
    );
    return mapa.get(client.id)?.alerts?.[0];
  }, [client?.id, client?.name, files, settings.alerta_days, settings.critico_days, settings.inativo_days, settings.categories]);

  useEffect(() => {
    if (user && id) {
      loadClientData();
      loadFollowupStatus();
    }
  }, [user, id]);

  const loadFollowupStatus = async () => {
    if (!user || !id) return;
    try {
      const status = await getClientFollowupStatus(user.id, id, {
        alerta: settings.alerta_days || 30,
        critico: settings.critico_days || 45,
        inativo: settings.inativo_days || 90,
      });
      setFollowupStatus(status);
    } catch (error) {
      console.error('Error loading followup status:', error);
    }
  };

  useEffect(() => {
    initializedRef.current = false;
  }, [id]);

  useEffect(() => {
    if (id && !initializedRef.current) {
      const currentDraft = drafts[id] || { value: "", category: "" };
      setUploadValue(currentDraft.value || "");
      setUploadCategory(currentDraft.category || "");
      initializedRef.current = true;
    }
  }, [id, drafts]);

  const handleUpdateValue = (val: string) => {
    setUploadValue(val);
    setDraft(id || "", { value: val });
  };

  const handleUpdateCategory = (cat: string) => {
    setUploadCategory(cat);
    setDraft(id || "", { category: cat });
  };

  const loadClientData = async () => {
    try {
      setLoading(true);
      const { data: clientData, error: clientError } = await supabase
        .from('clients')
        .select('*')
        .eq('id', id)
        .single();
      
      if (clientError) throw clientError;
      setClient(clientData as Client);
      setNotes(clientData.notes || "");

      const { data: ordersData } = await supabase
        .from('orders')
        .select('*')
        .eq('client_id', id)
        .order('created_at', { ascending: false });
      
      setFiles((ordersData as Order[]) || []);

      // As representadas do usuário vêm de todos os pedidos dele, não só deste
      // cliente: senão a lista de empresas some quando o cliente ainda não tem
      // pedido daquela fábrica — e a IA fica sem referência para reconhecê-la.
      const { data: catRows } = await supabase
        .from('orders')
        .select('category')
        .eq('user_id', user?.id);
      setUserCategories(
        Array.from(new Set((catRows || []).map(r => r.category).filter(Boolean) as string[]))
      );

      import('../lib/supabase').then(({ logAudit }) => logAudit('ACCESS_CLIENT_DETAILS', { client_id: id, client_name: clientData.name }));

    } catch (err) {
      console.error("Error loading client details:", err);
      toast.error("Erro ao carregar dados do cliente.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileDelete = async (fileId: string, filePath: string) => {
    if (!(await confirm({ title: 'Excluir pedido', message: 'Deseja realmente excluir este pedido e descontar do faturamento?' }))) return;
    
    try {
      if (!offlineCache.isOnline()) {
         const fileToDelete = files.find(f => f.id === fileId);
         if (!fileToDelete) return;
         
         syncQueue.enqueue('orders', 'DELETE', null, fileId);
         
         if (fileToDelete.value && fileToDelete.category && client) {
            const fat = (client.faturamento as Record<string, number>) || {};
            const currentCatTotal = Number(fat[fileToDelete.category]) || 0;
            const newTotal = Math.max(0, currentCatTotal - Number(fileToDelete.value));
            const updatedFat = { ...fat, [fileToDelete.category]: newTotal };
            syncQueue.enqueue('clients', 'UPDATE', { faturamento: updatedFat }, id);
            
            const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS) || [];
            const clientIndex = cachedClients.findIndex((c: Client) => c.id === id);
            if (clientIndex >= 0) {
                cachedClients[clientIndex].faturamento = updatedFat;
                offlineCache.set(CacheKeys.CLIENTS, cachedClients);
            }
         }
         
         const cachedOrders = offlineCache.get<Order[]>(CacheKeys.ORDERS) || [];
         offlineCache.set(CacheKeys.ORDERS, cachedOrders.filter((o: Order) => o.id !== fileId));
         
         setFiles(prev => prev.filter(f => f.id !== fileId));
         toast.success("Pedido removido offline!");
         return;
      }

      const { data: orderData } = await supabase.from('orders').select('*').eq('id', fileId).single();
      
      const { error: storageError } = await supabase.storage
        .from('client_vault')
        .remove([filePath]);
      
      if (storageError) {
        // Não interrompe a exclusão do registro: o arquivo pode já ter sumido
        // do Storage. (Havia um retry no bucket 'orders', que não existe.)
        console.warn("Falha ao remover o arquivo do Storage:", storageError);
      }

      const { error: dbError } = await supabase
        .from('orders')
        .delete()
        .eq('id', fileId);
      
      if (dbError) throw dbError;

      if (orderData && orderData.value && orderData.category) {
          const { data: clientData } = await supabase.from('clients').select('faturamento').eq('id', id).single();
          if (clientData) {
              const fat = (clientData.faturamento as Record<string, number>) || {};
              const currentCatTotal = Number(fat[orderData.category]) || 0;
              const newTotal = Math.max(0, currentCatTotal - Number(orderData.value));
              
              const updatedFat = { ...fat, [orderData.category]: newTotal };
              await supabase.from('clients').update({ faturamento: updatedFat }).eq('id', id).eq("user_id", user?.id);
          }
      }

      toast.success("Pedido removido com sucesso!");
      loadClientData();
    } catch (err) {
      toast.error("Erro ao remover pedido.");
    }
  };

  // URL assinada + download nativo do navegador em vez de baixar o blob
  // inteiro pra memória do JS antes de salvar — mesmo ganho de velocidade já
  // aplicado em Arquivos.tsx, mas esse fluxo de anexos do cliente ainda usava
  // o padrão antigo (.download), que fica lento em arquivos maiores/redes ruins.
  const handleDownload = async (fileName: string, filePath: string) => {
    try {
      let { data, error } = await supabase.storage
        .from('client_vault')
        .createSignedUrl(filePath, 60, { download: fileName });

      // O fallback aqui era para um bucket 'orders' que não existe no projeto:
      // só trocava o erro real por "Bucket not found".
      if (error || !data?.signedUrl) throw error || new Error("Arquivo não encontrado.");

      const a = document.createElement('a');
      a.href = data.signedUrl;
      a.download = fileName;
      a.click();
    } catch (err) {
      toast.error("Erro ao baixar arquivo.");
    }
  };

  // Abre PDFs no visualizador interno — renderiza só as páginas próximas da
  // área visível, então o scroll continua leve mesmo em documentos grandes.
  const handleOpenPdf = async (fileName: string, filePath: string) => {
    try {
      let { data, error } = await supabase.storage
        .from('client_vault')
        .createSignedUrl(filePath, 60 * 60);

      if (error || !data?.signedUrl) throw error || new Error("Arquivo não encontrado.");

      setPdfPreview({ url: data.signedUrl, name: fileName });
    } catch (err) {
      toast.error("Erro ao abrir arquivo.");
    }
  };

  const submitUpload = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!currentFile || !user || !id || !uploadCategory) {
        toast.error("Preencha todos os campos obrigatórios");
        return;
    }

    try {
      setIsUploading(true);
      const cleanValue = uploadValue.replace(/\./g, '').replace(',', '.');
      const numericValue = parseFloat(cleanValue) || 0;

      const cleanFileName = currentFile.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w\s.-]/g, "").replace(/\s+/g, "_");
      const formattedName = `${uploadCategory}___VALOR_${uploadValue}___${cleanFileName}`;
      const filePath = `${user.id}/${id}/${formattedName}`;

      const { error: uploadError } = await supabase.storage
        .from('client_vault')
        .upload(filePath, currentFile, { upsert: true });

      if (uploadError) throw uploadError;

      // Não incluir campos que não existem na tabela orders (ex.: "description"):
      // o PostgREST rejeita o insert inteiro e o pedido não é salvo.
      const orderPayload = {
          id: crypto.randomUUID(),
          user_id: user.id,
          client_id: id,
          value: numericValue,
          category: uploadCategory,
          file_name: currentFile.name,
          file_path: filePath,
          created_at: new Date().toISOString()
      };
      
      if (!offlineCache.isOnline()) {
          syncQueue.enqueue('orders', 'INSERT', orderPayload);
          
          if (client) {
             const fat = (client.faturamento as Record<string, number>) || {};
             const updatedFat = { ...fat, [uploadCategory]: (Number(fat[uploadCategory] || 0) + numericValue) };
             syncQueue.enqueue('clients', 'UPDATE', { faturamento: updatedFat }, id);
             
             const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS) || [];
             const clientIndex = cachedClients.findIndex((c: Client) => c.id === id);
             if (clientIndex >= 0) {
                 cachedClients[clientIndex].faturamento = updatedFat;
                 offlineCache.set(CacheKeys.CLIENTS, cachedClients);
             }
          }
          
          const cachedOrders = offlineCache.get<Order[]>(CacheKeys.ORDERS) || [];
          offlineCache.set(CacheKeys.ORDERS, [orderPayload, ...cachedOrders]);
          setFiles(prev => [orderPayload, ...prev]);
      } else {
          const { error: dbError } = await supabase.from('orders').insert([orderPayload]);
          if (dbError) throw dbError;
          
          const { data: clientData } = await supabase.from("clients").select("faturamento").eq("id", id).single();
          if (clientData) {
            const fat = (clientData.faturamento as Record<string, number>) || {};
            const updatedFat = { ...fat, [uploadCategory]: (Number(fat[uploadCategory] || 0) + numericValue) };
            await supabase.from("clients").update({ faturamento: updatedFat }).eq("id", id).eq("user_id", user?.id);
          }
      }

      toast.success("Arquivo anexado com sucesso!");
      clearDraft(id || "");
      setDraft(id || "", { isOpen: false });
      handleUpdateValue("");
      handleUpdateCategory("");
      loadClientData();
    } catch (err: any) {
      console.error("Upload error:", err);
      toast.error(err.message || "Erro no upload.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setDraft(id || "", { file });
    setIsProcessingFile(true);
    
    try {
        // Passa todas as representadas conhecidas: com a lista vazia a IA não
        // tem como reconhecer de qual fábrica é o pedido.
        const result = await processOrderFile(file, [client?.name || ""], allAvailableCategories);
        if (result.value) {
            handleUpdateValue(result.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 }));
        }
        if (result.category) {
            handleUpdateCategory(result.category);
        }
    } catch (err) {
        console.error("Error processing file:", err);
    } finally {
        setIsProcessingFile(false);
    }
  };

  const saveNewCategory = async () => {
    if (!newCategoryName.trim()) return;
    const current = settings.categories || [];
    if (current.includes(newCategoryName.trim())) {
      handleUpdateCategory(newCategoryName.trim());
      setIsCreatingCategory(false);
      return;
    }
    
    try {
        const updatedCategories = [...current, newCategoryName.trim()];
        const { error } = await supabase.from('user_settings').upsert({ user_id: user?.id, categories: updatedCategories });
        if (error) throw error;
        
        handleUpdateCategory(newCategoryName.trim());
        setIsCreatingCategory(false);
        setNewCategoryName("");
        toast.success("Categoria criada com sucesso!");
    } catch (err) {
        toast.error("Erro ao criar categoria");
    }
  };

  const handleSaveNotes = async () => {
    try {
      setIsSavingNotes(true);
      if (!offlineCache.isOnline()) {
          syncQueue.enqueue('clients', 'UPDATE', { notes }, id);
          const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS) || [];
          const clientIndex = cachedClients.findIndex((c: Client) => c.id === id);
          if (clientIndex >= 0) {
              cachedClients[clientIndex].notes = notes;
              offlineCache.set(CacheKeys.CLIENTS, cachedClients);
          }
          toast.success("Observações salvas offline!");
          return;
      }

      const { error } = await supabase
        .from('clients')
        .update({ notes })
        .eq('id', id);
      
      if (error) throw error;
      toast.success("Observações salvas!");
    } catch (err) {
      toast.error("Erro ao salvar.");
    } finally {
      setIsSavingNotes(false);
    }
  };

  const allAvailableCategories = useMemo(() => {
    const categoryMap = new Map<string, string>();
    const add = (cat?: string | null) => {
      if (!cat || !cat.trim()) return;
      const key = cat.toLowerCase().trim();
      if (!categoryMap.has(key)) categoryMap.set(key, cat.trim());
    };
    (settings.categories || []).forEach(add);
    userCategories.forEach(add);
    files.forEach(f => add(f.category));
    return Array.from(categoryMap.values()).sort();
  }, [settings.categories, userCategories, files]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-12 h-12 animate-spin text-emerald-600 opacity-20" />
      </div>
    );
  }

  if (!client) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-6">
        <AlertCircle className="w-16 h-16 text-red-500 opacity-20" />
        <h2 className="text-xl font-black uppercase text-slate-400 tracking-widest">Cliente não encontrado</h2>
        <Link to="/dashboard/clientes" className="px-8 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs">Voltar para Carteira</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 px-6 pt-6 pb-5 border-b border-slate-200/70 dark:border-zinc-800/70 bg-gradient-to-r from-white to-slate-50/50 dark:from-zinc-900 dark:to-zinc-950/50 mb-6 rounded-t-2xl">
        <div className="space-y-4">
          <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors">
            <ArrowLeft className="w-3 h-3" /> Voltar
          </button>
          <div className="flex items-center gap-6">
            <div className="w-20 h-20 bg-emerald-600 rounded-[32px] flex items-center justify-center text-white shadow-xl shadow-emerald-500/20">
              <User className="w-10 h-10" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900 dark:text-zinc-100">{toTitleCase(client.name || "")}</h1>
              <div className="flex items-center gap-4 mt-3">
                {alertaAtual ? (
                  <span
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-1 text-[10px] font-black uppercase rounded-full",
                      alertaAtual.type === "Inativo"
                        ? "bg-red-50 dark:bg-red-900/20 text-red-600"
                        : alertaAtual.type === "Crítico"
                          ? "bg-orange-50 dark:bg-orange-900/20 text-orange-600"
                          : "bg-amber-50 dark:bg-amber-900/20 text-amber-600"
                    )}
                    title={`Sem comprar em ${alertaAtual.company} há ${alertaAtual.days} dias`}
                  >
                    <div
                      className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        alertaAtual.type === "Inativo"
                          ? "bg-red-500"
                          : alertaAtual.type === "Crítico"
                            ? "bg-orange-500"
                            : "bg-amber-500"
                      )}
                    />
                    {alertaAtual.type} · {alertaAtual.days}d sem comprar
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-[10px] font-black uppercase rounded-full">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Ativo no Radar
                  </span>
                )}
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">CNPJ: {client.cnpj}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button onClick={() => navigate(`/dashboard/clientes/${id}/editar`)} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-xs font-black text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition-all">
            <Pencil className="w-3 h-3" /> Editar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-8">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none p-8 space-y-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 dark:border-zinc-800 pb-4">Informações de Contato</h3>
            
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-50 dark:bg-zinc-800 rounded-lg text-slate-400"><MapPin className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Localização</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-zinc-300 leading-relaxed">{client.address || "Não informado"}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-50 dark:bg-zinc-800 rounded-lg text-slate-400"><Phone className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">Telefone</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">{client.phone || "Não informado"}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-2 bg-slate-50 dark:bg-zinc-800 rounded-lg text-slate-400"><Mail className="w-4 h-4" /></div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase">E-mail Comercial</p>
                  <p className="text-xs font-bold text-slate-700 dark:text-zinc-300">Não configurado</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none p-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Anotações</h3>
              {isSavingNotes && <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />}
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Histórico, preferências e notas de negociação..."
              className="w-full h-40 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-2xl p-4 text-xs font-medium outline-none focus:ring-4 focus:ring-emerald-500/5 resize-none transition-all dark:text-zinc-200"
            />
            <button
              onClick={handleSaveNotes}
              disabled={isSavingNotes}
              className="w-full py-4 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              Atualizar Resumo
            </button>
          </div>

          {/* Followup Status */}
          {followupStatus && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none p-8 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Follow-up</h3>
              </div>

              <div className={cn(
                "p-4 rounded-xl border-2",
                followupStatus.priority === 'urgent' ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" :
                followupStatus.priority === 'high' ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" :
                followupStatus.priority === 'medium' ? "bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900" :
                followupStatus.priority === 'low' ? "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700" :
                "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900"
              )}>
                <p className={cn(
                  "text-xs font-black uppercase tracking-widest mb-2",
                  followupStatus.priority === 'urgent' ? "text-red-800 dark:text-red-200" :
                  followupStatus.priority === 'high' ? "text-amber-800 dark:text-amber-200" :
                  followupStatus.priority === 'medium' ? "text-yellow-800 dark:text-yellow-200" :
                  followupStatus.priority === 'low' ? "text-slate-600 dark:text-slate-400" :
                  "text-emerald-800 dark:text-emerald-200"
                )}>
                  {/* Os números vêm da régua configurada pelo usuário; antes
                      eram 45/30/14 fixos, que ignoravam o ajuste dele. */}
                  {followupStatus.priority === 'urgent' && `🔴 Urgente · ${settings.inativo_days || 90}+ dias`}
                  {followupStatus.priority === 'high' && `🟠 Alta · ${settings.critico_days || 45}+ dias`}
                  {followupStatus.priority === 'medium' && `🟡 Média · ${settings.alerta_days || 30}+ dias`}
                  {followupStatus.priority === 'low' && '⚪ Baixa · contato recente'}
                  {followupStatus.priority === 'done' && '✅ Em dia'}
                </p>
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-tight",
                  followupStatus.priority === 'urgent' ? "text-red-700 dark:text-red-300" :
                  followupStatus.priority === 'high' ? "text-amber-700 dark:text-amber-300" :
                  followupStatus.priority === 'medium' ? "text-yellow-700 dark:text-yellow-300" :
                  followupStatus.priority === 'low' ? "text-slate-500 dark:text-slate-400" :
                  "text-emerald-700 dark:text-emerald-300"
                )}>
                  {/* Deixa explícito que este card é sobre CONTATO registrado,
                      não sobre compra — o badge do topo é que fala de pedido. */}
                  {followupStatus.daysSinceContact >= 0
                    ? followupStatus.lastContact
                      ? `Último contato registrado há ${followupStatus.daysSinceContact} dias`
                      : 'Nenhum contato registrado ainda'
                    : 'Contato registrado hoje'}
                </p>
              </div>

              <button
                onClick={() => setIsFollowupModalOpen(true)}
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2"
              >
                <PhoneCall className="w-4 h-4" />
                Registrar Follow-up
              </button>
            </div>
          )}

          {user && id && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none p-8 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 border-b border-slate-50 dark:border-zinc-800 pb-4">Histórico de Contatos</h3>
              <ClientFollowupHistory clientId={id} userId={user.id} />
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-8">
           <div className="bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/80 shadow-none p-8 flex flex-col h-full min-h-[600px]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10 pb-6 border-b border-slate-50 dark:border-zinc-850">
                <div>
                  <h2 className="text-xl font-black text-slate-900 dark:text-zinc-100 flex items-center gap-3 uppercase tracking-tight">
                    <div className="p-2 bg-emerald-50 dark:bg-emerald-500/10 rounded-xl"><HardDrive className="w-6 h-6 text-emerald-600" /></div>
                    Documentos
                  </h2>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Pedidos e arquivos do cliente</p>
                </div>

                <div className="flex items-center gap-3">
                  <AnimatePresence>
                    {(draft.file || draft.category || draft.value) && !draft.isOpen && (
                      <motion.span 
                        initial={{ opacity: 0, scale: 0.8 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.8 }}
                        className="text-[9px] font-black text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 px-3 py-1.5 rounded-xl border border-amber-100 dark:border-amber-900/30 uppercase tracking-widest shadow-sm"
                      >
                        Rascunho Salvo Localmente
                      </motion.span>
                    )}
                  </AnimatePresence>

                  <button 
                    onClick={() => setDraft(id || "", { isOpen: true })}
                    className="flex items-center gap-3 px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-500/20 transition-all active:scale-95"
                  >
                    <Upload className="w-4 h-4" /> Anexar Novo
                  </button>
                </div>
              </div>

              {/* Ciclo de compra inteligente */}
              {purchaseCycles.length > 0 && (
                <div className="mb-6 rounded-3xl border border-slate-100 dark:border-zinc-800 bg-slate-50/60 dark:bg-zinc-950/40 p-5">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="p-1.5 bg-emerald-50 dark:bg-emerald-500/10 rounded-lg">
                      <TrendingUp className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h3 className="text-[11px] font-black text-slate-500 dark:text-zinc-400 uppercase tracking-widest">
                      Ritmo de compra
                    </h3>
                  </div>
                  <div className="grid gap-2.5">
                    {purchaseCycles.map((c) => {
                      const tone =
                        c.status === "atrasado"
                          ? "border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-950/20"
                          : c.status === "previsto"
                          ? "border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20"
                          : "border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900";
                      const labelTone =
                        c.status === "atrasado"
                          ? "text-red-600 dark:text-red-400"
                          : c.status === "previsto"
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-slate-500 dark:text-zinc-400";
                      return (
                        <div
                          key={c.category}
                          className={cn("flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 min-w-0", tone)}
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate">
                              {c.category}
                            </div>
                            {c.avgIntervalDays > 0 && (
                              <div className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5 flex items-center gap-1">
                                <Clock3 className="w-3 h-3" /> compra a cada ~{c.avgIntervalDays} dias · {c.purchases} pedidos
                              </div>
                            )}
                          </div>
                          {/* Sem shrink-0: rótulos longos ("Aprendendo o ritmo
                              (2/3 compras)") não cabem ao lado do nome da
                              empresa no celular e empurravam a linha inteira
                              para fora da tela — agora quebram em duas linhas. */}
                          <span className={cn("text-[10px] font-black uppercase tracking-widest text-right", labelTone)}>
                            {cycleLabel(c)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="flex-1 space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                {files.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-20 py-20">
                    <FileText className="w-20 h-20 mb-6 stroke-[1]" />
                    <p className="font-black uppercase text-xs tracking-[0.2em]">Nenhum arquivo ainda</p>
                  </div>
                ) : (
                  files.map((file) => {
                    const parts = file.file_name?.split("___") || [];
                    const actualName = parts.length > 2 ? parts.slice(2).join("___") : (parts.length > 1 ? parts.slice(1).join("___") : file.file_name);
                    const orderValueStr = file.value ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(file.value) : null;
                    const isPdf = (actualName || "").toLowerCase().endsWith(".pdf");

                    return (
                      <div key={file.id} className="flex items-center justify-between p-6 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-3xl hover:border-emerald-200 transition-all group">
                        <div className="flex items-center gap-6">
                           <div className="w-14 h-14 bg-white dark:bg-zinc-900 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 dark:border-zinc-800 group-hover:scale-110 transition-transform">
                              <FileText className="w-7 h-7 text-emerald-600" />
                           </div>
                           <div>
                              <div className="flex items-center gap-2 mb-1.5">
                                <span className="px-3 py-1 bg-emerald-600 text-white text-[8px] font-black uppercase tracking-widest rounded-full">{file.category || "Geral"}</span>
                                {orderValueStr && <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 text-[8px] font-black uppercase tracking-widest rounded-full">{orderValueStr}</span>}
                              </div>
                              <h4 className="text-sm font-black text-slate-900 dark:text-zinc-100 truncate max-w-xs uppercase tracking-tight">{actualName}</h4>
                              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-2">
                                <Calendar className="w-3 h-3" /> {file.created_at ? new Date(file.created_at).toLocaleDateString('pt-BR') : ""}
                              </p>
                           </div>
                        </div>

                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           {isPdf && (
                             <button onClick={() => handleOpenPdf(file.file_name || "", file.file_path || "")} className="p-3 bg-white dark:bg-zinc-800 text-slate-400 hover:text-emerald-600 rounded-xl shadow-sm border border-slate-100 dark:border-zinc-800"><Eye className="w-4 h-4" /></button>
                           )}
                           <button onClick={() => handleDownload(file.file_name || "", file.file_path || "")} className="p-3 bg-white dark:bg-zinc-800 text-slate-400 hover:text-emerald-600 rounded-xl shadow-sm border border-slate-100 dark:border-zinc-800"><Download className="w-4 h-4" /></button>
                           <button onClick={() => handleFileDelete(file.id, file.file_path || "")} className="p-3 bg-white dark:bg-zinc-800 text-slate-400 hover:text-red-500 rounded-xl shadow-sm border border-slate-100 dark:border-zinc-800"><Trash2 className="w-4 h-4" /></button>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
           </div>
        </div>
      </div>

      <AnimatePresence>
        {draft.isOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setDraft(id || "", { isOpen: false })} className="absolute inset-0 bg-slate-900/80 backdrop-blur-xl" />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white dark:bg-zinc-900 rounded-[48px] border border-white/20 shadow-2xl w-full max-w-md relative z-10 overflow-hidden"
            >
              <div className="p-10 border-b border-slate-50 dark:border-zinc-850 flex items-center justify-between">
                <div>
                   <h3 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter leading-none">Anexar Documento</h3>
                   <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Upload Seguro para Nuvem</p>
                </div>
                <button onClick={() => setDraft(id || "", { isOpen: false })} className="p-3 bg-slate-50 dark:bg-zinc-800 rounded-2xl text-slate-400 hover:text-red-500 transition-all"><X className="w-5 h-5"/></button>
              </div>

              <div className="p-10 space-y-8">
                <div className="space-y-4">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-2">Empresa do Pedido</label>
                  {!isCreatingCategory ? (
                    <div className="flex gap-2 p-2 bg-slate-50 dark:bg-zinc-950 rounded-3xl border border-slate-100 dark:border-zinc-800">
                      <select 
                        value={uploadCategory}
                        onChange={(e) => handleUpdateCategory(e.target.value)}
                        className="flex-1 bg-transparent px-4 py-2 text-xs font-black uppercase outline-none text-slate-900 dark:text-zinc-100"
                      >
                        <option value="">Selecione...</option>
                        {allAvailableCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </select>
                      <button onClick={() => setIsCreatingCategory(true)} className="p-3 bg-emerald-600 text-white rounded-2xl"><Plus className="w-4 h-4" /></button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        placeholder="Nome da empresa..."
                        className="flex-1 px-6 py-4 bg-slate-50 dark:bg-zinc-950 border border-emerald-500 rounded-3xl text-xs font-black uppercase outline-none"
                        autoFocus
                      />
                      <button onClick={saveNewCategory} className="px-6 bg-emerald-600 text-white rounded-3xl text-[10px] font-black uppercase tracking-widest">OK</button>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-2">Arquivo Local</label>
                  <div className={cn(
                    "relative p-8 border-2 border-dashed rounded-[32px] transition-all flex flex-col items-center justify-center text-center group",
                    currentFile ? "bg-emerald-50/50 dark:bg-emerald-500/5 border-emerald-500/30" : "bg-slate-50 dark:bg-zinc-800/50 border-slate-100 dark:border-zinc-700 hover:border-emerald-500/50"
                  )}>
                    {isProcessingFile ? (
                        <div className="py-4">
                            <Loader2 className="w-8 h-8 animate-spin text-emerald-600 mx-auto mb-2" />
                            <p className="text-[10px] font-black uppercase text-slate-400">Analisando Documento...</p>
                        </div>
                    ) : currentFile ? (
                        <div className="space-y-2">
                             <FileText className="w-8 h-8 text-emerald-600 mx-auto" />
                             <p className="text-[10px] font-black text-slate-900 dark:text-zinc-100 uppercase truncate max-w-[200px]">{currentFile.name}</p>
                             <button type="button" onClick={() => clearDraft(id || "")} className="text-[8px] font-black text-red-500 uppercase tracking-widest">Remover</button>
                        </div>
                    ) : (
                        <>
                            <Upload className="w-6 h-6 text-slate-300 group-hover:text-emerald-500 mb-2" />
                            <p className="text-[10px] font-black text-slate-400 uppercase">Clique para selecionar</p>
                            <input 
                                type="file" 
                                onChange={handleFileChange}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                            />
                        </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest px-2">Valor Total do Pedido (OPCIONAL)</label>
                  <div className="relative">
                    <CreditCard className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-300" />
                    <input 
                        type="text" 
                        value={uploadValue}
                        onChange={(e) => handleUpdateValue(e.target.value.replace(/[^0-9,.]/g, ''))}
                        placeholder="0,00"
                        className="w-full pl-16 pr-8 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-3xl text-sm font-black text-slate-900 dark:text-zinc-100 outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all"
                    />
                  </div>
                </div>
              </div>

              <div className="p-10 bg-slate-50 dark:bg-zinc-950 border-t border-slate-100 dark:border-zinc-850">
                <button 
                  onClick={submitUpload}
                  disabled={!currentFile || isUploading || !uploadCategory}
                  className="w-full py-6 bg-emerald-600 text-white rounded-[32px] font-black uppercase text-xs tracking-[0.2em] shadow-2xl shadow-emerald-500/30 hover:bg-emerald-700 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-4"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                  <span>Efetivar Upload</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {user && id && (
        <ClientFollowupModal
          isOpen={isFollowupModalOpen}
          onClose={() => setIsFollowupModalOpen(false)}
          clientId={id}
          clientName={client?.name || ""}
          userId={user.id}
          onFollowupLogged={() => {
            loadFollowupStatus();
            loadClientData();
          }}
        />
      )}

      <PdfViewerModal
        isOpen={!!pdfPreview}
        onClose={() => setPdfPreview(null)}
        url={pdfPreview?.url ?? null}
        fileName={pdfPreview?.name}
        onDownload={() => pdfPreview && handleDownload(pdfPreview.name, files.find(f => f.file_name === pdfPreview.name)?.file_path || "")}
      />
    </div>
  );
}

