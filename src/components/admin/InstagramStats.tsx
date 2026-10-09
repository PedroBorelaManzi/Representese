import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

/* Métricas do Instagram (@represente_se_) trazidas do Meta Business Suite — série diária e tabela
 * por post. Os dados ficam em instagram_daily_stats / instagram_posts (só admin) e são atualizados
 * a partir do Business Suite → Insights. "Visualizações" e "cliques em links" incluem anúncios. */

type Dia = { day: string; views: number; viewers: number; interactions: number; link_clicks: number; profile_visits: number };
type Post = {
  post_id: string;
  posted_at: string | null;
  media_type: string | null;
  caption: string | null;
  views: number | null;
  reach: number | null;
  viewers: number | null;
  interactions: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  link_clicks: number | null;
};

type Campanha = {
  id: string;
  platform: 'meta' | 'google';
  name: string;
  status: string;
  period_from: string | null;
  period_to: string | null;
  dates_estimated: boolean;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  result_label: string | null;
  result_value: number | null;
  note: string | null;
};
type DiaSite = { day: string; landing_sessions: number; leads: number; accounts: number; anon_visits: number; ads_visits: number };

const brl = (v: number | null | undefined) => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const fmtDia = (iso: string) => new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
const nf = new Intl.NumberFormat('pt-BR');
const n = (v: number | null | undefined) => (v == null ? '—' : nf.format(v));

