import { describe, it, expect } from 'vitest';
import { quoteUpgrade, executeDiffUpgrade, type UpgradeDeps } from './upgrade';

const prices = {
  exclusivo: { MONTHLY: 97, SEMIANNUAL: 77, ANNUAL: 1044 },
  profissional: { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 1584 },
  master: { MONTHLY: 197, SEMIANNUAL: 157, ANNUAL: 2124 },
  default: { MONTHLY: 147, SEMIANNUAL: 117, ANNUAL: 1584 },
};
const normalizePlanId = (v: string) => (v?.includes('master') ? 'master' : v?.includes('exclusivo') ? 'exclusivo' : 'profissional');

function mk(opts: { subId?: string | null; sub?: any; ent?: any; coupon?: any; referral?: number; putOk?: boolean; payOk?: boolean; noToken?: boolean }) {
  const calls: { path: string; method?: string; body?: any }[] = [];
  const updates: any[] = [];
  const table = (name: string) => ({
    select: () => ({
      eq: () => ({
        maybeSingle: async () => {
          if (name === 'coupons') return { data: opts.coupon ?? null };
          if (name === 'user_settings') return { data: { asaas_subscription_id: opts.subId ?? null, referral_discount_pct: opts.referral ?? 0, billing_cep: '01001000', billing_number: '10' } };
          if (name === 'user_entitlements') return { data: opts.ent ?? null };
          return { data: null };
        },
      }),
    }),
    update: (v: any) => ({ eq: async () => { updates.push({ name, v }); return {}; } }),
  });
  const deps: UpgradeDeps = {
    supabaseAdmin: { from: table },
    prices, normalizePlanId,
    asaas: async (path, init) => {
      calls.push({ path, method: init?.method, body: init?.body });
      if (path.startsWith('/payments?subscription=') && !init?.method) return { ok: true, status: 200, data: { data: [{ id: 'pay_old', creditCard: opts.noToken ? {} : { creditCardToken: 'tok_1', creditCardBrand: 'VISA', creditCardNumber: '1234' } }] } };
      if (path.startsWith('/subscriptions/') && !init?.method) return { ok: true, status: 200, data: opts.sub };
      if (path.startsWith('/subscriptions/') && init?.method === 'PUT') return opts.putOk === false ? { ok: false, status: 500, data: {} } : { ok: true, status: 200, data: { id: 'sub_1' } };
      if (path === '/payments') return opts.payOk === false ? { ok: false, status: 400, data: { errors: [{ description: 'Cartão recusado' }] } } : { ok: true, status: 200, data: { id: 'pay_1' } };
      return { ok: false, status: 404, data: {} };
    },
  };
  return { deps, calls, updates };
}
const err = (ok: boolean, status: number, data: any) => data?.errors?.length ? data.errors[0].description : (!ok ? `Falha (${status})` : null);
const card = { holderName: 'A B', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123', postalCode: '01001000', addressNumber: '10' };
const input = { userId: 'u1', planId: 'master', cycle: 'MONTHLY', asaasCustomerId: 'cus_1', creditCard: card, cleanCpf: '52998224725', cleanPhone: '11987654321', email: 'a@b.com', name: 'A B', clientIp: '1.1.1.1' };

describe('quoteUpgrade', () => {
  it('mensal com assinatura ativa: cobra só a diferença (147 → 197 = 50) e o novo valor cheio fica 197', async () => {
    const { deps } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    expect(q).toMatchObject({ mode: 'diff_subscription', newValue: 197, currentValue: 147, chargeNow: 50, subscriptionId: 'sub_1' });
  });
  it('usa o valor que o Asaas cobra de fato (cupom no plano atual: 7,35 → 197 = 189,65)', async () => {
    const { deps } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 7.35 } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    expect(q.chargeNow).toBe(189.65);
  });
  it('cupom no plano novo reduz o novo valor e a diferença', async () => {
    const { deps } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 }, coupon: { active: true, discount_percent: 10, applies_to_plans: null } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY', 'promo');
    expect(q.newValue).toBe(177.3);
    expect(q.chargeNow).toBe(30.3);
  });
  it('diferença menor que R$ 5 vira o mínimo de cobrança; novo valor ≤ atual não cobra nada', async () => {
    let r = mk({ subId: 's', sub: { status: 'ACTIVE', value: 195 } });
    expect((await quoteUpgrade(r.deps, 'u1', 'master', 'MONTHLY')).chargeNow).toBe(5);
    r = mk({ subId: 's', sub: { status: 'ACTIVE', value: 300 } });
    expect((await quoteUpgrade(r.deps, 'u1', 'master', 'MONTHLY')).chargeNow).toBe(0);
  });
  it('assinatura inativa/inexistente no mensal: modo antigo (valor cheio)', async () => {
    let r = mk({ subId: 's', sub: { status: 'INACTIVE', value: 147 } });
    expect(await quoteUpgrade(r.deps, 'u1', 'master', 'MONTHLY')).toMatchObject({ mode: 'full', chargeNow: 197 });
    r = mk({ subId: null });
    expect((await quoteUpgrade(r.deps, 'u1', 'master', 'MONTHLY')).mode).toBe('full');
  });
  it('anual ativo: diferença entre os dois planos anuais (2124 − 1584 = 540)', async () => {
    const { deps } = mk({ ent: { plan_id: 'profissional', billing_cycle: 'ANNUAL', subscription_status: 'active' } });
    expect(await quoteUpgrade(deps, 'u1', 'master', 'ANNUAL')).toMatchObject({ mode: 'diff_oneoff', chargeNow: 540, currentValue: 1584, subscriptionId: null });
  });
  it('troca de ciclo (mensal → anual) não compara: valor cheio', async () => {
    const { deps } = mk({ ent: { plan_id: 'profissional', billing_cycle: 'MONTHLY', subscription_status: 'active' } });
    expect((await quoteUpgrade(deps, 'u1', 'master', 'ANNUAL')).mode).toBe('full');
  });
});

