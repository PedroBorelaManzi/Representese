import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { adsSource, getAttribution } from '../lib/attribution';
import { isTrackingDisabled } from '../lib/trackingOptOut';

/* Pergunta de 1 clique "o que falta para você assinar hoje?" — sem dado pessoal, sem identificador,
 * sem cookie. Grava só a opção escolhida + origem/campanha (quando houver) em funnel_feedback, para o painel
 * mostrar o que mais trava quem chega aos planos. Só no site (não no app nativo). */

const OPCOES: { id: string; label: string }[] = [
  { id: 'preco', label: 'O preço' },
  { id: 'quero_testar', label: 'Quero testar antes' },
  { id: 'nao_sei_se_serve', label: 'Não sei se serve para mim' },
  { id: 'falta_funcao', label: 'Falta alguma função' },
  { id: 'so_pesquisando', label: 'Só estou pesquisando' },
  { id: 'outro', label: 'Outro motivo' },
];
const KEY = 'rs_funnel_poll_planos';

export function FunnelPoll({ page = 'planos' }: { page?: string }) {
  const [feito, setFeito] = useState(() => {
    try { return !!sessionStorage.getItem(KEY); } catch { return false; }
  });
  let nativo = false;
  try { nativo = Capacitor.isNativePlatform(); } catch { /* web */ }
  if (nativo || isTrackingDisabled()) return null;

  const responder = (choice: string) => {
    setFeito(true);
    try { sessionStorage.setItem(KEY, '1'); } catch { /* sem storage */ }
    const a = getAttribution();
    supabase
      .from('funnel_feedback')
      .insert([{ choice, page, source: adsSource(a), campaign: a?.utm_campaign ?? null }])
      .then(() => {}, () => {});
  };

  return (
    <div className="max-w-2xl mx-auto mb-16 rounded-3xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 md:p-8 text-center">
      {feito ? (
        <p className="text-sm font-bold text-slate-700 dark:text-zinc-200">Obrigado! Sua resposta ajuda a melhorar o Represente-Se!.</p>
      ) : (
        <>
          <h3 className="text-base font-black text-slate-900 dark:text-zinc-100 mb-1">O que está faltando para você assinar hoje?</h3>
          <p className="text-[12px] text-slate-500 dark:text-zinc-400 mb-4">Um toque, sem cadastro e sem dado pessoal.</p>
          <div className="flex flex-wrap justify-center gap-2">
            {OPCOES.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => responder(o.id)}
                className="px-4 py-2 rounded-full border border-slate-200 dark:border-zinc-700 text-[13px] font-bold text-slate-700 dark:text-zinc-200 hover:border-emerald-500 hover:text-emerald-700 transition-colors"
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
