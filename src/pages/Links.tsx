import {
  useState,
  useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Link as LinkIcon,
  Plus,
  ExternalLink,
  Search,
  Mail,
  FileText,
  Briefcase,
  X,
  Trash2,
  HardDrive,
  Calendar,
  Maximize2,
  Minimize2,
  Globe,
  ShieldCheck,
  Zap,
  Layers,
  Sparkles,
  Navigation,
  ArrowUpRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { PageHeader, useConfirm } from "../components/ui";

const initialLinks = [
  { id: "1", title: "WhatsApp Web", url: "https://web.whatsapp.com", icon: "MessageSquare", color: "bg-emerald-500" },
  { id: "2", title: "Gmail", url: "https://mail.google.com", icon: "Mail", color: "bg-red-500" },
  { id: "3", title: "Google Drive", url: "https://drive.google.com", icon: "HardDrive", color: "bg-emerald-500" },
  { id: "4", title: "Google Agenda", url: "https://calendar.google.com", icon: "Calendar", color: "bg-orange-500" },
];

const iconMap: Record<string, any> = {
  Mail,
  FileText,
  Briefcase,
  LinkIcon,
  HardDrive,
  Calendar,
  Globe
};

const colorOptions = [
  { name: "Verde", value: "bg-emerald-500" },
  { name: "Vermelho", value: "bg-red-500" },
  { name: "Azul", value: "bg-emerald-500" },
  { name: "Indigo", value: "bg-emerald-500" },
  { name: "Roxo", value: "bg-purple-500" },
  { name: "Laranja", value: "bg-orange-500" },
];

export default function LinksPage() {
  const confirm = useConfirm();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeLinkId = searchParams.get("id");
  const [links, setLinks] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Form State
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [color, setColor] = useState("bg-emerald-500");
  const [icon, setIcon] = useState("LinkIcon");
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("crm_shortcut_links");
    if (saved) {
      setLinks(JSON.parse(saved));
    } else {
      setLinks(initialLinks);
      localStorage.setItem("crm_shortcut_links", JSON.stringify(initialLinks));
    }
  }, []);

  const saveToStorage = (updatedLinks: any[]) => {
    setLinks(updatedLinks);
    localStorage.setItem("crm_shortcut_links", JSON.stringify(updatedLinks));
    window.dispatchEvent(new Event('crm_shortcut_links_updated'));
  };

  const handleAddLink = () => {
    if (!title || !url) return;
    let formattedUrl = url;
    if (!/^https?:\/\//i.test(url)) formattedUrl = `https://${url}`;
    const newLink = { id: crypto.randomUUID(), title, url: formattedUrl, icon, color };
    const updated = [...links, newLink];
    saveToStorage(updated);
    toast.success("Shortcut vinculado com sucesso.");
    resetForm();
  };

  const handleDeleteLink = async (id: string) => {
    if (!(await confirm({ title: 'Remover atalho', message: 'Desvincular este atalho permanentemente?', confirmLabel: 'Desvincular' }))) return;
    const updated = links.filter(l => l.id !== id);
    saveToStorage(updated);
    toast.success("Atalho removido.");
  };

  const resetForm = () => {
    setTitle("");
    setUrl("");
    setColor("bg-emerald-500");
    setIcon("LinkIcon");
    setIsModalOpen(false);
  };

  const filteredLinks = links.filter(l => l.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const activeLink = links.find(l => l.id === activeLinkId);

  if (activeLink) {
    const isBlockedIframe = 
      activeLink.url.includes("web.whatsapp.com") || 
      activeLink.url.includes("mail.google.com") || 
      activeLink.url.includes("docs.google.com") ||
      activeLink.url.includes("drive.google.com") ||
      activeLink.url.includes("calendar.google.com");
    const IconComponent = iconMap[activeLink.icon] || LinkIcon;

    return (
      <div className={cn(
        "flex flex-col gap-6 h-full transition-all duration-500",
        isFullScreen ? "fixed inset-0 z-[6000] bg-white dark:bg-zinc-950 p-4" : "min-h-[600px]"
      )}>
        <div className="flex items-center justify-between bg-white dark:bg-zinc-900 p-6 rounded-[32px] border border-slate-100 dark:border-zinc-800 shadow-sm">
           <div className="flex items-center gap-6">
              <button 
                onClick={() => { setSearchParams({}); setIsFullScreen(false); }}
                className="p-4 bg-slate-50 dark:bg-zinc-800 rounded-2xl text-slate-400 hover:text-emerald-600 transition-all active:scale-95"
              >
                 <X className="w-6 h-6" />
              </button>
              <div>
                 <h2 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter leading-none mb-1">{activeLink.title}</h2>
                 <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{activeLink.url}</p>
              </div>
           </div>

           <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsFullScreen(!isFullScreen)}
                className="px-6 py-4 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 border border-emerald-100 dark:border-emerald-900/40"
              >
                 {isFullScreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
                 {isFullScreen ? "Janela" : "Full Screen"}
              </button>
              <a 
                href={activeLink.url} 
                target="_blank" 
                rel="noreferrer" 
                className="px-6 py-4 bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-3 text-slate-400 hover:text-emerald-600 transition-all"
              >
                 Original <ExternalLink className="w-5 h-5" />
              </a>
           </div>
        </div>

        {isBlockedIframe ? (
          <div className="flex-1 bg-white dark:bg-zinc-900 rounded-[48px] border border-slate-100 dark:border-zinc-800 flex flex-col items-center justify-center p-20 text-center gap-8 shadow-sm">
             <div className={cn("w-24 h-24 rounded-[32px] flex items-center justify-center text-white shadow-2xl", activeLink.color || 'bg-emerald-600')}>
                <IconComponent className="w-12 h-12" />
             </div>
             <div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mb-4">Ambiente Externo Detectado</h3>
                <p className="text-sm font-medium text-slate-500 max-w-md mx-auto leading-relaxed uppercase tracking-tight">
                   Por motivos de segurança e políticas de CORS, este hub deve ser acessado em uma nova aba prioritária.
                </p>
             </div>
             <a 
               href={activeLink.url} 
               target="_blank" 
               rel="noreferrer" 
               className="px-12 py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[32px] font-black uppercase text-xs tracking-[0.2em] shadow-[0_0_28px_rgba(16,185,129,0.35)] active:scale-95 transition-all flex items-center gap-4"
             >
                Inaugurar {activeLink.title} <ExternalLink className="w-5 h-5" />
             </a>
          </div>
        ) : (
          <iframe 
            src={activeLink.url} 
            className="w-full flex-1 bg-white dark:bg-zinc-900 rounded-[48px] border border-slate-100 dark:border-zinc-800 shadow-sm" 
            title={activeLink.title}
          />
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-8 md:gap-10 pb-20">
      <PageHeader
        icon={Layers}
        title="Atalhos"
        subtitle="Suas ferramentas de trabalho em um só lugar"
        className="mb-0 lg:mb-0"
        actions={
          <div className="flex items-center gap-3">
            <div className="relative group max-w-md">
              <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-emerald-500 transition-colors" />
              <input
                type="text"
                placeholder="Buscar atalhos..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-12 pr-6 py-3.5 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-900 dark:text-zinc-100 outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all shadow-sm"
              />
            </div>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-black uppercase text-[11px] tracking-widest transition-all shadow-lg shadow-emerald-600/20 active:scale-95 flex items-center gap-2 group shrink-0"
            >
              <Plus className="w-5 h-5 group-hover:rotate-90 transition-transform" />
              Novo Atalho
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        <AnimatePresence mode="popLayout">
          {filteredLinks.map((link, i) => {
            const IconComponent = iconMap[link.icon] || LinkIcon;
            return (
              <motion.div
                key={link.id}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="group relative bg-white dark:bg-zinc-900 rounded-[40px] border border-slate-100 dark:border-zinc-850 p-10 shadow-sm hover:shadow-2xl hover:/30 dark:hover:shadow-none hover:border-emerald-200 transition-all flex flex-col h-full"
              >
                 <div className="flex items-start justify-between mb-8">
                    <div className={cn("w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-xl group-hover:scale-110 transition-transform", link.color)}>
                       <IconComponent className="w-8 h-8" />
                    </div>
                    <button 
                      onClick={() => handleDeleteLink(link.id)}
                      className="p-3 bg-slate-50 dark:bg-zinc-800 rounded-xl text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all active:scale-95"
                    >
                       <Trash2 className="w-4 h-4" />
                    </button>
                 </div>

                 <div className="flex-1 mb-10">
                    <h3 className="text-lg font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter leading-tight mb-2 group-hover:text-emerald-600 transition-colors">{link.title}</h3>
                    <p className="text-[10px] font-black text-slate-300 uppercase tracking-widest truncate">{link.url}</p>
                 </div>

                 <button 
                   onClick={() => setSearchParams({ id: link.id })}
                   className="w-full py-5 bg-slate-50 dark:bg-zinc-800 text-slate-400 group-hover:bg-emerald-600 group-hover:text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest transition-all flex items-center justify-center gap-3 border border-transparent shadow-sm "
                 >
                    Acessar <ArrowUpRight className="w-4 h-4" />
                 </button>
              </motion.div>
            )
          })}

          <motion.div
            layout
            onClick={() => setIsModalOpen(true)}
            className="bg-slate-50 dark:bg-zinc-950/20 rounded-[40px] border-4 border-dashed border-slate-100 dark:border-zinc-850 flex flex-col items-center justify-center p-10 group hover:bg-slate-100 dark:hover:bg-zinc-900/40 hover:border-emerald-200 transition-all cursor-pointer min-h-[320px]"
          >
             <div className="w-20 h-20 rounded-[32px] bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 flex items-center justify-center text-slate-300 group-hover:text-emerald-600 group-hover:scale-110 transition-all shadow-sm">
                <Plus className="w-10 h-10" />
             </div>
             <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest mt-6 group-hover:text-emerald-600">Criar Novo Atalho</span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Modal Premium Link */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[5000] flex items-center justify-center p-4">
             <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={resetForm} className="absolute inset-0 bg-slate-900/60 backdrop-blur-xl" />
             <motion.div initial={{ opacity: 0, scale: 0.9, y: 40 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 40 }} className="bg-white dark:bg-zinc-900 rounded-[56px] border border-slate-200 dark:border-zinc-800 shadow-2xl w-full max-w-xl relative z-[5001] overflow-hidden">
                <div className="p-10 border-b dark:border-zinc-850 flex items-center justify-between bg-slate-50/50 dark:bg-zinc-950/20">
                   <div>
                      <h3 className="text-2xl font-black uppercase tracking-tighter">Vincular Atalho</h3>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1 text-emerald-600">Personalização de Ecossistema Externo</p>
                   </div>
                   <button onClick={resetForm} className="p-4 bg-white dark:bg-zinc-800 rounded-2xl text-slate-300 hover:text-red-500 transition-all shadow-sm"><X className="w-6 h-6" /></button>
                </div>

                <div className="p-12 space-y-10">
                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Nome da Aplicação</label>
                      <input 
                        type="text" 
                        value={title} 
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="Ex: ERP Corporate"
                        className="w-full px-8 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[32px] text-sm font-black uppercase tracking-widest outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all"
                      />
                   </div>

                   <div className="space-y-4">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">Endereço Web (URL)</label>
                      <input 
                        type="text" 
                        value={url} 
                        onChange={(e) => setUrl(e.target.value)}
                        placeholder="dominio.com.br"
                        className="w-full px-8 py-5 bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[32px] text-sm font-black uppercase tracking-widest outline-none focus:ring-8 focus:ring-emerald-500/10 transition-all"
                      />
                   </div>

                   <div className="space-y-6">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-4">IdCliente Visual</label>
                      <div className="grid grid-cols-6 gap-4">
                        {colorOptions.map((opt) => (
                          <button 
                            key={opt.value}
                            onClick={() => setColor(opt.value)}
                            className={cn(
                              "w-12 h-12 rounded-2xl transition-all shadow-sm active:scale-90",
                              opt.value,
                              color === opt.value ? 'ring-4 ring-emerald-500/30 border-4 border-white dark:border-zinc-800 scale-110' : 'opacity-80'
                            )}
                          />
                        ))}
                      </div>
                   </div>

                   <button 
                     onClick={handleAddLink}
                     disabled={!title || !url}
                     className="w-full py-8 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[32px] font-black uppercase text-xs tracking-[0.2em] shadow-2xl active:scale-[0.98] transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                   >
                      <ShieldCheck className="w-6 h-6" />
                      Sincronizar Atalho
                   </button>
                </div>
             </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
