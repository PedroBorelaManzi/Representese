/* Google Ads — tag de medição de conversões (só no site, só com consentimento).
 *
 * Mesma regra do PostHog (ver cookieConsent.ts): sem aceite de "análise" o
 * script do Google nem é baixado. No app nativo (iOS/Android) não carrega — lá
 * a compra é por IAP e o clique no anúncio nunca passa por este navegador.
 *
 * A única conversão medida é "Assinatura paga": dispara quando o pagamento é
 * CONFIRMADO (user_entitlements.subscription_status virou 'active'), não quando
 * o checkout é criado — Pix pendente e teste de 7 dias não contam. */

import { Capacitor } from '@capacitor/core';
import { hasAnalyticsConsent } from './cookieConsent';

export const GOOGLE_ADS_ID = 'AW-18449917835';
/** Rótulo da ação de conversão "Assinatura paga" (Google Ads → Metas → Conversões). */
export const GOOGLE_ADS_PAID_LABEL = 'WX6OCMr6648dEIvPzd1E';

type Gtag = (...args: unknown[]) => void;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let carregado = false;

function appNativo(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Baixa e configura o gtag.js. No-op sem consentimento, no app nativo ou se já carregou. */
export function initGoogleAds(): void {
  if (carregado || typeof document === 'undefined') return;
  if (appNativo() || !hasAnalyticsConsent()) return;
  carregado = true;

  window.dataLayer = window.dataLayer || [];
  // O gtag.js exige o objeto `arguments`, não um array — por isso a função clássica.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_ID);

  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`;
  document.head.appendChild(s);
}

/** Valor da primeira cobrança, em reais (mensal = preço do plano; anual = 12× o preço anual/mês). */
export function valorPrimeiraCobranca(precoMensal: string, precoAnualPorMes: string, ciclo?: string | null): number {
  const anual = String(ciclo ?? '').toUpperCase().startsWith('ANN');
  const n = Number(anual ? precoAnualPorMes : precoMensal);
  if (!Number.isFinite(n)) return 0;
  return anual ? n * 12 : n;
}

/** Registra a conversão "Assinatura paga". `transactionId` (id do usuário) faz o
 *  Google ignorar duplicatas se o evento disparar de novo. Retorna true se enviou. */
export function trackPaidSubscription(transactionId: string, value: number): boolean {
  if (!hasAnalyticsConsent()) return false;
  initGoogleAds();
  if (!window.gtag) return false;
  window.gtag('event', 'conversion', {
    send_to: `${GOOGLE_ADS_ID}/${GOOGLE_ADS_PAID_LABEL}`,
    value,
    currency: 'BRL',
    transaction_id: transactionId,
  });
  return true;
}
