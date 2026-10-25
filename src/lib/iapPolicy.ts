import { Capacitor } from '@capacitor/core';

/**
 * Política de compra no app iOS.
 *
 * A App Store (Guideline 3.1.1) exige In-App Purchase pra venda a usuários
 * individuais — por isso no app iOS o fluxo de compra usa IAP (RevenueCat,
 * ver src/lib/iap.ts) em vez do checkout do site (Asaas). Quem já assinou
 * pelo site (ou por outra plataforma) continua logando e usando normal —
 * `user_entitlements.subscription_provider` ('asaas' | 'ios_iap') é o que
 * diferencia, tela a tela, se o botão certo é "gerenciar no app" (IAP) ou
 * "gerenciar no site" (Asaas — só existe lá, não dá pra mexer via IAP).
 *
 * `/checkout` (formulário do Asaas: CPF/CNPJ, endereço, cartão) continua
 * sem sentido no iOS — mesmo comprando por IAP, esses dados nunca são
 * coletados. É só `/planos` que muda de comportamento.
 *
 * Android e web continuam com o fluxo Asaas completo, sem nenhuma mudança.
 *
 * `getPlatform()` devolve 'ios' só dentro do app nativo iOS — no Safari do
 * iPhone devolve 'web', então o site aberto no navegador não é afetado.
 */
export const isIOSApp = (): boolean => Capacitor.getPlatform() === 'ios';

export const isAndroidApp = (): boolean => Capacitor.getPlatform() === 'android';

/**
 * App nativo de loja (iOS ou Android). As duas lojas exigem que a assinatura
 * de bens digitais seja vendida pelo próprio faturamento delas (App Store IAP /
 * Google Play Billing) — via RevenueCat, ver src/lib/iap.ts — e proíbem levar
 * a pessoa a pagar fora. Toda a política descrita acima vale pros dois.
 */
export const isStoreApp = (): boolean => isIOSApp() || isAndroidApp();

/** Textos que mudam conforme a loja. */
export const store = () =>
  isAndroidApp()
    ? {
        name: 'Google Play',
        account: 'conta Google',
        provider: 'o Google Play',
        payment: 'o cartão, o Google Pay ou outra forma de pagamento da sua conta Google',
        manage: 'Play Store › Pagamentos e assinaturas › Assinaturas',
        refund: 'Reembolsos seguem a política do Google Play, solicitados diretamente com ele.',
        codeLabel: 'código promocional',
      }
    : {
        name: 'App Store',
        account: 'Apple ID',
        provider: 'a Apple',
        payment: 'o cartão ou Apple Pay da sua conta Apple',
        manage: 'Ajustes › Assinaturas',
        refund: 'Reembolsos seguem a política da Apple, solicitados diretamente com ela.',
        codeLabel: 'código',
      };

/** Domínio pra citar como texto fora da tela/etapa de compra — nunca como
 *  link clicável nem colado no botão de assinar (risco de "anti-steering"
 *  da Apple). Ver seção 3.7 do plano de IAP. */
export const SITE_DOMAIN = 'representese.com';
