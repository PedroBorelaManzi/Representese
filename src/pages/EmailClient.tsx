import React, { useState, useEffect, useMemo, useRef } from "react";
import { Mail, Search, ChevronLeft, ChevronRight, Inbox, Send, Edit, Trash2, Plus, Sparkles, AlertCircle, ArrowLeft, Star, Reply, Forward, X, Minimize2, Maximize2, Loader2, RefreshCw, Clock, Info, ShieldAlert, Layers, Bookmark, Users, Zap, Paperclip, Download, FileText, ChevronDown } from "lucide-react";
import { cn } from "../lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { getGoogleEmailAuthUrl, getMicrosoftEmailAuthUrl, fetchEmailsFromApi, sendEmailViaApi, EmailMessage, EmailProvider, downloadAttachmentFromApi, fetchGoogleContacts } from "../lib/emailSync";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { supabase } from "../lib/supabase";

type ConnectedAccount = {
  id: string;
  provider: EmailProvider;
  email: string;
};

type EmailFolder = "inbox" | "sent" | "drafts" | "trash" | "starred" | "important" | "spam" | "snoozed" | "all";
type GmailCategory = "" | "CATEGORY_PERSONAL" | "CATEGORY_SOCIAL" | "CATEGORY_PROMOTIONS" | "CATEGORY_UPDATES";

interface Contact {
  name: string;
  email: string;
}

