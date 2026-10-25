import { Purchases } from '@revenuecat/purchases-capacitor';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Browser } from '@capacitor/browser';
import { isAndroidApp, isStoreApp, store } from './iapPolicy';
import { IOS_OFFERING_IDS, IosOfferingId, REVENUECAT_IOS_API_KEY, REVENUECAT_ANDROID_API_KEY, isIosOfferingId } from './iosPlansData';

let configured = false;

// Configura o SDK uma única vez por sessão do app. Chamado a partir do
// AuthContext (login/sessão restaurada) — sem isso, `getOfferings`/
// `purchasePackage` rejeitam com "not configured".
export async function initPurchases(appUserID?: string): Promise<void> {
  if (!isStoreApp() || configured) return;
  const apiKey = isAndroidApp() ? REVENUECAT_ANDROID_API_KEY : REVENUECAT_IOS_API_KEY;
  if (!apiKey) {
    console.error(`VITE_REVENUECAT_${isAndroidApp() ? 'ANDROID' : 'IOS'}_API_KEY ausente — compra no app não vai funcionar.`);
    return;
  }
  configured = true;
  try {
    await Purchases.configure({ apiKey, appUserID: appUserID ?? null });
  } catch (err) {
    configured = false;
    console.error('Erro ao configurar RevenueCat:', err);
  }
}

// Liga o app_user_id do RevenueCat ao id do usuário no Supabase — assim o
// webhook (handle-revenuecat-webhook) não precisa de nenhum lookup por
// e-mail pra saber de quem é a compra.
export async function iapLogIn(userId: string): Promise<void> {
  if (!isStoreApp()) return;
  if (!configured) await initPurchases(userId);
  try {
    await Purchases.logIn({ appUserID: userId });
  } catch (err) {
    console.error('Erro no RevenueCat logIn:', err);
  }
}

export async function iapLogOut(): Promise<void> {
  if (!isStoreApp() || !configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Sem sessão prévia no RevenueCat (ex.: já era anônimo) — ignora.
  }
}

// `annualPerMonth`: o plano anual dividido por 12, já formatado na moeda da
// loja do usuário — só pra comparar com o mensal. A Apple não parcela
// assinatura, então NUNCA apresentar isso como "12x": é só equivalência.
export type IosPlanPrices = Partial<Record<IosOfferingId, { monthly?: string; annual?: string; annualPerMonth?: string }>>;

function formatPerMonth(total: number | undefined, currencyCode: string | undefined): string | undefined {
  if (!total || !currencyCode) return undefined;
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(total / 12);
  } catch {
    return undefined;
  }
}

export interface IosPlanPricesResult {
  prices: IosPlanPrices;
  // Mensagem já pronta pra mostrar na tela quando não foi possível carregar
  // os planos da App Store (com o motivo real vindo do StoreKit/RevenueCat).
  error?: string;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function describeIapError(err: any): string {
  const parts = [err?.message, err?.underlyingErrorMessage, err?.code != null ? `código ${err.code}` : null]
    .filter((x) => typeof x === 'string' && x.length > 0 || typeof x === 'number');
  return parts.join(' — ') || 'erro desconhecido';
}

// Preço real, formatado e localizado pela própria App Store — nunca
// calculado a partir de plansData.ts (que é o preço do site). Tenta 3 vezes
// (rede ruim / SDK ainda configurando) e devolve o motivo real do erro em vez
// de engolir: a Apple rejeitou a v1.78 por "erro ao carregar os produtos" e
// sem esse motivo não dava pra diagnosticar.
export async function loadIosPlanPrices(): Promise<IosPlanPricesResult> {
  if (!isStoreApp()) return { prices: {} };
  let lastError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!configured) await initPurchases();
      if (!configured) throw new Error('RevenueCat não configurado (chave pública ausente ou inválida)');
      const { all } = await Purchases.getOfferings();
      const prices: IosPlanPrices = {};
      for (const id of IOS_OFFERING_IDS) {
        const offering = all[id];
        if (!offering) continue;
        prices[id] = {
          monthly: offering.monthly?.product.priceString,
          annual: offering.annual?.product.priceString,
          annualPerMonth: formatPerMonth(offering.annual?.product.price, offering.annual?.product.currencyCode),
        };
      }
      if (Object.keys(prices).length === 0) {
        throw new Error(`nenhuma oferta encontrada (ofertas recebidas: ${Object.keys(all).join(', ') || 'nenhuma'})`);
      }
      return { prices };
    } catch (err) {
      lastError = describeIapError(err);
      console.error(`Erro ao buscar preços da App Store (tentativa ${attempt + 1}):`, err);
      if (attempt < 2) await wait(1500 * (attempt + 1));
    }
  }
  return { prices: {}, error: lastError };
}

