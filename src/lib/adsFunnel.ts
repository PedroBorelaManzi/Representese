/* Funil de anúncios — eventos anônimos das etapas de topo (visita, tela de cadastro,
 * tela de checkout) de quem chegou por campanha. Alimenta a aba "Funil de anúncios" do
 * painel admin (RPC admin_ads_funnel). Só no site e só com aceite de cookies de análise
 * (LGPD) — por isso estes números são um piso; leads, contas e assinaturas vêm do banco. */

import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';
import { adsSource, getAttribution } from './attribution';
import { hasAnalyticsConsent } from './cookieConsent';
import { isTrackingDisabled } from './trackingOptOut';

export type FunnelStep = 'visit' | 'register_view' | 'checkout_view';

const SESSION_KEY = 'rs_ads_funnel_sid';

function sessionId(): string | null {
  try {
    let sid = sessionStorage.getItem(SESSION_KEY);
    if (!sid) {
      sid = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return null;
  }
}

/** Registra a etapa uma única vez por sessão. Silencioso: falha de rede nunca atrapalha a navegação. */
export function trackFunnelStep(step: FunnelStep): void {
  try {
    if (Capacitor.isNativePlatform()) return;
  } catch {
    /* segue como web */
  }
  if (isTrackingDisabled() || !hasAnalyticsConsent()) return;
  const a = getAttribution();
  const source = adsSource(a);
  if (!source) return;
  const sid = sessionId();
  if (!sid) return;
  const doneKey = `rs_ads_funnel_${step}`;
  try {
    if (sessionStorage.getItem(doneKey)) return;
    sessionStorage.setItem(doneKey, '1');
  } catch {
    /* sem storage: o índice único (session_id, step) no banco evita duplicata */
  }
  supabase
    .from('ads_funnel_events')
    .insert([{ session_id: sid, step, source, campaign: a?.utm_campaign ?? null }])
    .then(() => {}, () => {});
}
