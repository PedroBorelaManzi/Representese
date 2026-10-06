import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

/* Funil de anúncios: da impressão até a assinatura paga, com a porcentagem de cada etapa,
 * filtrável por origem (Google, Instagram/Meta, todas) e por campanha. Impressões e cliques
 * vêm das plataformas de anúncio (digitados aqui, ficam salvos neste navegador); o resto vem
 * do banco pela RPC admin_ads_funnel. */

type Funnel = {
  since: string;
  source: string;
  campaign: string | null;
  visits: number;
  register_views: number;
  checkout_views: number;
  leads: number;
  accounts: number;
  paid: number;
  paid_value: number;
  campaigns: string[];
};

type Stat = {
  id: string;
  source: 'google' | 'meta';
  period_from: string;
  period_to: string;
  impressions: number;
  clicks: number;
  spend: number | null;
  note: string | null;
  created_at: string;
};

type Periodo = '7' | '30' | '90' | 'desde';
type Origem = 'google' | 'meta' | 'todos';

const ORIGENS: { id: Origem; label: string; plataforma: string }[] = [
  { id: 'todos', label: 'Todas', plataforma: 'das plataformas' },
  { id: 'google', label: 'Google', plataforma: 'do Google Ads' },
  { id: 'meta', label: 'Instagram / Meta', plataforma: 'da Meta (Instagram/Facebook)' },
];

/** Dia em que começamos a guardar a origem do clique (gclid/utm). */
const INICIO_RASTREIO = '2026-10-05T00:00:00-03:00';
const MANUAL_KEY = 'rs_ads_funnel_manual_v2';
const SITE = 'https://www.representese.com';

type Manual = Record<string, { impressoes: string; cliques: string }>;

