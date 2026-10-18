// Upgrade de plano pagando só a diferença.
//
// Antes: o upgrade cancelava a assinatura atual e criava outra no valor cheio, cobrando tudo na hora
// (sem crédito pelo que já foi pago). Agora, quando há uma assinatura mensal ativa, a pessoa paga só
// a diferença entre o plano novo e o valor que ela paga hoje (cobrança avulsa) e a assinatura mensal
// passa a cobrar o valor do plano novo na MESMA data de renovação. O Asaas não deixa alterar o valor de
// uma assinatura de cartão que já tem fatura paga, então criamos a nova (com a data da renovação atual)
// e só depois cancelamos a antiga. Anual/semestral (cobrança avulsa, sem assinatura):
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
  /** Cartão já usado nas cobranças da assinatura (só marca e final — o token fica no servidor). */
  savedCard?: { brand: string | null; last4: string | null } | null;
  /** Valor cheio do plano novo (o que passa a ser cobrado nas próximas vezes). */
  newValue: number;
  /** O que a pessoa paga hoje no plano atual (null se não deu pra saber). */
  currentValue: number | null;
  /** Quanto cobrar agora. */
  chargeNow: number;
  subscriptionId: string | null;
  /** Próxima cobrança da assinatura atual (a nova assinatura herda essa data). */
  nextDueDate?: string | null;
}

interface SavedCardToken { token: string; brand: string | null; last4: string | null }

/** Acha o cartão (token do Asaas) usado nas cobranças da assinatura, pra não pedir o cartão de novo. */
export async function findSavedCard(d: UpgradeDeps, subscriptionId: string): Promise<SavedCardToken | null> {
  const r = await d.asaas(`/payments?subscription=${subscriptionId}&limit=10`);
  if (!r.ok) return null;
  for (const p of r.data?.data || []) {
    const c = p?.creditCard;
    if (c?.creditCardToken) {
      return { token: c.creditCardToken, brand: c.creditCardBrand ?? null, last4: c.creditCardNumber ? String(c.creditCardNumber).slice(-4) : null };
    }
  }
  return null;
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
      // Se a diferença já foi paga numa tentativa anterior (o webhook do pagamento já pôs a pessoa no plano
      // novo) e só faltou trocar a assinatura, não cobra de novo: só conclui a troca.
      const { data: ent0 } = await d.supabaseAdmin.from('user_entitlements').select('plan_id').eq('user_id', userId).maybeSingle();
      const jaPagou = !!ent0?.plan_id && ent0.plan_id !== 'none' && d.normalizePlanId(ent0.plan_id) === planId;
      const chargeNow = !jaPagou && diff > 0 ? Math.max(diff, MIN_CHARGE) : 0;
      const saved = await findSavedCard(d, st.asaas_subscription_id);
      return { mode: 'diff_subscription', newValue, currentValue: cur, chargeNow, subscriptionId: st.asaas_subscription_id, nextDueDate: r.data?.nextDueDate ?? null, savedCard: saved ? { brand: saved.brand, last4: saved.last4 } : null };
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
  /** Cobrar no cartão já usado na assinatura (sem pedir os dados de novo). */
  useSavedCard?: boolean;
  cleanCpf: string;
  cleanPhone: string;
  email: string;
  name: string;
  clientIp: string;
}

