import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  FolderPlus,
  Upload,
  Folder,
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  FileImage,
  Download,
  Trash2,
  ChevronRight,
  Home,
  Loader2,
  HardDrive,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { offlineCache } from "../lib/offlineCache";
import { toast } from "sonner";

const BUCKET = "user_files";
const PLACEHOLDER = ".keep";

interface StorageItem {
  name: string;
  isFolder: boolean;
  size: number;
  updatedAt: string | null;
}

const formatSize = (bytes: number) => {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const fileMeta = (name: string) => {
  const ext = name.split(".").pop()?.toLowerCase() || "";
  if (["xls", "xlsx", "csv"].includes(ext)) return { Icon: FileSpreadsheet, color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-500/10" };
  if (["pdf", "doc", "docx", "txt"].includes(ext)) return { Icon: FileText, color: "text-rose-600 bg-rose-50 dark:bg-rose-500/10" };
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) return { Icon: FileImage, color: "text-violet-600 bg-violet-50 dark:bg-violet-500/10" };
  return { Icon: FileIcon, color: "text-slate-500 bg-slate-100 dark:bg-zinc-800" };
};

export default function Arquivos() {
  const { user } = useAuth();
  const [path, setPath] = useState<string[]>([]);
  const [items, setItems] = useState<StorageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const prefix = user ? [user.id, ...path].join("/") : "";

  const loadItems = useCallback(async () => {
    if (!user) return;
    if (!offlineCache.isOnline()) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });

    if (error) {
      toast.error("Erro ao carregar arquivos.");
      setLoading(false);
      return;
    }

    const mapped: StorageItem[] = (data || [])
      .filter((it) => it.name !== PLACEHOLDER && it.name !== ".emptyFolderPlaceholder")
      .map((it) => ({
        name: it.name,
        isFolder: it.id === null,
        size: (it as any).metadata?.size || 0,
        updatedAt: (it as any).updated_at || null,
      }));

    // pastas primeiro, depois arquivos
    mapped.sort((a, b) => (a.isFolder === b.isFolder ? a.name.localeCompare(b.name) : a.isFolder ? -1 : 1));
    setItems(mapped);
    setLoading(false);
  }, [user, prefix]);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleCreateFolder = async () => {
    const name = newFolderName.trim().replace(/[\/\\]/g, "");
    if (!name) return;
    if (items.some((i) => i.isFolder && i.name.toLowerCase() === name.toLowerCase())) {
      toast.error("Já existe uma pasta com esse nome.");
      return;
    }
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(`${prefix}/${name}/${PLACEHOLDER}`, new Blob([""], { type: "text/plain" }));
    if (error) {
      toast.error("Erro ao criar pasta.");
      return;
    }
    toast.success("Pasta criada!");
    setNewFolderName("");
    setCreatingFolder(false);
    loadItems();
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    let ok = 0;
    for (const file of Array.from(files)) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${prefix}/${file.name}`, file, { upsert: true });
      if (error) toast.error(`Falha ao enviar ${file.name}`);
      else ok++;
    }
    setUploading(false);
    if (ok > 0) toast.success(ok === 1 ? "Arquivo enviado!" : `${ok} arquivos enviados!`);
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadItems();
  };

  const handleDownload = async (name: string) => {
    const { data, error } = await supabase.storage.from(BUCKET).download(`${prefix}/${name}`);
    if (error || !data) {
      toast.error("Erro ao baixar arquivo.");
      return;
    }
    const url = URL.createObjectURL(data);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  // lista todos os caminhos de arquivo (recursivo) sob um prefixo
  const listAllPaths = async (folderPrefix: string): Promise<string[]> => {
    const { data } = await supabase.storage.from(BUCKET).list(folderPrefix, { limit: 1000 });
    let paths: string[] = [];
    for (const it of data || []) {
      const full = `${folderPrefix}/${it.name}`;
      if (it.id === null) paths = paths.concat(await listAllPaths(full));
      else paths.push(full);
    }
    return paths;
  };

  const handleDelete = async (item: StorageItem) => {
    const label = item.isFolder ? `a pasta "${item.name}" e todo o seu conteúdo` : `o arquivo "${item.name}"`;
    if (!window.confirm(`Deseja excluir ${label}? Esta ação não pode ser desfeita.`)) return;

    let toRemove: string[];
    if (item.isFolder) {
      toRemove = await listAllPaths(`${prefix}/${item.name}`);
    } else {
      toRemove = [`${prefix}/${item.name}`];
    }
    if (toRemove.length === 0) {
      // pasta vazia: remove o placeholder explicitamente
      toRemove = [`${prefix}/${item.name}/${PLACEHOLDER}`];
    }
    const { error } = await supabase.storage.from(BUCKET).remove(toRemove);
    if (error) {
      toast.error("Erro ao excluir.");
      return;
    }
    toast.success(item.isFolder ? "Pasta excluída." : "Arquivo excluído.");
    loadItems();
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    handleUpload(e.dataTransfer.files);
  };

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-emerald-600 rounded-2xl">
            <HardDrive className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black text-slate-900 dark:text-zinc-100 tracking-tight">Arquivos</h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">Guarde tabelas, pedidos e documentos. Organize em pastas.</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setCreatingFolder(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 text-[12px] font-black uppercase tracking-widest hover:border-emerald-300 hover:text-emerald-600 transition-all"
          >
            <FolderPlus className="w-4 h-4" /> Nova pasta
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-60"
          >
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Enviar arquivo
          </button>
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
        </div>
      </div>

      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 mb-5 text-[13px] font-bold flex-wrap">
        <button
          onClick={() => setPath([])}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${path.length === 0 ? "text-emerald-600" : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"}`}
        >
          <Home className="w-3.5 h-3.5" /> Início
        </button>
        {path.map((seg, i) => (
          <React.Fragment key={i}>
            <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
            <button
              onClick={() => setPath(path.slice(0, i + 1))}
              className={`px-2.5 py-1 rounded-lg transition-colors ${i === path.length - 1 ? "text-emerald-600" : "text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200"}`}
            >
              {seg}
            </button>
          </React.Fragment>
        ))}
      </div>

      {/* Nova pasta inline */}
      <AnimatePresence>
        {creatingFolder && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden mb-5"
          >
            <div className="flex items-center gap-2 p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl">
              <Folder className="w-5 h-5 text-emerald-600 shrink-0" />
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateFolder(); if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); } }}
                placeholder="Nome da pasta"
                className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-800 dark:text-zinc-100 placeholder:text-slate-400"
              />
              <button onClick={handleCreateFolder} className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors">Criar</button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(""); }} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><X className="w-4 h-4" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Lista */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
        onDragLeave={() => setDragActive(false)}
        onDrop={onDrop}
        className={`rounded-3xl border transition-colors ${dragActive ? "border-emerald-400 border-dashed bg-emerald-50/40 dark:bg-emerald-500/5" : "border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"}`}
      >
        {loading ? (
          <div className="flex items-center justify-center py-24 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : !offlineCache.isOnline() ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <HardDrive className="w-12 h-12 text-slate-200 dark:text-zinc-700 mb-4" />
            <p className="text-sm font-bold text-slate-500">Os arquivos precisam de conexão com a internet.</p>
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <div className="w-16 h-16 rounded-3xl bg-slate-50 dark:bg-zinc-800 flex items-center justify-center mb-5">
              <Folder className="w-8 h-8 text-slate-300 dark:text-zinc-600" />
            </div>
            <h4 className="text-base font-black text-slate-900 dark:text-zinc-100">Nada por aqui ainda</h4>
            <p className="text-sm text-slate-400 mt-1 max-w-xs font-medium">Arraste arquivos para cá ou use os botões acima para enviar e organizar.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50 dark:divide-zinc-800/60">
            {items.map((item) => {
              const meta = fileMeta(item.name);
              const Icon = item.isFolder ? Folder : meta.Icon;
              const iconClass = item.isFolder ? "text-amber-500 bg-amber-50 dark:bg-amber-500/10" : meta.color;
              return (
                <div
                  key={item.name}
                  className="group flex items-center gap-4 px-5 py-3.5 hover:bg-slate-50/70 dark:hover:bg-zinc-800/40 transition-colors"
                >
                  <button
                    onClick={() => item.isFolder ? setPath([...path, item.name]) : handleDownload(item.name)}
                    className="flex items-center gap-4 flex-1 min-w-0 text-left"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${iconClass}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate">{item.name}</p>
                      <p className="text-[11px] font-medium text-slate-400">
                        {item.isFolder ? "Pasta" : formatSize(item.size)}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!item.isFolder && (
                      <button
                        onClick={() => handleDownload(item.name)}
                        className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                        title="Baixar"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(item)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
