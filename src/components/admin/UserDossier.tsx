import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, User as UserIcon, CreditCard, Cookie, Activity, Database,
  Bot, ShieldAlert, BarChart3, ExternalLink, RefreshCw, MapPin,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

/* "Ficha Completa" do usuário — junta num só lugar tudo o que o sistema sabe
 * de cada conta, separado por tipo de dado. Lê a RPC admin_user_overview()
 * (SECURITY DEFINER, só responde pra admin). Dados de PostHog e Sentry entram
 * quando o cron de sincronização roda (ver api/cron/sync-analytics.ts). */

type Overview = {
  user_id: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  onboarding_ok: boolean | null;
  is_admin: boolean | null;
  cidade: string | null;
  estado: string | null;
  billing_cidade: string | null;
  billing_estado: string | null;
  billing_cep: string | null;
  plano: string | null;
  plan_id: string | null;
  assinatura_status: string | null;
  ciclo: string | null;
  periodo_fim: string | null;
  trial_fim: string | null;
  cancela_no_fim: boolean | null;
  asaas_id: string | null;
  consent_analiticos: boolean | null;
  consent_version: number | null;
  consent_action: string | null;
  consent_em: string | null;
  ultimo_acesso: string | null;
  eventos_total: number;
  eventos_30d: number;
  rotas_distintas: number;
  segundos_total: number;
  ultima_localizacao: string | null;
  clientes: number;
  pedidos: number;
  representadas: number;
  compromissos: number;
  mensagens_ia: number;
  ultima_acao_audit: string | null;
  ultima_acao_audit_em: string | null;
  ph_last_seen: string | null;
  ph_total_events: number;
  ph_pageviews: number;
  ph_sessions_30d: number;
  ph_properties: Record<string, unknown> | null;
  ph_top_events: string[] | null;
  st_errors_30d: number;
  st_total_errors: number;
  st_last_error_at: string | null;
  st_last_error_title: string | null;
  st_top_issues: { title: string; count: number; permalink?: string; culprit?: string }[] | null;
};

