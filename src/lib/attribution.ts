/* Origem do visitante (anúncio, rede social, indicação) — só no site.
 *
 * Guarda os parâmetros de campanha da URL (gclid/gbraid/wbraid e utm_*) para que
 * o lead de /register e a conta criada no Checkout saibam de onde vieram. Sem isso
 * não dá para dizer quantos leads/assinaturas o Google Ads trouxe nem exportar a
 * conversão para o Google (importação offline por gclid).
 *
 * LGPD: sem aceite de cookies analíticos o dado fica só em sessionStorage (some ao
 * fechar a aba) — o suficiente para a pessoa preencher o formulário. Com aceite,
 * também vai para localStorage por 90 dias (a pessoa pode voltar outro dia). */

import { Capacitor } from '@capacitor/core';
import { hasAnalyticsConsent, subscribeConsent } from './cookieConsent';

const KEY = 'rm_attribution';
const TTL_MS = 90 * 24 * 60 * 60 * 1000;
const PARAMS = ['gclid', 'gbraid', 'wbraid', 'fbclid', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

export type Attribution = Partial<Record<(typeof PARAMS)[number], string>> & {
  /** Host de onde a pessoa veio, quando não há parâmetro de campanha. */
  ref_host?: string;
  /** Primeira página vista nesta origem (ex.: "/register"). */
  landing?: string;
  captured_at?: string;
};

const limpa = (v: string | null | undefined) => (v ?? '').trim().slice(0, 200) || undefined;

/** Extrai a origem da URL/referrer. Pura (testável). Retorna null se não há nada útil. */
export function parseAttribution(search: string, pathname: string, referrer: string, ownHost: string): Attribution | null {
  const p = new URLSearchParams(search);
  const a: Attribution = {};
  for (const k of PARAMS) {
    const v = limpa(p.get(k));
    if (v) a[k] = v;
  }
  if (!Object.keys(a).length) {
    // Sem campanha na URL: guarda só o domínio de referência externo (ex.: instagram.com).
    try {
      const host = referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '';
      if (!host || host === ownHost.replace(/^www\./, '')) return null;
      a.ref_host = host.slice(0, 100);
    } catch {
      return null;
    }
  }
  a.landing = pathname.slice(0, 100);
  a.captured_at = new Date().toISOString();
  return a;
}

/** Origem normalizada da visita: 'google' (ID de clique ou utm_source=google), 'meta' (Instagram/Facebook:
 *  fbclid, utm_source ou domínio de referência), senão utm_source / domínio de referência. */
export function adsSource(a: Attribution | null): string | null {
  if (!a) return null;
  if (a.gclid || a.gbraid || a.wbraid) return 'google';
  const utm = (a.utm_source || '').toLowerCase().trim();
  if (utm === 'google') return 'google';
  if (a.fbclid || ['instagram', 'ig', 'facebook', 'fb', 'meta'].includes(utm) || /(instagram|facebook|fb\.com|fb\.me)/i.test(a.ref_host || '')) return 'meta';
  if (utm) return utm.slice(0, 100);
  return a.ref_host ? a.ref_host.slice(0, 100) : null;
}

function ler(storage: Storage | undefined): Attribution | null {
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return null;
    const a = JSON.parse(raw) as Attribution;
    if (a.captured_at && Date.now() - new Date(a.captured_at).getTime() > TTL_MS) return null;
    return a;
  } catch {
    return null;
  }
}

function gravar(a: Attribution) {
  const s = JSON.stringify(a);
  try { sessionStorage.setItem(KEY, s); } catch { /* storage indisponível */ }
  if (hasAnalyticsConsent()) {
    try { localStorage.setItem(KEY, s); } catch { /* idem */ }
  }
}

/** Chamar a cada carregamento do site (web). Uma campanha nova na URL substitui a anterior;
 *  uma visita sem campanha (ex.: voltou direto) preserva a que já estava guardada. */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;
  try { if (Capacitor.isNativePlatform()) return; } catch { /* segue como web */ }
  const nova = parseAttribution(window.location.search, window.location.pathname, document.referrer, window.location.hostname);
  if (nova) {
    const atual = getAttribution();
    // Visita só com referrer não apaga uma origem de campanha (gclid/utm) já guardada.
    if (nova.ref_host && atual && (atual.gclid || atual.utm_source)) return;
    gravar(nova);
  }
  // Se a pessoa aceitar os cookies depois, passa o que está na sessão para o localStorage.
  subscribeConsent(() => {
    if (!hasAnalyticsConsent()) return;
    const s = ler(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
    if (s) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* idem */ } }
  });
}

/** Origem guardada (localStorage com aceite, senão a da sessão). null se não há. */
export function getAttribution(): Attribution | null {
  return ler(typeof localStorage !== 'undefined' ? localStorage : undefined)
    ?? ler(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined);
}
