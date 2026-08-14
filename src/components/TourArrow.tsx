import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";

interface TourArrowProps {
  /** Valor do atributo data-tour do elemento a apontar. */
  targetId: string;
  label: string;
}

/**
 * Seta flutuante usada pelo checklist "Primeiros passos": guia o usuário até
 * o botão certo depois que ele é levado pra outra página pelo tutorial.
 * Segue o elemento (resize/scroll) e some sozinha quando ele é clicado ou
 * depois de um tempo, pra nunca ficar "presa" na tela.
 */
export default function TourArrow({ targetId, label }: TourArrowProps) {
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    setVisible(true);
    const updateRect = () => {
      const el = document.querySelector(`[data-tour="${targetId}"]`);
      setRect(el ? el.getBoundingClientRect() : null);
    };
    updateRect();
    const interval = setInterval(updateRect, 300);
    window.addEventListener("resize", updateRect);
    window.addEventListener("scroll", updateRect, true);
    return () => {
      clearInterval(interval);
      window.removeEventListener("resize", updateRect);
      window.removeEventListener("scroll", updateRect, true);
    };
  }, [targetId]);

  // Efeito separado do polling de posição acima: depender de `rect` ali
  // cancelava e recriava o timer a cada 300ms (rect é um DOMRect novo a cada
  // leitura), então o timeout de 10s nunca chegava a disparar de verdade.
  // Também tenta de novo por alguns instantes: se o alvo (ex.: botão dentro
  // de um modal) ainda não montou no instante do primeiro render, os
  // listeners não ficam presos "sem dono".
  const attachedRef = useRef(false);
  useEffect(() => {
    attachedRef.current = false;
    let cleanupListeners: (() => void) | undefined;

    const tryAttach = () => {
      if (attachedRef.current) return;
      const el = document.querySelector(`[data-tour="${targetId}"]`);
      if (!el) return;
      attachedRef.current = true;
      clearInterval(retry);
      const dismiss = () => setVisible(false);
      el.addEventListener("click", dismiss, { once: true });
      const timer = setTimeout(dismiss, 10000);
      cleanupListeners = () => {
        el.removeEventListener("click", dismiss);
        clearTimeout(timer);
      };
    };

    const retry = setInterval(tryAttach, 300);
    tryAttach();
    return () => {
      clearInterval(retry);
      cleanupListeners?.();
    };
  }, [targetId]);

  if (!visible || !rect) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed z-[9999] pointer-events-none flex flex-col items-center"
        style={{ left: rect.left + rect.width / 2, top: rect.top - 64 }}
      >
        <div className="-translate-x-1/2 bg-slate-900 dark:bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-xl shadow-xl whitespace-nowrap">
          {label}
        </div>
        <motion.div
          animate={{ y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1 }}
          className="-translate-x-1/2 text-slate-900 dark:text-emerald-500 text-2xl leading-none mt-1"
          style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.25))" }}
        >
          ↓
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
