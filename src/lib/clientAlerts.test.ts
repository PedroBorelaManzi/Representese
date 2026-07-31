import { describe, it, expect } from "vitest";
import { computeClientAlerts, resolveOrderCategory } from "./clientAlerts";

const LIMITES = { alerta: 30, critico: 45, inativo: 90 };
const HOJE = new Date("2026-07-31T12:00:00Z").getTime();

/** Monta a data de um pedido feito há N dias. */
const diasAtras = (n: number) => new Date(HOJE - n * 86400000).toISOString();

describe("computeClientAlerts", () => {
  it("não gera alerta para quem comprou há poucos dias", () => {
    const clientes = [{ id: "c1", name: "Angelo Paiotti Comercio Varejista Ltda" }];
    const pedidos = [{ client_id: "c1", created_at: diasAtras(7), category: "Cozimax" }];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("c1")!.alerts).toEqual([]);
  });

  it("respeita o limite configurado: 22 dias não é alerta quando o limite é 25", () => {
    const clientes = [{ id: "c1", name: "Ramalho & Rosa Ltda" }];
    const pedidos = [{ client_id: "c1", created_at: diasAtras(22), category: "Cozimax" }];

    const limite25 = { alerta: 25, critico: 45, inativo: 90 };
    expect(computeClientAlerts(clientes, pedidos, limite25, ["Cozimax"], HOJE).get("c1")!.alerts).toEqual([]);

    // e com o limite em 20 o mesmo cliente entra em alerta
    const limite20 = { alerta: 20, critico: 45, inativo: 90 };
    const comLimite20 = computeClientAlerts(clientes, pedidos, limite20, ["Cozimax"], HOJE).get("c1")!.alerts;
    expect(comLimite20).toHaveLength(1);
    expect(comLimite20[0]).toMatchObject({ type: "Alerta", days: 22 });
  });

  it("classifica em Alerta, Crítico e Inativo conforme os dias", () => {
    const clientes = [{ id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }];
    const pedidos = [
      { client_id: "a", created_at: diasAtras(31), category: "Cozimax" },
      { client_id: "b", created_at: diasAtras(50), category: "Cozimax" },
      { client_id: "c", created_at: diasAtras(120), category: "Cozimax" },
    ];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("a")!.alerts[0].type).toBe("Alerta");
    expect(r.get("b")!.alerts[0].type).toBe("Crítico");
    expect(r.get("c")!.alerts[0].type).toBe("Inativo");
    expect(r.get("c")!.alerts[0].days).toBe(120);
  });

  it("um pedido novo derruba o alerta antigo do mesmo cliente", () => {
    const clientes = [{ id: "c1", name: "Cliente Um" }];
    const pedidos = [
      { client_id: "c1", created_at: diasAtras(200), category: "Cozimax" },
      { client_id: "c1", created_at: diasAtras(2), category: "Cozimax" }, // comprou agora
    ];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("c1")!.alerts).toEqual([]);
  });

  it("conta o pedido mesmo sem arquivo anexado", () => {
    const clientes = [{ id: "c1", name: "Cliente Um" }];
    // pedido lançado sem file_name (ex.: importado de relatório)
    const pedidos = [{ client_id: "c1", created_at: diasAtras(3), category: "Cozimax", file_name: null }];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("c1")!.alerts).toEqual([]);
  });

  it("compra de uma filial tira matriz e demais filiais do crítico/inativo", () => {
    const grupo = [
      { id: "matriz", name: "Comercial Jimenez Ltda" },
      { id: "filial1", name: "Comercial Jimenez Ltda" },
      { id: "filial2", name: "COMERCIAL JIMENEZ LTDA" }, // grafia diferente, mesmo nome
    ];
    // só a matriz comprou, e faz 5 dias
    const pedidos = [{ client_id: "matriz", created_at: diasAtras(5), category: "Cozimax" }];

    const r = computeClientAlerts(grupo, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("matriz")!.alerts).toEqual([]);
    expect(r.get("filial1")!.alerts).toEqual([]);
    expect(r.get("filial2")!.alerts).toEqual([]);
  });

  it("o agrupamento usa a compra mais recente do grupo, não a mais antiga", () => {
    const grupo = [
      { id: "m", name: "Padovani & Padovani" },
      { id: "f", name: "Padovani & Padovani" },
    ];
    const pedidos = [
      { client_id: "m", created_at: diasAtras(300), category: "Cozimax" },
      { client_id: "f", created_at: diasAtras(10), category: "Cozimax" },
    ];

    const r = computeClientAlerts(grupo, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("m")!.alerts).toEqual([]);
    expect(r.get("f")!.alerts).toEqual([]);
  });

  it("não mistura clientes de nomes diferentes", () => {
    const clientes = [
      { id: "x", name: "Casa Forte Materiais" },
      { id: "y", name: "Casa Nova Materiais" },
    ];
    const pedidos = [{ client_id: "x", created_at: diasAtras(3), category: "Cozimax" }];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("x")!.alerts).toEqual([]);
    expect(r.get("y")!.alerts).toEqual([]); // sem pedido nenhum, não entra em alerta
  });

  it("o alerta é por representada: comprou de uma, continua inativo na outra", () => {
    const clientes = [{ id: "c1", name: "Cliente Um" }];
    const pedidos = [
      { client_id: "c1", created_at: diasAtras(3), category: "Cozimax" },
      { client_id: "c1", created_at: diasAtras(120), category: "LA GRANITOS" },
    ];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax", "LA GRANITOS"], HOJE);
    const alerts = r.get("c1")!.alerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ company: "LA GRANITOS", type: "Inativo" });
  });

  it("grafias diferentes da mesma empresa não viram duas representadas", () => {
    const clientes = [{ id: "c1", name: "Cliente Um" }];
    const pedidos = [
      { client_id: "c1", created_at: diasAtras(200), category: "COZIMAX" },
      { client_id: "c1", created_at: diasAtras(4), category: "cozimax" },
    ];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("c1")!.alerts).toEqual([]);
  });

  it("guarda o último pedido de cada representada para o mapa", () => {
    const clientes = [{ id: "c1", name: "Cliente Um" }];
    const antigo = { client_id: "c1", created_at: diasAtras(60), category: "Cozimax" };
    const recente = { client_id: "c1", created_at: diasAtras(5), category: "Cozimax" };

    const r = computeClientAlerts(clientes, [antigo, recente], LIMITES, ["Cozimax"], HOJE);
    expect(r.get("c1")!.lastOrdersByCategory["COZIMAX"]).toEqual(recente);
  });

  it("ignora pedido com data inválida em vez de quebrar", () => {
    const clientes = [{ id: "c1", name: "Cliente Um" }];
    const pedidos = [{ client_id: "c1", created_at: "data-invalida", category: "Cozimax" }];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("c1")!.alerts).toEqual([]);
  });
});

