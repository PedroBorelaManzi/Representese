import { Capacitor } from '@capacitor/core';

/**
 * Política de compra no app iOS.
 *
 * A App Store (Guideline 3.1.1) proíbe qualquer botão, link ou chamada pra
 * ação que leve o usuário a pagar/assinar fora do In-App Purchase. Como a
 * assinatura do Represente-Se é cobrada pelo site (Asaas), no app iOS a
 * gente **esconde** planos, preços, checkout, upgrade e qualquer link de
 * cobrança. Quem já assinou pelo site loga e usa normal; quem não tem plano
 * é orientado por texto (sem link clicável) a resolver no navegador.
 *
 * Android e web continuam com o fluxo completo.
 *
 * `getPlatform()` devolve 'ios' só dentro do app nativo iOS — no Safari do
 * iPhone devolve 'web', então o site aberto no navegador não é afetado.
 */
export const isIOSApp = (): boolean => Capacitor.getPlatform() === 'ios';

/** Alias semântico pros pontos de venda. */
export const purchasesBlocked = isIOSApp;

/** Domínio pra citar como TEXTO (nunca como link clicável no iOS). */
export const SITE_DOMAIN = 'representese.com';
