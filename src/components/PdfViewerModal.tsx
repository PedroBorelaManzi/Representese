import { useState, useEffect, useRef, useCallback } from "react";
import { X, Loader2, AlertTriangle, Download, ZoomIn, ZoomOut } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { loadPdfjs } from "../lib/pdfjsLoader";

interface PdfViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string | null;
  fileName?: string;
  onDownload?: () => void;
}

// Só renderiza em canvas as páginas dentro dessa margem (em px) da área
// visível — o resto vira placeholder vazio. Sem isso, um PDF de centenas
// de páginas tentaria manter todas renderizadas ao mesmo tempo, o que
// esgota a memória e deixa o scroll extremamente travado.
const RENDER_MARGIN_PX = 1200;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2.5;

export function PdfViewerModal({ isOpen, onClose, url, fileName, onDownload }: PdfViewerModalProps) {
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  // Páginas com pelo menos parte visível na tela agora — usado só pro
  // indicador "Página X de Y", que deve mostrar a mais no topo, não a
  // última cujo observer disparou (senão fica pulando pra qualquer uma).
  const visiblePagesRef = useRef<Set<number>>(new Set());

  const handleVisibilityChange = useCallback((pageNumber: number, isVisible: boolean) => {
    if (isVisible) visiblePagesRef.current.add(pageNumber);
    else visiblePagesRef.current.delete(pageNumber);
    if (visiblePagesRef.current.size > 0) {
      setCurrentPage(Math.min(...visiblePagesRef.current));
    }
  }, []);

  // Carrega o documento — pdfjs faz range requests (só baixa os bytes das
  // páginas que precisa), então nem o carregamento inicial baixa o arquivo
  // inteiro de uma vez, mesmo para PDFs grandes.
  useEffect(() => {
    if (!isOpen || !url) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    setPdf(null);
    setNumPages(0);
    setZoom(1);
    setCurrentPage(1);

    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ url, isEvalSupported: false }).promise;
        if (cancelled) return;
        const firstPage = await doc.getPage(1);
        if (cancelled) return;
        const viewport = firstPage.getViewport({ scale: 1 });
        setPageSize({ width: viewport.width, height: viewport.height });
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (err) {
        console.error("Erro ao abrir PDF:", err);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, url]);

  useEffect(() => {
    if (!isOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setContainerWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fitScale = pageSize && containerWidth ? (containerWidth - 32) / pageSize.width : 1;
  const scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitScale * zoom));

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
            <div className="min-w-0">
              <p className="text-sm font-black text-slate-900 dark:text-zinc-100 truncate max-w-[50vw]">{fileName || "Documento"}</p>
              {numPages > 0 && (
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Página {currentPage} de {numPages}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
                className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                title="Diminuir zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <button
                onClick={() => setZoom((z) => Math.min(1.8, +(z + 0.15).toFixed(2)))}
                className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                title="Aumentar zoom"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
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

          <div ref={containerRef} className="flex-1 min-h-0 overflow-y-auto bg-slate-200 dark:bg-zinc-950 custom-scrollbar">
            {loading ? (
              <div className="h-full flex flex-col items-center justify-center gap-3">
                <Loader2 className="w-8 h-8 animate-spin text-white/60" />
                <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Abrindo documento...</p>
              </div>
            ) : error ? (
              <div className="h-full flex flex-col items-center justify-center gap-3 text-center px-6">
                <AlertTriangle className="w-8 h-8 text-amber-500" />
                <p className="text-xs font-bold text-white/80">Não foi possível abrir este documento.</p>
              </div>
            ) : pdf && pageSize && containerWidth > 0 ? (
              <div className="flex flex-col items-center gap-4 py-6">
                {Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => (
                  <PdfPage
                    key={pageNumber}
                    pdf={pdf}
                    pageNumber={pageNumber}
                    scale={scale}
                    fallbackWidth={pageSize.width * scale}
                    fallbackHeight={pageSize.height * scale}
                    root={containerRef.current}
                    onVisibilityChange={handleVisibilityChange}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}

function PdfPage({
  pdf,
  pageNumber,
  scale,
  fallbackWidth,
  fallbackHeight,
  root,
  onVisibilityChange,
}: {
  pdf: any;
  pageNumber: number;
  scale: number;
  fallbackWidth: number;
  fallbackHeight: number;
  root: HTMLDivElement | null;
  onVisibilityChange: (pageNumber: number, isVisible: boolean) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // As duas primeiras páginas já entram renderizadas — evita uma tela em
  // branco no instante entre o modal abrir e o IntersectionObserver disparar.
  const [shouldRender, setShouldRender] = useState(pageNumber <= 2);
  const renderTaskRef = useRef<any>(null);

  // Janela larga: decide o que fica renderizado em canvas.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShouldRender(entry.isIntersecting),
      { root, rootMargin: `${RENDER_MARGIN_PX}px 0px ${RENDER_MARGIN_PX}px 0px`, threshold: 0 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [root]);

  // Janela justa (sem margem): só pro indicador "Página X de Y" refletir
  // de fato o que está na tela, não o que já foi pré-carregado ao redor.
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el || !root) return;
    const observer = new IntersectionObserver(
      ([entry]) => onVisibilityChange(pageNumber, entry.isIntersecting),
      { root, rootMargin: "0px", threshold: 0.15 }
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      onVisibilityChange(pageNumber, false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  useEffect(() => {
    if (!shouldRender) {
      // Libera o canvas de páginas fora da janela visível — manter todas
      // renderizadas ao mesmo tempo é o que trava o scroll em PDFs grandes.
      renderTaskRef.current?.cancel();
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = 0;
        canvas.height = 0;
      }
      return;
    }

    let cancelled = false;
    (async () => {
      const page = await pdf.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const canvas = canvasRef.current;
      if (!canvas) return;

      const outputScale = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

      const task = page.render({ canvasContext: ctx, viewport, transform });
      renderTaskRef.current = task;
      try {
        await task.promise;
      } catch (err: any) {
        if (err?.name !== "RenderingCancelledException") console.error(err);
      }
    })();

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
    };
  }, [shouldRender, pdf, pageNumber, scale]);

  return (
    <div
      ref={wrapperRef}
      style={{ width: fallbackWidth, height: fallbackHeight }}
      className="bg-white shadow-lg shrink-0"
    >
      <canvas ref={canvasRef} />
    </div>
  );
}
