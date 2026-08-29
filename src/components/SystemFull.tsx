// src/components/SystemFull.tsx
//
// Tela mostrada quando o teto global de sessões simultâneas foi atingido
// (ver SessionGateContext). Fica tentando reentrar sozinha em segundo plano;
// o botão só antecipa a próxima tentativa.

import { useEffect, useState } from 'react';
import { Users, RefreshCw } from 'lucide-react';
import { useSessionGate } from '../contexts/SessionGateContext';

export default function SystemFull() {
  const { active, limit, retryNow } = useSessionGate();
  const [secs, setSecs] = useState(15);

  useEffect(() => {
    const t = setInterval(() => {
      setSecs((s) => {
        if (s <= 1) {
          retryNow();
          return 15;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [retryNow]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950 px-6">
      <div className="max-w-md w-full text-center bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 p-8">
        <div className="mx-auto w-14 h-14 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-5">
          <Users className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
        </div>

        <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Sistema com lotação máxima
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Tem muita gente usando o Represente-Se agora. Assim que uma vaga abrir
          você entra automaticamente — não precisa recarregar a página.
        </p>

        {typeof active === 'number' && typeof limit === 'number' && (
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
            {active} de {limit} sessões em uso
          </p>
        )}

        <button
          onClick={() => {
            setSecs(15);
            retryNow();
          }}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-2 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Tentar agora
        </button>
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Nova tentativa em {secs}s
        </p>
      </div>
    </div>
  );
}
