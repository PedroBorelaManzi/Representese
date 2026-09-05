// src/lib/orderItems.ts
//
// Grava os produtos de um pedido (order_items) depois que o pedido em si já
// foi criado — usado pelos mesmos pontos que inserem em `orders` (Pedidos.tsx,
// Empresas.tsx, api/order-intake.ts). Puro `@supabase/supabase-js`, sem nada
// de navegador, então funciona tanto no browser quanto na função serverless
// (mesmo padrão de orderExtractionCore.ts).
//
// Nunca lança: produto é informação complementar (área de Produtos) — uma
// falha aqui não pode derrubar o registro do pedido, que já terminou.

import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizar, type ItemExtraido } from "./orderExtractionCore.js";

export interface SalvarItensDoPedidoParams {
  userId: string;
  orderId: string;
  clientId: string | null;
  /** A representada (orders.category) — desnormalizada em cada item pra
   *  filtrar "quantas peças vendi da empresa X" sem precisar de join. */
  category: string;
  /** Data do pedido (ISO) — vira o eixo do tempo na área de Produtos. */
  orderDate: string;
  items: ItemExtraido[];
}

/** Chave de agrupamento do produto: mesma normalização usada pra categoria e
 *  cliente em todo o motor de leitura, então duas grafias do mesmo produto
 *  ("Kit Porta 80cm" / "KIT PORTA 80 CM") caem na mesma linha do ranking. */
export function chaveDoProduto(description: string): string {
  return normalizar(description).trim();
}

/** Normaliza um código de produto pra comparação tolerante a espaço/caixa —
 *  não usa `normalizar` (que tira pontuação), porque código costuma ter
 *  hífen/ponto que importa ("A-102" é diferente de "A102"). */
export function normalizarCodigo(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Resolve o produto canônico de um item a partir do código que veio no
 * documento do pedido (sempre extraído por IA, nunca digitado à mão — ver
 * ItemExtraido.code). O mesmo código físico pode ser tanto o código da
 * representada (catálogo) quanto o código interno que O CLIENTE usa pra esse
 * produto (ex.: Atacadão chama o mesmo item de outro código que a fábrica) —
 * sem essa resolução, duas grafias do mesmo produto vindas de clientes
 * diferentes contariam como produtos distintos pro ranking e pra comissão
 * por produto.
 *
 * Prioridade: código do catálogo da representada > código do cliente >
 * comportamento de hoje (chave pela descrição do documento). Só dispara
 * consulta ao banco quando algum item realmente tem código — a maioria dos
 * pedidos sem código no documento não paga esse custo.
 */
async function resolverProdutos(
  supabase: SupabaseClient,
  userId: string,
  clientId: string | null,
  category: string,
  items: ItemExtraido[]
): Promise<{
  codeToRepresentada: Map<string, { name: string; key: string }>;
  keyToName: Map<string, string>;
  codeToCliente: Map<string, string>;
}> {
  const codeToRepresentada = new Map<string, { name: string; key: string }>();
  const keyToName = new Map<string, string>();
  const codeToCliente = new Map<string, string>();

  const temCodigo = items.some((item) => item.code && item.code.trim());
  if (!temCodigo) return { codeToRepresentada, keyToName, codeToCliente };

  const [catalogRes, clientCodesRes] = await Promise.all([
    supabase.from("product_catalog").select("name, code").eq("user_id", userId).eq("category", category).not("code", "is", null),
    clientId
      ? supabase
          .from("client_product_settings")
          .select("client_code, product_key")
          .eq("user_id", userId)
          .eq("client_id", clientId)
          .eq("category", category)
          .not("client_code", "is", null)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  ((catalogRes as any).data || []).forEach((row: any) => {
    const key = chaveDoProduto(row.name);
    codeToRepresentada.set(normalizarCodigo(row.code), { name: row.name, key });
    keyToName.set(key, row.name);
  });
  ((clientCodesRes as any).data || []).forEach((row: any) => {
    codeToCliente.set(normalizarCodigo(row.client_code), row.product_key);
  });

  return { codeToRepresentada, keyToName, codeToCliente };
}

export async function salvarItensDoPedido(
  supabase: SupabaseClient,
  { userId, orderId, clientId, category, orderDate, items }: SalvarItensDoPedidoParams
): Promise<void> {
  if (!items || items.length === 0) return;

  const candidatos = items.filter((item) => item.description && item.quantity > 0);
  if (candidatos.length === 0) return;

  const { codeToRepresentada, keyToName, codeToCliente } = await resolverProdutos(
    supabase,
    userId,
    clientId,
    category,
    candidatos
  );

  const linhas = candidatos.map((item) => {
    const codigo = item.code && item.code.trim() ? normalizarCodigo(item.code) : null;
    const viaRepresentada = codigo ? codeToRepresentada.get(codigo) : undefined;
    const viaCliente = !viaRepresentada && codigo ? codeToCliente.get(codigo) : undefined;

    const productKey = viaRepresentada?.key ?? viaCliente ?? chaveDoProduto(item.description);
    // Nome canônico do catálogo quando dá — inclusive resolvendo pelo código
    // do cliente (ele só guarda a product_key, não o nome; o nome vem daqui).
    // Sem isso no catálogo, mantém a descrição como veio no documento.
    const productName = viaRepresentada?.name ?? (viaCliente ? keyToName.get(viaCliente) : undefined) ?? item.description;

    return {
      user_id: userId,
      order_id: orderId,
      client_id: clientId,
      category,
      product_name: productName,
      product_key: productKey,
      // Sempre o código cru como veio no documento — vira trilha de
      // auditoria pra código ainda não reconhecido, mesmo quando a
      // resolução acima já achou o produto certo por outro caminho.
      product_code: item.code || null,
      quantity: item.quantity,
      unit_value: item.unitValue ?? null,
      total_value: item.totalValue ?? null,
      order_date: orderDate,
    };
  });

  const { error } = await supabase.from("order_items").insert(linhas);
  if (error) {
    // Não interrompe o fluxo: o pedido já foi salvo, e produto é dado
    // complementar. Só fica sem aparecer na área de Produtos.
    console.warn("Não consegui salvar os produtos deste pedido (área de Produtos ficará sem eles):", error.message);
  }
}
