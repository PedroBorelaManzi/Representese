import React from "react";
import ReactDOM from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "../lib/utils";

export type NfCommissionStatus = "atrasado" | "pendente" | "confirmado";

const OPCOES: NfCommissionStatus[] = ["pendente", "confirmado", "atrasado"];

const ESTILO: Record<NfCommissionStatus, { bg: string; label: string }> = {
  atrasado: { bg: "bg-red-500", label: "Atrasado" },
  pendente: { bg: "bg-amber-400", label: "Pendente" },
  confirmado: { bg: "bg-emerald-500", label: "Confirmado" },
};

/** Seletor de status de baixa da comissão daquela NF — clique abre um menu
 *  com as 3 opções (atrasado/pendente/confirmado), em vez de ficar
 *  adivinhando alternando cor a cada clique. Persistência fica por conta de
 *  quem usa (onChange), igual ao resto dos campos de Entregas. */
export function NfCommissionStatusDot({
  status,
  onChange,
  className,
}: {
  status: NfCommissionStatus | null | undefined;
  onChange: (next: NfCommissionStatus) => void;
  className?: string;
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [menuRect, setMenuRect] = React.useState<{ top: number; left: number } | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const atual = status && ESTILO[status] ? status : null;

  const updateMenuRect = React.useCallback(() => {
    if (!wrapperRef.current) return;
    const rect = wrapperRef.current.getBoundingClientRect();
    setMenuRect({ top: rect.bottom + 6, left: rect.left });
  }, []);

  React.useEffect(() => {
    if (!isOpen) return;
    updateMenuRect();
    window.addEventListener("scroll", updateMenuRect, true);
    window.addEventListener("resize", updateMenuRect);
    return () => {
      window.removeEventListener("scroll", updateMenuRect, true);
      window.removeEventListener("resize", updateMenuRect);
    };
  }, [isOpen, updateMenuRect]);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (!wrapperRef.current?.contains(target) && !menuRef.current?.contains(target)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block" ref={wrapperRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setIsOpen((v) => !v); }}
        title={atual ? `Comissão desta NF: ${ESTILO[atual].label} — clique pra mudar` : "Baixa da comissão desta NF não definida — clique pra marcar"}
        aria-label="Status de baixa da comissão desta NF"
        className={cn("inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 border border-black/5 transition-transform active:scale-90", atual ? ESTILO[atual].bg : "bg-slate-200 dark:bg-zinc-700", className)}
      />

      {ReactDOM.createPortal(
        <AnimatePresence>
          {isOpen && menuRect && (
            <motion.div
              ref={menuRef}
              initial={{ opacity: 0, y: -6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.96 }}
              style={{ position: "fixed", top: menuRect.top, left: menuRect.left }}
              className="z-[1000] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] overflow-hidden p-1.5 min-w-[150px]"
            >
              {OPCOES.map((opt) => (
                <button
                  key={opt}
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onChange(opt); setIsOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-black transition-colors",
                    atual === opt ? "bg-slate-100 dark:bg-zinc-800 text-slate-900 dark:text-zinc-100" : "text-slate-600 dark:text-zinc-300 hover:bg-slate-50 dark:hover:bg-zinc-800"
                  )}
                >
                  <span className={cn("w-2.5 h-2.5 rounded-full shrink-0", ESTILO[opt].bg)} />
                  {ESTILO[opt].label}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}
