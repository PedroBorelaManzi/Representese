import React from "react";
import { EyeOff } from "lucide-react";
import { cn } from "../lib/utils";
import { useCommissionPrivacy } from "../contexts/CommissionPrivacyContext";

/** Envolve um campo EDITÁVEL de comissão (% ou R$) — mesma trava do
 *  CommissionValue (Configurações → Privacidade), só que pra inputs em vez
 *  de texto: enquanto oculto, mostra um botão de cadeado no lugar do campo
 *  inteiro (nunca deixa o valor atual passar pro DOM/value do input), em vez
 *  de só borrar visualmente por cima de um valor que continuaria ali. */
export function HideableCommissionField({ children, className }: { children: () => React.ReactNode; className?: string }) {
  const { isHidden, requestReveal } = useCommissionPrivacy();

  if (!isHidden) return <>{children()}</>;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); requestReveal(); }}
      title="Comissão oculta — clique pra digitar a senha e editar"
      className={cn(
        "w-full inline-flex items-center justify-center gap-1.5 cursor-pointer select-none rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-900 py-2.5 text-[10px] font-black uppercase tracking-widest text-slate-400",
        className
      )}
    >
      <EyeOff className="w-3 h-3" /> Oculto
    </button>
  );
}
