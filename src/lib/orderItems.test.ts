import { describe, it, expect, vi } from "vitest";
import { chaveDoProduto, normalizarCodigo, salvarItensDoPedido } from "./orderItems";

// chaveDoProduto é o que faz duas grafias do mesmo produto virarem uma linha
// só no ranking da área de Produtos — sem isso, "Kit Porta 80cm" e
// "KIT PORTA 80 CM" contariam como dois produtos diferentes.
describe("chaveDoProduto", () => {
  it("case e acento não importam", () => {
    expect(chaveDoProduto("Kit Porta Ônix")).toBe(chaveDoProduto("KIT PORTA ONIX"));
  });

  it("espaçamento extra não importa", () => {
    expect(chaveDoProduto("Kit  Porta   80")).toBe(chaveDoProduto("Kit Porta 80"));
  });

  it("produtos diferentes geram chaves diferentes", () => {
    expect(chaveDoProduto("Gabinete Modelo A")).not.toBe(chaveDoProduto("Gabinete Modelo B"));
  });
});

function supabaseFalso(insertMock: ReturnType<typeof vi.fn>) {
  return { from: vi.fn().mockReturnValue({ insert: insertMock }) } as any;
}

/** Encadeável e "thenable" — imita o bastante do query builder do Supabase
 *  (select/eq/not encadeiam, e o resultado final resolve como uma Promise)
 *  pra `resolverProdutos` funcionar sem precisar de um Supabase de verdade. */
function tabelaFalsa(rows: any[]) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    not: () => chain,
    then: (resolve: any) => resolve({ data: rows }),
  };
  return chain;
}

/** Supabase falso com `product_catalog`/`client_product_settings` de mentira
 *  (pra testar a resolução de código) e `order_items.insert` espionado. */
function supabaseComResolucao(opts: {
  insert: ReturnType<typeof vi.fn>;
  catalogo?: { name: string; code: string }[];
  codigosCliente?: { client_code: string; product_key: string }[];
}) {
  const { insert, catalogo = [], codigosCliente = [] } = opts;
  return {
    from: vi.fn((table: string) => {
      if (table === "product_catalog") return tabelaFalsa(catalogo);
      if (table === "client_product_settings") return tabelaFalsa(codigosCliente);
      if (table === "order_items") return { insert };
      throw new Error(`tabela não esperada no teste: ${table}`);
    }),
  } as any;
}

