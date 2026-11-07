import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { plans } from './plansData';

// A tabela de preços existe copiada em 3 Edge Functions (que não importam do src/).
// Já aconteceu de o webhook ficar com 97/147/197 depois da Black Friday: o sync do
// desconto de indicação recalcularia a assinatura de quem entrou a 49,90 com base em 97.
// Este teste falha se qualquer cópia divergir das outras ou da tabela do site.
const FUNCTIONS = ['process-checkout', 'regularize-subscription', 'handle-asaas-webhook', 'handle-revenuecat-webhook'];
// Arquivo que guarda a tabela em cada função (a do RevenueCat vive no módulo de indicação).
const FILE: Record<string, string> = { 'handle-revenuecat-webhook': 'referral.ts' };

type Table = Record<string, Record<string, number>>;

function readPlanPrices(fn: string): Table {
  const src = readFileSync(resolve(__dirname, `../../supabase/functions/${fn}/${FILE[fn] ?? 'index.ts'}`), 'utf8');
  const m = src.match(/const PLAN_PRICES[^=]*=\s*(\{[\s\S]*?\n\s*\})\s*;?/);
  if (!m) throw new Error(`PLAN_PRICES não encontrada em ${fn}`);
  // Literal de objeto simples (chaves entre aspas, valores numéricos) — sem código a executar.
  return new Function(`return (${m[1]})`)() as Table;
}

describe('tabela de preços das Edge Functions', () => {
  const tables = Object.fromEntries(FUNCTIONS.map((fn) => [fn, readPlanPrices(fn)]));

  it.each(FUNCTIONS)('%s tem os 3 planos, o default e os 3 ciclos', (fn) => {
    const t = tables[fn];
    expect(Object.keys(t).sort()).toEqual(['default', 'exclusivo', 'master', 'profissional']);
    for (const prices of Object.values(t)) {
      expect(Object.keys(prices).sort()).toEqual(['ANNUAL', 'MONTHLY', 'SEMIANNUAL']);
    }
  });

  it('as 3 funções usam exatamente os mesmos preços', () => {
    expect(tables['regularize-subscription']).toEqual(tables['process-checkout']);
    expect(tables['handle-asaas-webhook']).toEqual(tables['process-checkout']);
    expect(tables['handle-revenuecat-webhook']).toEqual(tables['process-checkout']);
  });

  it('o mensal e o anual batem com a tabela de planos do site', () => {
    for (const p of plans) {
      const t = tables['handle-asaas-webhook'][p.id];
      expect(t.MONTHLY).toBe(Number(p.price));
      // plansData guarda o equivalente mensal do anual; a cobrança é o total do ano
      expect(t.ANNUAL).toBeCloseTo(Number(p.annualPrice) * 12, 2);
    }
  });

  it('o anual sai mais barato que 12 meses no mensal', () => {
    for (const id of ['exclusivo', 'profissional', 'master']) {
      const t = tables['handle-asaas-webhook'][id];
      expect(t.ANNUAL).toBeLessThan(t.MONTHLY * 12);
    }
  });

  it('o plano default é o Profissional (o que o webhook assume sem plan_id)', () => {
    const t = tables['handle-asaas-webhook'];
    expect(t.default).toEqual(t.profissional);
  });
});
