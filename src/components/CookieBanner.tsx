import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { aceitarTudo, recusarNaoEssenciais, precisaDecidir } from '../lib/cookieConsent';

/* Barra de consentimento (LGPD). Enxuta: um texto com link pra Política de
 * Cookies + "Aceitar" e "Rejeitar" com o mesmo peso (exigência da ANPD).
 * Ajuste fino por categoria fica em Configurações › Privacidade.
 *
 * Notas de mobile (iOS Safari):
 *  - respeita safe-area-inset-bottom, senão os botões ficam atrás da barra do
 *    Safari / do home indicator e não dá pra tocar;
 *  - alvos de toque ≥ 44px;
 *  - sem backdrop-blur (trava a composição durante o scroll no Safari);
 *  - touch-action: manipulation pra tirar o atraso de 300ms. */

export default function CookieBanner() {
  const [visivel, setVisivel] = useState(() => {
    try {
      return precisaDecidir();
    } catch {
      return false;
    }
  });

  if (!visivel) return null;

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9999] p-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)', touchAction: 'manipulation' }}
    >
      <div className="mx-auto max-w-2xl flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 shadow-2xl shadow-slate-900/15">
        <p className="flex-1 text-[13px] leading-snug font-medium text-slate-600 dark:text-zinc-300">
          Usamos cookies para o funcionamento do app e, com seu aceite, para análise de uso.{' '}
          <Link
            to="/cookies"
            className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2 whitespace-nowrap"
            onClick={() => setVisivel(false)}
          >
            Política de Cookies
          </Link>
        </p>
        <div className="flex gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              recusarNaoEssenciais();
              setVisivel(false);
            }}
            className="flex-1 sm:flex-none min-h-[44px] px-5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-xs font-black uppercase tracking-widest active:bg-slate-200 dark:active:bg-zinc-700 transition-colors"
          >
            Rejeitar
          </button>
          <button
            type="button"
            onClick={() => {
              aceitarTudo();
              setVisivel(false);
            }}
            className="flex-1 sm:flex-none min-h-[44px] px-5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest active:bg-emerald-700 transition-colors"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
