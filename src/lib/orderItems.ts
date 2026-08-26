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

export async function salvarItensDoPedido(
  supabase: SupabaseClient,
  { userId, orderId, clientId, category, orderDate, items }: SalvarItensDoPedidoParams
): Promise<void> {
  if (!items || items.length === 0) return;

  const linhas = items
    .filter((item) => item.description && item.quantity > 0)
    .map((item) => ({
      user_id: userId,
      order_id: orderId,
      client_id: clientId,
      category,
      product_name: item.description,
      product_key: chaveDoProduto(item.description),
      product_code: item.code || null,
      quantity: item.quantity,
      unit_value: item.unitValue ?? null,
      total_value: item.totalValue ?? null,
      order_date: orderDate,
    }));

  if (linhas.length === 0) return;

  const { error } = await supabase.from("order_items").insert(linhas);
  if (error) {
    // Não interrompe o fluxo: o pedido já foi salvo, e produto é dado
    // complementar. Só fica sem aparecer na área de Produtos.
    console.warn("Não consegui salvar os produtos deste pedido (área de Produtos ficará sem eles):", error.message);
  }
}
