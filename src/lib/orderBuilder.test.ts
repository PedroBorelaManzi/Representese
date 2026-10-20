import { describe, it, expect } from "vitest";
import { computeOrderTotals, itemTotal } from "./orderBuilder";

describe("orderBuilder", () => {
  const items = [
    { quantity: 10, unit_value: 100, discount_pct: 10 }, // 900
    { quantity: 2, unit_value: 50 }, // 100
  ];

  it("aplica desconto por item", () => {
    expect(itemTotal(items[0])).toBe(900);
    const t = computeOrderTotals(items);
    expect(t.gross).toBe(1100);
    expect(t.itemDiscounts).toBe(100);
    expect(t.subtotal).toBe(1000);
    expect(t.total).toBe(1000);
  });

  it("desconto geral, imposto e frete em % incidem sobre o valor com desconto", () => {
    const t = computeOrderTotals(items, {
      discount: { mode: "pct", value: 10 },
      tax: { mode: "pct", value: 5 },
      freight: { mode: "brl", value: 80 },
    });
    expect(t.orderDiscount).toBe(100);
    expect(t.base).toBe(900);
    expect(t.tax).toBe(45);
    expect(t.freight).toBe(80);
    expect(t.total).toBe(1025);
  });

  it("desconto em R$ não passa do subtotal e valores inválidos viram 0", () => {
    const t = computeOrderTotals(items, { discount: { mode: "brl", value: 99999 }, tax: { mode: "pct", value: NaN } });
    expect(t.total).toBe(0);
    expect(computeOrderTotals([{ quantity: 1, unit_value: null }]).total).toBe(0);
  });
});
