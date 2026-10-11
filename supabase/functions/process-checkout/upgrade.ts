// Upgrade de plano pagando só a diferença.
//
// Antes: o upgrade cancelava a assinatura atual e criava outra no valor cheio, cobrando tudo na hora
// (sem crédito pelo que já foi pago). Agora, quando há uma assinatura mensal ativa, a pessoa paga só
// a diferença entre o plano novo e o valor que ela paga hoje, e a MESMA assinatura passa a cobrar o
// valor do plano novo nas próximas mensalidades. Anual/semestral (cobrança avulsa, sem assinatura):
// paga a diferença entre os dois planos do mesmo ciclo. Sem base pra comparar → comportamento antigo
// (modo 'full').
//
// Sem import de Deno/esm: as dependências entram por parâmetro, pra poder testar em Node (vitest).

export type Prices = Record<string, Record<string, number>>;

export interface UpgradeDeps {
  supabaseAdmin: any;
  /** Chamada à API do Asaas (já com a chave): devolve a resposta e o JSON. */
  asaas: (path: string, init?: { method?: string; body?: unknown }) => Promise<{ ok: boolean; status: number; data: any }>;
  prices: Prices;
  normalizePlanId: (v: string) => string;
}

export type UpgradeMode = 'diff_subscription' | 'diff_oneoff' | 'full';

