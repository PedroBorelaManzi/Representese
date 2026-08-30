import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie, ChevronDown } from 'lucide-react';
import {
  aceitarTudo,
  recusarNaoEssenciais,
  setConsent,
  precisaDecidir,
} from '../lib/cookieConsent';
import { cn } from '../lib/utils';

/* Banner de consentimento (LGPD). Aparece só enquanto não há decisão válida para
 * a versão atual do texto. "Aceitar" e "Recusar" têm o mesmo peso visual — a
 * ANPD exige que recusar seja tão fácil quanto aceitar. Trocar a escolha depois:
 * Configurações › Privacidade. */

export default function CookieBanner() {
  // precisaDecidir() é lido uma vez na montagem; após a escolha o componente se
  // desmonta sozinho. Não depende de estado externo reativo de propósito — nada
  // reabre o banner na mesma navegação.
  const [visivel, setVisivel] = useState(() => {
    try {
      return precisaDecidir();
    } catch {
      return false;
    }
  });
  const [detalhado, setDetalhado] = useState(false);
  const [analiticos, setAnaliticos] = useState(false);

  if (!visivel) return null;

  const fechar = () => setVisivel(false);

  return (
    <div
      role="dialog"
      aria-label="Aviso de cookies"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-[9999] p-3 sm:p-4"
    >
      <div className="mx-auto max-w-3xl rounded-2xl sm:rounded-[28px] border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl shadow-slate-900/10 dark:shadow-black/40 p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <div className="hidden sm:flex p-3 rounded-2xl bg-amber-50 dark:bg-amber-900/20 text-amber-500 shrink-0">
            <Cookie className="w-6 h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">
              A gente usa cookies
            </p>
            <p className="text-[13px] leading-relaxed font-medium text-slate-500 dark:text-zinc-400">
              Os essenciais mantêm seu login e a sincronização funcionando. Os de{' '}
              <strong className="font-bold text-slate-700 dark:text-zinc-200">análise</strong> nos
              ajudam a entender o uso e melhorar o app — e só rodam se você deixar. Detalhes em{' '}
              <Link
                to="/cookies"
                className="text-emerald-600 dark:text-emerald-400 underline underline-offset-2"
                onClick={fechar}
              >
                Política de Cookies
              </Link>
              .
            </p>

            <button
              type="button"
              onClick={() => setDetalhado((v) => !v)}
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 transition-colors"
              aria-expanded={detalhado}
            >
              Personalizar
              <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', detalhado && 'rotate-180')} />
            </button>

            {detalhado && (
              <div className="mt-4 space-y-3 border-t border-slate-100 dark:border-zinc-800 pt-4">
                <label className="flex items-center justify-between gap-4 opacity-60">
                  <span>
                    <span className="block text-[12px] font-black uppercase tracking-wide text-slate-800 dark:text-zinc-200">
                      Essenciais
                    </span>
                    <span className="block text-[11px] font-medium text-slate-400">
                      Login, segurança, uso offline. Sempre ativos.
                    </span>
                  </span>
                  <input type="checkbox" checked disabled className="w-4 h-4 accent-emerald-600" />
                </label>
                <label className="flex items-center justify-between gap-4 cursor-pointer">
                  <span>
                    <span className="block text-[12px] font-black uppercase tracking-wide text-slate-800 dark:text-zinc-200">
                      Análise de uso
                    </span>
                    <span className="block text-[11px] font-medium text-slate-400">
                      PostHog e métricas próprias de navegação.
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    checked={analiticos}
                    onChange={(e) => setAnaliticos(e.target.checked)}
                    className="w-4 h-4 accent-emerald-600"
                  />
                </label>
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-2 sm:justify-end">
          {detalhado ? (
            <button
              type="button"
              onClick={() => {
                setConsent({ preferencias: true, analiticos });
                fechar();
              }}
              className="px-5 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-zinc-900 text-[11px] font-black uppercase tracking-widest hover:opacity-90 transition-opacity"
            >
              Salvar escolha
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  recusarNaoEssenciais();
                  fechar();
                }}
                className="px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-300 text-[11px] font-black uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Só essenciais
              </button>
              <button
                type="button"
                onClick={() => {
                  aceitarTudo();
                  fechar();
                }}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white text-[11px] font-black uppercase tracking-widest hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/20"
              >
                Aceitar todos
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
