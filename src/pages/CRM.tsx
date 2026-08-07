import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from "react-router-dom";
import { Search, MapPin, Building2, Trash2, ChevronRight, Plus, Loader2, FileUp, X, ChevronDown, Users, BellOff } from 'lucide-react';
import { supabase, logAudit } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useSync } from '../contexts/SyncContext';
import { useClients } from '../hooks/useClients';
import { syncQueue } from '../lib/syncQueue';
import { cn, useDebounce, toTitleCase } from '../lib/utils';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { parseFileForCnpjs } from '../lib/clientImport';
import { getHighPrecisionCoordinates } from '../lib/geminiGeocoding';
import { Client, Alert, Order } from '../types';
import { useQueryClient } from '@tanstack/react-query';
import { EmptyState, PageHeader, Skeleton, useConfirm } from '../components/ui';
import { posthog } from '../lib/posthog';
import ClientImportModal from '../components/ClientImportModal';
import { ExportLeadsButton } from '../components/ExportLeadsButton';

export default function CRMPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { settings } = useSettings();
  const { isOnline } = useSync();
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const [activeTab, setActiveTab] = useState<'Todos' | 'Alerta' | 'Crítico' | 'Inativo'>('Todos');
  const { data: clients = [], isLoading: loading, isFetching: loadingAlerts, dismissAlert } = useClients();
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearchTerm = useDebounce(searchTerm, 200);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tab = params.get("tab");
    if (tab === "Alerta") setActiveTab("Alerta");
    else if (tab === "Critico" || tab === "Crítico") setActiveTab("Crítico");
    else if (tab === "Inativo") setActiveTab("Inativo");
  }, [location.search]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Import Modal/State
  const [isImporting, setIsImporting] = useState(false);
  const [isAddingClient, setIsAddingClient] = useState(false);
  const [newCnpj, setNewCnpj] = useState("");
  const [isSearchingCnpj, setIsSearchingCnpj] = useState(false);
  const [importStats, setImportStats] = useState({ current: 0, total: 0 });
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);

  // Pagination for performance on mobile
  const [displayLimit, setDisplayLimit] = useState(40);

  useEffect(() => {
    logAudit('ACCESS_CLIENT_LIST');
  }, [user]);

  useEffect(() => {
    setDisplayLimit(40);
  }, [debouncedSearchTerm, activeTab]);

  const filteredClients = useMemo(() => {
    const lowerSearch = debouncedSearchTerm.toLowerCase();
    const result = (clients || []).filter(c => {
      const searchMatch = !debouncedSearchTerm || 
        (c.name || "").toLowerCase().includes(lowerSearch) || 
        (c.cnpj || "").includes(debouncedSearchTerm) || 
        (c.city || "").toLowerCase().includes(lowerSearch);
      
      if (!searchMatch) return false;
      
      if (activeTab === 'Todos') return true;
      return c.alerts?.some((a: Alert) => a.type === activeTab);
    });

    return result.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [clients, debouncedSearchTerm, activeTab]);

  const displayClients = useMemo(() => {
    return filteredClients.slice(0, displayLimit);
  }, [filteredClients, displayLimit]);

  const handleDeleteClient = async (id: string) => {
    if (!(await confirm({ title: 'Excluir cliente', message: 'Deseja realmente excluir este cliente? Todos os pedidos associados serão mantidos, mas o vínculo será perdido.' }))) return;
    
    if (!isOnline) {
        syncQueue.enqueue('clients', 'DELETE', null, id);
        queryClient.invalidateQueries({ queryKey: ['clients'] });
        toast.success('Cliente removido offline.');
        return;
    }

    try {
      const { error } = await supabase.from('clients').delete().eq('id', id).eq('user_id', user?.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      toast.success('Cliente removido com sucesso.');
    } catch (err) {
      console.error('Delete Error:', err);
      toast.error('Erro ao remover cliente.');
    }
  };

  const handleDismissAlert = async (client: Client, alert: Alert) => {
    if (!isOnline) {
      toast.error('Ignorar aviso precisa de internet.');
      return;
    }
    if (!(await confirm({
      title: 'Ignorar aviso',
      message: `O aviso de ${alert.company} para ${toTitleCase(client.name || '')} não vai mais aparecer, a menos que ele compre de novo dessa representada.`,
    }))) return;

    try {
      await dismissAlert(client, alert);
      toast.success('Aviso ignorado.');
    } catch (err) {
      console.error('Dismiss alert error:', err);
      toast.error('Erro ao ignorar o aviso.');
    }
  };

  const handleAddClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCnpj || !user) return;

    setIsSearchingCnpj(true);
    const toastId = toast.loading("Buscando dados do CNPJ...");

    try {
      const cleanCnpj = newCnpj.replace(/\D/g, "");
      const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
      
      let clientData = { name: "Novo Cliente", city: "", address: "" };
      if (response.ok) {
        const data = await response.json();
        clientData = {
          name: data.razao_social || data.nome_fantasia || "Novo Cliente",
          city: data.municipio || "",
          address: `${data.logradouro || ""}, ${data.numero || "S/N"} - ${data.bairro || ""}, ${data.municipio || ""} - ${data.uf || ""}`.trim(),
        };
      } else {
        toast.error("CNPJ não encontrado ou erro na API.");
        setIsSearchingCnpj(false);
        toast.dismiss(toastId);
        return;
      }

      const coords = await getHighPrecisionCoordinates(clientData.address, clientData.name, cleanCnpj);

      const newClientData = {
        user_id: user.id,
        name: clientData.name,
        cnpj: cleanCnpj,
        city: clientData.city,
        address: clientData.address,
        lat: coords?.lat || null,
        lng: coords?.lng || null,
        status: "Ativo",
        last_contact: new Date().toISOString().split("T")[0]
      };

      if (!isOnline) {
        const optimisticId = crypto.randomUUID();
        syncQueue.enqueue('clients', 'INSERT', newClientData);
        toast.success("Cliente salv localmente (Offline).", { id: toastId });
        // Optimistic updates via queryClient would go here
        setIsAddingClient(false);
        setNewCnpj("");
      } else {
        const { data, error } = await supabase.from("clients").insert([newClientData]).select().single();
        if (error) throw error;
        toast.success("Cliente adicionado com sucesso!", { id: toastId });
        posthog.capture('client_added');
        // React Query will refetch or invalidate
        setIsAddingClient(false);
        setNewCnpj("");
      }
    } catch (err) {
      console.error("Add Client Error:", err);
      toast.error("Erro ao adicionar cliente: " + (err instanceof Error ? err.message : 'Erro desconhecido'), { id: toastId });
    } finally {
      setIsSearchingCnpj(false);
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setIsImporting(true);
    const toastId = toast.loading('Processando arquivo via IA...');

    try {
      const cnpjs = await parseFileForCnpjs(file);
      
      const importPath = `${user.id}/imports/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      await supabase.storage.from('client_vault').upload(importPath, file);
      if (cnpjs.length === 0) {
        toast.error('Nenhum CNPJ detectado no arquivo.');
        setIsImporting(false);
        toast.dismiss(toastId);
        return;
      }

      const processedLocal = new Set<string>();
      const uniqueCnpjs = cnpjs.filter(cnpj => {
        if (processedLocal.has(cnpj)) return false;
        processedLocal.add(cnpj);
        return true;
      });

      setImportStats({ current: 0, total: uniqueCnpjs.length });
      toast.loading(`Importando ${uniqueCnpjs.length} potenciais clientes...`, { id: toastId });

      let importedCount = 0;
      const chunkSize = 5;

      for (let i = 0; i < uniqueCnpjs.length; i += chunkSize) {
        const chunk = uniqueCnpjs.slice(i, i + chunkSize);
        
        const chunkPromises = chunk.map(async (cnpj) => {
          try {
            const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);
            let clientData = { name: `Cliente ${cnpj.substring(0, 4)}`, city: "", address: "" };
            
            if (response.ok) {
              const data = await response.json();
              clientData = {
                name: data.razao_social || data.nome_fantasia || 'Cliente Importado',
                city: data.municipio || "",
                address: `${data.logradouro || ""}, ${data.numero || "S/N"} - ${data.bairro || ""}, ${data.municipio || ""} - ${data.uf || ""}`.trim(),
              };
            }

            const coords = await getHighPrecisionCoordinates(clientData.address, clientData.name, cnpj);

            let clientId = null;
            const existing = clients.find(c => c.cnpj === cnpj);
            
            if (existing) {
              clientId = existing.id;
            } else {
              const { data, error: insertError } = await supabase.from('clients').insert([{
                user_id: user.id,
                name: clientData.name,
                cnpj: cnpj,
                city: clientData.city,
                address: clientData.address,
                lat: coords?.lat || null,
                lng: coords?.lng || null,
                status: 'Ativo',
                last_contact: new Date().toISOString().split('T')[0]
              }]).select('id').single();
              
              if (!insertError && data) {
                clientId = data.id;
                importedCount++;
              }
            }

            if (clientId) {
              await supabase.from('orders').insert([{
                user_id: user.id,
                client_id: clientId,
                category: "Lista Importada",
                value: 0,
                file_path: importPath,
                file_name: file.name
              }]);
            }
          } catch (err) {
            console.error('Import Step Error for CNPJ:', cnpj, err);
          } finally {
            setImportStats(prev => ({ ...prev, current: prev.current + 1 }));
          }
        });

        await Promise.allSettled(chunkPromises);

        const processedSoFar = Math.min(i + chunk.length, uniqueCnpjs.length);
        toast.loading(`Importando ${processedSoFar}/${uniqueCnpjs.length} clientes...`, { id: toastId });
      }

      toast.success(`Importação concluída! ${importedCount} novos clientes adicionados.`, { id: toastId });
      // React Query handles refetching
    } catch (err) {
      toast.error('Erro na Importação: ' + (err instanceof Error ? err.message : 'Erro desconhecido'), { id: toastId });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="h-[calc(100dvh-2rem)] flex flex-col">
      <PageHeader
        icon={Users}
        title="Clientes"
        subtitle={`${clients.length} na carteira`}
        actions={
          <>
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nome, CNPJ ou cidade..."
                aria-label="Buscar cliente"
                className="pl-10 pr-4 py-2.5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-xs w-full sm:w-72 outline-none focus:ring-2 focus:ring-emerald-500 font-bold"
              />
            </div>
            <input type="file" ref={fileInputRef} onChange={handleImportFile} className="hidden" accept=".pdf,.xlsx,.xls,.txt,image/*" />
            <button
              onClick={() => setIsAddingClient(true)}
              className="px-5 py-2.5 bg-white dark:bg-zinc-800 text-slate-900 dark:text-zinc-100 border border-slate-200 dark:border-zinc-700 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 dark:hover:bg-zinc-700 transition-all flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Novo Cliente
            </button>
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-5 py-2.5 bg-emerald-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <FileUp className="w-4 h-4" />
              Importar Clientes
            </button>
            <ExportLeadsButton leads={clients} userName={user?.email} />
          </>
        }
      />
      <div className="flex-1 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 flex flex-col min-h-0 ring-1 ring-slate-200/80 shadow-none overflow-hidden relative">
        <div className="px-4 py-3 border-b dark:border-zinc-850 bg-slate-50/50 dark:bg-zinc-950/20 flex items-center gap-2 overflow-x-auto no-scrollbar">
          {(['Todos', 'Alerta', 'Crítico', 'Inativo'] as const).map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-1.5 rounded-full text-xs font-black transition-all whitespace-nowrap ${activeTab === tab ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}
            >
              {tab} <span className="ml-1 opacity-50">({clients.filter(c => tab === 'Todos' ? true : c.alerts?.some((a: Alert) => a.type === tab)).length})</span>
            </button>
          ))}
          {loadingAlerts && (
             <div className="flex items-center gap-2 ml-auto pr-4">
                <Loader2 className="w-3 h-3 animate-spin text-emerald-600" />
                <span className="text-[9px] font-black uppercase text-emerald-600/60 tracking-widest">Sincronizando Alertas...</span>
             </div>
          )}
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar">
           {loading ? (
              <div className="flex flex-col divide-y divide-slate-50 dark:divide-zinc-800/50">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 p-5">
                    <Skeleton className="w-11 h-11 rounded-2xl shrink-0" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-3.5 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-6 w-16 rounded-full" />
                  </div>
                ))}
              </div>
           ) : (
              <div className="flex flex-col">
                 {displayClients.map((client) => (
                    <div 
                      key={client.id}
                      onClick={() => navigate(`/dashboard/clientes/${client.id}`)}
                      className="p-4 cursor-pointer transition-colors hover:bg-slate-50/80 border-b border-slate-100 flex items-center gap-4 group"
                    >
                       <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black uppercase bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 shrink-0">
                          {client.name?.substring(0, 2)}
                       </div>
                       <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                             <p className="text-sm font-black text-slate-900 dark:text-zinc-100 normal-case truncate pr-1">{toTitleCase(client.name || "")}</p>
                             {client.alerts && client.alerts.length > 0 && (
                               <span className="flex gap-1 shrink-0">
                                 {client.alerts.filter((a: Alert) => activeTab === 'Todos' ? true : a.type === activeTab).slice(0, 1).map((a: Alert, i: number) => (
                                   <span key={i} className={cn("pl-2 pr-1 py-0.5 rounded-md text-[8px] font-black uppercase border flex items-center gap-1", a.type === 'Inativo' ? 'bg-red-50 text-red-600 border-red-100 dark:bg-red-950/30 dark:border-red-900/40' : a.type === 'Crítico' ? 'bg-orange-50 text-orange-600 border-orange-100 dark:bg-orange-950/30 dark:border-orange-900/40' : 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40') }>
                                     <span className="opacity-60">{a.company}</span> <span className="w-1 h-1 rounded-full bg-current opacity-30" /> <span>{a.type}: {a.days}D</span>
                                     <button
                                       onClick={(e) => { e.stopPropagation(); handleDismissAlert(client, a); }}
                                       title={`Ignorar aviso de ${a.company} para este cliente`}
                                       className="ml-0.5 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 opacity-60 hover:opacity-100 transition-opacity"
                                     >
                                       <BellOff className="w-2.5 h-2.5" />
                                     </button>
                                   </span>
                                 ))}
                               </span>
                             )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                             <span className="px-1.5 py-0.5 bg-slate-100 dark:bg-zinc-800 text-[8px] font-bold text-slate-500 dark:text-zinc-400 rounded-md uppercase whitespace-nowrap tracking-widest">
                                {client.cnpj || 'Sem CNPJ'}
                             </span>
                             <p className="text-[10px] text-slate-400 dark:text-zinc-500 truncate uppercase font-bold tracking-tight">
                                {client.city ? `📍 ${client.city}` : 'Cidade não informada'}
                             </p>
                             {client.alerts && client.alerts.length > 0 && (
                               <span className={cn(
                                 "text-[10px] font-black uppercase tracking-tight px-2 py-0.5 rounded-full shrink-0",
                                 client.alerts[0].type === 'Crítico' ? "bg-red-50 text-red-600 dark:bg-red-950/30 dark:text-red-500" :
                                 client.alerts[0].type === 'Inativo' ? "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-400" :
                                 "bg-amber-50 text-amber-600 dark:bg-amber-950/30 dark:text-amber-500"
                               )}>
                                 {client.alerts[0].days}d sem comprar
                               </span>
                             )}
                          </div>
                       </div>
                       <div className="flex items-center gap-2 shrink-0">
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteClient(client.id); }} className="p-2 md:opacity-0 group-hover:opacity-100 hover:bg-red-50 dark:hover:bg-red-950/20 text-red-500 rounded-lg transition-all">
                             <Trash2 className="w-4 h-4" />
                          </button>
                          <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                       </div>
                    </div>
                 ))}
                 {filteredClients.length > displayLimit && (
                    <button 
                      onClick={() => setDisplayLimit(prev => prev + 40)}
                      className="w-full py-8 text-[11px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/5 transition-all flex items-center justify-center gap-3 border-t border-slate-100 dark:border-zinc-850"
                    >
                       <ChevronDown className="w-4 h-4" />
                       Carregar mais clientes ({filteredClients.length - displayLimit} restantes)
                    </button>
                 )}
                 {filteredClients.length === 0 && (
                    clients.length === 0 ? (
                      <EmptyState
                        icon={Building2}
                        title="Sua carteira começa aqui"
                        description="Cadastre seu primeiro cliente pelo CNPJ — buscamos os dados da empresa automaticamente."
                        actionLabel="Cadastrar primeiro cliente →"
                        onAction={() => setIsAddingClient(true)}
                      />
                    ) : (
                      <div className="p-12 text-center opacity-40">
                        <Building2 className="w-12 h-12 mx-auto mb-4 text-slate-300" />
                        <p className="text-sm font-black uppercase tracking-widest">Nenhum cliente encontrado</p>
                      </div>
                    )
                 )}
              </div>
           )}
        </div>
      </div>
      <AnimatePresence>
        {isAddingClient && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => !isSearchingCnpj && setIsAddingClient(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-md bg-white dark:bg-zinc-900 rounded-[32px] border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Novo Cliente</h3>
                  <button 
                    onClick={() => setIsAddingClient(false)}
                    disabled={isSearchingCnpj}
                    className="p-2 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-xl transition-all"
                  >
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>
                <form onSubmit={handleAddClient} className="space-y-6">
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">CNPJ da Empresa</label>
                    <input 
                      type="text"
                      value={newCnpj}
                      onChange={(e) => setNewCnpj(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      className="w-full px-5 py-4 bg-slate-50 dark:bg-zinc-800/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                      required
                      autoFocus
                    />
                    <p className="mt-3 text-[10px] text-slate-400 font-medium leading-relaxed">
                      Insira apenas o CNPJ. Buscaremos automaticamente todos os dados (Razão Social, Endereço, Localização) para você.
                    </p>
                  </div>
                  <button 
                    type="submit"
                    disabled={isSearchingCnpj || !newCnpj}
                    className="w-full py-4 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-700 disabled:opacity-50 disabled:scale-100 active:scale-95 transition-all flex items-center justify-center gap-3"
                  >
                    {isSearchingCnpj ? <Loader2 className="w-5 h-5 animate-spin" /> : <Building2 className="w-5 h-5" />}
                    {isSearchingCnpj ? "Buscando..." : "Adicionar Cliente"}
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ClientImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImportComplete={() => {
          setIsImportModalOpen(false);
          queryClient.invalidateQueries({ queryKey: ['clients'] });
        }}
      />
    </div>
  );
}
