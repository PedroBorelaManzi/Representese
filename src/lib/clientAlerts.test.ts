import { describe, it, expect } from "vitest";
import { computeClientAlerts, resolveOrderCategory, computeWalletHealth, computeWalletHealthGrouped } from "./clientAlerts";

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

  it("network_name agrupa filiais com nomes diferentes entre si (rede cadastrada manualmente)", () => {
    const grupo = [
      { id: "sp", name: "Cliente X Filial SP", network_name: "Rede Cliente X" },
      { id: "rj", name: "Cliente X Filial RJ", network_name: "rede cliente x" }, // grafia diferente, mesma rede
      { id: "avulso", name: "Cliente Y" }, // sem rede, não deve ser afetado
    ];
    // só a filial SP comprou, e faz 5 dias
    const pedidos = [{ client_id: "sp", created_at: diasAtras(5), category: "Cozimax" }];

    const r = computeClientAlerts(grupo, pedidos, LIMITES, ["Cozimax"], HOJE);
    expect(r.get("sp")!.alerts).toEqual([]);
    expect(r.get("rj")!.alerts).toEqual([]); // não comprou, mas a rede comprou

    const saude = computeWalletHealth(grupo, pedidos, LIMITES, HOJE);
    expect(saude.get("sp")).toBe("emDia");
    expect(saude.get("rj")).toBe("emDia"); // rede comprou, filial RJ não fica "inativo"
    expect(saude.get("avulso")).toBe("inativo"); // fora da rede, sem pedido nenhum
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

describe("computeWalletHealth", () => {
  it("reproduz o bug relatado: cliente comprou há poucos dias não pode ser inativo", () => {
    const clientes = [{ id: "c1", name: "Angelo Paiotti Comercio Varejista Ltda" }];
    // pedido lançado sem file_name (ex.: lançamento manual na tela do cliente),
    // que era exatamente o caso que ficava de fora antes
    const pedidos = [{ client_id: "c1", created_at: diasAtras(7), category: "Cozimax" }];

    const r = computeWalletHealth(clientes, pedidos, LIMITES, HOJE);
    expect(r.get("c1")).toBe("emDia");
  });

  it("classifica cada faixa corretamente", () => {
    const clientes = [
      { id: "a", name: "A" }, { id: "b", name: "B" }, { id: "c", name: "C" }, { id: "d", name: "D" },
    ];
    const pedidos = [
      { client_id: "a", created_at: diasAtras(5), category: "Cozimax" },
      { client_id: "b", created_at: diasAtras(31), category: "Cozimax" },
      { client_id: "c", created_at: diasAtras(50), category: "Cozimax" },
      { client_id: "d", created_at: diasAtras(120), category: "Cozimax" },
    ];

    const r = computeWalletHealth(clientes, pedidos, LIMITES, HOJE);
    expect(r.get("a")).toBe("emDia");
    expect(r.get("b")).toBe("alerta");
    expect(r.get("c")).toBe("critico");
    expect(r.get("d")).toBe("inativo");
  });

  it("cliente sem nenhum pedido registrado conta como inativo", () => {
    const clientes = [{ id: "c1", name: "Nunca Comprou Nada" }];
    const r = computeWalletHealth(clientes, [], LIMITES, HOJE);
    expect(r.get("c1")).toBe("inativo");
  });

  it("usa a compra em qualquer representada, não uma categoria específica", () => {
    const clientes = [{ id: "c1", name: "Cliente Duas Marcas" }];
    const pedidos = [
      { client_id: "c1", created_at: diasAtras(120), category: "Cozimax" },
      { client_id: "c1", created_at: diasAtras(3), category: "LA GRANITOS" },
    ];
    // comprou LA GRANITOS há 3 dias: pela carteira, está em dia
    expect(computeWalletHealth(clientes, pedidos, LIMITES, HOJE).get("c1")).toBe("emDia");
  });

  it("agrupa matriz e filiais pela compra mais recente do grupo", () => {
    const grupo = [
      { id: "matriz", name: "Grupo Com Filiais" },
      { id: "filial", name: "Grupo Com Filiais" },
    ];
    const pedidos = [{ client_id: "filial", created_at: diasAtras(2), category: "Cozimax" }];
    const r = computeWalletHealth(grupo, pedidos, LIMITES, HOJE);
    expect(r.get("matriz")).toBe("emDia");
    expect(r.get("filial")).toBe("emDia");
  });
});

describe("computeWalletHealthGrouped", () => {
  it("3 filiais sem pedido nenhum contam como 1 inativo, não como 3", () => {
    const grupo = [
      { id: "matriz", name: "Comercial Jimenez Ltda" },
      { id: "filial1", name: "Comercial Jimenez Ltda" },
      { id: "filial2", name: "COMERCIAL JIMENEZ LTDA" },
    ];
    const r = computeWalletHealthGrouped(grupo, [], LIMITES, HOJE);
    expect(r.size).toBe(1);
    expect(r.get("COMERCIAL JIMENEZ LTDA")).toBe("inativo");
  });

  it("uma linha por cliente sem filial, exatamente como antes", () => {
    const clientes = [{ id: "a", name: "Cliente Sozinho" }, { id: "b", name: "Outro Cliente" }];
    const pedidos = [{ client_id: "a", created_at: diasAtras(5), category: "Cozimax" }];
    const r = computeWalletHealthGrouped(clientes, pedidos, LIMITES, HOJE);
    expect(r.size).toBe(2);
    expect(r.get("CLIENTE SOZINHO")).toBe("emDia");
    expect(r.get("OUTRO CLIENTE")).toBe("inativo");
  });

  it("total de grupos é sempre menor ou igual ao total de cadastros quando há filiais", () => {
    const clientes = [
      { id: "1", name: "A" }, { id: "2", name: "A" }, { id: "3", name: "A" }, // 3 cadastros, 1 grupo
      { id: "4", name: "B" }, // 1 cadastro, 1 grupo
    ];
    const r = computeWalletHealthGrouped(clientes, [], LIMITES, HOJE);
    expect(clientes.length).toBe(4);
    expect(r.size).toBe(2);
  });
});
