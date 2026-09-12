// supabase/functions/_shared/orderItems.ts
//
// Cópia Deno de src/lib/orderItems.ts (só a parte usada por
// handle-inbound-order-email: gravar order_items depois que o pedido já foi
// criado). Mesmo motivo de _shared/orderExtractionCore.ts — manter os dois
// em sincronia manualmente quando um mudar.

import { normalizar, type ItemExtraido } from "./orderExtractionCore.ts";

export interface SalvarItensDoPedidoParams {
  userId: string;
  orderId: string;
  clientId: string | null;
  category: string;
  orderDate: string;
  items: ItemExtraido[];
}

export function chaveDoProduto(description: string): string {
  return normalizar(description).trim();
}

export function normalizarCodigo(code: string): string {
  return code.trim().toUpperCase();
}

async function resolverProdutos(
  supabase: any,
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

  (catalogRes.data || []).forEach((row: any) => {
    const key = chaveDoProduto(row.name);
    codeToRepresentada.set(normalizarCodigo(row.code), { name: row.name, key });
    keyToName.set(key, row.name);
  });
  (clientCodesRes.data || []).forEach((row: any) => {
    codeToCliente.set(normalizarCodigo(row.client_code), row.product_key);
  });

  return { codeToRepresentada, keyToName, codeToCliente };
}

export async function salvarItensDoPedido(
  supabase: any,
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
    const productName = viaRepresentada?.name ?? (viaCliente ? keyToName.get(viaCliente) : undefined) ?? item.description;

    return {
      user_id: userId,
      order_id: orderId,
      client_id: clientId,
      category,
      product_name: productName,
      product_key: productKey,
      product_code: item.code || null,
      quantity: item.quantity,
      unit_value: item.unitValue ?? null,
      total_value: item.totalValue ?? null,
      order_date: orderDate,
    };
  });

  const { error } = await supabase.from("order_items").insert(linhas);
  if (error) {
    console.warn("Não consegui salvar os produtos deste pedido:", error.message);
  }
}
