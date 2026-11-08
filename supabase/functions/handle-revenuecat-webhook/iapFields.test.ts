import { describe, it, expect } from 'vitest';
import { revenueCatFields } from './iapFields';

const NOW = new Date('2026-11-08T20:00:00.000Z');

describe('revenueCatFields', () => {
  it('compra completa: guarda loja, produto, preço, país, ambiente e renovação', () => {
    const f = revenueCatFields({
      type: 'INITIAL_PURCHASE', store: 'APP_STORE', product_id: 'com.representese.app.master.monthly',
      price_in_purchased_currency: 131.9, currency: 'BRL', country_code: 'BR', period_type: 'NORMAL',
      environment: 'PRODUCTION', purchased_at_ms: 1_800_000_000_000, renewal_number: 1,
      event_timestamp_ms: 1_800_000_001_000,
    }, NOW);
    expect(f).toMatchObject({
      iap_last_event_type: 'INITIAL_PURCHASE', iap_store: 'APP_STORE',
      iap_product_id: 'com.representese.app.master.monthly', iap_price: 131.9, iap_currency: 'BRL',
      iap_country: 'BR', iap_period_type: 'NORMAL', iap_environment: 'PRODUCTION', iap_renewal_number: 1,
      iap_purchased_at: new Date(1_800_000_000_000).toISOString(),
      iap_last_event_at: new Date(1_800_000_001_000).toISOString(),
    });
  });

  it('evento magro não devolve chaves vazias (não apaga o que já estava gravado)', () => {
    const f = revenueCatFields({ type: 'EXPIRATION' }, NOW);
    expect(Object.keys(f).sort()).toEqual(['iap_last_event_at', 'iap_last_event_type']);
    expect(f.iap_last_event_at).toBe(NOW.toISOString());
  });

  it('não confunde o preço em USD do RevenueCat com o valor pago', () => {
    const f = revenueCatFields({ type: 'RENEWAL', price: 24.99 }, NOW);
    expect(f).not.toHaveProperty('iap_price');
  });

  it('guarda o código da oferta e o motivo do cancelamento', () => {
    const f = revenueCatFields({ type: 'CANCELLATION', offer_code: 'referral_10', cancel_reason: 'UNSUBSCRIBE' }, NOW);
    expect(f).toMatchObject({ iap_offer_code: 'referral_10', iap_cancel_reason: 'UNSUBSCRIBE' });
  });

  it('usa o motivo da expiração quando não há motivo de cancelamento', () => {
    expect(revenueCatFields({ type: 'EXPIRATION', expiration_reason: 'BILLING_ERROR' }, NOW).iap_cancel_reason).toBe('BILLING_ERROR');
  });

  it('ignora valores de tipo errado em vez de gravar lixo', () => {
    const f = revenueCatFields({ type: 'RENEWAL', price_in_purchased_currency: '131,90', renewal_number: 'x', purchased_at_ms: 0 }, NOW);
    expect(f).not.toHaveProperty('iap_price');
    expect(f).not.toHaveProperty('iap_renewal_number');
    expect(f).not.toHaveProperty('iap_purchased_at');
  });

  it('evento sem objeto nunca estoura', () => {
    expect(() => revenueCatFields(undefined, NOW)).not.toThrow();
    expect(revenueCatFields(null, NOW).iap_last_event_type).toBe('unknown');
  });
});