describe("salvarItensDoPedido", () => {
  const base = {
    userId: "user-1",
    orderId: "order-1",
    clientId: "client-1",
    category: "Cozimax",
    orderDate: "2026-08-18T00:00:00.000Z",
  };

  it("grava uma linha por item, com a categoria (representada) em cada uma", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseFalso(insert);

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [
        { description: "Kit Porta Ônix", quantity: 2, unitValue: 100, totalValue: 200 },
        { description: "Gabinete Modelo B", quantity: 1 },
      ],
    });

    expect(supabase.from).toHaveBeenCalledWith("order_items");
    const linhas = insert.mock.calls[0][0];
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toMatchObject({
      user_id: "user-1", order_id: "order-1", client_id: "client-1", category: "Cozimax",
      product_name: "Kit Porta Ônix", quantity: 2, unit_value: 100, total_value: 200,
      order_date: "2026-08-18T00:00:00.000Z",
    });
    expect(linhas[0].product_key).toBe(chaveDoProduto("Kit Porta Ônix"));
  });

  it("item sem quantidade > 0 é descartado antes de gravar", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseFalso(insert);

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "Produto sem quantidade", quantity: 0 }],
    });

    expect(insert).not.toHaveBeenCalled();
  });

  it("lista de itens vazia não chama o banco", async () => {
    const insert = vi.fn();
    const supabase = supabaseFalso(insert);
    await salvarItensDoPedido(supabase, { ...base, items: [] });
    expect(insert).not.toHaveBeenCalled();
  });

  it("MUTAÇÃO: erro do Supabase não lança — o pedido já foi salvo, produto é complementar", async () => {
    const insert = vi.fn().mockResolvedValue({ error: { message: "RLS negou" } });
    const supabase = supabaseFalso(insert);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await expect(
      salvarItensDoPedido(supabase, { ...base, items: [{ description: "Produto X", quantity: 1 }] })
    ).resolves.toBeUndefined();

    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("normalizarCodigo", () => {
  it("tira espaço e ignora caixa, mas preserva pontuação (hífen importa em código)", () => {
    expect(normalizarCodigo("  a-102 ")).toBe("A-102");
    expect(normalizarCodigo("A-102")).not.toBe(normalizarCodigo("A102"));
  });
});

describe("salvarItensDoPedido — resolução de código do produto", () => {
  const base = {
    userId: "user-1",
    orderId: "order-1",
    clientId: "client-1",
    category: "Kobber",
    orderDate: "2026-08-18T00:00:00.000Z",
  };

  it("código bate no catálogo da representada -> usa nome e chave canônicos do catálogo", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseComResolucao({
      insert,
      catalogo: [{ name: "Granola Tradicional 800g", code: "ABC" }],
    });

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "granola trad 800", code: "abc", quantity: 1, totalValue: 10 }],
    });

    const linha = insert.mock.calls[0][0][0];
    expect(linha.product_name).toBe("Granola Tradicional 800g");
    expect(linha.product_key).toBe(chaveDoProduto("Granola Tradicional 800g"));
    expect(linha.product_code).toBe("abc"); // código cru, sem mudar
  });

  it("código bate no código do cliente -> usa a product_key configurada e o nome canônico do catálogo", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseComResolucao({
      insert,
      catalogo: [{ name: "Granola Tradicional 800g", code: "ABC" }],
      codigosCliente: [{ client_code: "XYZ", product_key: chaveDoProduto("Granola Tradicional 800g") }],
    });

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "granola do jeito que o cliente escreveu", code: "xyz", quantity: 1 }],
    });

    const linha = insert.mock.calls[0][0][0];
    expect(linha.product_key).toBe(chaveDoProduto("Granola Tradicional 800g"));
    expect(linha.product_name).toBe("Granola Tradicional 800g");
    expect(linha.product_code).toBe("xyz");
  });

  it("código do cliente bate mas o produto não está no catálogo -> mantém a descrição do documento como nome", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseComResolucao({
      insert,
      codigosCliente: [{ client_code: "XYZ", product_key: "produto sem catalogo" }],
    });

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "Descrição do Documento", code: "xyz", quantity: 1 }],
    });

    const linha = insert.mock.calls[0][0][0];
    expect(linha.product_key).toBe("produto sem catalogo");
    expect(linha.product_name).toBe("Descrição do Documento");
  });

  it("código não bate em nada -> comportamento de hoje (chave pela descrição)", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseComResolucao({ insert, catalogo: [{ name: "Outro Produto", code: "999" }] });

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "Produto Novo", code: "000", quantity: 1 }],
    });

    const linha = insert.mock.calls[0][0][0];
    expect(linha.product_key).toBe(chaveDoProduto("Produto Novo"));
    expect(linha.product_name).toBe("Produto Novo");
  });

  it("catálogo tem prioridade sobre código do cliente quando os dois bateriam", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseComResolucao({
      insert,
      catalogo: [{ name: "Produto Da Representada", code: "AAA" }],
      codigosCliente: [{ client_code: "AAA", product_key: "produto errado" }],
    });

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "qualquer coisa", code: "aaa", quantity: 1 }],
    });

    const linha = insert.mock.calls[0][0][0];
    expect(linha.product_name).toBe("Produto Da Representada");
  });

  it("nenhum item tem código -> não consulta catálogo nem código do cliente, só order_items", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const supabase = supabaseComResolucao({ insert });

    await salvarItensDoPedido(supabase, {
      ...base,
      items: [{ description: "Produto Sem Código", quantity: 1 }],
    });

    expect(supabase.from).not.toHaveBeenCalledWith("product_catalog");
    expect(supabase.from).not.toHaveBeenCalledWith("client_product_settings");
    expect(supabase.from).toHaveBeenCalledWith("order_items");
  });
});
