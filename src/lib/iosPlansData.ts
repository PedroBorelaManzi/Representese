/**
 * IDs usados só pela perna de IAP no iOS — não confundir com `plansData.ts`
 * (preços do site/Android, cobrados via Asaas).
 *
 * No RevenueCat, cada plano é uma Offering com esse mesmo identifier
 * ("exclusivo"/"profissional"/"master"), contendo um pacote `monthly` e um
 * `annual` apontando pros produtos de assinatura criados no App Store
 * Connect. O preço em si NUNCA fica hardcoded aqui — vem do próprio
 * StoreKit via `package.product.priceString` (ver src/lib/iap.ts), pra
 * sempre bater com o valor real aprovado pela Apple.
 */
export const IOS_OFFERING_IDS = ['exclusivo', 'profissional', 'master'] as const;
export type IosOfferingId = typeof IOS_OFFERING_IDS[number];

export const isIosOfferingId = (id: string): id is IosOfferingId =>
  (IOS_OFFERING_IDS as readonly string[]).includes(id);

/** Chave pública do RevenueCat (equivalente a uma publishable key — segura
 *  pra expor no bundle do app). Configurada no dashboard do RevenueCat. */
export const REVENUECAT_IOS_API_KEY = import.meta.env.VITE_REVENUECAT_IOS_API_KEY as string | undefined;
