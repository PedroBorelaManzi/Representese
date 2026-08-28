import React from "react";
import { cn } from "../lib/utils";

export type NfCommissionStatus = "atrasado" | "pendente" | "confirmado";

const ORDEM: NfCommissionStatus[] = ["pendente", "confirmado", "atrasado"];

const ESTILO: Record<NfCommissionStatus, { bg: string; label: string }> = {
  atrasado: { bg: "bg-red-500", label: "Atrasado" },
  pendente: { bg: "bg-amber-400", label: "Pendente" },
  confirmado: { bg: "bg-emerald-500", label: "Confirmado" },
};

/** Bolinha clicável ao lado da NF — controla se a comissão daquela nota já
 *  foi dada baixa. Clique alterna pendente → confirmado → atrasado → pendente
 *  (primeiro clique, sem status ainda, cai em "pendente"). Persistência fica
 *  por conta de quem usa (onChange), igual ao resto dos campos de Entregas. */
export function NfCommissionStatusDot({
  status,
  onChange,
  className,
}: {
  status: NfCommissionStatus | null | undefined;
  onChange: (next: NfCommissionStatus) => void;
  className?: string;
}) {
  const atual = status && ESTILO[status] ? status : null;
  const proximo = (): NfCommissionStatus => {
    if (!atual) return "pendente";
    const idx = ORDEM.indexOf(atual);
    return ORDEM[(idx + 1) % ORDEM.length];
  };

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(proximo()); }}
      title={atual ? `Comissão desta NF: ${ESTILO[atual].label} — clique pra mudar` : "Baixa da comissão desta NF não definida — clique pra marcar"}
      aria-label="Status de baixa da comissão desta NF"
      className={cn("inline-flex items-center justify-center w-4 h-4 rounded-full shrink-0 border border-black/5 transition-transform active:scale-90", atual ? ESTILO[atual].bg : "bg-slate-200 dark:bg-zinc-700", className)}
    />
  );
}
