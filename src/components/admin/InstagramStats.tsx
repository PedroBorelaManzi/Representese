import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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