export default function InstagramStats() {
  const { data: dias, isLoading } = useQuery({
    queryKey: ['instagram_daily_stats'],
    queryFn: async () => {
      const { data, error } = await supabase.from('instagram_daily_stats').select('*').order('day', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Dia[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });
  const { data: posts } = useQuery({
    queryKey: ['instagram_posts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('instagram_posts').select('*').order('posted_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Post[];
    },
    staleTime: 0,
    refetchOnMount: 'always',
  });

  const { data: campanhas } = useQuery({
    queryKey: ['ads_campaigns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ads_campaigns').select('*').order('period_from', { ascending: true });
      if (error) throw error;
      return (data ?? []) as Campanha[];
    },
    staleTime: 0,
  });
  const de = dias && dias.length ? dias[0].day : null;
  const ate = new Date().toISOString().slice(0, 10);
  const { data: site } = useQuery({
    queryKey: ['admin_site_daily', de, ate],
    enabled: !!de,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_site_daily', { p_from: de, p_to: ate });
      if (error) throw error;
      return (data ?? []) as DiaSite[];
    },
    staleTime: 0,
  });

  // Dia a dia: Instagram + site + campanhas ativas naquele dia (as datas das campanhas Meta são estimadas).
  const diaADia = useMemo(() => {
    const porDia = new Map((dias ?? []).map((d) => [d.day, d]));
    return (site ?? []).map((st) => {
      const ig = porDia.get(st.day);
      const ativas = (campanhas ?? []).filter((c) => c.period_from && c.period_from <= st.day && (!c.period_to || c.period_to >= st.day));
      return { day: st.day, ig, st, ativas };
    });
  }, [dias, site, campanhas]);

  const total = useMemo(() => {
    const t = { views: 0, viewers: 0, interactions: 0, link_clicks: 0, profile_visits: 0 };
    (dias ?? []).forEach((d) => {
      t.views += d.views;
      t.viewers += d.viewers; // soma diária (pessoas únicas no período são menos)
      t.interactions += d.interactions;
      t.link_clicks += d.link_clicks;
      t.profile_visits += d.profile_visits;
    });
    return t;
  }, [dias]);

  const grafico = (dias ?? []).map((d) => ({
    dia: new Date(d.day + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
    Visualizações: d.views,
    'Cliques em links': d.link_clicks,
    'Visitas ao perfil': d.profile_visits,
  }));

  const cards = [
    { label: 'Visualizações', valor: total.views },
    { label: 'Cliques em links', valor: total.link_clicks },
    { label: 'Visitas ao perfil', valor: total.profile_visits },
    { label: 'Interações', valor: total.interactions },
  ];

  const periodo = dias && dias.length ? `${new Date(dias[0].day + 'T12:00:00').toLocaleDateString('pt-BR')} a ${new Date(dias[dias.length - 1].day + 'T12:00:00').toLocaleDateString('pt-BR')}` : '';

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Instagram · @represente_se_</h2>
        <p className="text-sm text-zinc-500 mt-1">
          Dados do Meta Business Suite{periodo ? ` — ${periodo}` : ''}. Visualizações e cliques incluem os anúncios impulsionados.
        </p>
      </div>

      {isLoading ? (
        <div className="h-64 bg-zinc-100 dark:bg-zinc-800 rounded-2xl animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {cards.map((c) => (
              <div key={c.label} className="bg-white dark:bg-zinc-900 p-5 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-500">{c.label}</p>
                <p className="text-3xl font-black text-zinc-900 dark:text-white tabular-nums">{nf.format(c.valor)}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-zinc-900 p-6 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 h-[360px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={grafico} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="dia" tick={{ fill: '#888', fontSize: 11 }} />
                <YAxis tick={{ fill: '#888', fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                <Legend />
                {(campanhas ?? []).filter((c) => c.period_from).map((c) => {
                  const x1 = fmtDia(c.period_from!);
                  const x2 = fmtDia(c.period_to ?? ate);
                  return <ReferenceArea key={c.id} x1={x1} x2={x2} fill={c.platform === 'google' ? '#3b82f6' : '#ec4899'} fillOpacity={0.08} />;
                })}
                <Line type="monotone" dataKey="Visualizações" stroke="#6366f1" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Cliques em links" stroke="#10b981" dot={false} strokeWidth={2} />
                <Line type="monotone" dataKey="Visitas ao perfil" stroke="#f59e0b" dot={false} strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Campanhas pagas · Meta (rosa) e Google (azul)</h3>
          <p className="text-xs text-zinc-500 mt-1">As faixas coloridas do gráfico mostram os dias de cada campanha. Datas marcadas com ~ são estimadas pelos picos diários (campanhas excluídas/impulsionadas pelo app não guardam o período).</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400">
                {['Plataforma', 'Campanha', 'Status', 'Período', 'Gasto', 'Impressões', 'Cliques', 'Resultado'].map((h) => (
                  <th key={h} className="px-4 py-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(campanhas ?? []).map((c) => (
                <tr key={c.id} className="border-t border-zinc-100 dark:border-zinc-800 align-top" title={c.note ?? ''}>
                  <td className="px-4 py-2"><span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold', c.platform === 'google' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700')}>{c.platform === 'google' ? 'Google' : 'Meta'}</span></td>
                  <td className="px-4 py-2 max-w-[280px] text-zinc-700 dark:text-zinc-200">{c.name}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{c.status}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{c.period_from ? `${c.dates_estimated ? '~' : ''}${fmtDia(c.period_from)} → ${c.period_to ? fmtDia(c.period_to) : 'em andamento'}` : '—'}</td>
                  <td className="px-4 py-2 tabular-nums font-semibold">{brl(c.spend)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(c.impressions)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(c.clicks)}</td>
                  <td className="px-4 py-2 tabular-nums">{c.result_value != null ? `${nf.format(c.result_value)} · ${c.result_label ?? ''}` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Dia a dia: Instagram × campanhas × site</h3>
          <p className="text-xs text-zinc-500 mt-1">
            "Sessões medidas" só contam quem aceitou os cookies; "visitas anônimas" são as de anúncio sem aceite. Cliques em link do Instagram e cadastros no mesmo dia mostram o quanto do clique vira visita.
          </p>
        </div>
        <div className="overflow-x-auto max-h-[480px]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white dark:bg-zinc-900">
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400">
                {['Dia', 'Campanhas no ar', 'IG views', 'IG cliques link', 'IG visitas perfil', 'Sessões medidas', 'Visitas anônimas', 'Leads', 'Contas novas'].map((h) => (
                  <th key={h} className="px-4 py-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...diaADia].reverse().map(({ day, ig, st, ativas }) => (
                <tr key={day} className={cn('border-t border-zinc-100 dark:border-zinc-800', ativas.length > 0 && 'bg-pink-50/40 dark:bg-pink-500/5')}>
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-500">{fmtDia(day)}</td>
                  <td className="px-4 py-2 text-[12px]">
                    {ativas.length === 0 ? <span className="text-zinc-300">—</span> : ativas.map((a) => (
                      <span key={a.id} className={cn('mr-1 px-1.5 py-0.5 rounded font-bold', a.platform === 'google' ? 'bg-blue-100 text-blue-700' : 'bg-pink-100 text-pink-700')}>{a.platform === 'google' ? 'G' : 'M'}</span>
                    ))}
                  </td>
                  <td className="px-4 py-2 tabular-nums">{n(ig?.views)}</td>
                  <td className="px-4 py-2 tabular-nums font-semibold">{n(ig?.link_clicks)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(ig?.profile_visits)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(st.landing_sessions)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(st.anon_visits + st.ads_visits)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(st.leads)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(st.accounts)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-sm border border-zinc-100 dark:border-zinc-800 overflow-hidden">
        <div className="p-6 pb-2">
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-white">Posts e stories ({posts?.length ?? 0})</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wider text-zinc-400">
                {['Publicado', 'Tipo', 'Conteúdo', 'Views', 'Alcance', 'Interações', 'Curtidas', 'Coment.', 'Salvos', 'Cliques'].map((h) => (
                  <th key={h} className="px-4 py-2 font-bold whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(posts ?? []).map((p) => (
                <tr key={p.post_id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-4 py-2 whitespace-nowrap text-zinc-500">
                    {p.posted_at ? new Date(p.posted_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('px-2 py-0.5 rounded-full text-[11px] font-bold', p.media_type === 'Story' ? 'bg-fuchsia-100 text-fuchsia-700' : 'bg-indigo-100 text-indigo-700')}>
                      {p.media_type ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-2 max-w-[320px] truncate text-zinc-700 dark:text-zinc-200" title={p.caption ?? ''}>{p.caption ?? '—'}</td>
                  <td className="px-4 py-2 tabular-nums font-semibold">{n(p.views)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(p.reach)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(p.interactions)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(p.likes)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(p.comments)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(p.saves)}</td>
                  <td className="px-4 py-2 tabular-nums">{n(p.link_clicks)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
