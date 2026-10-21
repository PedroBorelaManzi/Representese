// Carrega do banco tudo que o PDF do pedido precisa e baixa o arquivo.
// Separado de orderPdf.ts (puro, testável) porque aqui há acesso ao Supabase.

import { supabase } from "./supabase";
import { downloadOrderPdf } from "./orderPdf";
import type { OrderPricing } from "./orderBuilder";

export async function openSavedOrderPdf(orderId: string): Promise<"ok" | "error"> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, category, created_at, order_number, payment_terms, notes, pricing, client:clients(name, cnpj, address, phone, email)")
    .eq("id", orderId)
    .single();
  if (error || !order) return "error";

  const { data: items } = await supabase
    .from("order_items")
    .select("product_name, product_code, quantity, unit_value, discount_pct")
    .eq("order_id", orderId)
    .order("created_at");

  const { data: cfg } = await supabase.from("user_settings").select("logo_url").eq("user_id", order.user_id).maybeSingle();

  const { data: auth } = await supabase.auth.getUser();
  const sellerName = (auth?.user?.user_metadata?.full_name as string | undefined) || undefined;

  const client = (Array.isArray(order.client) ? order.client[0] : order.client) as any;
  const ok = await downloadOrderPdf({
    orderNumber: order.order_number || String(order.id).slice(0, 8).toUpperCase(),
    date: order.created_at,
    logoUrl: cfg?.logo_url,
    sellerName,
    company: order.category,
    client: client || { name: "—" },
    items: (items || []) as any[],
    pricing: order.pricing as OrderPricing | null,
    paymentTerms: order.payment_terms,
    notes: order.notes,
  });
  return ok ? "ok" : "error";
}