export interface UpgradeQuote {
  mode: UpgradeMode;
  /** Valor cheio do plano novo (o que passa a ser cobrado nas próximas vezes). */
  newValue: number;
  /** O que a pessoa paga hoje no plano atual (null se não deu pra saber). */
  currentValue: number | null;
  /** Quanto cobrar agora. */
  chargeNow: number;
  subscriptionId: string | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const MIN_CHARGE = 5; // mínimo de cobrança no Asaas

async function resolveDiscount(d: UpgradeDeps, userId: string, planId: string, coupon?: string): Promise<{ pct: number; hasCoupon: boolean }> {
  if (coupon) {
    const code = String(coupon).toUpperCase().trim();
    const { data: c } = await d.supabaseAdmin.from('coupons').select('*').eq('code', code).maybeSingle();
    const self = c?.referrer_user_id && c.referrer_user_id === userId;
    const applies = !c?.applies_to_plans || c.applies_to_plans.length === 0 || c.applies_to_plans.includes(planId);
    if (c && c.active && !self && applies && (!c.expires_at || new Date(c.expires_at).getTime() > Date.now()) && (!c.max_redemptions || c.times_redeemed < c.max_redemptions)) {
      return { pct: c.discount_percent, hasCoupon: true };
    }
  }
  const { data: s } = await d.supabaseAdmin.from('user_settings').select('referral_discount_pct').eq('user_id', userId).maybeSingle();
  return { pct: s?.referral_discount_pct || 0, hasCoupon: false };
}

export async function quoteUpgrade(d: UpgradeDeps, userId: string, planId: string, cycle: string, coupon?: string): Promise<UpgradeQuote> {
  const table = d.prices[planId] || d.prices.default;
  const { pct } = await resolveDiscount(d, userId, planId, coupon);
  const newValue = Math.max(round2(table[cycle] - (table[cycle] * pct) / 100), MIN_CHARGE);

  // 1) assinatura mensal ativa: o valor atual é o que o Asaas cobra de fato (inclui cupom/indicação).
  const { data: st } = await d.supabaseAdmin.from('user_settings').select('asaas_subscription_id').eq('user_id', userId).maybeSingle();
  if (cycle === 'MONTHLY' && st?.asaas_subscription_id) {
    const r = await d.asaas(`/subscriptions/${st.asaas_subscription_id}`);
    const cur = Number(r.data?.value);
    if (r.ok && r.data?.status === 'ACTIVE' && cur > 0) {
      const diff = round2(newValue - cur);
      return { mode: 'diff_subscription', newValue, currentValue: cur, chargeNow: diff > 0 ? Math.max(diff, MIN_CHARGE) : 0, subscriptionId: st.asaas_subscription_id };
    }
  }

  // 2) anual/semestral: sem assinatura no Asaas; compara os dois planos do mesmo ciclo.
  if (cycle !== 'MONTHLY') {
    const { data: ent } = await d.supabaseAdmin.from('user_entitlements').select('plan_id, billing_cycle, subscription_status').eq('user_id', userId).maybeSingle();
    if (ent && ent.subscription_status === 'active' && ent.plan_id && ent.plan_id !== 'none' && ent.billing_cycle === cycle) {
      const curTable = d.prices[d.normalizePlanId(ent.plan_id)] || d.prices.default;
      const cur = curTable[cycle];
      const diff = round2(newValue - cur);
      return { mode: 'diff_oneoff', newValue, currentValue: cur, chargeNow: diff > 0 ? Math.max(diff, MIN_CHARGE) : 0, subscriptionId: null };
    }
  }

  // 3) sem base pra calcular a diferença: cobra o plano novo inteiro (comportamento antigo).
  return { mode: 'full', newValue, currentValue: null, chargeNow: newValue, subscriptionId: null };
}

export interface DiffUpgradeInput {
  userId: string;
  planId: string;
  cycle: string;
  asaasCustomerId: string;
  creditCard?: any;
  cleanCpf: string;
  cleanPhone: string;
  email: string;
  name: string;
  clientIp: string;
}

export async function executeDiffUpgrade(d: UpgradeDeps, q: UpgradeQuote, i: DiffUpgradeInput, asaasError: (ok: boolean, status: number, data: any) => string | null): Promise<{ success: boolean; message?: string; chargedNow?: number; newValue?: number }> {
  const description = `Plano ${i.planId} - ${i.cycle}`;

  if (q.chargeNow > 0) {
    if (!i.creditCard) return { success: false, message: 'Dados do cartão incompletos. Verifique e tente novamente.' };
    const pay = await d.asaas('/payments', {
      method: 'POST',
      body: {
        customer: i.asaasCustomerId,
        billingType: 'CREDIT_CARD',
        value: q.chargeNow,
        dueDate: new Date().toISOString().split('T')[0],
        description,
        externalReference: i.userId,
        creditCard: {
          holderName: i.creditCard.holderName, number: i.creditCard.number,
          expiryMonth: i.creditCard.expiryMonth, expiryYear: i.creditCard.expiryYear, ccv: i.creditCard.ccv,
        },
        creditCardHolderInfo: {
          name: i.creditCard.holderName || i.name, email: i.email, cpfCnpj: i.cleanCpf,
          postalCode: String(i.creditCard.postalCode).replace(/\D/g, ''), addressNumber: String(i.creditCard.addressNumber),
          phone: i.cleanPhone, mobilePhone: i.cleanPhone,
        },
        remoteIp: i.clientIp,
      },
    });
    const err = asaasError(pay.ok, pay.status, pay.data);
    if (err || !pay.data?.id) return { success: false, message: err || 'Não foi possível cobrar a diferença do upgrade.' };
  }

  // A mesma assinatura passa a cobrar o valor cheio do plano novo (e a descrição nova mantém o plano
  // certo no webhook das próximas cobranças).
  if (q.subscriptionId) {
    const upd = await d.asaas(`/subscriptions/${q.subscriptionId}`, {
      method: 'PUT',
      body: { value: q.newValue, description, updatePendingPayments: true },
    });
    if (!upd.ok) {
      console.error('Upgrade: diferença cobrada, mas falhou atualizar a assinatura', q.subscriptionId, upd.status, JSON.stringify(upd.data).slice(0, 300));
      return { success: false, message: `Cobramos a diferença de R$ ${q.chargeNow.toFixed(2).replace('.', ',')}, mas não conseguimos atualizar sua assinatura. Fale com o suporte pelo WhatsApp que ajustamos na hora.` };
    }
  }

  await d.supabaseAdmin.from('user_entitlements').update({ plan_id: i.planId, updated_at: new Date().toISOString() }).eq('user_id', i.userId);
  return { success: true, chargedNow: q.chargeNow, newValue: q.newValue };
}
