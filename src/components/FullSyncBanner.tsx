import { Loader2 } from "lucide-react";
import { useSync } from "../contexts/SyncContext";

/**
 * Indicador visível da sincronização completa (clientes, pedidos, agenda,
 * feriados e, no app, arquivos) — roda no boot do app e ao reconectar.
 * Fica só enquanto a sincronização está ativa; não bloqueia o uso do app.
 */
export default function FullSyncBanner() {
  const { fullSyncProgress } = useSync();
  if (!fullSyncProgress) return null;

  const { etapaIndex, etapaTotal, etapaLabel, subAtual, subTotal } = fullSyncProgress;
  const pct = Math.min(100, Math.round((etapaIndex / etapaTotal) * 100));
  const subText = subTotal && subTotal > 0 ? ` — ${subAtual} de ${subTotal}` : "";

  return (
    <div
      className="fixed top-0 inset-x-0 z-[250] pointer-events-none flex justify-center"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      <div className="mt-2 px-4 py-2.5 w-[min(360px,calc(100%-32px))] bg-slate-900/95 dark:bg-zinc-900/95 backdrop-blur-md rounded-2xl shadow-xl border border-white/10 pointer-events-auto">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-white truncate">
              Sincronizando · {etapaLabel}
              {subText}
            </p>
            <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
