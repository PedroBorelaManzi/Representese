import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, User as UserIcon, CreditCard, Cookie, Activity, Database,
  Bot, ShieldAlert, BarChart3, ExternalLink, RefreshCw, MapPin, Navigation, Route, Smartphone, Megaphone, ArrowLeft,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { cn } from '../../lib/utils';

import { isHiddenAdminAccount } from '../../lib/adminHiddenAccounts';
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
  gps_lat: number | null;
  gps_lng: number | null;
  gps_precisao_m: number | null;
  gps_em: string | null;
  compartilha_local: boolean | null;
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
  // Colunas adicionadas em 08/11/2026 (migration capture_lead_on_signup).
  nome: string | null;
  empresa: string | null;
  email_confirmado: boolean | null;
  ultimo_login: string | null;
  origem_cadastro: 'app' | 'site' | null;
  plataforma: string | null;
  sistema_operacional: string | null;
  navegador: string | null;
  provedor_pagamento: string | null;
  iap_app_user_id: string | null;
  iap_original_transaction_id: string | null;
  iap_store: string | null;
  iap_product_id: string | null;
  iap_price: number | null;
  iap_currency: string | null;
  iap_country: string | null;
  iap_period_type: string | null;
  iap_environment: string | null;
  iap_purchased_at: string | null;
  iap_renewal_number: number | null;
  iap_offer_code: string | null;
  iap_cancel_reason: string | null;
  iap_last_event_type: string | null;
  iap_last_event_at: string | null;
  viu_planos_em: string | null;
  viu_checkout_em: string | null;
  funil_etapa: string | null;
  lead_marketing_consent: boolean | null;
  atribuicao: Record<string, string> | null;
  segmentos: string | null;
  indicado_por: string | null;
  indicacoes_feitas: number;
  desconto_indicacao: number | null;
};

const ETAPAS = ['assinante', 'teste grátis', 'pagamento com problema', 'começou o pagamento', 'escolhendo o plano', 'só cadastro', 'cancelou ou expirou'] as const;
const ETAPA_COR: Record<string, string> = {
  'assinante': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
  'teste grátis': 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-400',
  'pagamento com problema': 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  'começou o pagamento': 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
  'escolhendo o plano': 'bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-400',
  'só cadastro': 'bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400',
  'cancelou ou expirou': 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
};
const STATUS_PT: Record<string, string> = {
  active: 'ativa', trialing: 'em teste grátis', past_due: 'pagamento com problema',
  canceled: 'cancelada', cancelled: 'cancelada', expired: 'expirada', inactive: 'sem assinatura ativa',
};
const PROVEDOR_PT: Record<string, string> = {
  asaas: 'Site / Asaas', ios_iap: 'App Store (Apple)', play_iap: 'Google Play',
};
const LOJA_PT: Record<string, string> = { APP_STORE: 'App Store (Apple)', PLAY_STORE: 'Google Play', MAC_APP_STORE: 'Mac App Store', STRIPE: 'Stripe' };
const PLATAFORMA_PT: Record<string, string> = { ios: 'iPhone / iPad (app)', android: 'Android (app)', web: 'Navegador' };
const brl = (v: number | null, moeda: string | null) => {
  if (v == null) return null;
  try { return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: moeda || 'BRL' }).format(v); } catch { return String(v); }
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
      <span className="text-slate-700 dark:text-zinc-200 text-right font-medium break-words min-w-0">{children || '—'}</span>
    </div>
  );
}