export default function EmailClient() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<ConnectedAccount | null>(null);
  
  // Navigation State
  const [currentFolder, setCurrentFolder] = useState<EmailFolder>("inbox");
  const [currentCategory, setCurrentCategory] = useState<GmailCategory>(""); // Start with empty (Primary)
  
  // Messages State
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  
  // UX Sizing States
  const [isFoldersCollapsed, setIsFoldersCollapsed] = useState(false);
  const [isReadingFocusMode, setIsReadingFocusMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);

  // Rich Contacts for autocomplete
  const [contacts, setContacts] = useState<Contact[]>([]);

  // Pagination
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);

  // Compose State
  const [isComposing, setIsComposing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [replyTo, setReplyTo] = useState("");
  const [replySubject, setReplySubject] = useState("");

      // Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [resolvedBody, setResolvedBody] = useState("");
  const [attachmentDataUrls, setAttachmentDataUrls] = useState<Record<string, string>>({});

  // 5. Resolve Inline Images (cid:)
  useEffect(() => {
    if (selectedEmail && selectedEmail.isHtml) {
      resolveInlineImages(selectedEmail);
    } else {
      setResolvedBody("");
    }
  }, [selectedEmail]);

        async function resolveInlineImages(email: EmailMessage) {
    let html = email.fullBody || "";
    setResolvedBody(html); 
    setAttachmentDataUrls({}); // Reset for new email

    if (!email.attachments || email.attachments.length === 0 || !user || !selectedAccount) return;

    // Find all cid references in the HTML
    const cidRegex = /cid:([^"'\s>)]+)/g;
    const matches = Array.from(html.matchAll(cidRegex));
    
    let updatedHtml = html;
    let changed = false;

    // Fetch images and CIDs
    const attachmentsToFetch = email.attachments.filter(att => 
      att.mimeType.startsWith("image/") || 
      matches.some(m => {
        const cleanMatch = m[1].replace(/[<>]/g, "");
        const cleanAttCid = att.contentId?.replace(/[<>]/g, "");
        return cleanMatch === cleanAttCid;
      })
    );

    for (const att of attachmentsToFetch) {
      try {
        const res = await downloadAttachmentFromApi(user.id, selectedAccount.provider, email.id, att.id, selectedAccount.email);
        if (res.success && res.data) {
          const base64Data = res.data.replace(/-/g, "+").replace(/_/g, "/");
          const dataUrl = "data:" + att.mimeType + ";base64," + base64Data;
          
          setAttachmentDataUrls(prev => {
            const next = { ...prev };
            next[att.id] = dataUrl;
            return next;
          });

          if (att.contentId) {
             const cleanCid = att.contentId.replace(/[<>]/g, "");
             // Replace both direct and URL-encoded versions
             updatedHtml = updatedHtml.split("cid:" + att.contentId).join(dataUrl);
             updatedHtml = updatedHtml.split("cid:" + cleanCid).join(dataUrl);
             updatedHtml = updatedHtml.split("cid:" + encodeURIComponent(att.contentId)).join(dataUrl);
             updatedHtml = updatedHtml.split("cid:" + encodeURIComponent(cleanCid)).join(dataUrl);
             changed = true;
          }
        }
      } catch (err) {}
    }

    if (changed) setResolvedBody(updatedHtml);
  }

  // 1. Load Connected Accounts
  useEffect(() => {
    if (!user) return;
    loadAccounts();
  }, [user]);

  async function loadAccounts() {
    const { data } = await supabase
      .from('user_email_tokens')
      .select('id, provider, email_address')
      .eq('user_id', user?.id);

    if (data) {
      setAccounts(data.map(d => ({
        id: d.id,
        provider: d.provider,
        email: d.email_address || "Conectado"
      })));
      
      // Auto-select if only one account
      if (data.length === 1 && !selectedAccount) {
        setSelectedAccount({
          id: data[0].id,
          provider: data[0].provider,
          email: data[0].email_address || "Conectado"
        });
      }
    }
  }

  async function deleteAccount(id: string) {
    if (!confirm("Tem certeza que deseja remover esta conta de e-mail?")) return;
    
    const { error } = await supabase
      .from('user_email_tokens')
      .delete()
      .eq('id', id);

    if (!error) {
       setAccounts(prev => prev.filter(acc => acc.id !== id));
       if (selectedAccount?.id === id) setSelectedAccount(null);
    } else {
       alert("Erro ao remover: " + error.message);
    }
  }

  
  // 3. Fetch Global Contacts
  useEffect(() => {
    if (selectedAccount && user && selectedAccount.provider === 'google') {
      fetchGoogleContacts(user.id, selectedAccount.email).then(newContacts => {
        if (newContacts.length > 0) {
          setContacts(prev => {
            const map = new Map<string, string>();
            prev.forEach(c => map.set(c.email, c.name));
            newContacts.forEach(c => map.set(c.email, c.name));
            return Array.from(map.entries()).map(([email, name]) => ({ name, email }));
          });
        }
      });
    }
  }, [selectedAccount, user]);

  // 2. Fetch Emails
  useEffect(() => {
    if (selectedAccount && user) {
      setEmails([]); 
      setNextPageToken(null);
      setErrorStatus(null);
      fetchEmails();
    }
  }, [selectedAccount, currentFolder, currentCategory]);

    async function handleDownloadAttachment(attachmentId: string, filename: string) {
    if (!user || !selectedAccount || !selectedEmail) return;
    
    try {
      const res = await downloadAttachmentFromApi(user.id, selectedAccount.provider, selectedEmail.id, attachmentId, selectedAccount.email);
      if (res.success && res.data) {
        const base64Data = res.data.replace(/-/g, '+').replace(/_/g, '/');
        const byteCharacters = atob(base64Data);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray]);
        
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert("Erro ao baixar anexo: " + res.error);
      }
    } catch (err: any) {
      alert("Falha no download: " + err.message);
    }
  }

  async function fetchEmails(pageToken?: string) {
    if (!user || !selectedAccount) return;
    
    setIsLoading(true);
    setErrorStatus(null);
    try {
      const activeCategory = currentFolder === 'inbox' ? currentCategory : "";
      const result = await fetchEmailsFromApi(user.id, selectedAccount.provider, currentFolder, pageToken, activeCategory, selectedAccount.email, searchQuery);
      
      if (result.success) {
        const newEmails = result.emails || [];
        
        if (pageToken) {
          setEmails(prev => {
            const existingIds = new Set(prev.map(e => e.id));
            const filtered = newEmails.filter(e => !existingIds.has(e.id));
            return [...prev, ...filtered];
          });
        } else {
          setEmails(newEmails);
        }
        
        setContacts(prev => {
           const map = new Map<string, string>();
           prev.forEach(c => map.set(c.email, c.name));
           
           newEmails.forEach(e => {
             if (e.fromEmail) {
               const existing = map.get(e.fromEmail);
               if (!existing || (e.from && e.from !== e.fromEmail && existing === e.fromEmail)) {
                 map.set(e.fromEmail, e.from);
               }
             }
             if (e.toEmail) {
               const existing = map.get(e.toEmail);
               const name = e.to || e.toEmail;
               if (!existing || (e.to && e.to !== e.toEmail && existing === e.toEmail)) {
                 map.set(e.toEmail, name);
               }
             }
           });
           
           return Array.from(map.entries()).map(([email, name]) => ({ name, email }));
        });

        setNextPageToken(result.nextPageToken || null);
      } else {
        setErrorStatus(result.error || "Erro ao carregar mensagens.");
      }
    } catch (err: any) {
      setErrorStatus(err.message || "Falha na conexão.");
    } finally {
      setIsLoading(false);
    }
  }

  const handleConnectProvider = async (provider: EmailProvider) => {
    if (provider === 'google') window.location.href = getGoogleEmailAuthUrl();
    else {
      try {
        const url = await getMicrosoftEmailAuthUrl();
        window.location.href = url;
      } catch (err: any) {
        alert(err.message || "Erro ao conectar conta da Microsoft.");
      }
    }
  };

  const getFolderIcon = (folder: EmailFolder) => {
    switch(folder) {
      case 'inbox': return <Inbox className="w-4 h-4" />;
      case 'starred': return <Star className="w-4 h-4" />;
      case 'snoozed': return <Clock className="w-4 h-4" />;
      case 'important': return <Bookmark className="w-4 h-4" />;
      case 'sent': return <Send className="w-4 h-4" />;
      case 'drafts': return <Edit className="w-4 h-4" />;
      case 'spam': return <ShieldAlert className="w-4 h-4" />;
      case 'trash': return <Trash2 className="w-4 h-4" />;
      case 'all': return <Layers className="w-4 h-4" />;
    }
  };

  const folderLabels: Record<EmailFolder, string> = {
    inbox: "Caixa de Entrada",
    starred: "Com Estrela",
    snoozed: "Adiados",
    important: "Importante",
    sent: "Enviados",
    drafts: "Rascunhos",
    spam: "Spam",
    trash: "Lixeira",
    all: "Todos os e-mails"
  };

  // Helper to optimize email body for mobile
    const getOptimizedHtml = (html: string) => {
    const meta = "<meta name='viewport' content='width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover'>";
    const style = "<style>" +
        ":root { color-scheme: light dark; }" +
        "html, body { height: auto !important; min-height: 0 !important; margin: 0; padding: 0; }" +
        "body { display: table; width: 100%; table-layout: fixed; }" +
        "body {" +
          "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;" +
          "font-size: 16px;" +
          "line-height: 1.6;" +
          "color: #1a1a1a;" +
          "margin: 0;" +
          "padding: 16px;" +
          "word-wrap: break-word;" +
          "overflow-wrap: break-word;" +
          "-webkit-text-size-adjust: 100%;" +
          "max-width: 100vw;" +
          "box-sizing: border-box;" +
        "}" +
        "img {" +
          "max-width: 100% !important;" +
          "height: auto !important;" +
          "display: block;" +
          "margin: 10px 0;" +
        "}" +
        "table {" +
          "width: 100% !important;" +
          "max-width: 100% !important;" +
          "height: auto !important;" +
          "table-layout: fixed !important;" +
          "border-collapse: collapse !important;" +
        "}" +
        "a { color: #059669; text-decoration: none; }" +
        "pre, code { white-space: pre-wrap; word-break: break-all; }" +
        ".dark-mode { color: #f4f4f5; background-color: #18181b; }" +
        "@media (max-width: 600px) {" +
          "html, body { height: auto !important; min-height: 0 !important; margin: 0; padding: 0; }" +
          "body { display: table; width: 100%; table-layout: fixed; }" +
          "body { padding: 12px; font-size: 15px; }" +
          ".no-mobile-padding { padding: 0 !important; }" +
        "}" +
      "</style>";
    
    return "<!DOCTYPE html>" +
      "<html>" +
        "<head>" +
          meta +
          style +
        "</head>" +
        "<body class='" + (settings.theme === 'dark' ? 'dark-mode' : '') + "'>" +
          html +
        "</body>" +
      "</html>";
  };

  if (!selectedAccount) {
    return (
      <div className="h-full flex flex-col items-center justify-center -mt-10">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl w-full text-center space-y-6 px-4">
          <div className="w-20 h-20 bg-emerald-100 dark:bg-emerald-900/30 rounded-[32px] flex items-center justify-center mx-auto mb-8 shadow-xl shadow-emerald-500/10">
            <Mail className="w-10 h-10 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">
            E-mails
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium text-base max-w-xl mx-auto leading-relaxed">
            Conecte sua conta do Gmail para ler e responder mensagens sem sair do sistema.
          </p>
          {accounts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-8 md:mt-12 text-left pb-20">
              {accounts.map(acc => (
                <button
                  key={acc.id}
                  onClick={() => setSelectedAccount(acc)}
                  className="p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] hover:border-emerald-500 hover:shadow-xl hover:-translate-y-1 transition-all group flex items-start gap-4 text-left relative overflow-hidden"
                >
                  <div className="w-12 h-12 rounded-full bg-slate-50 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                    <div className="w-6 h-6 flex items-center justify-center">
                      {acc.provider === 'google' ? (
                        <img src="https://upload.wikimedia.org/wikipedia/commons/5/53/Google_%22G%22_Logo.svg" alt="Google" className="w-5 h-5"/>
                      ) : (
                        <img src="https://upload.wikimedia.org/wikipedia/commons/4/44/Microsoft_logo.svg" alt="Microsoft" className="w-5 h-5"/>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0 pr-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Gmail</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate">{acc.email}</p>
                  </div>
                  <div 
                    onClick={(e) => { e.stopPropagation(); deleteAccount(acc.id); }}
                    className="absolute top-4 right-4 p-2.5 bg-red-50 text-red-600 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:bg-red-600 hover:text-white shadow-sm z-10 scale-90 group-hover:scale-100"
                    title="Remover conta"
                  >
                    <X className="w-4 h-4" />
                  </div>
                  <div className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 flex items-center justify-center absolute right-6 top-12 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all">
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </button>
              ))}
            </div>
          )}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-8">
             <button onClick={() => handleConnectProvider('google')} className="px-8 py-5 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl font-black text-xs uppercase tracking-widest text-slate-700 dark:text-zinc-300 hover:border-emerald-500 hover:text-emerald-600 transition-all flex items-center gap-3 shadow-sm active:scale-95">
               <Plus className="w-4 h-4" /> Nova Conta Gmail
             </button>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-4 p-2 lg:p-0 relative overflow-hidden">
      <div className="px-4 sm:px-0 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
           <button onClick={() => { setSelectedAccount(null); setSelectedEmail(null); }} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors mb-4">
             <ArrowLeft className="w-3 h-3" /> Voltar
           </button>
           <h1 className="text-3xl font-black text-slate-900 dark:text-zinc-100 flex items-center gap-3 uppercase tracking-tight">
             <div className="p-2 bg-emerald-600 rounded-[16px]">
               {getFolderIcon(currentFolder)}
             </div>
             {folderLabels[currentFolder]}
           </h1>
           <p className="text-xs font-semibold text-slate-500 dark:text-zinc-400 mt-2 flex items-center gap-2">
             <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> {selectedAccount.email}
           </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button onClick={() => { setEmails([]); fetchEmails(); }} className="p-4 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[20px] text-slate-500 hover:text-emerald-600 transition-all hover:border-emerald-500 shadow-sm" title="Sincronizar">
            <RefreshCw className={cn("w-5 h-5", isLoading && "animate-spin")} />
          </button>
          <button 
            onClick={() => {
              setReplyTo("");
              setReplySubject("");
              setIsComposing(true);
            }} 
            className="px-6 py-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-[20px] font-black uppercase text-[10px] tracking-widest transition-all shadow-md flex items-center justify-center gap-2"
          >
            <Edit className="w-4 h-4" /> Escrever
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-2 sm:gap-6 px-2 sm:px-0 bg-slate-50 dark:bg-zinc-950 overflow-hidden relative">
        <div className={cn(
          "hidden lg:flex flex-col gap-2 transition-all duration-300",
          selectedEmail && isReadingFocusMode ? "lg:hidden" : "",
          isFoldersCollapsed ? "w-20" : "w-64"
        )}>
           <div className="h-fit bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] p-4 flex flex-col shadow-sm">
              <div className="flex items-center justify-between px-2 mb-2">
                {!isFoldersCollapsed && <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pastas</span>}
                <button 
                  onClick={() => setIsFoldersCollapsed(!isFoldersCollapsed)}
                  className="p-1.5 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-lg text-slate-400 hover:text-slate-700 transition-colors mx-auto"
                  title={isFoldersCollapsed ? "Expandir menu" : "Recolher menu"}
                >
                  {isFoldersCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
                </button>
              </div>
              <nav className="space-y-1">
                 {(Object.keys(folderLabels) as EmailFolder[]).map(folder => (
                    <button 
                      key={folder}
                      onClick={() => { 
                        setCurrentFolder(folder); 
                        setSelectedEmail(null); 
                        if (folder !== 'inbox') setCurrentCategory("");
                        else setCurrentCategory(""); 
                      }} 
                      className={cn(
                        "w-full flex items-center rounded-2xl text-[11px] font-black uppercase tracking-wider transition-all py-3", 
                        isFoldersCollapsed ? "justify-center px-0 gap-0" : "gap-3 px-4",
                        currentFolder === folder ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:hover:bg-zinc-800/50"
                      )}
                      title={isFoldersCollapsed ? folderLabels[folder] : undefined}
                    >
                      {getFolderIcon(folder)} {!isFoldersCollapsed && <span>{folderLabels[folder]}</span>}
                    </button>
                 ))}
              </nav>
           </div>
        </div>

        <div className={cn(
          "flex flex-col bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] overflow-hidden shadow-sm transition-all duration-500 ease-in-out",
          selectedEmail ? "w-[280px] lg:w-80 flex-shrink-0 hidden md:flex" : "flex-1 w-full",
          selectedEmail && isReadingFocusMode && "lg:hidden"
        )}>
          {currentFolder === 'inbox' && (
            <div className="px-4 pt-4 flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-slate-50 dark:border-zinc-800 pb-2">
              {[
                { id: "", label: "Principal", icon: <Inbox className="w-3.5 h-3.5" /> },
                { id: "CATEGORY_PROMOTIONS", label: "Promoções", icon: <Zap className="w-3.5 h-3.5" /> },
                { id: "CATEGORY_SOCIAL", label: "Social", icon: <Users className="w-3.5 h-3.5" /> },
                { id: "CATEGORY_UPDATES", label: "Atualizações", icon: <Info className="w-3.5 h-3.5" /> }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setCurrentCategory(cat.id as GmailCategory)}
                  className={cn(
                    "flex items-center gap-2 px-4 py-3 rounded-full whitespace-nowrap text-[10px] font-black uppercase tracking-widest transition-all",
                    currentCategory === cat.id 
                      ? "bg-slate-900 dark:bg-white text-white dark:text-black shadow-lg" 
                      : "bg-slate-50 dark:bg-zinc-800 text-slate-400 hover:bg-slate-100"
                  )}
                >
                  {cat.icon} {cat.label}
                </button>
              ))}
            </div>
          )}

          <div className="p-4 flex items-center gap-3 relative">
             <Search className="w-4 h-4 text-slate-400 absolute left-8" />
             <input 
               type="text" 
               placeholder="Pesquisar..." 
               value={searchQuery}
               onChange={(e) => setSearchQuery(e.target.value)}
               onKeyDown={(e) => { if (e.key === 'Enter') { setEmails([]); fetchEmails(); } }}
               className="w-full bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 rounded-[20px] py-3 pl-10 pr-12 text-xs font-bold text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/10" 
             />
             <button 
               onClick={() => { setEmails([]); fetchEmails(); }}
               className="absolute right-8 p-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm"
               title="Buscar"
             >
               <Search className="w-3.5 h-3.5" />
             </button>
          </div>
          
          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
             {isLoading && emails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-50">
                   <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
                   <p className="text-[10px] font-black uppercase tracking-widest">Sincronizando...</p>
                </div>
             ) : errorStatus ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                   <AlertCircle className="w-12 h-12 text-red-400" />
                   <p className="text-sm font-bold text-slate-600 dark:text-zinc-400 max-w-[220px]">
                     {(errorStatus === "auth_expired" || errorStatus === "Token não disponível")
                       ? "Sua sessão com o Gmail expirou. Reconecte sua conta para continuar."
                       : "Não foi possível carregar os e-mails."}
                   </p>
                   <button
                     onClick={() => handleConnectProvider(selectedAccount.provider)}
                     className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-full font-black uppercase text-[10px] tracking-widest transition-colors shadow-md"
                   >
                     Reconectar Gmail
                   </button>
                   {errorStatus !== "auth_expired" && errorStatus !== "Token não disponível" && (
                     <button
                       onClick={() => fetchEmails()}
                       className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors"
                     >
                       Tentar novamente
                     </button>
                   )}
                </div>
             ) : emails.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center gap-6 opacity-40 p-12 text-center">
                   <div className="w-16 h-16 bg-slate-50 dark:bg-zinc-800 rounded-full flex items-center justify-center mx-auto mb-2">
                     <Mail className="w-8 h-8 text-slate-300" />
                   </div>
                   <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Tudo limpo por aqui!</h3>
                </div>
             ) : (
                <>
                  {emails.map(email => (
                    <button 
                      key={email.id}
                      onClick={() => { setSelectedEmail(email); setShowDetails(false); }}
                      className={cn(
                        "w-full text-left p-5 border-b border-slate-50 dark:border-zinc-800/50 hover:bg-slate-50 dark:hover:bg-zinc-800/20 transition-colors flex gap-4 relative",
                        selectedEmail?.id === email.id && "bg-emerald-50/50 dark:bg-emerald-500/5 border-l-4 border-l-emerald-500"
                      )}
                    >
                      {email.unread && <span className="absolute left-2.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-500 shadow-sm" />}
                      <div className="w-11 h-11 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center font-black text-emerald-600 shrink-0 text-sm border border-emerald-200 dark:border-emerald-800/50">
                        {email.from.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                           <span className={cn("text-xs font-black truncate pr-2", email.unread ? "text-slate-900 dark:text-zinc-100" : "text-slate-500 italic")}>
                             {currentFolder === 'sent' ? 'Para: ' + email.to : email.from}
                           </span>
                           <span className="text-[10px] font-black text-slate-400 shrink-0">{email.time}</span>
                        </div>
                        <p className={cn("text-xs truncate mb-1", email.unread ? "font-bold text-slate-800 dark:text-zinc-200" : "text-slate-600 dark:text-zinc-400")}>{email.subject}</p>
                        <p className="text-[11px] text-slate-400 truncate leading-snug">{email.preview}</p>
                      </div>
                    </button>
                  ))}
                  {nextPageToken && (
                    <button 
                      onClick={() => fetchEmails(nextPageToken)}
                      disabled={isLoading}
                      className="w-full py-8 text-[11px] font-black uppercase tracking-widest text-emerald-600 hover:bg-emerald-50 transition-all flex items-center justify-center gap-3"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin"/> : <RefreshCw className="w-4 h-4"/>}
                      {isLoading ? "Buscando..." : "Carregar mais mensagens"}
                    </button>
                  )}
                </>
             )}
          </div>
        </div>

        {selectedEmail && (
          <div className={cn(
            "flex-1 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-[32px] overflow-hidden flex flex-col z-10",
            "absolute inset-0 md:relative shadow-xl" 
          )}>
             <div className="px-6 py-4 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between bg-white dark:bg-zinc-950">
                <div className="flex items-center gap-4">
                   <button onClick={() => { setSelectedEmail(null); setIsReadingFocusMode(false); }} className="p-2.5 bg-slate-100 dark:bg-zinc-800 rounded-full"><ChevronLeft className="w-5 h-5"/></button>
                   <div className="flex gap-2">
                     <button 
                       onClick={() => {
                         setReplyTo(selectedEmail.fromEmail || "");
                         setReplySubject('Re: ' + selectedEmail.subject);
                         setIsComposing(true);
                       }}
                       className="p-3 rounded-2xl hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-slate-500 hover:text-emerald-600 transition-colors border border-slate-100 dark:border-zinc-800 flex items-center gap-2 font-black uppercase text-[10px] tracking-widest"
                     >
                       <Reply className="w-4 h-4" /> Responder
                     </button>
                     <button className="p-3 rounded-2xl hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-500 transition-colors border border-slate-100 dark:border-zinc-800"><Forward className="w-4 h-4" /></button>
                     <button 
                       onClick={() => setIsReadingFocusMode(!isReadingFocusMode)}
                       className={cn(
                         "p-3 rounded-2xl transition-all border flex items-center gap-2 font-black uppercase text-[10px] tracking-widest",
                         isReadingFocusMode 
                           ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" 
                           : "hover:bg-slate-50 dark:hover:bg-zinc-800 text-slate-500 border-slate-100 dark:border-zinc-800"
                       )}
                       title={isReadingFocusMode ? "Sair do Modo Foco" : "Modo Foco (Tela Inteira)"}
                     >
                       {isReadingFocusMode ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                       <span className="hidden sm:inline">{isReadingFocusMode ? "Restaurar" : "Modo Foco"}</span>
                     </button>
                   </div>
                </div>
                <button className="p-3 rounded-2xl hover:bg-red-50 text-red-500 transition-colors border border-red-100 dark:border-red-900/10"><Trash2 className="w-4 h-4" /></button>
             </div>

             <div className="flex-1 overflow-y-auto p-4 sm:p-14 custom-scrollbar bg-white dark:bg-zinc-900">
                <div className={cn("mx-auto transition-all duration-500", isReadingFocusMode ? "max-w-4xl" : "max-w-none")}>
                   <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-zinc-100 mb-6 sm:mb-10 leading-tight">{selectedEmail.subject}</h2>
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                     <div className="flex items-center gap-3 sm:gap-5">
                        <div className="w-10 h-10 sm:w-14 sm:h-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center font-black text-emerald-600 text-base sm:text-xl border-2 border-white dark:border-zinc-800 shadow-sm">
                          {selectedEmail.from.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-black text-slate-900 dark:text-zinc-100 text-sm sm:text-base truncate">{selectedEmail.from}</p>
                            <button 
                              onClick={() => setShowDetails(!showDetails)}
                              className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 rounded-full transition-colors"
                            >
                              <ChevronDown className={cn("w-4 h-4 text-slate-400 transition-transform", showDetails && "rotate-180")} />
                            </button>
                          </div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Para: {selectedEmail.to || 'mim'}</p>
                        </div>
                     </div>
                     <span className="self-start sm:self-center text-[9px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-2 rounded-full uppercase tracking-widest">{selectedEmail.time}</span>
                  </div>

                  {showDetails && (
                    <div className="mb-8 p-6 bg-slate-50 dark:bg-zinc-950 rounded-[24px] border border-slate-100 dark:border-zinc-800 text-[11px] font-bold space-y-2 animate-in fade-in slide-in-from-top-2">
                      <div className="flex gap-2"><span className="text-slate-400 uppercase w-16">de:</span> <span className="text-slate-700 dark:text-zinc-300">{selectedEmail.from} &lt;{selectedEmail.fromEmail}&gt;</span></div>
                      <div className="flex gap-2"><span className="text-slate-400 uppercase w-16">para:</span> <span className="text-slate-700 dark:text-zinc-300">{selectedEmail.to} &lt;{selectedEmail.toEmail}&gt;</span></div>
                      <div className="flex gap-2"><span className="text-slate-400 uppercase w-16">data:</span> <span className="text-slate-700 dark:text-zinc-300">{(selectedEmail as any).fullDate || selectedEmail.time}</span></div>
                      <div className="flex gap-2"><span className="text-slate-400 uppercase w-16">assunto:</span> <span className="text-slate-700 dark:text-zinc-300">{selectedEmail.subject}</span></div>
                    </div>
                  )}

                  <div className="space-y-8">
                    {selectedEmail.isHtml ? (
                      <div className="bg-white dark:bg-zinc-800 rounded-3xl overflow-hidden border border-slate-100 dark:border-zinc-800 shadow-sm transition-all duration-500">
                                                <iframe
                          srcDoc={getOptimizedHtml(resolvedBody || selectedEmail.fullBody || selectedEmail.preview)}
                          title="Email Content"
                          className="w-full border-none transition-all duration-300"
                          style={{ height: '200px', minHeight: '100px' }}
                          sandbox="allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin" referrerPolicy="no-referrer"
                          onLoad={(e) => {
                             const iframe = e.currentTarget;
                                                          const updateHeight = () => {
                               if (iframe.contentWindow) {
                                  try {
                                    iframe.style.height = "10px";
                                    const height = iframe.contentWindow.document.body.getBoundingClientRect().height;
                                    iframe.style.height = (Math.max(height, 50) + 40) + "px";
                                  } catch (err) {
                                    iframe.style.height = "auto";
                                  }
                               }
                             };
                             
                             updateHeight();
                             setTimeout(updateHeight, 500);
                             setTimeout(updateHeight, 1500);
                             setTimeout(updateHeight, 3000);
                          }}
                        />
                      </div>
                    ) : (
                      <div className="prose dark:prose-invert max-w-none text-slate-700 dark:text-zinc-300 text-sm sm:text-base leading-relaxed space-y-6 whitespace-pre-wrap font-medium bg-slate-50 dark:bg-zinc-900/50 p-6 sm:p-10 rounded-[32px] border border-slate-100 dark:border-zinc-800 overflow-x-auto custom-scrollbar">
                        {selectedEmail.fullBody || selectedEmail.preview}
                      </div>
                    )}

                    {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                      <div className="mt-12 pt-8 border-t border-slate-100 dark:border-zinc-800">
                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                          <Paperclip className="w-4 h-4" /> Anexos ({selectedEmail.attachments.length})
                        </h4>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                          {selectedEmail.attachments.map(att => (
                            <div 
                              key={att.id} 
                              onClick={() => handleDownloadAttachment(att.id, att.filename)}
                              className="group cursor-pointer flex flex-col bg-slate-50 dark:bg-zinc-800/30 border border-slate-200 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-emerald-500/50 transition-all shadow-sm"
                            >
                               <div className="h-28 bg-white dark:bg-zinc-900 flex items-center justify-center relative overflow-hidden">
                                  {att.mimeType.startsWith("image/") ? (
                                    <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-zinc-800">
                                       <img src={attachmentDataUrls[att.id] || "#"} alt="" className="w-full h-full object-cover" />
                                       <FileText className="w-8 h-8 text-slate-300 absolute" />
                                    </div>
                                  ) : (
                                    <div className="flex flex-col items-center gap-2">
                                      <div className="w-12 h-12 bg-red-50 dark:bg-red-900/20 rounded-lg flex items-center justify-center">
                                        <FileText className="w-6 h-6 text-red-500" />
                                      </div>
                                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">PDF</span>
                                    </div>
                                  )}
                                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                                    <Download className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-md" />
                                  </div>
                               </div>
                               <div className="p-3 bg-white dark:bg-zinc-950 border-t border-slate-100 dark:border-zinc-800">
                                  <p className="text-[10px] font-bold text-slate-700 dark:text-zinc-300 truncate mb-1">{att.filename}</p>
                                  <p className="text-[9px] font-medium text-slate-400 uppercase">{(att.size / 1024).toFixed(0)} KB</p>
                               </div>
                            </div>
                          ))}
                        </div>
                        </div>
                      )}
                  </div>
                </div>
             </div>
          </div>
        )}
      </div>

      <ComposeBalloon 
        isOpen={isComposing} 
        onClose={() => setIsComposing(false)} 
        userId={user?.id || ""} 
        provider={selectedAccount?.provider} emailAccount={selectedAccount?.email}
        contacts={contacts}
        initialTo={replyTo}
        initialSubject={replySubject}
      />
    </div>
  );
}

