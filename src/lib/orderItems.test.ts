import { describe, it, expect, vi } from "vitest";
import { chaveDoProduto, salvarItensDoPedido } from "./orderItems";

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
