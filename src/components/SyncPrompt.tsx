import { Cloud } from 'lucide-react';
import { useSync } from '../contexts/SyncContext';

/**
 * Faixa discreta no topo da tela:
 *  - sincronização atrasada → pergunta "Sincronizar agora?" (Sim / Agora não);
 *  - sincronizando → barrinha de progresso fina com a etapa atual.
 * O app já abriu com o que estava salvo no aparelho; nada disso bloqueia o uso.
 */
export default function SyncPrompt() {
  const { syncPromptVisible, acceptSyncPrompt, dismissSyncPrompt, fullSyncProgress } = useSync();

  if (fullSyncProgress) {
    const { etapaIndex, etapaTotal, etapaLabel, subAtual, subTotal } = fullSyncProgress;
    const dentro = subTotal && subTotal > 0 ? (subAtual || 0) / subTotal : 0;
    const pct = Math.min(100, Math.round(((etapaIndex - 1 + dentro) / etapaTotal) * 100));
    return (
      <div role="status" aria-live="polite" className="mb-3 rounded-xl border border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/70 dark:bg-emerald-950/20 px-3 py-2">
        <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
          <span className="truncate">
            Sincronizando · {etapaLabel.replace('...', '')}
            {subTotal ? ` ${subAtual || 0}/${subTotal}` : ''}
          </span>
          <span className="tabular-nums">{pct}%</span>
        </div>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-emerald-100 dark:bg-emerald-900/40">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (!syncPromptVisible) return null;

  return (
    <div role="region" aria-label="Sincronização" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2 text-[12px] font-semibold text-slate-600 dark:text-zinc-300">
        <Cloud className="h-4 w-4 shrink-0 text-emerald-500" />
        <span className="truncate">Atualizar os dados com a nuvem?</span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <button onClick={dismissSyncPrompt} className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200">
          Agora não
        </button>
        <button onClick={acceptSyncPrompt} className="rounded-lg bg-emerald-600 px-3 py-1 text-[11px] font-black text-white active:scale-95">
          Sincronizar
        </button>
      </div>
    </div>
  );
}
