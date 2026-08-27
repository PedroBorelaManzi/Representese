import { describe, it, expect } from "vitest";
import {
  aggregateProductRanking,
  groupProductsByRepeatedName,
  monthlySeries,
  filterByPeriod,
  periodoRange,
  type OrderItemRow,
} from "./productAnalytics";

function item(overrides: Partial<OrderItemRow>): OrderItemRow {
  return {
    product_key: "kit porta onix",
    product_name: "Kit Porta Ônix",
    category: "Cozimax",
    client_id: "client-1",
    quantity: 1,
    unit_value: null,
    total_value: null,
    order_date: "2026-08-10T12:00:00.000Z",
    order_id: "order-1",
    ...overrides,
  };
}

describe("aggregateProductRanking", () => {
  it("soma quantidade e receita do mesmo produto em pedidos diferentes", () => {
    const rows = [
      item({ order_id: "o1", quantity: 2, total_value: 200 }),
      item({ order_id: "o2", quantity: 3, total_value: 300 }),
    ];
    const [top] = aggregateProductRanking(rows);
    expect(top.totalQuantity).toBe(5);
    expect(top.totalRevenue).toBe(500);
    expect(top.orderCount).toBe(2);
  });

  it("SEPARA POR REPRESENTADA: mesmo product_key em categorias diferentes vira duas linhas", () => {
    const rows = [
      item({ category: "Cozimax", quantity: 10 }),
      item({ category: "AgroMax", quantity: 4 }),
    ];
    const ranking = aggregateProductRanking(rows);
    expect(ranking).toHaveLength(2);
    const cozimax = ranking.find((r) => r.category === "Cozimax")!;
    const agromax = ranking.find((r) => r.category === "AgroMax")!;
    expect(cozimax.totalQuantity).toBe(10);
    expect(agromax.totalQuantity).toBe(4);
  });

  it("calcula receita a partir de unit_value × quantity quando não há total_value", () => {
    const rows = [item({ quantity: 3, unit_value: 50, total_value: null })];
    expect(aggregateProductRanking(rows)[0].totalRevenue).toBe(150);
  });

  it("ordena por quantidade vendida, maior primeiro", () => {
    const rows = [
      item({ product_key: "a", product_name: "A", quantity: 5 }),
      item({ product_key: "b", product_name: "B", quantity: 50 }),
      item({ product_key: "c", product_name: "C", quantity: 20 }),
    ];
    const nomes = aggregateProductRanking(rows).map((r) => r.productName);
    expect(nomes).toEqual(["B", "C", "A"]);
  });

  it("usa a grafia mais frequente do nome do produto no grupo", () => {
    const rows = [
      item({ order_id: "o1", product_name: "KIT PORTA ONIX" }),
      item({ order_id: "o2", product_name: "Kit Porta Ônix" }),
      item({ order_id: "o3", product_name: "Kit Porta Ônix" }),
    ];
    expect(aggregateProductRanking(rows)[0].productName).toBe("Kit Porta Ônix");
  });

  it("ignora item sem product_key ou com quantidade zero", () => {
    const rows = [item({ product_key: "", quantity: 5 }), item({ quantity: 0 })];
    expect(aggregateProductRanking(rows)).toEqual([]);
  });

  it("avgUnitValue é a receita total dividida pela quantidade total", () => {
    const rows = [item({ order_id: "o1", quantity: 2, total_value: 100 }), item({ order_id: "o2", quantity: 2, total_value: 300 })];
    expect(aggregateProductRanking(rows)[0].avgUnitValue).toBe(100); // 400 / 4
  });
});

