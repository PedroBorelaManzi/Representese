import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { aceitarTudo, recusarNaoEssenciais, precisaDecidir } from '../lib/cookieConsent';

/* Barra de consentimento (LGPD). Enxuta: um texto curto com link pra Política de
 * Cookies, "Aceitar" em destaque e "Rejeitar" como link de texto discreto — mas sempre
 * visível e a um clique (a ANPD não admite recusa escondida ou mais difícil que o aceite).
 * O texto é genérico por decisão do dono; o detalhe das finalidades (incluindo medição de
 * campanhas) fica na Política de Cookies, linkada em "Saiba mais". Ajuste fino por categoria fica em Configurações › Privacidade.
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

  const ref = useRef<HTMLDivElement>(null);

  // Reserva o espaço do aviso no fim da página: assim ele nunca cobre botões e
  // campos de baixo (o usuário consegue rolar até eles com o aviso aberto).
  useEffect(() => {
    if (!visivel) return;
    const el = ref.current;
    if (!el) return;
    const aplicar = () => { document.body.style.paddingBottom = `${el.offsetHeight}px`; };
    aplicar();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(aplicar) : null;
    ro?.observe(el);
    return () => { ro?.disconnect(); document.body.style.paddingBottom = ''; };
  }, [visivel]);

  if (!visivel) return null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Aviso de cookies"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9999] p-3"
      style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)', touchAction: 'manipulation' }}
    >
      <div className="mx-auto max-w-2xl flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 shadow-2xl shadow-slate-900/15">
        <p className="flex-1 text-[13px] leading-snug font-medium text-slate-600 dark:text-zinc-300">
          Usamos cookies para melhor funcionalidade do site e para promover uma melhor experiência ao usuário.{' '}
          <Link
            to="/cookies"
            className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2 whitespace-nowrap"
            onClick={() => setVisivel(false)}
          >
            Saiba mais
          </Link>
        </p>
        <div className="flex flex-col items-stretch sm:items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              aceitarTudo();
              setVisivel(false);
            }}
            className="min-h-[44px] px-8 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest active:bg-emerald-700 transition-colors"
          >
            Aceitar
          </button>
          <button
            type="button"
            onClick={() => {
              recusarNaoEssenciais();
              setVisivel(false);
            }}
            className="min-h-[44px] sm:min-h-[32px] px-2 text-[11px] font-medium text-slate-400 dark:text-zinc-500 underline underline-offset-2 hover:text-slate-500 dark:hover:text-zinc-400 transition-colors"
          >
            Continuar sem aceitar
          </button>
        </div>
      </div>
    </div>
  );
}
