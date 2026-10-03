/* Google Ads — tag de medição de conversões, em Consent Mode v2 (só no site).
 *
 * O gtag.js carrega em toda visita ao site, mas com TODO armazenamento e
 * identificador NEGADO por padrão: sem cookies, sem ID de clique guardado, sem
 * dados de usuário. O Google só recebe os dados técnicos da própria conexão
 * (IP, user agent). Quando a pessoa aceita os cookies de análise (ver
 * cookieConsent.ts), mandamos `consent update` liberando a medição de
 * conversão; se ela revoga depois, voltamos a negar. Isso também permite ao
 * Google detectar a tag na verificação da conta, que entra sem aceitar nada.
 *
 * No app nativo (iOS/Android) não carrega — lá a compra é por IAP e o clique no
 * anúncio nunca passa por este navegador.
 *
 * Não usamos remarketing nem personalização de anúncios: `ad_personalization`
 * fica sempre negado. A única conversão medida é "Assinatura paga", que dispara
 * quando o pagamento é CONFIRMADO (user_entitlements.subscription_status virou
 * 'active'), não quando o checkout é criado — Pix pendente e teste de 7 dias
 * não contam. E só com consentimento: sem aceite, nenhum evento é enviado. */

import { Capacitor } from '@capacitor/core';
import { hasAnalyticsConsent, subscribeConsent } from './cookieConsent';

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

/** Estado de consentimento que o Google deve usar agora. */
export function estadoConsentimento(concedido: boolean) {
  const v = concedido ? 'granted' : 'denied';
  return {
    ad_storage: v,
    ad_user_data: v,
    // Sem remarketing/personalização de anúncios, nunca.
    ad_personalization: 'denied',
    // Não usamos Google Analytics.
    analytics_storage: 'denied',
  } as const;
}

/** Baixa e configura o gtag.js em Consent Mode. Idempotente; no-op no app nativo. */
export function initGoogleAds(): void {
  if (carregado || typeof document === 'undefined') return;
  if (appNativo()) return;
  carregado = true;

  window.dataLayer = window.dataLayer || [];
  // O gtag.js exige o objeto `arguments`, não um array — por isso a função clássica.
  window.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };

  // O default tem que vir ANTES do `config`. Se a pessoa já aceitou em visita
  // anterior, já nasce concedido (evita perder o primeiro pageview).
  window.gtag('consent', 'default', { ...estadoConsentimento(hasAnalyticsConsent()), wait_for_update: 500 });
  // Com ad_storage negado, o Google remove IDs de clique das requisições.
  window.gtag('set', 'ads_data_redaction', true);
  window.gtag('js', new Date());
  window.gtag('config', GOOGLE_ADS_ID);

  // Acompanha aceite/recusa/revogação feitos depois (banner e Configurações).
  subscribeConsent(() => {
    window.gtag?.('consent', 'update', estadoConsentimento(hasAnalyticsConsent()));
  });

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
 *  Google ignorar duplicatas se o evento disparar de novo. Retorna true se enviou.
 *  Exige consentimento: sem aceite, nada é enviado (nem cookieless). */
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