describe("groupProductsByRepeatedName", () => {
  it("agrupa produtos que compartilham uma palavra no nome, mesmo sem serem o mesmo item", () => {
    const rows = [
      item({ product_key: "kit porta onix branco", product_name: "Kit Porta Ônix Branco" }),
      item({ product_key: "kit porta onix cinza", product_name: "Kit Porta Ônix Cinza" }),
      item({ product_key: "fechadura porta aluminio", product_name: "Fechadura Porta Alumínio" }),
    ];
    const ranking = aggregateProductRanking(rows);
    const grupos = groupProductsByRepeatedName(ranking);
    // "kit" está na lista de palavras ignoradas — a palavra que une os 3 é "porta"
    const grupoPorta = grupos.find((g) => g.label.toLowerCase() === "porta");
    expect(grupoPorta).toBeTruthy();
    expect(grupoPorta!.products).toHaveLength(3);
  });

  it("nunca agrupa produtos de empresas diferentes, mesmo com nome igual", () => {
    const rows = [
      item({ category: "Cozimax", product_key: "fechadura porta", product_name: "Fechadura Porta" }),
      item({ category: "Cozimax", product_key: "dobradica porta", product_name: "Dobradiça Porta" }),
      item({ category: "AgroMax", product_key: "fechadura porta 2", product_name: "Fechadura Porta" }),
      item({ category: "AgroMax", product_key: "dobradica porta 2", product_name: "Dobradiça Porta" }),
    ];
    const ranking = aggregateProductRanking(rows);
    const grupos = groupProductsByRepeatedName(ranking);
    const cozimaxGrupo = grupos.find((g) => g.category === "Cozimax" && g.label.toLowerCase() === "porta")!;
    const agromaxGrupo = grupos.find((g) => g.category === "AgroMax" && g.label.toLowerCase() === "porta")!;
    expect(cozimaxGrupo.products).toHaveLength(2);
    expect(agromaxGrupo.products).toHaveLength(2);
  });

  it("produto sem nenhuma palavra em comum com outro vira grupo de 1 item só", () => {
    const rows = [
      item({ product_key: "parafuso sextavado", product_name: "Parafuso Sextavado" }),
      item({ product_key: "arruela lisa", product_name: "Arruela Lisa" }),
    ];
    const ranking = aggregateProductRanking(rows);
    const grupos = groupProductsByRepeatedName(ranking);
    expect(grupos).toHaveLength(2);
    grupos.forEach((g) => expect(g.products).toHaveLength(1));
  });

  it('palavra genérica demais ("kit") não vira grupo sozinha', () => {
    const rows = [
      item({ product_key: "kit banheiro", product_name: "Kit Banheiro" }),
      item({ product_key: "kit cozinha", product_name: "Kit Cozinha" }),
    ];
    const ranking = aggregateProductRanking(rows);
    const grupos = groupProductsByRepeatedName(ranking);
    // Sem outra palavra em comum além de "kit" (ignorada), cada um fica sozinho
    expect(grupos).toHaveLength(2);
    grupos.forEach((g) => expect(g.products).toHaveLength(1));
  });
});

describe("monthlySeries", () => {
  it("preenche todos os meses da janela, mesmo sem venda (não pula mês vazio)", () => {
    const rows = [item({ order_date: "2026-08-05T00:00:00.000Z", quantity: 10 })];
    const serie = monthlySeries(rows, 3, new Date(2026, 7, 15)); // ref = agosto/2026
    expect(serie).toHaveLength(3);
    expect(serie.map((p) => p.monthKey)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(serie[0].quantity).toBe(0);
    expect(serie[1].quantity).toBe(0);
    expect(serie[2].quantity).toBe(10);
  });

  it("soma quantidade de vários itens no mesmo mês", () => {
    const rows = [
      item({ order_date: "2026-08-03T00:00:00.000Z", quantity: 5 }),
      item({ order_date: "2026-08-20T00:00:00.000Z", quantity: 7 }),
    ];
    const serie = monthlySeries(rows, 1, new Date(2026, 7, 25));
    expect(serie[0].quantity).toBe(12);
  });
});

describe("periodoRange / filterByPeriod", () => {
  it("'tudo' não filtra nada (devolve range nulo)", () => {
    expect(periodoRange("tudo", new Date(2026, 7, 15))).toBeNull();
  });

  it("'mes' cobre do dia 1 ao último dia do mês de referência", () => {
    const rows = [
      item({ order_date: "2026-07-31T23:59:00.000Z" }), // fora (mês anterior)
      item({ order_date: "2026-08-01T00:00:00.000Z" }), // dentro
      item({ order_date: "2026-08-31T23:00:00.000Z" }), // dentro
      item({ order_date: "2026-09-01T00:00:00.000Z" }), // fora
    ];
    const filtrado = filterByPeriod(rows, "mes", new Date(2026, 7, 15));
    expect(filtrado).toHaveLength(2);
  });

  it("'trimestre' cobre os 3 meses do trimestre corrente", () => {
    // Agosto está no 3º trimestre (jul-ago-set)
    const rows = [
      item({ order_date: "2026-06-30T00:00:00.000Z" }), // fora
      item({ order_date: "2026-07-01T00:00:00.000Z" }), // dentro
      item({ order_date: "2026-09-30T12:00:00.000Z" }), // dentro
      item({ order_date: "2026-10-01T00:00:00.000Z" }), // fora
    ];
    const filtrado = filterByPeriod(rows, "trimestre", new Date(2026, 7, 15));
    expect(filtrado).toHaveLength(2);
  });

  it("'ano' cobre o ano inteiro de referência", () => {
    const rows = [
      item({ order_date: "2025-12-31T23:59:00.000Z" }),
      item({ order_date: "2026-01-01T00:00:00.000Z" }),
      item({ order_date: "2026-12-31T23:59:00.000Z" }),
      item({ order_date: "2027-01-01T00:00:00.000Z" }),
    ];
    const filtrado = filterByPeriod(rows, "ano", new Date(2026, 5, 1));
    expect(filtrado).toHaveLength(2);
  });
});