describe('executeDiffUpgrade', () => {
  it('cobra a diferença no cartão, atualiza a MESMA assinatura pro valor novo e grava o plano', async () => {
    const { deps, calls, updates } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    calls.length = 0;
    const r = await executeDiffUpgrade(deps, q, input, err);
    expect(r).toEqual({ success: true, chargedNow: 50, newValue: 197 });
    const pay = calls.find((c) => c.path === '/payments')!;
    expect(pay.body.value).toBe(50);
    expect(pay.body.description).toBe('Plano master - MONTHLY');
    expect(pay.body.externalReference).toBe('u1');
    const put = calls.find((c) => c.method === 'PUT')!;
    expect(put.path).toBe('/subscriptions/sub_1');
    expect(put.body).toMatchObject({ value: 197, description: 'Plano master - MONTHLY', updatePendingPayments: true });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false); // não cancela nada
    expect(updates).toContainEqual({ name: 'user_entitlements', v: expect.objectContaining({ plan_id: 'master' }) });
  });
  it('cartão recusado: nada muda (não mexe na assinatura nem no plano)', async () => {
    const { deps, calls, updates } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 }, payOk: false });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    calls.length = 0;
    const r = await executeDiffUpgrade(deps, q, input, err);
    expect(r).toEqual({ success: false, message: 'Cartão recusado' });
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    expect(updates).toHaveLength(0);
  });
  it('cobrou mas falhou atualizar a assinatura: avisa e não grava o plano', async () => {
    const { deps, updates } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 }, putOk: false });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    const r = await executeDiffUpgrade(deps, q, input, err);
    expect(r.success).toBe(false);
    expect(r.message).toContain('Cobramos a diferença de R$ 50,00');
    expect(updates).toHaveLength(0);
  });
  it('diferença zero: não cobra cartão, só atualiza a assinatura', async () => {
    const { deps, calls } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 300 } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    calls.length = 0;
    const r = await executeDiffUpgrade(deps, q, { ...input, creditCard: undefined }, err);
    expect(r.success).toBe(true);
    expect(calls.some((c) => c.path === '/payments')).toBe(false);
    expect(calls.find((c) => c.method === 'PUT')!.body.value).toBe(197);
  });
  it('anual: cobra a diferença avulsa e não mexe em assinatura', async () => {
    const { deps, calls } = mk({ ent: { plan_id: 'profissional', billing_cycle: 'ANNUAL', subscription_status: 'active' } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'ANNUAL');
    calls.length = 0;
    const r = await executeDiffUpgrade(deps, q, { ...input, cycle: 'ANNUAL' }, err);
    expect(r).toMatchObject({ success: true, chargedNow: 540 });
    expect(calls.map((c) => c.path)).toEqual(['/payments']);
  });

  it('cartão salvo: cobra a diferença com o token (sem dados de cartão nem endereço) e a quote mostra só marca e final', async () => {
    const { deps, calls } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    expect(q.savedCard).toEqual({ brand: 'VISA', last4: '1234' });
    expect(JSON.stringify(q)).not.toContain('tok_1');
    calls.length = 0;
    const r = await executeDiffUpgrade(deps, q, { ...input, creditCard: undefined, useSavedCard: true }, err);
    expect(r.success).toBe(true);
    const pay = calls.find((c) => c.path === '/payments')!;
    expect(pay.body.creditCardToken).toBe('tok_1');
    expect(pay.body.creditCard).toBeUndefined();
    expect(pay.body.creditCardHolderInfo).toBeUndefined();
    expect(pay.body.remoteIp).toBe('1.1.1.1');
    expect(pay.body.value).toBe(50);
  });
  it('cartão salvo pedido mas não encontrado: não cobra e pede o cartão', async () => {
    const { deps, calls } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 }, noToken: true });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    expect(q.savedCard).toBeNull();
    calls.length = 0;
    const r = await executeDiffUpgrade(deps, q, { ...input, creditCard: undefined, useSavedCard: true }, err);
    expect(r.success).toBe(false);
    expect(calls.some((c) => c.path === '/payments')).toBe(false);
  });
  it('cartão novo sem CEP/número: usa o endereço do cadastro', async () => {
    const { deps, calls } = mk({ subId: 'sub_1', sub: { status: 'ACTIVE', value: 147 } });
    const q = await quoteUpgrade(deps, 'u1', 'master', 'MONTHLY');
    calls.length = 0;
    const { postalCode, addressNumber, ...semEndereco } = card;
    const r = await executeDiffUpgrade(deps, q, { ...input, creditCard: semEndereco }, err);
    expect(r.success).toBe(true);
    const info = calls.find((c) => c.path === '/payments')!.body.creditCardHolderInfo;
    expect(info.postalCode).toBe('01001000');
    expect(info.addressNumber).toBe('10');
  });
});
