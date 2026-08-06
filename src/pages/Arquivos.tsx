import React, { useState, useRef, useEffect } from "react";
import {
  FolderPlus,
  FolderUp,
  Upload,
  Folder,
  File as FileIcon,
  FileText,
  FileSpreadsheet,
  FileImage,
  Download,
  Trash2,
  ChevronRight,
  ChevronDown,
  Home,
  Loader2,
  HardDrive,
  X,
  Eye,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { offlineCache } from "../lib/offlineCache";
import { PageHeader, Skeleton, useConfirm } from "../components/ui";
import { PdfViewerModal } from "../components/PdfViewerModal";
import { toast } from "sonner";

const BUCKET = "user_files";
const PLACEHOLDER = ".keep";
// Acima disso o upload direto (PUT único) fica frágil em redes lentas/instáveis;
// usamos upload retomável (TUS) em partes de 6MB, que retoma sozinho se cair a conexão.
const RESUMABLE_THRESHOLD = 6 * 1024 * 1024;

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

async function listFolder(prefix: string): Promise<StorageItem[]> {
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (error) throw error;

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
  return mapped;
}

export default function Arquivos() {
  const { user } = useAuth();
  const confirm = useConfirm();
  const [path, setPath] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{ name: string; pct: number } | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [pdfPreview, setPdfPreview] = useState<{ url: string; name: string } | null>(null);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const uploadMenuBoxRef = useRef<HTMLDivElement>(null);

  // Fecha o menu "Enviar arquivo" ao clicar fora
  useEffect(() => {
    if (!uploadMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (uploadMenuBoxRef.current && !uploadMenuBoxRef.current.contains(e.target as Node)) setUploadMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [uploadMenuOpen]);

  const prefix = user ? [user.id, ...path].join("/") : "";

  // Cache por pasta: reabrir uma pasta já visitada nesta sessão mostra a lista
  // na hora (sem esperar a rede) enquanto revalida em segundo plano.
  const { data: items = [], isLoading: loading, refetch: loadItems } = useQuery({
    queryKey: ["storage-list", user?.id, prefix],
    queryFn: () => listFolder(prefix),
    enabled: !!user && offlineCache.isOnline(),
    staleTime: 60 * 1000,
  });

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

  // Upload retomável (TUS) em partes de 6MB — não perde o progresso se a conexão cair
  // no meio do envio, o que é essencial para arquivos grandes em redes instáveis.
  // Import dinâmico: a lib só é baixada quando alguém realmente envia um
  // arquivo grande, em vez de pesar no carregamento inicial da página.
  const uploadResumable = async (file: File, objectPath: string, accessToken: string) => {
    const tus = await import("tus-js-client");
    return new Promise<void>((resolve, reject) => {
      const upload = new tus.Upload(file, {
        endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable`,
        retryDelays: [0, 3000, 5000, 10000, 20000],
        headers: {
          authorization: `Bearer ${accessToken}`,
          "x-upsert": "true",
        },
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: {
          bucketName: BUCKET,
          objectName: objectPath,
          contentType: file.type || "application/octet-stream",
          cacheControl: "3600",
        },
        chunkSize: 6 * 1024 * 1024,
        onError: reject,
        onProgress: (bytesUploaded, bytesTotal) => {
          setUploadProgress({ name: file.name, pct: Math.round((bytesUploaded / bytesTotal) * 100) });
        },
        onSuccess: () => resolve(),
      });
      upload.start();
    });
  };

  const handleUpload = async (files: FileList | null) => {
    if (!files || files.length === 0 || !user) return;
    setUploading(true);
    let ok = 0;

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    // Arquivo vindo de uma pasta importada (input com webkitdirectory) traz o
    // caminho relativo completo em vez de só o nome — ex.: "Pedidos/2026/nota.pdf".
    // Usar esse caminho reconstrói a mesma árvore de pastas (e subpastas) dentro
    // da pasta atual, em vez de jogar tudo solto no nível corrente.
    const relativePathOf = (file: File) => (file as any).webkitRelativePath || file.name;
    const firstPath = relativePathOf(files[0]);
    const importedFolderName = firstPath.includes("/") ? firstPath.split("/")[0] : null;

    for (const file of Array.from(files)) {
      const objectPath = `${prefix}/${relativePathOf(file)}`;
      try {
        if (file.size > RESUMABLE_THRESHOLD && accessToken) {
          setUploadProgress({ name: file.name, pct: 0 });
          await uploadResumable(file, objectPath, accessToken);
        } else {
          const { error } = await supabase.storage.from(BUCKET).upload(objectPath, file, { upsert: true });
          if (error) throw error;
        }
        ok++;
      } catch (err: any) {
        const msg = /payload too large|exceeded|max.*size/i.test(err?.message || "")
          ? `${file.name} excede o limite de tamanho permitido pelo servidor.`
          : `Falha ao enviar ${file.name}.`;
        toast.error(msg);
      }
    }

    setUploadProgress(null);
    setUploading(false);
    if (ok > 0) {
      toast.success(
        importedFolderName
          ? `Pasta "${importedFolderName}" importada com ${ok} ${ok === 1 ? "arquivo" : "arquivos"}!`
          : ok === 1 ? "Arquivo enviado!" : `${ok} arquivos enviados!`
      );
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (folderInputRef.current) folderInputRef.current.value = "";
    loadItems();
  };

  // Abre o arquivo para VISUALIZAR. PDFs abrem no visualizador interno
  // (renderiza só as páginas próximas da área visível, então o scroll
  // continua leve mesmo em arquivos de centenas de páginas); os demais
  // tipos abrem numa nova aba / visualizador do celular, com compartilhar nativo.
  const handleOpen = async (name: string) => {
    const isPdf = name.toLowerCase().endsWith(".pdf");
    const win = isPdf ? null : window.open("", "_blank");
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${prefix}/${name}`, 60 * 60);
    if (error || !data?.signedUrl) {
      win?.close();
      toast.error("Erro ao abrir arquivo.");
      return;
    }
    if (isPdf) {
      setPdfPreview({ url: data.signedUrl, name });
    } else if (win) {
      win.location.href = data.signedUrl;
    } else {
      window.open(data.signedUrl, "_blank");
    }
  };

  // Baixa o arquivo (salvar no dispositivo) — ação explícita.
  // Usa URL assinada + download nativo do navegador em vez de carregar o
  // blob inteiro na memória do JS, o que deixa arquivos grandes muito mais rápidos.
  const handleDownload = async (name: string) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(`${prefix}/${name}`, 60 * 60, { download: name });
    if (error || !data?.signedUrl) {
      toast.error("Erro ao baixar arquivo.");
      return;
    }
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = name;
    a.click();
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
    if (!(await confirm({ title: item.isFolder ? 'Excluir pasta' : 'Excluir arquivo', message: `Deseja excluir ${label}? Esta ação não pode ser desfeita.` }))) return;

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
      {/* Header padrão */}
      <PageHeader
        icon={HardDrive}
        title="Arquivos"
        subtitle="Tabelas, pedidos e documentos em pastas"
        actions={
          <>
            <button
              onClick={() => setCreatingFolder(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-slate-700 dark:text-zinc-200 text-[10px] font-black uppercase tracking-widest hover:border-emerald-300 hover:text-emerald-600 transition-all"
            >
              <FolderPlus className="w-4 h-4" /> Nova pasta
            </button>
            <div className="relative" ref={uploadMenuBoxRef}>
              <button
                onClick={() => setUploadMenuOpen((o) => !o)}
                disabled={uploading}
                className="flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-60"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadProgress ? `Enviando ${uploadProgress.pct}%` : "Enviar arquivo"}
                {!uploading && <ChevronDown className="w-3.5 h-3.5" />}
              </button>

              <AnimatePresence>
                {uploadMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.97 }}
                    className="absolute right-0 mt-2 w-56 bg-white dark:bg-zinc-900 rounded-2xl border border-slate-200 dark:border-zinc-800 shadow-2xl z-[9000] overflow-hidden"
                  >
                    <button
                      onClick={() => { setUploadMenuOpen(false); fileInputRef.current?.click(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors"
                    >
                      <Upload className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="text-sm font-bold text-slate-700 dark:text-zinc-200">Arquivos</span>
                    </button>
                    <button
                      onClick={() => { setUploadMenuOpen(false); folderInputRef.current?.click(); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-zinc-800/60 transition-colors border-t border-slate-50 dark:border-zinc-800/60"
                    >
                      <FolderUp className="w-4 h-4 text-emerald-600 shrink-0" />
                      <div>
                        <span className="text-sm font-bold text-slate-700 dark:text-zinc-200 block">Pasta</span>
                        <span className="text-[10px] font-medium text-slate-400">Importa a pasta e tudo dentro dela</span>
                      </div>
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <input ref={fileInputRef} type="file" multiple className="hidden" onChange={(e) => handleUpload(e.target.files)} />
            <input
              ref={folderInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => handleUpload(e.target.files)}
              {...({ webkitdirectory: "", directory: "", mozdirectory: "" } as any)}
            />
          </>
        }
      />

      {uploadProgress && (
        <div className="mb-5 -mt-2">
          <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
            <span className="truncate">{uploadProgress.name}</span>
            <span className="text-emerald-600">{uploadProgress.pct}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-zinc-800 overflow-hidden">
            <div className="h-full bg-emerald-600 transition-all duration-300" style={{ width: `${uploadProgress.pct}%` }} />
          </div>
        </div>
      )}

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
          <div className="p-6 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 py-3">
                <Skeleton className="w-10 h-10 rounded-2xl shrink-0" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-1/3" />
                  <Skeleton className="h-3 w-1/6" />
                </div>
                <Skeleton className="h-4 w-14" />
              </div>
            ))}
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
                    onClick={() => item.isFolder ? setPath([...path, item.name]) : handleOpen(item.name)}
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

                  <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                    {!item.isFolder && (
                      <>
                        <button
                          onClick={() => handleOpen(item.name)}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                          title="Visualizar"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDownload(item.name)}
                          className="p-2 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                          title="Baixar"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </>
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

      <PdfViewerModal
        isOpen={!!pdfPreview}
        onClose={() => setPdfPreview(null)}
        url={pdfPreview?.url ?? null}
        fileName={pdfPreview?.name}
        onDownload={() => pdfPreview && handleDownload(pdfPreview.name)}
      />
    </div>
  );
}
