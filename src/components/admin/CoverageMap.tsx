import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
import { supabase } from '../../lib/supabase';

/* Mapa de cobertura — todos os representantes com localização num só lugar,
 * pra ver de bate-pronto onde a rede está e onde tem buraco. Lê a mesma RPC
 * admin_user_overview() (SECURITY DEFINER, só admin). Carregado sob demanda
 * pela aba "Cobertura" do AdminAnalytics. */

type Rep = {
  user_id: string;
  email: string | null;
  plano: string | null;
  assinatura_status: string | null;
  is_admin: boolean | null;
  gps_lat: number | null;
  gps_lng: number | null;
  gps_em: string | null;
  compartilha_local: boolean | null;
  clientes: number;
};

const pin = (cor: string) =>
  L.divIcon({
    className: 'cov-pin',
    html: `<svg width="26" height="26" viewBox="0 0 24 24" fill="${cor}" stroke="white" stroke-width="1"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/></svg>`,
    iconSize: [26, 26],
    iconAnchor: [13, 24],
    popupAnchor: [0, -20],
  });
const pinAtivo = pin('#059669');
const pinInativo = pin('#f59e0b');

function AjustarLimites({ pontos }: { pontos: [number, number][] }) {
  const map = useMap();
  React.useEffect(() => {
    if (pontos.length === 0) return;
    if (pontos.length === 1) {
      map.setView(pontos[0], 11);
      return;
    }
    map.fitBounds(L.latLngBounds(pontos), { padding: [40, 40], maxZoom: 12 });
  }, [pontos, map]);
  return null;
}

const fmt = (s: string | null) =>
  s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

export default function CoverageMap() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['admin_user_overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_overview');
      if (error) throw error;
      return (data || []) as Rep[];
    },
    staleTime: 60_000,
  });

  const reps = useMemo(() => (data || []).filter((r) => !r.is_admin), [data]);
  const comLocal = useMemo(
    () => reps.filter((r) => r.gps_lat != null && r.gps_lng != null),
    [reps],
  );
  const pontos = useMemo<[number, number][]>(
    () => comLocal.map((r) => [r.gps_lat as number, r.gps_lng as number]),
    [comLocal],
  );
  const desligaram = reps.filter((r) => r.compartilha_local === false).length;
  const semPonto = reps.length - comLocal.length - desligaram;

  if (isLoading) return <div className="py-20 text-center text-slate-400">Carregando mapa…</div>;
  if (isError)
    return (
      <div className="py-20 text-center text-red-500">
        Erro ao carregar. <button onClick={() => refetch()} className="underline">tentar de novo</button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <span className="px-3 py-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-bold">
          {comLocal.length} no mapa
        </span>
        <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 font-bold">
          {semPonto} sem ponto ainda
        </span>
        <span className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 font-bold">
          {desligaram} desligaram
        </span>
        <span className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 font-bold">
          {reps.length} representantes no total
        </span>
      </div>

      <div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-zinc-800 h-[70vh]">
        <MapContainer center={[-14.2, -51.9]} zoom={4} className="h-full w-full" scrollWheelZoom>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <AjustarLimites pontos={pontos} />
          <MarkerClusterGroup chunkedLoading>
            {comLocal.map((r) => (
              <Marker
                key={r.user_id}
                position={[r.gps_lat as number, r.gps_lng as number]}
                icon={r.assinatura_status === 'active' ? pinAtivo : pinInativo}
              >
                <Popup>
                  <div className="text-xs space-y-0.5">
                    <p className="font-bold">{r.email}</p>
                    <p>{r.plano || 'sem plano'} · {r.assinatura_status}</p>
                    <p>{r.clientes} clientes</p>
                    <p className="text-slate-400">visto em {fmt(r.gps_em)}</p>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MarkerClusterGroup>
        </MapContainer>
      </div>

      <p className="text-[11px] text-slate-400">
        Pino verde = assinatura ativa · pino amarelo = inativa/trial. A localização é a última
        capturada pelo app/site de cada representante (ver Ficha Completa para o detalhe).
      </p>
    </div>
  );
}
