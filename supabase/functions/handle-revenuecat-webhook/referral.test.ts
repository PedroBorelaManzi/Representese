import { describe, it, expect, vi } from 'vitest';
import { registerPendingReferral, recomputeReferrerOf, syncAsaasSubscriptionValue, referralPctFromOfferCode, markReferralOfferRedeemed } from './referral';

type Rows = Record<string, any>[];

// Banco em memória só com as formas de consulta que referral.ts usa.
function fakeDb(seed: Partial<Record<string, Rows>> = {}) {
  const t: Record<string, Rows> = {
    pending_referral_codes: [], coupons: [], referrals: [], user_settings: [], user_entitlements: [],
    ...seed,
  } as Record<string, Rows>;
  const rpcCalls: { fn: string; args: any }[] = [];
  const from = (name: string) => ({
    select: () => ({ eq: (col: string, val: any) => ({ maybeSingle: async () => ({ data: t[name].find((r) => r[col] === val) ?? null }) }) }),
    upsert: async (row: any, opts: { onConflict: string; ignoreDuplicates?: boolean }) => {
      const dup = t[name].find((r) => r[opts.onConflict] === row[opts.onConflict]);
      if (!dup) t[name].push({ ...row });
      else if (!opts.ignoreDuplicates) Object.assign(dup, row);
      return {};
    },
    delete: () => ({ eq: async (col: string, val: any) => { t[name] = t[name].filter((r) => r[col] !== val); return {}; } }),
    update: (v: any) => ({ eq: async (col: string, val: any) => { t[name].filter((r) => r[col] === val).forEach((r) => Object.assign(r, v)); return {}; } }),
  });
  const rpc = async (fn: string, args: any) => { rpcCalls.push({ fn, args }); return { data: null }; };
  return { from, rpc, t, rpcCalls };
}

const REFERRER = 'user-referrer';
const REFERRED = 'user-referred';
const coupon = (code = 'JOAO', referrer: string | null = REFERRER) => ({ code, referrer_user_id: referrer });

describe('registerPendingReferral', () => {
  it('confirma a indicação, grava a plataforma e apaga o código pendente', async () => {
    const db = fakeDb({ pending_referral_codes: [{ user_id: REFERRED, code: 'JOAO' }], coupons: [coupon()] });
    const r = await registerPendingReferral(db, REFERRED, 'ios');
    expect(r).toBe(REFERRER);
    expect(db.t.referrals).toEqual([{ referrer_user_id: REFERRER, referred_user_id: REFERRED, code: 'JOAO', platform: 'ios' }]);
    expect(db.t.pending_referral_codes).toHaveLength(0);
  });

  it('usa a plataforma android quando a compra veio do Google Play', async () => {
    const db = fakeDb({ pending_referral_codes: [{ user_id: REFERRED, code: 'JOAO' }], coupons: [coupon()] });
    await registerPendingReferral(db, REFERRED, 'android');
    expect(db.t.referrals[0].platform).toBe('android');
  });

  it('sem código pendente não faz nada', async () => {
    const db = fakeDb({ coupons: [coupon()] });
    expect(await registerPendingReferral(db, REFERRED, 'ios')).toBeNull();
    expect(db.t.referrals).toHaveLength(0);
  });

  it('bloqueia autoindicação (descarta o código, sem registrar)', async () => {
    const db = fakeDb({ pending_referral_codes: [{ user_id: REFERRER, code: 'JOAO' }], coupons: [coupon()] });
    expect(await registerPendingReferral(db, REFERRER, 'ios')).toBeNull();
    expect(db.t.referrals).toHaveLength(0);
    expect(db.t.pending_referral_codes).toHaveLength(0);
  });

  it('cupom promocional comum (sem indicador) não vira indicação', async () => {
    const db = fakeDb({ pending_referral_codes: [{ user_id: REFERRED, code: 'PROMO' }], coupons: [coupon('PROMO', null)] });
    expect(await registerPendingReferral(db, REFERRED, 'ios')).toBeNull();
    expect(db.t.referrals).toHaveLength(0);
    expect(db.t.pending_referral_codes).toHaveLength(0);
  });

  it('código inexistente é descartado', async () => {
    const db = fakeDb({ pending_referral_codes: [{ user_id: REFERRED, code: 'NAOEXISTE' }] });
    expect(await registerPendingReferral(db, REFERRED, 'ios')).toBeNull();
    expect(db.t.referrals).toHaveLength(0);
    expect(db.t.pending_referral_codes).toHaveLength(0);
  });

  it('quem já foi indicado por outra pessoa não troca de indicador', async () => {
    const db = fakeDb({
      pending_referral_codes: [{ user_id: REFERRED, code: 'MARIA' }],
      coupons: [coupon('JOAO'), coupon('MARIA', 'user-maria')],
      referrals: [{ referrer_user_id: REFERRER, referred_user_id: REFERRED, code: 'JOAO', platform: 'web' }],
    });
    await registerPendingReferral(db, REFERRED, 'ios');
    expect(db.t.referrals).toHaveLength(1);
    expect(db.t.referrals[0].referrer_user_id).toBe(REFERRER);
  });

  it('é idempotente: reenvio do mesmo evento não duplica nem falha', async () => {
    const db = fakeDb({ pending_referral_codes: [{ user_id: REFERRED, code: 'JOAO' }], coupons: [coupon()] });
    await registerPendingReferral(db, REFERRED, 'ios');
    expect(await registerPendingReferral(db, REFERRED, 'ios')).toBeNull();
    expect(db.t.referrals).toHaveLength(1);
  });
});

