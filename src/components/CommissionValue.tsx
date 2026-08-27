import React from "react";
import { EyeOff } from "lucide-react";
import { cn } from "../lib/utils";
import { useCommissionPrivacy } from "../contexts/CommissionPrivacyContext";

/** Envolve qualquer valor de comissão (R$) — quando a privacidade está
 *  ativa (Configurações > Privacidade) e ainda não foi revelada nesta
 *  sessão, troca o conteúdo por uma máscara de tamanho fixo (não dá pra
 *  notar nem o valor aproximado nem quantos dígitos ele tem — um blur em
 *  cima do número real deixava passar as duas coisas) e, ao clicar, abre
 *  o prompt de senha. Já revelado ou com a opção desligada, é transparente
 *  (renderiza normal). */
export function CommissionValue({ children, className }: { children: React.ReactNode; className?: string }) {
  const { isHidden, requestReveal } = useCommissionPrivacy();

  if (!isHidden) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); requestReveal(); }}
      title="Comissão oculta — clique pra digitar a senha"
      className={cn("inline-flex items-center gap-1.5 cursor-pointer select-none group/hidden", className)}
    >
      <span aria-hidden="true" className="tracking-[0.2em]">R$ •••••</span>
      <span className="sr-only">Comissão oculta</span>
      <EyeOff className="w-3 h-3 text-slate-400 shrink-0" />
    </button>
  );
}
