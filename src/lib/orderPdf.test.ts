import { describe, it, expect } from "vitest";
import { buildOrderPdf, orderPdfFileName } from "./orderPdf";

const base = {
  orderNumber: "1234",
  date: "2026-10-20T12:00:00Z",
  sellerName: "Pedro Borela",
  company: "Indústria Exemplo Ltda",
  client: { name: "Mercado São João Comércio de Alimentos Ltda", cnpj: "12345678000190", address: "Rua das Flores, 100, Centro, Campinas - SP", phone: "(19) 99999-0000", email: "compras@mercado.com" },
  pricing: { discount: { mode: "pct" as const, value: 5 }, tax: { mode: "pct" as const, value: 4 }, freight: { mode: "brl" as const, value: 80 } },
  paymentTerms: "30/60/90",
  notes: "Entregar pela manhã. Cliente pediu nota separada por linha de produto — “urgente”.",
};

const bytes = async (b: Blob) => new Uint8Array(await b.arrayBuffer());
const pageCount = (u8: Uint8Array) => (Buffer.from(u8).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;

describe("buildOrderPdf", () => {
  it("gera um PDF válido de uma página", async () => {
    const blob = await buildOrderPdf({ ...base, items: [{ product_name: "Biscoito 200g", product_code: "B200", quantity: 10, unit_value: 12.5, discount_pct: 0 }] });
    const u8 = await bytes(blob);
    expect(Buffer.from(u8.slice(0, 5)).toString()).toBe("%PDF-");
    expect(pageCount(u8)).toBe(1);
    if (process.env.DUMP_PDF) (await import("node:fs")).writeFileSync(process.env.DUMP_PDF, u8);
  });

  it("pagina quando há muitos itens", async () => {
    const items = Array.from({ length: 70 }, (_, i) => ({ product_name: `Produto com nome bem comprido número ${i + 1} para forçar quebra de linha na coluna`, product_code: `P${i}`, quantity: i + 1, unit_value: 9.9, discount_pct: i % 3 ? 5 : 0 }));
    const u8 = await bytes(await buildOrderPdf({ ...base, items }));
    expect(pageCount(u8)).toBeGreaterThan(1);
    if (process.env.DUMP_PDF_MULTI) (await import("node:fs")).writeFileSync(process.env.DUMP_PDF_MULTI, u8);
  });

  it("não quebra com pedido sem preço e sem logo", async () => {
    const u8 = await bytes(await buildOrderPdf({ ...base, pricing: null, paymentTerms: null, notes: null, items: [{ product_name: "X", quantity: 1, unit_value: 1 }] }));
    expect(u8.length).toBeGreaterThan(500);
  });

  it("nome do arquivo é seguro", () => {
    expect(orderPdfFileName("A/B 1")).toBe("pedido-A_B_1.pdf");
  });
});
