import React, { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

/* Funil de anúncios do Google: do anúncio até a assinatura paga, com a porcentagem de
 * cada etapa. Impressões e cliques vêm do Google Ads (digitados aqui, ficam salvos neste
 * navegador); o resto vem do banco pela RPC admin_ads_funnel. */

type Funnel = {
  since: string;
  visits: number;
  register_views: number;
  checkout_views: number;
  leads: number;
  accounts: number;
  paid: number;
  paid_value: number;
};

type Periodo = '7' | '30' | '90' | 'desde';

/** Dia em que começamos a guardar a origem do clique (gclid/utm). */
const INICIO_RASTREIO = '2026-10-05T00:00:00-03:00';
const MANUAL_KEY = 'rs_ads_funnel_manual';

const nf = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function pct(num: number, den: number): string {
  if (!den) return '—';
  return `${((num / den) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

function carregarManual(): { impressoes: string; cliques: string } {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (raw) return { impressoes: '', cliques: '', ...JSON.parse(raw) };
  } catch {
    /* storage indisponível */
  }
  return { impressoes: '', cliques: '' };
}

export default function AdsFunnel() {
  const [periodo, setPeriodo] = useState<Periodo>('desde');
  const [manual, setManual] = useState(carregarManual);

  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_KEY, JSON.stringify(manual));
    } catch {
      /* idem */
    }
  }, [manual]);

  const since = useMemo(() => {
    if (periodo === 'desde') return INICIO_RASTREIO;
    return new Date(Date.now() - Number(periodo) * 86_400_000).toISOString();
  }, [periodo]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['admin_ads_funnel', since],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_ads_funnel', { p_since: since });
      if (error) throw error;
      return data as Funnel;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const impressoes = Number(manual.impressoes.replace(/\D/g, '')) || 0;
  const cliques = Number(manual.cliques.replace(/\D/g, '')) || 0;

  const etapas = [
    { chave: 'impressoes', nome: 'Viram o anúncio', valor: impressoes, origem: 'Google Ads (digitado)', manual: true },
    { chave: 'cliques', nome: 'Clicaram no anúncio', valor: cliques, origem: 'Google Ads (digitado)', manual: true },
    { chave: 'visitas', nome: 'Entraram no site', valor: data?.visits ?? 0, origem: 'Site · só quem aceitou cookies' },
    { chave: 'cadastro_tela', nome: 'Abriram o cadastro', valor: data?.register_views ?? 0, origem: 'Site · só quem aceitou cookies' },
    { chave: 'leads', nome: 'Fizeram cadastro (lead)', valor: data?.leads ?? 0, origem: 'Banco · exato' },
    { chave: 'checkout', nome: 'Abriram o checkout', valor: data?.checkout_views ?? 0, origem: 'Site · só quem aceitou cookies' },
    { chave: 'contas', nome: 'Criaram conta no checkout', valor: data?.accounts ?? 0, origem: 'Banco · exato' },
    { chave: 'pagos', nome: 'Assinaram (pagaram)', valor: data?.paid ?? 0, origem: 'Banco · exato' },
  ];

  const maior = Math.max(1, ...etapas.map((e) => e.valor));

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Funil de anúncios (Google)</h2>
            <p className="text-sm text-zinc-500 mt-1">
              Do anúncio até a assinatura paga, só com visitantes que vieram de um clique do Google.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              ['desde', 'Desde 05/10'],
              ['7', '7 dias'],
              ['30', '30 dias'],
              ['90', '90 dias'],
            ] as [Periodo, string][]).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setPeriodo(v)}
                className={cn(
                  'px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
                  periodo === v
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800',
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">
            Impressões no Google Ads (mesmo período)
            <input
              inputMode="numeric"
              value={manual.impressoes}
              onChange={(e) => setManual((m) => ({ ...m, impressoes: e.target.value }))}
              placeholder="ex.: 3804"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
            />
          </label>
          <label className="text-sm text-zinc-600 dark:text-zinc-400">
            Cliques no Google Ads (mesmo período)
            <input
              inputMode="numeric"
              value={manual.cliques}
              onChange={(e) => setManual((m) => ({ ...m, cliques: e.target.value }))}
              placeholder="ex.: 320"
              className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
            />
          </label>
        </div>
      </div>

      {isLoading ? (
        <div className="h-64 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
      ) : error ? (
        <div className="p-6 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm">
          Não foi possível carregar o funil. {(error as Error).message}
        </div>
      ) : (
        <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
          <div className="space-y-4">
            {etapas.map((e, i) => {
              const anterior = i > 0 ? etapas[i - 1].valor : 0;
              return (
                <div key={e.chave}>
                  <div className="flex items-baseline justify-between gap-3 flex-wrap">
                    <div>
                      <span className="font-semibold text-zinc-900 dark:text-white">{e.nome}</span>
                      <span className="ml-2 text-xs text-zinc-400">{e.origem}</span>
                    </div>
                    <div className="flex items-baseline gap-4 text-sm">
                      {i > 0 && (
                        <span className="text-zinc-500" title="Em relação à etapa anterior">
                          {pct(e.valor, anterior)} da etapa anterior
                        </span>
                      )}
                      {i > 1 && cliques > 0 && (
                        <span className="text-zinc-500" title="Em relação aos cliques">
                          {pct(e.valor, cliques)} dos cliques
                        </span>
                      )}
                      <span className="text-2xl font-black text-zinc-900 dark:text-white tabular-nums">{nf.format(e.valor)}</span>
                    </div>
                  </div>
                  <div className="mt-2 h-3 rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', e.manual ? 'bg-indigo-500' : 'bg-emerald-500')}
                      style={{ width: `${Math.max(e.valor > 0 ? 2 : 0, (e.valor / maior) * 100)}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">Cliques que viraram assinatura</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{pct(data?.paid ?? 0, cliques)}</p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">Leads que viraram assinatura</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{pct(data?.paid ?? 0, data?.leads ?? 0)}</p>
            </div>
            <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950">
              <p className="text-xs text-zinc-500">Receita da 1ª cobrança</p>
              <p className="text-2xl font-black text-zinc-900 dark:text-white">{brl.format(Number(data?.paid_value ?? 0))}</p>
            </div>
          </div>

          <p className="mt-6 text-xs text-zinc-500 leading-relaxed">
            “Entraram no site”, “Abriram o cadastro” e “Abriram o checkout” só contam quem aceitou os cookies de análise
            (LGPD), então podem ficar abaixo do número de cliques. Cadastro, conta criada e assinatura vêm direto do banco e são
            exatos. A origem só é guardada a partir de 05/10/2026.
          </p>
        </div>
      )}
    </div>
  );
}
