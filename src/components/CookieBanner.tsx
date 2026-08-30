import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { aceitarTudo, recusarNaoEssenciais, precisaDecidir } from '../lib/cookieConsent';

/* Barra de consentimento (LGPD). Enxuta: um texto com link pra Política de
 * Cookies + "Aceitar" e "Rejeitar" com o mesmo peso (exigência da ANPD).
 * Ajuste fino por categoria fica em Configurações › Privacidade. */

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
      className="fixed inset-x-0 bottom-0 z-[9999] p-2 sm:p-3"
    >
      <div className="mx-auto max-w-2xl flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white/95 dark:bg-zinc-900/95 backdrop-blur px-4 py-2.5 shadow-lg">
        <p className="flex-1 text-[12px] leading-snug font-medium text-slate-500 dark:text-zinc-400">
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
            className="px-4 py-1.5 rounded-lg bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
          >
            Rejeitar
          </button>
          <button
            type="button"
            onClick={() => {
              aceitarTudo();
              setVisivel(false);
            }}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors"
          >
            Aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