function ComposeBalloon({ 
  isOpen, 
  onClose, 
  userId, 
  provider, 
  contacts, 
  emailAccount,
  initialTo = "",
  initialSubject = ""
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  userId: string, 
  provider?: EmailProvider, 
  contacts: Contact[], 
  emailAccount?: string,
  initialTo?: string,
  initialSubject?: string
}) {
  const [to, setTo] = useState(initialTo);
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [attachments, setAttachments] = useState<{file: File, base64: string}[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isOpen) {
      setTo(initialTo);
      setSubject(initialSubject);
    }
  }, [isOpen, initialTo, initialSubject]);

  const [isMinimized, setIsMinimized] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredContacts = useMemo(() => {
    if (!to) return [];
    const search = to.toLowerCase();
    return contacts.filter(c => 
      c.name.toLowerCase().includes(search) || 
      c.email.toLowerCase().includes(search)
    ).slice(0, 8);
  }, [to, contacts]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        setAttachments(prev => [...prev, { file, base64 }]);
      };
      reader.readAsDataURL(file);
    });
    
    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  async function handleSend() {
    if (!to) { alert("Por favor, preencha o destinatário."); return; }
    if (!body) { alert("Por favor, preencha a mensagem."); return; }
    if (!provider) { alert("Conta de e-mail não disponível."); return; }

    setIsSending(true);
    try {
      const attData = attachments.map(a => ({
        filename: a.file.name,
        content: a.base64,
        mimeType: a.file.type
      }));

      const res = await sendEmailViaApi(userId, provider, to, subject, body, emailAccount, attData);
      if (res.success) {
        onClose();
        setTo(""); setSubject(""); setBody(""); setAttachments([]);
      } else {
        alert("Erro no envio: " + res.error);
      }
    } catch (err: any) {
      alert("Falha técnica: " + err.message);
    } finally {
      setIsSending(false);
    }
  }

  const avatarColors = ["bg-blue-500", "bg-emerald-500", "bg-purple-500", "bg-orange-500", "bg-pink-500", "bg-red-500"];
  const getAvatarColor = (name: string) => {
    const charCode = name.charCodeAt(0) || 0;
    return avatarColors[charCode % avatarColors.length];
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          ref={containerRef}
          initial={{ y: "100%", opacity: 0 }}
          animate={{ y: isMinimized ? "calc(100% - 80px)" : 0, opacity: 1 }}
          exit={{ y: "100%", opacity: 0 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className={cn(
            "fixed bottom-0 left-0 sm:left-auto right-0 sm:right-10 w-full sm:w-[550px] max-w-[100vw] bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-800 shadow-2xl sm:rounded-t-[40px] z-[100] flex flex-col",
            isMinimized ? "h-[80px]" : "h-[100dvh] sm:h-[750px]"
          )}
        >
          <div className="bg-slate-900 p-6 sm:rounded-t-[40px] flex items-center justify-between shrink-0">
             <h3 className="text-xs font-black uppercase tracking-[0.2em] text-white pl-2">Nova Mensagem</h3>
             <div className="flex items-center gap-3">
                <button onClick={() => setIsMinimized(!isMinimized)} className="p-2 hover:bg-white/10 rounded-xl text-white transition-colors">
                   {isMinimized ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
                </button>
                <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl text-white transition-colors"><X className="w-4 h-4" /></button>
             </div>
          </div>

          <div className={cn("flex-1 p-6 sm:p-10 flex flex-col gap-4 sm:gap-6 overflow-y-auto custom-scrollbar", isMinimized && "hidden")}>
             <div className="space-y-1 relative">
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Para</p>
               <input 
                 type="text" 
                 placeholder="Destinatário" 
                 value={to} 
                 onChange={(e) => { setTo(e.target.value); setShowSuggestions(true); }}
                 onFocus={() => setShowSuggestions(true)}
                 className="w-full bg-transparent border-b border-slate-100 dark:border-zinc-800 py-3 text-sm font-bold outline-none focus:border-emerald-500 transition-colors dark:text-zinc-100 placeholder:text-slate-300"
               />
               
               <AnimatePresence>
                {showSuggestions && filteredContacts.length > 0 && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="absolute top-full left-0 w-full bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 shadow-2xl rounded-3xl z-[120] mt-2 overflow-hidden py-2"
                  >
                      {filteredContacts.map(contact => (
                        <button 
                          key={contact.email}
                          onClick={() => { setTo(contact.email); setShowSuggestions(false); }}
                          className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-slate-50 dark:hover:bg-zinc-900 transition-colors group"
                        >
                          <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-white font-black text-sm uppercase shadow-sm", getAvatarColor(contact.name))}>
                            {contact.name.charAt(0)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 dark:text-zinc-100 truncate group-hover:text-emerald-600 transition-colors">
                              {contact.name}
                            </p>
                            <p className="text-xs font-medium text-slate-400 truncate">
                              {contact.email}
                            </p>
                          </div>
                        </button>
                      ))}
                  </motion.div>
                )}
               </AnimatePresence>
             </div>

             <div className="space-y-1">
               <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Assunto</p>
               <input type="text" placeholder="Qual o assunto hoje? (Opcional)" value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full bg-transparent border-b border-slate-100 dark:border-zinc-800 py-3 text-sm font-bold outline-none focus:border-emerald-500 transition-colors dark:text-zinc-100 placeholder:text-slate-300"/>
             </div>

             <div className="flex-1 flex flex-col min-h-0 space-y-4">
               <div className="flex-1 space-y-1">
                 <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-1">Mensagem</p>
                 <textarea placeholder="Sua história começa aqui..." value={body} onChange={(e) => setBody(e.target.value)} className="w-full h-full bg-transparent border-none outline-none resize-none text-sm leading-relaxed dark:text-zinc-200 placeholder:text-slate-300 focus:ring-0 shadow-none"/>
               </div>

               {attachments.length > 0 && (
                 <div className="flex flex-wrap gap-2 pt-2">
                   {attachments.map((att, idx) => (
                     <div key={idx} className="group relative flex items-center gap-2 px-3 py-2 bg-slate-50 dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-xl animate-in zoom-in-95 duration-200">
                        <FileText className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-[10px] font-bold text-slate-600 dark:text-zinc-400 truncate max-w-[120px]">{att.file.name}</span>
                        <button 
                          onClick={() => removeAttachment(idx)}
                          className="p-1 hover:bg-red-50 hover:text-red-500 rounded-lg transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                     </div>
                   ))}
                 </div>
               )}
             </div>

             <div className="pt-4 sm:pt-6 border-t border-slate-100 dark:border-zinc-800 flex items-center justify-between shrink-0 pb-6 sm:pb-0">
                <div className="flex items-center gap-2">
                   <input 
                     type="file" 
                     ref={fileInputRef} 
                     className="hidden" 
                     onChange={handleFileChange} 
                     multiple 
                   />
                   <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="p-4 text-slate-500 hover:text-emerald-600 bg-slate-50 dark:bg-zinc-900 rounded-2xl hover:bg-emerald-50 transition-all border border-slate-100 dark:border-zinc-800 shadow-sm"
                     title="Anexar arquivos"
                   >
                     <Paperclip className="w-5 h-5" />
                   </button>
                   <button className="p-4 text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl hover:bg-emerald-100 transition-colors"><Sparkles className="w-5 h-5" /></button>
                </div>
                <button 
                  disabled={isSending}
                  onClick={handleSend}
                  className="flex-1 sm:flex-none justify-center px-8 sm:px-12 py-4 sm:py-5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl sm:rounded-[24px] font-black uppercase text-[10px] sm:text-[11px] tracking-widest transition-all shadow-xl active:scale-95 disabled:opacity-50 flex items-center gap-3"
                >
                  {isSending ? "Enviando..." : "Enviar E-mail"} <Send className="w-4 h-4" />
                </button>
             </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}



