export async function getIosPlanPrices(): Promise<IosPlanPrices> {
  return (await loadIosPlanPrices()).prices;
}

async function getPackage(planId: string, period: 'MONTHLY' | 'ANNUAL'): Promise<PurchasesPackage | null> {
  if (!isIosOfferingId(planId)) return null;
  if (!configured) await initPurchases();
  const { all } = await Purchases.getOfferings();
  const offering = all[planId];
  if (!offering) return null;
  return (period === 'ANNUAL' ? offering.annual : offering.monthly) ?? null;
}

export interface PurchaseOutcome {
  success: boolean;
  userCancelled: boolean;
  message?: string;
}

export async function purchasePlan(planId: string, period: 'MONTHLY' | 'ANNUAL'): Promise<PurchaseOutcome> {
  try {
    const aPackage = await getPackage(planId, period);
    if (!aPackage) {
      return { success: false, userCancelled: false, message: `Plano indisponível na ${store().name} no momento. Toque em "Tentar novamente" ou volte em instantes.` };
    }
    await Purchases.purchasePackage({ aPackage });
    // user_entitlements é atualizado pelo webhook do RevenueCat
    // (handle-revenuecat-webhook) — não escrevemos nada daqui.
    return { success: true, userCancelled: false };
  } catch (err: any) {
    // O plugin do RevenueCat rejeita com code "1" (PURCHASE_CANCELLED_ERROR) e/ou
    // userCancelled em locais diferentes conforme a versão — checa todos, senão
    // fechar a janela da Apple aparece pro usuário como "erro".
    const cancelou =
      err?.userCancelled === true ||
      err?.userInfo?.userCancelled === true ||
      String(err?.code) === '1' ||
      /PURCHASE_CANCELLED|purchase was cancelled/i.test(`${err?.code ?? ''} ${err?.message ?? ''}`);
    if (cancelou) return { success: false, userCancelled: true };
    return { success: false, userCancelled: false, message: describeIapError(err) || 'Erro ao processar a compra.' };
  }
}

// Abre a folha nativa da Apple pra resgatar um Offer Code (código promocional
// de assinatura). O resgate acontece dentro da Apple; o acesso chega depois
// pelo webhook do RevenueCat, igual a uma compra.
export async function redeemOfferCode(): Promise<PurchaseOutcome> {
  try {
    if (isAndroidApp()) {
      // Android não tem folha nativa: o resgate é feito na própria Play Store.
      await Browser.open({ url: 'https://play.google.com/redeem' });
      return { success: true, userCancelled: false };
    }
    await Purchases.presentCodeRedemptionSheet();
    return { success: true, userCancelled: false };
  } catch (err: any) {
    return { success: false, userCancelled: false, message: describeIapError(err) || 'Não foi possível abrir o resgate de código.' };
  }
}

export async function restorePurchases(): Promise<PurchaseOutcome> {
  try {
    await Purchases.restorePurchases();
    return { success: true, userCancelled: false };
  } catch (err: any) {
    return { success: false, userCancelled: false, message: err?.message || 'Erro ao restaurar compras.' };
  }
}

// A Apple não expõe cancelamento/gerenciamento de assinatura via SDK — o
// caminho oficial é este link universal, que abre a tela nativa de
// assinaturas do usuário (App Store ou Ajustes, dependendo da versão do iOS).
export async function openManageSubscriptions(): Promise<void> {
  await Browser.open({
    url: isAndroidApp()
      ? 'https://play.google.com/store/account/subscriptions?package=com.representese.app'
      : 'https://apps.apple.com/account/subscriptions',
  });
}