export async function executeDiffUpgrade(d: UpgradeDeps, q: UpgradeQuote, i: DiffUpgradeInput, asaasError: (ok: boolean, status: number, data: any) => string | null): Promise<{ success: boolean; message?: string; chargedNow?: number; newValue?: number }> {
  const description = `Plano ${i.planId} - ${i.cycle}`;
  const today = new Date().toISOString().split('T')[0];

  // 1) Cartão (salvo ou digitado) — conferido ANTES de cobrar ou mudar qualquer coisa.
  let cardPart: Record<string, unknown> | null = null;
  if (i.useSavedCard && q.subscriptionId) {
    const saved = await findSavedCard(d, q.subscriptionId);
    if (!saved) return { success: false, message: 'Não encontramos o cartão salvo. Informe os dados do cartão para continuar.' };
    cardPart = { creditCardToken: saved.token };
  } else if (i.creditCard) {
    // CEP e número do titular: usa os do cadastro (guardados no checkout) em vez de pedir de novo.
    let postalCode = i.creditCard.postalCode;
    let addressNumber = i.creditCard.addressNumber;
    if (!postalCode || !addressNumber) {
      const { data: st } = await d.supabaseAdmin.from('user_settings').select('billing_cep, billing_number').eq('user_id', i.userId).maybeSingle();
      postalCode = postalCode || st?.billing_cep;
      addressNumber = addressNumber || st?.billing_number;
    }
    if (!postalCode || !addressNumber) return { success: false, message: 'Faltam o CEP e o número do endereço no seu cadastro. Fale com o suporte pelo WhatsApp.' };
    cardPart = {
      creditCard: {
        holderName: i.creditCard.holderName, number: i.creditCard.number,
        expiryMonth: i.creditCard.expiryMonth, expiryYear: i.creditCard.expiryYear, ccv: i.creditCard.ccv,
      },
      creditCardHolderInfo: {
        name: i.creditCard.holderName || i.name, email: i.email, cpfCnpj: i.cleanCpf,
        postalCode: String(postalCode).replace(/\D/g, ''), addressNumber: String(addressNumber),
        phone: i.cleanPhone, mobilePhone: i.cleanPhone,
      },
    };
  } else if (q.subscriptionId) {
    // Sem diferença a cobrar e sem cartão informado: a assinatura nova usa o cartão já salvo.
    const saved = await findSavedCard(d, q.subscriptionId);
    if (saved) cardPart = { creditCardToken: saved.token };
  }
  if (!cardPart && (q.chargeNow > 0 || q.subscriptionId)) return { success: false, message: 'Dados do cartão incompletos. Verifique e tente novamente.' };

  // 2) Cobra a diferença agora (avulsa, no cartão).
  if (q.chargeNow > 0) {
    const pay = await d.asaas('/payments', {
      method: 'POST',
      body: {
        customer: i.asaasCustomerId, billingType: 'CREDIT_CARD', value: q.chargeNow, dueDate: today,
        description, externalReference: i.userId, remoteIp: i.clientIp, ...(cardPart as object),
      },
    });
    const err = asaasError(pay.ok, pay.status, pay.data);
    if (err || !pay.data?.id) return { success: false, message: err || 'Não foi possível cobrar a diferença do upgrade.' };
    // Se o cartão foi digitado, o Asaas devolve o token: a assinatura nova usa o token, sem reenviar o cartão.
    const tok = pay.data?.creditCard?.creditCardToken;
    if (tok) cardPart = { creditCardToken: tok };
  }

  // 3) Assinatura mensal: cria a nova no valor cheio do plano novo, com a MESMA data de renovação, e só
  //    então cancela a antiga (o Asaas não permite mudar o valor de assinatura de cartão já paga).
  if (q.subscriptionId) {
    const due = q.nextDueDate && q.nextDueDate > today ? q.nextDueDate : new Date(Date.now() + 86400000).toISOString().split('T')[0];
    const created = await d.asaas('/subscriptions', {
      method: 'POST',
      body: {
        customer: i.asaasCustomerId, billingType: 'CREDIT_CARD', value: q.newValue, nextDueDate: due, cycle: 'MONTHLY',
        description, externalReference: i.userId, remoteIp: i.clientIp, ...(cardPart as object),
      },
    });
    const newId = created.data?.id;
    if (!created.ok || !newId) {
      console.error('Upgrade: diferença cobrada, mas falhou criar a nova assinatura', created.status, JSON.stringify(created.data).slice(0, 300));
      return { success: false, message: q.chargeNow > 0 ? `Cobramos a diferença de R$ ${q.chargeNow.toFixed(2).replace('.', ',')}, mas não conseguimos concluir a troca da assinatura. Não tente de novo: fale com o suporte pelo WhatsApp que ajustamos na hora.` : 'Não foi possível concluir a troca da assinatura. Tente novamente.' };
    }
    const del = await d.asaas(`/subscriptions/${q.subscriptionId}`, { method: 'DELETE' });
    if (!del.ok) {
      // Duas assinaturas ativas cobrariam em dobro: desfaz a nova e avisa.
      console.error('Upgrade: não conseguiu cancelar a assinatura antiga', q.subscriptionId, del.status, JSON.stringify(del.data).slice(0, 300));
      await d.asaas(`/subscriptions/${newId}`, { method: 'DELETE' });
      return { success: false, message: 'Não conseguimos concluir a troca da assinatura. Não tente de novo: fale com o suporte pelo WhatsApp que ajustamos na hora.' };
    }
    await d.supabaseAdmin.from('user_settings').update({ asaas_subscription_id: newId, cancel_at_period_end: false }).eq('user_id', i.userId);
  }

  await d.supabaseAdmin.from('user_entitlements').update({ plan_id: i.planId, updated_at: new Date().toISOString() }).eq('user_id', i.userId);
  return { success: true, chargedNow: q.chargeNow, newValue: q.newValue };
}
