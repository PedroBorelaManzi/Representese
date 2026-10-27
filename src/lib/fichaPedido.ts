// Ficha do pedido: PDF gerado com os dados que o sistema já tem. Usada quando o pedido não tem
// PDF anexado nem produtos gravados (ex.: importado de relatório). Pedido feito no app usa os itens reais.
import { supabase } from "./supabase";

export async function montarFichaPedido(
  order: any,
  client?: { name?: string | null; cnpj?: string | null; address?: string | null; phone?: string | null; email?: string | null } | null,
) {
  const { buildOrderPdf, orderPdfFileName } = await import("./orderPdf");
  const numero = order.order_number || String(order.id).slice(0, 8).toUpperCase();
  const valor = Number(order.value) || 0;
  let itensReais: any[] = [];
  try {
    const { data } = await supabase.from("order_items").select("product_name, product_code, quantity, unit_value, discount_pct").eq("order_id", order.id);
    itensReais = (data || []).map((i: any) => ({
      product_name: i.product_name,
      product_code: i.product_code,
      quantity: Number(i.quantity) || 0,
      unit_value: Number(i.unit_value) || 0,
      discount_pct: Number(i.discount_pct) || 0,
    }));
  } catch { /* offline: cai no item único */ }
  const c = client || order.client || null;
  const blob = await buildOrderPdf({
    orderNumber: numero,
    date: order.created_at || new Date().toISOString(),
    company: order.category || "Geral",
    client: { name: c?.name || "—", cnpj: c?.cnpj, address: c?.address, phone: c?.phone, email: c?.email },
    items: itensReais.length ? itensReais : [{ product_name: `Pedido ${numero} (importado de relatório)`, quantity: 1, unit_value: valor } as any],
    paymentTerms: order.payment_terms,
    notes: order.notes || (itensReais.length ? null : "Ficha gerada a partir dos dados do pedido importado. Não há PDF original anexado a este pedido."),
  });
  return { bytes: new Uint8Array(await blob.arrayBuffer()), blob, nome: orderPdfFileName(numero) };
}