describe("computeClientAlerts com dispensas (ignorar aviso)", () => {
  it("esconde o aviso ignorado enquanto não houver compra nova", () => {
    const clientes = [{ id: "c1", name: "Cliente Trocou De Fornecedor" }];
    const pedidos = [{ client_id: "c1", created_at: diasAtras(120), category: "Cozimax" }];

    // sem dispensa: aparece Inativo normalmente
    const semDispensa = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(semDispensa.get("c1")!.alerts).toHaveLength(1);

    const lastOrderAt = semDispensa.get("c1")!.alerts[0].lastOrderAt;
    const dispensas = [{ clientNameKey: "CLIENTE TROCOU DE FORNECEDOR", company: "Cozimax", lastOrderAt }];

    const comDispensa = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE, dispensas);
    expect(comDispensa.get("c1")!.alerts).toEqual([]);
  });

  it("o aviso reaparece se o cliente comprar de novo depois de ignorado", () => {
    const clientes = [{ id: "c1", name: "Cliente Voltou A Comprar" }];
    const primeiraCompra = diasAtras(120);

    // ignora o aviso com base na primeira compra (feita há 120 dias)
    const dispensas = [{ clientNameKey: "CLIENTE VOLTOU A COMPRAR", company: "Cozimax", lastOrderAt: primeiraCompra }];

    // depois disso o cliente compra de novo, e essa nova compra já fica velha (95 dias)
    const pedidos = [
      { client_id: "c1", created_at: primeiraCompra, category: "Cozimax" },
      { client_id: "c1", created_at: diasAtras(95), category: "Cozimax" },
    ];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax"], HOJE, dispensas);
    expect(r.get("c1")!.alerts).toHaveLength(1);
    expect(r.get("c1")!.alerts[0]).toMatchObject({ type: "Inativo", days: 95 });
  });

  it("dispensa vale para o grupo inteiro (matriz + filiais), não só para um cadastro", () => {
    const grupo = [
      { id: "matriz", name: "Grupo Com Filiais" },
      { id: "filial", name: "Grupo Com Filiais" },
    ];
    const pedidos = [{ client_id: "matriz", created_at: diasAtras(100), category: "Cozimax" }];
    const dispensas = [{ clientNameKey: "GRUPO COM FILIAIS", company: "Cozimax", lastOrderAt: diasAtras(100) }];

    const r = computeClientAlerts(grupo, pedidos, LIMITES, ["Cozimax"], HOJE, dispensas);
    expect(r.get("matriz")!.alerts).toEqual([]);
    expect(r.get("filial")!.alerts).toEqual([]);
  });

  it("dispensar uma representada não afeta o aviso de outra representada do mesmo cliente", () => {
    const clientes = [{ id: "c1", name: "Cliente Duas Marcas" }];
    const pedidos = [
      { client_id: "c1", created_at: diasAtras(120), category: "Cozimax" },
      { client_id: "c1", created_at: diasAtras(120), category: "LA GRANITOS" },
    ];
    const dispensas = [{ clientNameKey: "CLIENTE DUAS MARCAS", company: "Cozimax", lastOrderAt: diasAtras(120) }];

    const r = computeClientAlerts(clientes, pedidos, LIMITES, ["Cozimax", "LA GRANITOS"], HOJE, dispensas);
    const alerts = r.get("c1")!.alerts;
    expect(alerts).toHaveLength(1);
    expect(alerts[0].company).toBe("LA GRANITOS");
  });
});

describe("resolveOrderCategory", () => {
  it("usa o prefixo do nome do arquivo quando existe", () => {
    const order = { client_id: "c", created_at: "", file_name: "Cozimax___VALOR_500___pedido.pdf", category: "GERAL" };
    expect(resolveOrderCategory(order, ["Cozimax"])).toBe("Cozimax");
  });

  it("cai na coluna category quando o arquivo não tem prefixo", () => {
    const order = { client_id: "c", created_at: "", file_name: "relatorio.pdf", category: "LA GRANITOS" };
    expect(resolveOrderCategory(order, ["LA GRANITOS"])).toBe("LA GRANITOS");
  });

  it("normaliza para a grafia cadastrada pelo usuário", () => {
    const order = { client_id: "c", created_at: "", category: "COZIMAX" };
    expect(resolveOrderCategory(order, ["Cozimax"])).toBe("Cozimax");
  });
});
