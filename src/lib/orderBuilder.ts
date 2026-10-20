// Cálculo do criador de pedidos (Empresas & Pedidos › Novo pedido).
//
// Ordem: bruto (qtd × preço) → desconto por item (%) → desconto geral (% ou R$)
// → impostos e frete (% ou R$) SOBRE o valor já com desconto → total.
// Puro e sem dependências: usado pela tela, pelo PDF e pela edição de itens
// depois de salvo (OrderDetailModal), então os três sempre batem.

export type AmountMode = "pct" | "brl";

export interface AmountInput {
  mode: AmountMode;
  /** Valor digitado: % (0–100) ou R$, conforme `mode`. */
  value: number;
}

/** Entradas de preço do pedido, gravadas em `orders.pricing`. */
export interface OrderPricing {
  discount?: AmountInput | null;
  tax?: AmountInput | null;
  freight?: AmountInput | null;
}

export interface PricedItem {
  quantity: number;
  unit_value?: number | null;
  discount_pct?: number | null;
}

export interface OrderTotals {
  /** Soma de qtd × preço, antes de qualquer desconto. */
  gross: number;
  /** Quanto os descontos por item tiraram. */
  itemDiscounts: number;
  /** Bruto − descontos por item. */
  subtotal: number;
  /** Desconto geral do pedido, já em R$. */
  orderDiscount: number;
  /** Subtotal − desconto geral: base de cálculo de impostos e frete. */
  base: number;
  tax: number;
  freight: number;
  total: number;
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const num = (n: unknown) => (Number.isFinite(Number(n)) ? Number(n) : 0);

/** Desconto % por item, limitado a 0–100. */
export function clampPct(p: unknown): number {
  return Math.min(100, Math.max(0, num(p)));
}

/** Total de uma linha, já com o desconto do item. */
export function itemTotal(item: PricedItem): number {
  const gross = num(item.quantity) * num(item.unit_value);
  return round2(gross * (1 - clampPct(item.discount_pct) / 100));
}

function amountOf(input: AmountInput | null | undefined, base: number): number {
  if (!input) return 0;
  const v = Math.max(0, num(input.value));
  return round2(input.mode === "pct" ? base * (Math.min(v, 100) / 100) : v);
}

export function computeOrderTotals(items: PricedItem[], pricing?: OrderPricing | null): OrderTotals {
  const gross = round2(items.reduce((s, i) => s + num(i.quantity) * num(i.unit_value), 0));
  const subtotal = round2(items.reduce((s, i) => s + itemTotal(i), 0));
  const itemDiscounts = round2(gross - subtotal);
  // Desconto em R$ nunca passa do subtotal (total não pode ficar negativo).
  const orderDiscount = Math.min(amountOf(pricing?.discount, subtotal), subtotal);
  const base = round2(subtotal - orderDiscount);
  const tax = amountOf(pricing?.tax, base);
  const freight = amountOf(pricing?.freight, base);
  return { gross, itemDiscounts, subtotal, orderDiscount, base, tax, freight, total: round2(base + tax + freight) };
}
