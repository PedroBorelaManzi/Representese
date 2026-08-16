import { useState, useEffect } from "react";
import { X, Loader2, AlertTriangle, Download } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useFecharComBotaoVoltar } from "../lib/backOverlays";

interface ImageViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  fileName?: string;
  onDownload?: () => void;
}

export function ImageViewerModal({ isOpen, onClose, url, fileName, onDownload }: ImageViewerModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!isOpen || !url) return;
    setLoading(true);
    setError(false);
  }, [isOpen, url]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // No Android, "Voltar" fecha o visualizador em vez de sair da página.
  useFecharComBotaoVoltar(isOpen, onClose);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[300] flex flex-col">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
        />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="relative z-10 flex flex-col h-full min-h-0"
        >
          <div className="flex items-center justify-between gap-4 px-6 py-4 bg-white dark:bg-zinc-900 border-b border-slate-200 dark:border-zinc-800">
            <p className="text-sm font-black text-slate-900 dark:text-zinc-100 truncate max-w-[60vw]">{fileName || "Imagem"}</p>
            <div className="flex items-center gap-2 shrink-0">
              {onDownload && (
                <button
                  onClick={onDownload}
                  className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                  title="Baixar"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                title="Fechar"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 min-h-0 overflow-auto bg-slate-200 dark:bg-zinc-950 custom-scrollbar flex items-center justify-center p-4">
            {loading && !error && (
              <div className="absolute flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-white/60" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Abrindo imagem...</p>
              </div>
            )}
            {error ? (
              <div className="flex flex-col items-center justify-center gap-3 text-center px-6">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <p className="text-xs font-bold text-white/80">Não foi possível abrir esta imagem.</p>
              </div>
            ) : url ? (
              <img
                src={url}
                alt={fileName || "Imagem"}
                onLoad={() => setLoading(false)}
                onError={() => { setLoading(false); setError(true); }}
                className={`max-w-full max-h-full object-contain rounded-lg shadow-2xl transition-opacity ${loading ? "opacity-0" : "opacity-100"}`}
              />
            ) : null}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