const fmtData = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const fmtDia = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('pt-BR') : '—';
const fmtDur = (seg: number) => {
  if (!seg) return '—';
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const desde = (s: string | null) => {
  if (!s) return '';
  const dias = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (dias === 0) return 'hoje';
  if (dias === 1) return 'ontem';
  if (dias < 30) return `há ${dias} dias`;
  return `há ${Math.floor(dias / 30)} meses`;
};

function Linha({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-1.5 text-sm border-b border-slate-100 dark:border-zinc-800/60 last:border-0">
      <span className="text-slate-400 dark:text-zinc-500 shrink-0">{label}</span>
      <span className="text-slate-700 dark:text-zinc-200 text-right font-medium break-words">{children || '—'}</span>
    </div>
  );
}

function Card({
  icon: Icon, titulo, cor, children, acao,
}: {
  icon: typeof UserIcon; titulo: string; cor: string; children: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className={cn('p-2 rounded-lg', cor)}><Icon className="w-4 h-4" /></div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-zinc-200">{titulo}</h3>
        </div>
        {acao}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function UserDossier() {
  const [busca, setBusca] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin_user_overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_overview');
      if (error) throw error;
      return (data || []) as Overview[];
    },
    staleTime: 60_000,
  });

  const lista = useMemo(() => {
    const arr = data || [];
    const q = busca.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.plano || '').toLowerCase().includes(q) ||
        (u.ultima_localizacao || '').toLowerCase().includes(q),
    );
  }, [data, busca]);

  const sel = useMemo(
    () => (data || []).find((u) => u.user_id === selId) || null,
    [data, selId],
  );

  if (isLoading) {
    return <div className="py-20 text-center text-slate-400">Carregando fichas…</div>;
  }
  if (isError) {
    return (
      <div className="py-20 text-center text-red-500">
        Erro ao carregar. <button onClick={() => refetch()} className="underline">tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="grid md:grid-cols-[320px_1fr] gap-6">
      {/* Lista de usuários */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por e-mail, plano, cidade…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
          {lista.length} {lista.length === 1 ? 'usuário' : 'usuários'}
        </p>
        <div className="space-y-1 max-h-[70vh] overflow-y-auto pr-1">
          {lista.map((u) => (
            <button
              key={u.user_id}
              onClick={() => setSelId(u.user_id)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-xl transition-colors',
                selId === u.user_id
                  ? 'bg-emerald-50 dark:bg-emerald-900/20 ring-1 ring-emerald-500/30'
                  : 'hover:bg-slate-50 dark:hover:bg-zinc-800/50',
              )}
            >
              <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate flex items-center gap-1.5">
                {u.is_admin && <ShieldAlert className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
                {u.email || 'sem e-mail'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {u.plano || 'sem plano'} · {u.ultimo_acesso ? desde(u.ultimo_acesso) : 'nunca acessou'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Ficha do selecionado */}
      {!sel ? (
        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 py-20 text-center text-slate-400">
          Selecione um usuário para ver a ficha completa.
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">{sel.email}</h2>
              <p className="text-xs text-slate-400 font-mono">{sel.user_id}</p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 disabled:opacity-50"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Atualizar
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card icon={UserIcon} titulo="Identidade & Contato" cor="bg-blue-100 dark:bg-blue-900/30 text-blue-600">
              <Linha label="E-mail">{sel.email}</Linha>
              <Linha label="Telefone">{sel.phone}</Linha>
              <Linha label="Conta criada">{fmtDia(sel.created_at)} <span className="text-slate-400">({desde(sel.created_at)})</span></Linha>
              <Linha label="Onboarding">{sel.onboarding_ok ? 'concluído' : 'pendente'}</Linha>
              <Linha label="Cidade (clima)">{[sel.cidade, sel.estado].filter(Boolean).join(', ')}</Linha>
              <Linha label="Perfil">{sel.is_admin ? 'Administrador' : 'Usuário'}</Linha>
            </Card>

            <Card icon={CreditCard} titulo="Plano & Assinatura" cor="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
              <Linha label="Plano">{sel.plano || sel.plan_id}</Linha>
              <Linha label="Status">{sel.assinatura_status}</Linha>
              <Linha label="Ciclo">{sel.ciclo}</Linha>
              <Linha label="Período até">{fmtDia(sel.periodo_fim)}</Linha>
              <Linha label="Trial até">{fmtDia(sel.trial_fim)}</Linha>
              <Linha label="Cancela no fim?">{sel.cancela_no_fim ? 'sim' : 'não'}</Linha>
              <Linha label="Endereço cobrança">{[sel.billing_cidade, sel.billing_estado, sel.billing_cep].filter(Boolean).join(' · ')}</Linha>
              <Linha label="ID Asaas">{sel.asaas_id && <span className="font-mono text-xs">{sel.asaas_id}</span>}</Linha>
            </Card>

            <Card icon={Cookie} titulo="Consentimento (LGPD)" cor="bg-amber-100 dark:bg-amber-900/30 text-amber-600">
              {sel.consent_em ? (
                <>
                  <Linha label="Análise de uso">
                    <span className={sel.consent_analiticos ? 'text-emerald-600' : 'text-red-500'}>
                      {sel.consent_analiticos ? 'aceitou' : 'recusou'}
                    </span>
                  </Linha>
                  <Linha label="Quando">{fmtData(sel.consent_em)}</Linha>
                  <Linha label="Versão do texto">v{sel.consent_version}</Linha>
                  <Linha label="Origem">{sel.consent_action}</Linha>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-2">
                  Sem registro ligado a esta conta ainda (a decisão anônima do navegador é ligada no próximo login).
                </p>
              )}
            </Card>

            <Card icon={Activity} titulo="Atividade" cor="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600">
              <Linha label="Último acesso">{fmtData(sel.ultimo_acesso)} <span className="text-slate-400">({desde(sel.ultimo_acesso)})</span></Linha>
              <Linha label="Eventos (total)">{sel.eventos_total.toLocaleString('pt-BR')}</Linha>
              <Linha label="Eventos (30 dias)">{sel.eventos_30d.toLocaleString('pt-BR')}</Linha>
              <Linha label="Telas distintas">{sel.rotas_distintas}</Linha>
              <Linha label="Tempo somado">{fmtDur(sel.segundos_total)}</Linha>
              <Linha label="Última localização">
                {sel.ultima_localizacao && (
                  <span className="inline-flex items-center gap-1"><MapPin className="w-3 h-3" />{sel.ultima_localizacao}</span>
                )}
              </Linha>
            </Card>

            <Card icon={Database} titulo="Volume de Dados" cor="bg-teal-100 dark:bg-teal-900/30 text-teal-600">
              <Linha label="Clientes">{sel.clientes.toLocaleString('pt-BR')}</Linha>
              <Linha label="Pedidos">{sel.pedidos.toLocaleString('pt-BR')}</Linha>
              <Linha label="Representadas">{sel.representadas}</Linha>
              <Linha label="Compromissos">{sel.compromissos.toLocaleString('pt-BR')}</Linha>
              <Linha label="Mensagens IA">{sel.mensagens_ia.toLocaleString('pt-BR')}</Linha>
            </Card>

            <Card icon={Bot} titulo="IA & Auditoria" cor="bg-purple-100 dark:bg-purple-900/30 text-purple-600">
              <Linha label="Mensagens no assistente">{sel.mensagens_ia.toLocaleString('pt-BR')}</Linha>
              <Linha label="Última ação registrada">{sel.ultima_acao_audit}</Linha>
              <Linha label="Quando">{fmtData(sel.ultima_acao_audit_em)}</Linha>
            </Card>

            <Card
              icon={BarChart3}
              titulo="PostHog"
              cor="bg-orange-100 dark:bg-orange-900/30 text-orange-600"
              acao={
                <a
                  href="https://us.posthog.com/persons"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-black uppercase tracking-widest text-orange-600 inline-flex items-center gap-1"
                >
                  abrir <ExternalLink className="w-3 h-3" />
                </a>
              }
            >
              {sel.ph_last_seen || sel.ph_total_events ? (
                <>
                  <Linha label="Visto por último">{fmtData(sel.ph_last_seen)}</Linha>
                  <Linha label="Eventos (total)">{sel.ph_total_events.toLocaleString('pt-BR')}</Linha>
                  <Linha label="Pageviews">{sel.ph_pageviews.toLocaleString('pt-BR')}</Linha>
                  <Linha label="Sessões (30d)">{sel.ph_sessions_30d.toLocaleString('pt-BR')}</Linha>
                  {sel.ph_properties?.['$geoip_city_name'] != null && (
                    <Linha label="Local (GeoIP)">
                      {String(sel.ph_properties['$geoip_city_name'])}
                      {sel.ph_properties['$geoip_country_name'] ? `, ${String(sel.ph_properties['$geoip_country_name'])}` : ''}
                    </Linha>
                  )}
                  {sel.ph_properties?.['$browser'] != null && (
                    <Linha label="Navegador">{String(sel.ph_properties['$browser'])} / {String(sel.ph_properties['$os'] ?? '')}</Linha>
                  )}
                  {Array.isArray(sel.ph_top_events) && sel.ph_top_events.length > 0 && (
                    <Linha label="Eventos mais comuns">{sel.ph_top_events.slice(0, 5).join(', ')}</Linha>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 py-2">
                  Ainda não sincronizado. Configure as chaves e o cron (ver <span className="font-mono text-xs">api/cron/sync-analytics.ts</span>).
                </p>
              )}
            </Card>

            <Card
              icon={ShieldAlert}
              titulo="Sentry (erros)"
              cor="bg-rose-100 dark:bg-rose-900/30 text-rose-600"
              acao={
                <a
                  href="https://sentry.io"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-black uppercase tracking-widest text-rose-600 inline-flex items-center gap-1"
                >
                  abrir <ExternalLink className="w-3 h-3" />
                </a>
              }
            >
              {sel.st_last_error_at || sel.st_total_errors ? (
                <>
                  <Linha label="Erros (30 dias)">{sel.st_errors_30d.toLocaleString('pt-BR')}</Linha>
                  <Linha label="Erros (total)">{sel.st_total_errors.toLocaleString('pt-BR')}</Linha>
                  <Linha label="Último erro">{fmtData(sel.st_last_error_at)}</Linha>
                  <Linha label="Título">{sel.st_last_error_title}</Linha>
                  {Array.isArray(sel.st_top_issues) && sel.st_top_issues.length > 0 && (
                    <div className="pt-2 space-y-1">
                      {sel.st_top_issues.slice(0, 3).map((i, idx) => (
                        <p key={idx} className="text-xs text-slate-500 truncate">
                          {i.permalink ? (
                            <a href={i.permalink} target="_blank" rel="noopener noreferrer" className="underline">{i.title}</a>
                          ) : i.title}{' '}
                          <span className="text-slate-400">×{i.count}</span>
                        </p>
                      ))}
                    </div>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-400 py-2">
                  Nenhum erro registrado (ou ainda não sincronizado).
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
