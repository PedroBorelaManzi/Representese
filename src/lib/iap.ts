import { Purchases } from '@revenuecat/purchases-capacitor';
import type { PurchasesPackage } from '@revenuecat/purchases-capacitor';
import { Browser } from '@capacitor/browser';
import { isIOSApp } from './iapPolicy';
import { IOS_OFFERING_IDS, IosOfferingId, REVENUECAT_IOS_API_KEY, isIosOfferingId } from './iosPlansData';

let configured = false;

// Configura o SDK uma única vez por sessão do app. Chamado a partir do
// AuthContext (login/sessão restaurada) — sem isso, `getOfferings`/
// `purchasePackage` rejeitam com "not configured".
export async function initPurchases(appUserID?: string): Promise<void> {
  if (!isIOSApp() || configured) return;
  if (!REVENUECAT_IOS_API_KEY) {
    console.error('VITE_REVENUECAT_IOS_API_KEY ausente — IAP não vai funcionar.');
    return;
  }
  configured = true;
  try {
    await Purchases.configure({ apiKey: REVENUECAT_IOS_API_KEY, appUserID: appUserID ?? null });
  } catch (err) {
    configured = false;
    console.error('Erro ao configurar RevenueCat:', err);
  }
}

// Liga o app_user_id do RevenueCat ao id do usuário no Supabase — assim o
// webhook (handle-revenuecat-webhook) não precisa de nenhum lookup por
// e-mail pra saber de quem é a compra.
export async function iapLogIn(userId: string): Promise<void> {
  if (!isIOSApp()) return;
  if (!configured) await initPurchases(userId);
  try {
    await Purchases.logIn({ appUserID: userId });
  } catch (err) {
    console.error('Erro no RevenueCat logIn:', err);
  }
}

export async function iapLogOut(): Promise<void> {
  if (!isIOSApp() || !configured) return;
  try {
    await Purchases.logOut();
  } catch {
    // Sem sessão prévia no RevenueCat (ex.: já era anônimo) — ignora.
  }
}

export type IosPlanPrices = Partial<Record<IosOfferingId, { monthly?: string; annual?: string }>>;

// Preço real, formatado e localizado pela própria App Store — nunca
// calculado a partir de plansData.ts (que é o preço do site).
export async function getIosPlanPrices(): Promise<IosPlanPrices> {
  if (!isIOSApp()) return {};
  try {
    const { all } = await Purchases.getOfferings();
    const result: IosPlanPrices = {};
    for (const id of IOS_OFFERING_IDS) {
      const offering = all[id];
      if (!offering) continue;
      result[id] = {
        monthly: offering.monthly?.product.priceString,
        annual: offering.annual?.product.priceString,
      };
    }
    return result;
  } catch (err) {
    console.error('Erro ao buscar preços da App Store:', err);
    return {};
  }
}

async function getPackage(planId: string, period: 'MONTHLY' | 'ANNUAL'): Promise<PurchasesPackage | null> {
  if (!isIosOfferingId(planId)) return null;
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
      return { success: false, userCancelled: false, message: 'Plano indisponível na App Store no momento.' };
    }
    await Purchases.purchasePackage({ aPackage });
    // user_entitlements é atualizado pelo webhook do RevenueCat
    // (handle-revenuecat-webhook) — não escrevemos nada daqui.
    return { success: true, userCancelled: false };
  } catch (err: any) {
    if (err?.userCancelled) return { success: false, userCancelled: true };
    return { success: false, userCancelled: false, message: err?.message || 'Erro ao processar a compra.' };
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
  await Browser.open({ url: 'https://apps.apple.com/account/subscriptions' });
}
