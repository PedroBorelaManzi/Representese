import { describe, it, expect, vi } from "vitest";

// aiActions importa o cliente do Supabase (precisa de localStorage/env) — irrelevante aqui.
vi.mock("./supabase", () => ({ supabase: {} }));

import { buildDailyBriefing } from "./aiActions";

const base = { cnpj: null, city: null, state: null, status: null, notes: null, faturamento: null };
const T = { alerta: 30, critico: 45, inativo: 90 };

describe("buildDailyBriefing com alertas do CRM", () => {
  it("usa os alertas (último pedido), não o last_contact antigo", () => {
    const r = buildDailyBriefing([
      { ...base, id: "1", name: "A", last_contact: "2020-01-01", alerts: [] },
      { ...base, id: "2", name: "B", last_contact: "2020-01-01", alerts: [{ type: "Inativo", days: 120 }] },
      { ...base, id: "3", name: "C", last_contact: "2020-01-01", alerts: [{ type: "Alerta", days: 31 }] },
      { ...base, id: "4", name: "D", last_contact: "2020-01-01", alerts: [{ type: "Crítico", days: 50 }, { type: "Inativo", days: 95 }] },
    ], T);
    expect(r.totalClientes).toBe(4);
    expect(r.inativos).toBe(2); // B e D
    expect(r.emAlerta).toBe(1); // C
    expect(r.urgentes.map((u) => u.name)).toEqual(["B", "D"]);
  });
});