describe('recomputeReferrerOf', () => {
  it('quem não foi indicado não dispara recálculo', async () => {
    const db = fakeDb();
    expect(await recomputeReferrerOf({ supabase: db }, REFERRED)).toBeNull();
    expect(db.rpcCalls).toHaveLength(0);
  });

  it('recalcula o desconto de quem indicou', async () => {
    const db = fakeDb({ referrals: [{ referrer_user_id: REFERRER, referred_user_id: REFERRED }] });
    expect(await recomputeReferrerOf({ supabase: db }, REFERRED)).toBe(REFERRER);
    expect(db.rpcCalls).toEqual([{ fn: 'recompute_referrer_discount', args: { p_referrer_user_id: REFERRER } }]);
  });
});

describe('syncAsaasSubscriptionValue', () => {
  const settings = (over: Record<string, any> = {}) => ({ user_id: REFERRER, asaas_subscription_id: 'sub_1', referral_discount_pct: 10, referral_discount_applied_pct: 0, ...over });
  const ent = (plan_id: string, billing_cycle = 'MONTHLY') => ({ user_id: REFERRER, plan_id, billing_cycle });
  const okFetch = () => vi.fn(async () => ({ ok: true, text: async () => '' })) as any;

  it('reajusta a assinatura para o preço cheio menos o desconto e marca como aplicado', async () => {
    const db = fakeDb({ user_settings: [settings()], user_entitlements: [ent('master')] });
    const fetchFn = okFetch();
    await syncAsaasSubscriptionValue({ supabase: db, asaasApiKey: 'k', fetchFn }, REFERRER);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('/subscriptions/sub_1');
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ value: 89.91 }); // 99,90 - 10%
    expect(db.t.user_settings[0].referral_discount_applied_pct).toBe(10);
  });

  it('usa o ciclo do plano (anual com 20%)', async () => {
    const db = fakeDb({ user_settings: [settings({ referral_discount_pct: 20 })], user_entitlements: [ent('exclusivo', 'ANNUAL')] });
    const fetchFn = okFetch();
    await syncAsaasSubscriptionValue({ supabase: db, asaasApiKey: 'k', fetchFn }, REFERRER);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ value: 431.04 }); // 538,80 - 20%
  });

  it('volta ao preço cheio quando o desconto cai para 0', async () => {
    const db = fakeDb({ user_settings: [settings({ referral_discount_pct: 0, referral_discount_applied_pct: 10 })], user_entitlements: [ent('profissional')] });
    const fetchFn = okFetch();
    await syncAsaasSubscriptionValue({ supabase: db, asaasApiKey: 'k', fetchFn }, REFERRER);
    expect(JSON.parse(fetchFn.mock.calls[0][1].body)).toEqual({ value: 79.9 });
    expect(db.t.user_settings[0].referral_discount_applied_pct).toBe(0);
  });

  it('assinante de loja (sem assinatura Asaas) não chama a API', async () => {
    const db = fakeDb({ user_settings: [settings({ asaas_subscription_id: null })], user_entitlements: [ent('master')] });
    const fetchFn = okFetch();
    await syncAsaasSubscriptionValue({ supabase: db, asaasApiKey: 'k', fetchFn }, REFERRER);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('já sincronizado: não chama a API à toa', async () => {
    const db = fakeDb({ user_settings: [settings({ referral_discount_applied_pct: 10 })], user_entitlements: [ent('master')] });
    const fetchFn = okFetch();
    await syncAsaasSubscriptionValue({ supabase: db, asaasApiKey: 'k', fetchFn }, REFERRER);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sem chave do Asaas não chama a API', async () => {
    const db = fakeDb({ user_settings: [settings()], user_entitlements: [ent('master')] });
    const fetchFn = okFetch();
    await syncAsaasSubscriptionValue({ supabase: db, fetchFn }, REFERRER);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('se o Asaas recusar, não marca como aplicado (tenta de novo no próximo evento) e não lança', async () => {
    const db = fakeDb({ user_settings: [settings()], user_entitlements: [ent('master')] });
    const fetchFn = vi.fn(async () => ({ ok: false, text: async () => 'erro' })) as any;
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(syncAsaasSubscriptionValue({ supabase: db, asaasApiKey: 'k', fetchFn }, REFERRER)).resolves.toBeUndefined();
    expect(db.t.user_settings[0].referral_discount_applied_pct).toBe(0);
    err.mockRestore();
  });
});

describe('referralPctFromOfferCode', () => {
  it('reconhece os 12 identificadores do App Store Connect', () => {
    expect(referralPctFromOfferCode('referral_10')).toBe(10);
    expect(referralPctFromOfferCode('referral_20')).toBe(20);
    expect(referralPctFromOfferCode('referral_10_exclusivo_annual')).toBe(10);
    expect(referralPctFromOfferCode('referral_20_master_monthly')).toBe(20);
  });

  it('ignora qualquer outro código (cupom, offer code comum, vazio)', () => {
    expect(referralPctFromOfferCode('BLACK20')).toBeNull();
    expect(referralPctFromOfferCode('referral_15')).toBeNull();
    expect(referralPctFromOfferCode('referral_100')).toBeNull();
    expect(referralPctFromOfferCode(undefined)).toBeNull();
    expect(referralPctFromOfferCode('')).toBeNull();
  });
});

describe('markReferralOfferRedeemed', () => {
  it('grava o percentual resgatado em user_settings', async () => {
    const db = fakeDb({ user_settings: [{ user_id: REFERRER, referral_discount_pct: 20, referral_discount_applied_pct: 0 }] });
    expect(await markReferralOfferRedeemed(db, REFERRER, 'referral_20_profissional_annual')).toBe(20);
    expect(db.t.user_settings[0].referral_discount_applied_pct).toBe(20);
  });

  it('evento sem oferta de indicação não mexe em nada', async () => {
    const db = fakeDb({ user_settings: [{ user_id: REFERRER, referral_discount_applied_pct: 10 }] });
    expect(await markReferralOfferRedeemed(db, REFERRER, undefined)).toBeNull();
    expect(db.t.user_settings[0].referral_discount_applied_pct).toBe(10);
  });
});