const nf = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function pct(num: number, den: number): string {
  if (!den) return '—';
  return `${((num / den) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

const soNumero = (v: string) => Number(v.replace(/\D/g, '')) || 0;

function carregarManual(): Manual {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    if (raw) return JSON.parse(raw) as Manual;
  } catch {
    /* storage indisponível */
  }
  return {};
}

const slug = (v: string) =>
  v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

/** Cria links com marcação (utm) para bio, stories, anúncios etc. */
function GeradorLinks() {
  const [origem, setOrigem] = useState('instagram');
  const [meio, setMeio] = useState('bio');
  const [campanha, setCampanha] = useState('');
  const [pagina, setPagina] = useState('/');

  const url = useMemo(() => {
    const params = new URLSearchParams();
    params.set('utm_source', slug(origem) || 'instagram');
    params.set('utm_medium', slug(meio) || 'social');
    if (slug(campanha)) params.set('utm_campaign', slug(campanha));
    const caminho = pagina.startsWith('/') ? pagina : `/${pagina}`;
    return `${SITE}${caminho}?${params.toString()}`;
  }, [origem, meio, campanha, pagina]);

  const campo = 'mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white text-sm';

  return (
    <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 space-y-4">
      <div className="flex items-center gap-2">
        <Link2 className="w-5 h-5 text-teal-600" />
        <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Gerador de links com marcação</h3>
      </div>
      <p className="text-sm text-zinc-500">
        Use um link marcado em cada lugar (bio, stories, cada anúncio) para saber de onde veio cada cadastro e assinatura.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Origem
          <select value={origem} onChange={(e) => setOrigem(e.target.value)} className={campo}>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="youtube">YouTube</option>
            <option value="google">Google</option>
          </select>
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Onde o link fica
          <select value={meio} onChange={(e) => setMeio(e.target.value)} className={campo}>
            <option value="bio">Link da bio</option>
            <option value="stories">Stories</option>
            <option value="reels">Reels</option>
            <option value="post">Post / legenda</option>
            <option value="anuncio">Anúncio pago</option>
            <option value="direct">Mensagem direta</option>
          </select>
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Nome da campanha
          <input value={campanha} onChange={(e) => setCampanha(e.target.value)} placeholder="ex.: reels outubro" className={campo} />
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Página
          <select value={pagina} onChange={(e) => setPagina(e.target.value)} className={campo}>
            <option value="/">Página inicial</option>
            <option value="/register">Cadastro</option>
            <option value="/planos">Planos</option>
          </select>
        </label>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className={cn(campo, 'mt-0 font-mono text-xs flex-1')} />
        <button
          onClick={() => {
            navigator.clipboard?.writeText(url).then(
              () => toast.success('Link copiado'),
              () => toast.error('Não consegui copiar — selecione e copie à mão'),
            );
          }}
          className="px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Copy className="w-4 h-4" /> Copiar
        </button>
      </div>
    </div>
  );
}

export default function AdsFunnel() {
  const [periodo, setPeriodo] = useState<Periodo>('desde');
  const [origem, setOrigem] = useState<Origem>('todos');
  const [campanha, setCampanha] = useState<string>('');
  const [manual, setManual] = useState<Manual>(carregarManual);
  const queryClient = useQueryClient();

  // Números das plataformas gravados no banco (Google Ads / Meta Business Suite).
  const { data: stats } = useQuery({
    queryKey: ['ads_platform_stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ads_platform_stats').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Stat[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const ultimo = (o: 'google' | 'meta') => stats?.find((x) => x.source === o);

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
    queryKey: ['admin_ads_funnel', since, origem, campanha],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_ads_funnel', {
        p_since: since,
        p_source: origem,
        p_campaign: campanha || null,
      });
      if (error) throw error;
      return data as Funnel;
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Impressões/cliques digitados: por origem (e por campanha, quando filtrada). "Todas" soma Google + Meta.
  const chaveManual = (o: Origem) => `${o}|${campanha}`;
  const lerManual = (o: Origem) => manual[chaveManual(o)] ?? { impressoes: '', cliques: '' };
  const somaTodas = (campo: 'impressoes' | 'cliques') =>
    (['google', 'meta'] as Origem[]).reduce((t, o) => t + soNumero((manual[`${o}|${campanha}`] ?? { impressoes: '', cliques: '' })[campo]), 0);

  // Valor mostrado: o que foi digitado aqui; se nada foi digitado (e sem filtro de campanha), o último gravado no banco.
  const valorDe = (o: 'google' | 'meta', campo: 'impressoes' | 'cliques'): number => {
    const digitado = (manual[`${o}|${campanha}`] ?? { impressoes: '', cliques: '' })[campo];
    if (digitado !== '') return soNumero(digitado);
    if (campanha) return 0;
    const u = ultimo(o);
    return u ? (campo === 'impressoes' ? u.impressions : u.clicks) : 0;
  };
  const impressoes = origem === 'todos' ? valorDe('google', 'impressoes') + valorDe('meta', 'impressoes') : valorDe(origem, 'impressoes');
  const cliques = origem === 'todos' ? valorDe('google', 'cliques') + valorDe('meta', 'cliques') : valorDe(origem, 'cliques');
  const ultimaLinha = origem === 'todos' ? null : ultimo(origem);

  const salvarNoPainel = async () => {
    if (origem === 'todos' || campanha) return;
    const imp = valorDe(origem, 'impressoes');
    const cli = valorDe(origem, 'cliques');
    const hoje = new Date();
    const de = new Date(since);
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const { error } = await supabase.from('ads_platform_stats').insert([
      { source: origem, period_from: iso(de), period_to: iso(hoje), impressions: imp, clicks: cli, note: 'Digitado no painel' },
    ]);
    if (error) {
      toast.error('Não consegui salvar: ' + error.message);
      return;
    }
    toast.success('Números salvos no painel');
    setManual((m) => ({ ...m, [chaveManual(origem)]: { impressoes: '', cliques: '' } }));
    queryClient.invalidateQueries({ queryKey: ['ads_platform_stats'] });
  };

  const info = ORIGENS.find((o) => o.id === origem)!;

  const etapas = [
    { chave: 'impressoes', nome: 'Viram o anúncio', valor: impressoes, origem: `${info.plataforma} (digitado)`, manual: true },
    { chave: 'cliques', nome: 'Clicaram / abriram o link', valor: cliques, origem: `${info.plataforma} (digitado)`, manual: true },
    { chave: 'visitas', nome: 'Entraram no site', valor: data?.visits ?? 0, origem: 'Site · só quem aceitou cookies' },
    { chave: 'cadastro_tela', nome: 'Abriram o cadastro', valor: data?.register_views ?? 0, origem: 'Site · só quem aceitou cookies' },
    { chave: 'leads', nome: 'Fizeram cadastro (lead)', valor: data?.leads ?? 0, origem: 'Banco · exato' },
    { chave: 'checkout', nome: 'Abriram o checkout', valor: data?.checkout_views ?? 0, origem: 'Site · só quem aceitou cookies' },
    { chave: 'contas', nome: 'Criaram conta no checkout', valor: data?.accounts ?? 0, origem: 'Banco · exato' },
    { chave: 'pagos', nome: 'Assinaram (pagaram)', valor: data?.paid ?? 0, origem: 'Banco · exato' },
  ];

  const maior = Math.max(1, ...etapas.map((e) => e.valor));
  const campanhas = data?.campaigns ?? [];

  const chip = (ativo: boolean) =>
    cn(
      'px-4 py-2 rounded-xl text-sm font-semibold border transition-colors',
      ativo
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800',
    );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Funil de anúncios</h2>
          <p className="text-sm text-zinc-500 mt-1">
            Do anúncio (ou link) até a assinatura paga. Escolha a origem para ver tudo junto ou separado.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-4 lg:items-center justify-between">
          <div className="flex gap-2 flex-wrap">
            {ORIGENS.map((o) => (
              <button key={o.id} onClick={() => setOrigem(o.id)} className={chip(origem === o.id)}>
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap">
            {([
              ['desde', 'Desde 05/10'],
              ['7', '7 dias'],
              ['30', '30 dias'],
              ['90', '90 dias'],
            ] as [Periodo, string][]).map(([v, label]) => (
              <button key={v} onClick={() => setPeriodo(v)} className={chip(periodo === v)}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-sm text-zinc-600 dark:text-zinc-400">
            Campanha
            <select
              value={campanha}
              onChange={(e) => setCampanha(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
            >
              <option value="">Todas as campanhas</option>
              {campanhas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {origem === 'todos' ? (
            <p className="sm:col-span-2 text-sm text-zinc-500 self-end pb-2">
              Impressões e cliques de “Todas” são a soma do que você digitar em Google e em Instagram / Meta.
            </p>
          ) : (
            <>
              <label className="text-sm text-zinc-600 dark:text-zinc-400">
                Impressões {info.plataforma}
                <input
                  inputMode="numeric"
                  value={lerManual(origem).impressoes}
                  onChange={(e) => setManual((m) => ({ ...m, [chaveManual(origem)]: { ...lerManual(origem), impressoes: e.target.value } }))}
                  placeholder={ultimaLinha ? String(ultimaLinha.impressions) : 'ex.: 3804'}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </label>
              <label className="text-sm text-zinc-600 dark:text-zinc-400">
                Cliques {info.plataforma}
                <input
                  inputMode="numeric"
                  value={lerManual(origem).cliques}
                  onChange={(e) => setManual((m) => ({ ...m, [chaveManual(origem)]: { ...lerManual(origem), cliques: e.target.value } }))}
                  placeholder={ultimaLinha ? String(ultimaLinha.clicks) : 'ex.: 320'}
                  className="mt-1 w-full px-3 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-zinc-900 dark:text-white"
                />
              </label>
            </>
          )}
        </div>
        {origem !== 'todos' && !campanha && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-xs text-zinc-500">
            {ultimaLinha ? (
              <span>
                Dados gravados de {new Date(ultimaLinha.period_from + 'T12:00:00').toLocaleDateString('pt-BR')} a{' '}
                {new Date(ultimaLinha.period_to + 'T12:00:00').toLocaleDateString('pt-BR')}
                {ultimaLinha.spend != null ? ` · gasto ${brl.format(Number(ultimaLinha.spend))}` : ''}
                {ultimaLinha.note ? ` · ${ultimaLinha.note}` : ''}
              </span>
            ) : (
              <span>Ainda não há números gravados para esta origem.</span>
            )}
            <button
              onClick={salvarNoPainel}
              className="sm:ml-auto px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white font-semibold"
            >
              Salvar números no painel
            </button>
          </div>
        )}
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
            exatos. O Instagram só é reconhecido quando o link tem marcação (use o gerador abaixo) ou quando o clique vem de
            anúncio da Meta; links sem marcação aparecem como origem desconhecida. A origem só é guardada a partir de 05/10/2026.
          </p>
        </div>
      )}

      <GeradorLinks />
    </div>
  );
}