function Card({
  icon: Icon, titulo, cor, children, acao,
}: {
  icon: typeof UserIcon; titulo: string; cor: string; children: React.ReactNode; acao?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 sm:p-5 min-w-0">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn('p-2 rounded-lg', cor)}><Icon className="w-4 h-4" /></div>
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-800 dark:text-zinc-200 break-words min-w-0">{titulo}</h3>
        </div>
        {acao}
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function UserDossier() {
  const [busca, setBusca] = useState('');
  const [etapa, setEtapa] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['admin_user_overview'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_user_overview');
      if (error) throw error;
      return ((data || []) as Overview[]).filter((u) => !isHiddenAdminAccount(u.email));
    },
    staleTime: 60_000,
  });

  const lista = useMemo(() => {
    const arr = (data || []).filter((u) => !etapa || u.funil_etapa === etapa);
    const q = busca.trim().toLowerCase();
    if (!q) return arr;
    return arr.filter(
      (u) =>
        (u.email || '').toLowerCase().includes(q) ||
        (u.nome || '').toLowerCase().includes(q) ||
        (u.empresa || '').toLowerCase().includes(q) ||
        (u.plano || '').toLowerCase().includes(q) ||
        (u.funil_etapa || '').toLowerCase().includes(q) ||
        (u.plataforma || '').toLowerCase().includes(q) ||
        (u.ultima_localizacao || '').toLowerCase().includes(q),
    );
  }, [data, busca, etapa]);

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
    <div className="grid md:grid-cols-[320px_1fr] gap-4 md:gap-6">
      {/* Lista de usuários — no celular some quando uma ficha está aberta (uma tela de cada vez) */}
      <div className={cn('space-y-3', sel && 'hidden md:block')}>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, e-mail, plano, cidade…"
            className="w-full pl-9 pr-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>
        <select
          value={etapa}
          onChange={(e) => setEtapa(e.target.value)}
          aria-label="Filtrar por etapa do funil"
          className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-sm outline-none focus:ring-2 focus:ring-emerald-500/20"
        >
          <option value="">Todas as etapas</option>
          {ETAPAS.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </select>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            {lista.length} {lista.length === 1 ? 'usuário' : 'usuários'}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            data-testid="ficha-recarregar"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-zinc-800 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-slate-800 dark:hover:text-zinc-200 hover:bg-slate-50 dark:hover:bg-zinc-800/50 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} /> Recarregar
          </button>
        </div>
        <div className="space-y-1 md:max-h-[70vh] md:overflow-y-auto pr-1">
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
                {u.nome || u.email || 'sem e-mail'}
              </p>
              <p className="text-[11px] text-slate-400 truncate">
                {u.nome ? `${u.email} · ` : ''}{u.funil_etapa || 'sem etapa'} · {u.ultimo_acesso ? desde(u.ultimo_acesso) : 'nunca acessou'}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Ficha do selecionado */}
      {!sel ? (
        <div className="hidden md:block rounded-2xl border border-dashed border-slate-200 dark:border-zinc-800 py-20 text-center text-slate-400">
          Selecione um usuário para ver a ficha completa.
        </div>
      ) : (
        <div className="space-y-4 min-w-0">
          <button
            onClick={() => setSelId(null)}
            className="md:hidden inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-slate-500 active:text-slate-800 py-1"
          >
            <ArrowLeft className="w-4 h-4" /> Voltar à lista
          </button>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2 flex-wrap break-words">
                {sel.nome || sel.email}
                {sel.funil_etapa && (
                  <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider', ETAPA_COR[sel.funil_etapa] || ETAPA_COR['só cadastro'])}>
                    {sel.funil_etapa}
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 break-all">{sel.nome ? `${sel.email} · ` : ''}<span className="font-mono">{sel.user_id}</span></p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-600 disabled:opacity-50 shrink-0"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')} /> <span className="hidden sm:inline">Atualizar</span>
            </button>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card icon={UserIcon} titulo="Identidade & Contato" cor="bg-blue-100 dark:bg-blue-900/30 text-blue-600">
              <Linha label="Nome">{sel.nome}</Linha>
              <Linha label="Empresa">{sel.empresa}</Linha>
              <Linha label="E-mail">
                {sel.email}
                {sel.email_confirmado != null && (
                  <span className={cn('ml-2 text-[11px]', sel.email_confirmado ? 'text-emerald-600' : 'text-amber-600')}>
                    {sel.email_confirmado ? 'confirmado' : 'não confirmado'}
                  </span>
                )}
              </Linha>
              <Linha label="WhatsApp">{sel.phone || (sel.origem_cadastro === 'app' ? 'não informado (opcional no app)' : null)}</Linha>
              <Linha label="Conta criada">{fmtDia(sel.created_at)} <span className="text-slate-400">({desde(sel.created_at)})</span></Linha>
              <Linha label="Cadastrou pelo">
                {sel.origem_cadastro === 'app' ? 'Aplicativo' : sel.origem_cadastro === 'site' ? 'Site' : null}
              </Linha>
              <Linha label="Usa o sistema por">
                {sel.plataforma
                  ? `${PLATAFORMA_PT[sel.plataforma] || sel.plataforma}${sel.sistema_operacional ? ` · ${sel.sistema_operacional}` : ''}${sel.navegador && sel.plataforma === 'web' ? ` · ${sel.navegador}` : ''}`
                  : null}
              </Linha>
              <Linha label="Último login">{sel.ultimo_login ? <>{fmtData(sel.ultimo_login)} <span className="text-slate-400">({desde(sel.ultimo_login)})</span></> : null}</Linha>
              <Linha label="Onboarding">{sel.onboarding_ok ? 'concluído' : 'pendente (ainda não configurou as empresas)'}</Linha>
              <Linha label="Cidade">
                {(() => {
                  const clima = [sel.cidade, sel.estado].filter(Boolean).join(', ');
                  const cobranca = [sel.billing_cidade, sel.billing_estado].filter(Boolean).join(', ');
                  if (clima) return clima;
                  if (cobranca) return `${cobranca} (endereço de cobrança)`;
                  if (sel.ultima_localizacao) return `${sel.ultima_localizacao} (pelo acesso)`;
                  return null;
                })()}
              </Linha>
              <Linha label="Mercado de atuação">{sel.segmentos}</Linha>
              <Linha label="Perfil">{sel.is_admin ? 'Administrador' : 'Usuário'}</Linha>
            </Card>

            <Card icon={Route} titulo="Funil de venda" cor="bg-sky-100 dark:bg-sky-900/30 text-sky-600">
              <Linha label="Etapa agora">
                {sel.funil_etapa && (
                  <span className={cn('px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider', ETAPA_COR[sel.funil_etapa] || ETAPA_COR['só cadastro'])}>
                    {sel.funil_etapa}
                  </span>
                )}
              </Linha>
              <Linha label="Cadastro concluído">{fmtData(sel.created_at)}</Linha>
              <Linha label="Viu a tela de planos">{sel.viu_planos_em ? fmtData(sel.viu_planos_em) : 'ainda não'}</Linha>
              <Linha label="Abriu o pagamento">{sel.viu_checkout_em ? fmtData(sel.viu_checkout_em) : sel.asaas_id || sel.iap_original_transaction_id ? 'sim' : 'ainda não'}</Linha>
              <Linha label="Indicado por">{sel.indicado_por || 'ninguém'}</Linha>
              <Linha label="Indicações feitas">{sel.indicacoes_feitas ? `${sel.indicacoes_feitas} (desconto de ${sel.desconto_indicacao ?? 0}%)` : 'nenhuma'}</Linha>
            </Card>

            <Card icon={CreditCard} titulo="Plano & Assinatura" cor="bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600">
              {(() => {
                const semPlano = !sel.plan_id || sel.plan_id === 'none';
                const temPagamento = !!(sel.asaas_id || sel.iap_original_transaction_id);
                return (
                  <>
                    <Linha label="Plano">{semPlano ? 'nenhum ainda' : sel.plano || sel.plan_id}</Linha>
                    <Linha label="Situação">{STATUS_PT[sel.assinatura_status || ''] || sel.assinatura_status}</Linha>
                    <Linha label="Ciclo">{semPlano ? null : sel.ciclo === 'ANNUAL' ? 'Anual' : sel.ciclo === 'SEMIANNUAL' ? 'Semestral' : sel.ciclo === 'MONTHLY' ? 'Mensal' : sel.ciclo}</Linha>
                    <Linha label="Paga por">{temPagamento || !semPlano ? PROVEDOR_PT[sel.provedor_pagamento || ''] || sel.provedor_pagamento : 'ainda não pagou'}</Linha>
                    <Linha label="Período até">{sel.periodo_fim ? fmtDia(sel.periodo_fim) : null}</Linha>
                    <Linha label="Trial até">{sel.trial_fim ? fmtDia(sel.trial_fim) : null}</Linha>
                    <Linha label="Cancela no fim?">{semPlano ? null : sel.cancela_no_fim ? 'sim' : 'não'}</Linha>
                    <Linha label="Endereço cobrança">{[sel.billing_cidade, sel.billing_estado, sel.billing_cep].filter(Boolean).join(' · ') || (semPlano ? 'preenchido no pagamento' : null)}</Linha>
                    <Linha label="ID Asaas">{sel.asaas_id && <span className="font-mono text-xs">{sel.asaas_id}</span>}</Linha>
                  </>
                );
              })()}
            </Card>

            <Card icon={Smartphone} titulo="Loja (App Store / Google Play · RevenueCat)" cor="bg-violet-100 dark:bg-violet-900/30 text-violet-600">
              {sel.iap_store || sel.iap_original_transaction_id || sel.iap_last_event_type ? (
                <>
                  <Linha label="Loja">{sel.iap_store ? LOJA_PT[sel.iap_store] || sel.iap_store : PROVEDOR_PT[sel.provedor_pagamento || ''] || null}</Linha>
                  <Linha label="Produto">{sel.iap_product_id && <span className="font-mono text-xs">{sel.iap_product_id}</span>}</Linha>
                  <Linha label="Valor pago">{brl(sel.iap_price, sel.iap_currency)}</Linha>
                  <Linha label="País da loja">{sel.iap_country}</Linha>
                  <Linha label="Ambiente">
                    {sel.iap_environment && (
                      <span className={sel.iap_environment === 'SANDBOX' ? 'text-amber-600' : 'text-emerald-600'}>
                        {sel.iap_environment === 'SANDBOX' ? 'teste (sandbox, não é dinheiro real)' : 'produção'}
                      </span>
                    )}
                  </Linha>
                  <Linha label="Tipo de período">{sel.iap_period_type}</Linha>
                  <Linha label="Compra em">{sel.iap_purchased_at ? fmtData(sel.iap_purchased_at) : null}</Linha>
                  <Linha label="Renovação nº">{sel.iap_renewal_number}</Linha>
                  <Linha label="Oferta usada">{sel.iap_offer_code && <span className="font-mono text-xs">{sel.iap_offer_code}</span>}</Linha>
                  <Linha label="Motivo do cancelamento">{sel.iap_cancel_reason}</Linha>
                  <Linha label="Último evento">{sel.iap_last_event_type ? <>{sel.iap_last_event_type} <span className="text-slate-400">({fmtData(sel.iap_last_event_at)})</span></> : null}</Linha>
                  <Linha label="ID no RevenueCat">{sel.iap_app_user_id && <span className="font-mono text-xs">{sel.iap_app_user_id}</span>}</Linha>
                  <Linha label="Transação original">{sel.iap_original_transaction_id && <span className="font-mono text-xs">{sel.iap_original_transaction_id}</span>}</Linha>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-2">
                  Sem compra pela loja. Quando esta pessoa assinar pelo aplicativo, os dados (valor pago, país, renovações,
                  ambiente de teste ou produção) chegam sozinhos pelo RevenueCat.
                </p>
              )}
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
                  {sel.origem_cadastro === 'app'
                    ? 'Cadastro pelo aplicativo: o app não usa cookies, então não existe decisão de cookies para registrar.'
                    : 'Sem registro ligado a esta conta ainda (a decisão anônima do navegador é ligada no próximo login).'}
                </p>
              )}
            </Card>

            <Card icon={Megaphone} titulo="Origem de marketing" cor="bg-pink-100 dark:bg-pink-900/30 text-pink-600">
              {sel.atribuicao && Object.keys(sel.atribuicao).length > 0 ? (
                <>
                  <Linha label="Origem">{sel.atribuicao.utm_source}</Linha>
                  <Linha label="Meio">{sel.atribuicao.utm_medium}</Linha>
                  <Linha label="Campanha">{sel.atribuicao.utm_campaign}</Linha>
                  <Linha label="Anúncio">{sel.atribuicao.utm_content}</Linha>
                  <Linha label="Termo">{sel.atribuicao.utm_term}</Linha>
                  <Linha label="Clique Google (gclid)">{sel.atribuicao.gclid && <span className="font-mono text-xs">{sel.atribuicao.gclid.slice(0, 18)}…</span>}</Linha>
                  <Linha label="Clique Meta (fbclid)">{sel.atribuicao.fbclid && <span className="font-mono text-xs">{sel.atribuicao.fbclid.slice(0, 18)}…</span>}</Linha>
                  <Linha label="Veio de">{sel.atribuicao.ref_host}</Linha>
                  <Linha label="Página de entrada">{sel.atribuicao.landing}</Linha>
                  <Linha label="Capturado em">{sel.atribuicao.captured_at ? fmtData(sel.atribuicao.captured_at) : null}</Linha>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-2">
                  {sel.origem_cadastro === 'app'
                    ? 'Cadastro feito dentro do aplicativo: não passa por anúncio nem link com UTM, então não há origem de campanha.'
                    : 'Sem UTM registrada: a pessoa chegou direto, por busca orgânica ou antes de a captura de campanha existir.'}
                </p>
              )}
              <Linha label="Aceitou receber novidades">{sel.lead_marketing_consent == null ? null : sel.lead_marketing_consent ? 'sim' : 'não'}</Linha>
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

            <Card
              icon={Navigation}
              titulo="Localização (GPS)"
              cor="bg-rose-100 dark:bg-rose-900/30 text-rose-600"
              acao={
                sel.gps_lat != null && sel.gps_lng != null ? (
                  <a
                    href={`https://www.google.com/maps?q=${sel.gps_lat},${sel.gps_lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[10px] font-black uppercase tracking-widest text-rose-600 inline-flex items-center gap-1"
                  >
                    mapa <ExternalLink className="w-3 h-3" />
                  </a>
                ) : undefined
              }
            >
              {sel.gps_lat != null && sel.gps_lng != null ? (
                <>
                  <Linha label="Coordenadas">
                    <span className="font-mono text-xs">{sel.gps_lat.toFixed(5)}, {sel.gps_lng.toFixed(5)}</span>
                  </Linha>
                  <Linha label="Precisão">{sel.gps_precisao_m != null ? `± ${Math.round(sel.gps_precisao_m)} m` : '—'}</Linha>
                  <Linha label="Capturada">{fmtData(sel.gps_em)} <span className="text-slate-400">({desde(sel.gps_em)})</span></Linha>
                  <Linha label="Compartilhamento">
                    <span className={sel.compartilha_local === false ? 'text-red-500' : 'text-emerald-600'}>
                      {sel.compartilha_local === false ? 'desligado pelo usuário' : 'ligado'}
                    </span>
                  </Linha>
                </>
              ) : (
                <p className="text-sm text-slate-400 py-2">
                  {sel.compartilha_local === false
                    ? 'Usuário desligou o compartilhamento de localização.'
                    : 'Sem ponto capturado ainda (permissão do aparelho não concedida ou app não reaberto).'}
                </p>
              )}
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
