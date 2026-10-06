/* Pixel da Meta (Instagram/Facebook) — mede se o clique num anúncio da Meta virou cadastro,
 * checkout e assinatura. Só no site.
 *
 * Privacidade (LGPD): o script da Meta NÃO é nem baixado antes do aceite de cookies de análise
 * (ver cookieConsent.ts) — nem em modo restrito. Se a pessoa revogar depois, mandamos
 * `consent revoke` e nenhum evento sai mais. Desligamos a configuração automática do pixel
 * (cliques em botões, metadados de página) e NUNCA mandamos e-mail, telefone ou nome: só o nome
 * do evento, o valor da assinatura e um identificador aleatório de deduplicação.
 *
 * Eventos: PageView (cada tela), Lead (cadastro em /register), InitiateCheckout (abriu /checkout),
 * Subscribe (primeira cobrança confirmada, com valor). */

import { Capacitor } from '@capacitor/core';
import { hasAnalyticsConsent, subscribeConsent } from './cookieConsent';
import { isTrackingDisabled } from './trackingOptOut';

/** Conjunto de dados "Represente-Se Site" no Gerenciador de Eventos da Meta. */
export const META_PIXEL_ID = '1419946310333519';

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[];
  loaded?: boolean;
  version?: string;
  push?: unknown;
};

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let carregado = false;
let ouvindo = false;

function appNativo(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function podeRastrear(): boolean {
  return !appNativo() && !isTrackingDisabled() && hasAnalyticsConsent();
}

/** Baixa e inicia o pixel — só depois do aceite. Idempotente. */
export function initMetaPixel(): boolean {
  if (typeof document === 'undefined' || !podeRastrear()) return false;
  if (!carregado) {
    carregado = true;
    // Snippet oficial da Meta, só que depois do aceite e com a configuração automática desligada.
    const fbq: Fbq = function (...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue!.push(args);
    } as Fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = '2.0';
    fbq.queue = [];
    window.fbq = fbq;
    window._fbq = fbq;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);

    fbq('consent', 'grant');
    fbq('set', 'autoConfig', false, META_PIXEL_ID);
    fbq('init', META_PIXEL_ID);
  }
  if (!ouvindo) {
    ouvindo = true;
    // Aceite/revogação feitos depois (banner e Configurações).
    subscribeConsent(() => {
      if (!window.fbq) return;
      window.fbq('consent', hasAnalyticsConsent() ? 'grant' : 'revoke');
    });
  }
  return true;
}

/** Dispara um evento padrão. `eventId` evita contar duas vezes o mesmo evento. */
export function metaTrack(evento: 'PageView' | 'Lead' | 'InitiateCheckout' | 'Subscribe', dados?: Record<string, unknown>, eventId?: string): boolean {
  if (!initMetaPixel() || !window.fbq) return false;
  if (eventId) window.fbq('track', evento, dados ?? {}, { eventID: eventId });
  else window.fbq('track', evento, dados ?? {});
  return true;
}

function umaVezPorSessao(chave: string): boolean {
  try {
    if (sessionStorage.getItem(chave)) return false;
    sessionStorage.setItem(chave, '1');
  } catch {
    /* sem storage: manda mesmo */
  }
  return true;
}

export function metaLead(): boolean {
  if (!podeRastrear() || !umaVezPorSessao('rs_meta_lead')) return false;
  return metaTrack('Lead');
}

export function metaInitiateCheckout(): boolean {
  if (!podeRastrear() || !umaVezPorSessao('rs_meta_checkout')) return false;
  return metaTrack('InitiateCheckout');
}

/** Assinatura paga: valor da 1ª cobrança; o id do usuário deduplica. */
export function metaSubscribe(userId: string, valor: number): boolean {
  return metaTrack('Subscribe', { value: valor, currency: 'BRL' }, `sub_${userId}`);
}
