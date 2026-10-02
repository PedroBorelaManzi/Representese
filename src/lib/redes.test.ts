import { describe, it, expect } from "vitest";
import { aggregateNetworks, suggestNetworks, networkPrefix, groupTopByNetwork, existingNetworks } from "./redes";

const clientes = [
  { id: "a", name: "Carrefour Comercio CD Sul", city: "SP", network_name: "Carrefour" },
  { id: "b", name: "Carrefour CD Norte", city: "RJ", network_name: "carrefour" },
  { id: "c", name: "Carrefour CD Parado", city: "MG", network_name: "Carrefour" },
  { id: "d", name: "Padaria do Zé", network_name: null },
];

describe("aggregateNetworks", () => {
  const pedidos = [
    { client_id: "a", value: 1000, category: "Cozimax", created_at: "2026-09-10T10:00:00Z" },
    { client_id: "b", value: 500, category: "Granitos", created_at: "2026-09-12T10:00:00Z" },
    { client_id: "a", value: 200, category: "Cozimax", created_at: "2026-08-01T10:00:00Z" },
    { client_id: "d", value: 999, category: "Cozimax", created_at: "2026-09-10T10:00:00Z" },
  ];

  it("soma os CDs da rede (grafias diferentes = mesma rede) e ignora clientes sem rede", () => {
    const r = aggregateNetworks(clientes, pedidos);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ revenue: 1700, orders: 3, cdsTotal: 3, cdsBought: 2 });
  });

  it("respeita o período e mantém CD parado na lista", () => {
    const r = aggregateNetworks(clientes, pedidos, { inRange: (d) => d.startsWith("2026-09") });
    expect(r[0].revenue).toBe(1500);
    expect(r[0].cdsBought).toBe(2);
    expect(r[0].cds.find((c) => c.id === "c")).toMatchObject({ revenue: 0, orders: 0 });
  });

  it("filtra por representada e quebra por empresa", () => {
    const r = aggregateNetworks(clientes, pedidos, { company: "granitos" });
    expect(r[0].revenue).toBe(500);
    expect(aggregateNetworks(clientes, pedidos)[0].byCompany[0]).toEqual({ name: "Cozimax", revenue: 1200 });
  });
});

describe("suggestNetworks", () => {
  it("marca = primeira palavra; genérica, primeiro nome ou número não valem", () => {
    expect(networkPrefix("Carrefour CD 2")).toBe("CARREFOUR");
    expect(networkPrefix("Rede Carrefour")).toBe("CARREFOUR");
    expect(networkPrefix("Casa do Construtor Salto")).toBe("CONSTRUTOR");
    expect(networkPrefix("Supermercado Ltda")).toBeNull();
    expect(networkPrefix("Depósito Central Casa")).toBeNull();
    expect(networkPrefix("Antonio Gomes Fogaca")).toBeNull();
    expect(networkPrefix("5 Irmaos Matieli")).toBeNull();
  });

  it("não casa sobrenome do meio do nome", () => {
    const s = suggestNetworks([
      { id: "1", name: "Assis Materiais De Construcao" },
      { id: "2", name: "Rodrigo Aparecido De Assis Ltda" },
    ]);
    expect(s).toHaveLength(0);
  });

  it("sugere grupos de 2+ sem rede e ignora avulsos", () => {
    const s = suggestNetworks([
      { id: "1", name: "Carrefour SP" },
      { id: "2", name: "Carrefour Comercio RJ" },
      { id: "3", name: "Padaria do Zé" },
      { id: "4", name: "Mercado Bahamas" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ name: "Carrefour" });
    expect(s[0].clients.map((c) => c.id)).toEqual(["1", "2"]);
  });

  it("adiciona a rede existente mesmo com 1 cliente", () => {
    const s = suggestNetworks([
      { id: "1", name: "Carrefour CD Novo" },
      { id: "2", name: "Carrefour CD Antigo", network_name: "Rede Carrefour" },
    ]);
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ existing: "Rede Carrefour" });
  });
});

describe("groupTopByNetwork / existingNetworks", () => {
  it("junta CDs da rede numa linha e mantém avulsos", () => {
    const r = groupTopByNetwork([
      { id: "a", name: "CD 1", revenue: 300, orders: 2, share: 0.3, network: "Carrefour" },
      { id: "x", name: "Avulso", revenue: 400, orders: 1, share: 0.4 },
      { id: "b", name: "CD 2", revenue: 300, orders: 1, share: 0.3, network: "carrefour" },
    ]);
    expect(r[0]).toMatchObject({ name: "Carrefour", revenue: 600, orders: 3, members: 2, isNetwork: true });
    expect(r[0].share).toBeCloseTo(0.6);
    expect(r[1]).toMatchObject({ id: "x", isNetwork: false });
  });

  it("existingNetworks não duplica por grafia", () => {
    expect(existingNetworks(clientes)).toEqual(["Carrefour"]);
  });
});
