import { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
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
// esgota a memória e deixa o scroll extremamente travado. Em PDFs com fotos
// de produto (catálogos, por exemplo), cada canvas ativo decodifica e pinta
// imagens grandes — uma margem menor mantém menos páginas "pesadas" ativas
// ao mesmo tempo, o que ajuda o scroll a ficar mais leve.
const RENDER_MARGIN_PX = 700;
// Limites do fator do usuário (1 = largura da tela). Em catálogo com foto e
// texto pequeno, 1x no celular é ilegível — por isso o teto é generoso.
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const PASSO_ZOOM = 0.25;

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

  const aplicarZoom = useCallback((novo: number) => {
    setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +novo.toFixed(2))));
  }, []);

  // Zoom por pinça. Sem isso, no celular só dava para ampliar pelos botões +/−
  // do cabeçalho — num catálogo de produto, que é o uso real aqui, isso torna
  // a leitura penosa. A WebView não faz o pinch nativo porque o conteúdo é
  // canvas dentro de um container com rolagem própria.
  const pinchRef = useRef<{ distanciaInicial: number; zoomInicial: number } | null>(null);

  const distanciaEntreDedos = (t: React.TouchList) => {
    const dx = t[0].clientX - t[1].clientX;
    const dy = t[0].clientY - t[1].clientY;
    return Math.hypot(dx, dy);
  };

  const aoTocarInicio = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 2) return;
      pinchRef.current = { distanciaInicial: distanciaEntreDedos(e.touches), zoomInicial: zoom };
    },
    [zoom]
  );

  const aoTocarMover = useCallback(
    (e: React.TouchEvent) => {
      const p = pinchRef.current;
      if (!p || e.touches.length !== 2) return;
      const atual = distanciaEntreDedos(e.touches);
      if (!p.distanciaInicial) return;
      aplicarZoom(p.zoomInicial * (atual / p.distanciaInicial));
    },
    [aplicarZoom]
  );

  const aoTocarFim = useCallback((e: React.TouchEvent) => {
    if (e.touches.length < 2) pinchRef.current = null;
  }, []);

  // Recalculado só quando o total de páginas muda — antes era recriado (novo
  // array, novos elementos React p/ as 16+ páginas) a cada re-render do modal,
  // inclusive nos disparados só pelo indicador "Página X de Y" durante o
  // scroll. Junto com o React.memo em PdfPage, isso é o que fazia rolar a
  // tela recalcular/rediferenciar todas as páginas a cada troca de página
  // visível, mesmo as que não tinham mudado nada.
  const pageNumbers = useMemo(() => Array.from({ length: numPages }, (_, i) => i + 1), [numPages]);

  if (!isOpen) return null;

  const fitScale = pageSize && containerWidth ? (containerWidth - 32) / pageSize.width : 1;
  // O clamp é no fator do usuário (feito em aplicarZoom), não no produto final:
  // limitar o produto fazia o zoom parar de responder em telas estreitas, onde
  // fitScale já é pequeno e o resultado batia no teto antes do usuário chegar lá.
  const scale = fitScale * zoom;

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
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => aplicarZoom(zoom - PASSO_ZOOM)}
                disabled={zoom <= MIN_ZOOM}
                className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
                title="Diminuir zoom"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              {/* Toque no número volta pro tamanho que cabe na largura da tela —
                  sem isso, depois de ampliar era preciso ficar clicando no "−". */}
              <button
                onClick={() => aplicarZoom(1)}
                className="min-w-[3.25rem] px-1 py-1 rounded-lg text-[10px] font-black tabular-nums text-slate-500 dark:text-zinc-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                title="Ajustar à largura da tela"
              >
                {Math.round(zoom * 100)}%
              </button>
              <button
                onClick={() => aplicarZoom(zoom + PASSO_ZOOM)}
                disabled={zoom >= MAX_ZOOM}
                className="p-2.5 rounded-xl text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors disabled:opacity-30"
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

          {/* overflow-auto (não só -y): ampliada, a página fica mais larga que a
              tela e precisa rolar na horizontal. touch-action pan-x/pan-y deixa
              a rolagem com um dedo funcionando enquanto a pinça de dois dedos é
              tratada por nós. */}
          <div
            ref={containerRef}
            onTouchStart={aoTocarInicio}
            onTouchMove={aoTocarMover}
            onTouchEnd={aoTocarFim}
            onTouchCancel={aoTocarFim}
            style={{ touchAction: "pan-x pan-y" }}
            className="flex-1 min-h-0 overflow-auto bg-slate-200 dark:bg-zinc-950 custom-scrollbar"
          >
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
              /* w-max + mx-auto em vez de items-center: com items-center, uma
                 página mais larga que o container transborda para os dois lados
                 e a metade esquerda fica inalcançável — não há como rolar até
                 ela. Com a largura acompanhando o conteúdo, as margens
                 automáticas centralizam quando cabe e zeram quando não cabe,
                 aí a rolagem horizontal alcança a página inteira. */
              <div className="w-max mx-auto flex flex-col items-center gap-4 py-6 px-4">
                {pageNumbers.map((pageNumber) => (
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

// memo() é o que faz a virtualização acima realmente valer: sem ele, cada
// setCurrentPage (disparado a cada página que cruza a borda de visibilidade
// durante o scroll) re-renderizava o PdfViewerModal inteiro, e como PdfPage
// não era memoizado, React rediferenciava as 16+ páginas a cada frame de
// scroll — inclusive as que não tinham nada pra atualizar. Num catálogo com
// fotos de produto pesadas, isso sozinho já travava a rolagem. Com memo(),
// uma página só re-renderiza quando as PRÓPRIAS props mudam (zoom, ou ela
// entrar/sair da janela de renderização).
const PdfPage = memo(function PdfPage({
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
});
