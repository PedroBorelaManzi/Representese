import { describe, it, expect } from "vitest";
import { buildClientContext } from "./context";

const base = { cnpj: null, city: null, state: null, status: null, last_contact: null, notes: null };

describe("buildClientContext", () => {
  it("inclui o ranking pronto na ordem certa, mesmo com a lista desordenada", () => {
    const { context } = buildClientContext([
      { ...base, id: "a", name: "Caetano", faturamento: { X: 83778 } },
      { ...base, id: "b", name: "Padovani", faturamento: { X: 100000, Y: 75831 } },
      { ...base, id: "c", name: "Sem vendas", faturamento: null },
    ] as any);
    const ranking = context.split("\n\n")[0];
    expect(ranking).toContain("RANKING PRONTO");
    expect(ranking.indexOf("Padovani")).toBeLessThan(ranking.indexOf("Caetano"));
    expect(ranking).not.toContain("Sem vendas");
  });
});
