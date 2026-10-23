// Monta o PDF de um pedido salvo, guarda uma cópia no aparelho e devolve o que
// a tela precisa pra mostrar. Separado de orderPdf.ts (puro) porque aqui há
// acesso ao Supabase e ao cache offline.
//
// Online: lê do banco (dado mais novo). Offline, ou se o banco não responder
// em poucos segundos: monta com a cópia local da última sincronização — o PDF
// em si é gerado no aparelho, não depende de internet.

import { supabase } from "./supabase";
import { buildOrderPdf, orderPdfFileName, type OrderPdfData } from "./orderPdf";
import { saveOrderPdfLocal, shareOrderPdf } from "./orderPdfStore";
import { offlineCache, CacheKeys } from "./offlineCache";
import type { OrderPricing } from "./orderBuilder";
import type { Client, Order } from "../types";

const NETWORK_TIMEOUT_MS = 8000;

export interface OrderPdfView {
  /** URL pra mostrar no visualizador (arquivo local no app, blob no navegador). */
  url: string;
  fileName: string;
  /** Salvar em Arquivos / enviar. */
  share: () => Promise<void>;
  /** Libera o blob do navegador quando o visualizador fecha. */
  dispose: () => void;
}

function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}

function fromCache(orderId: string, sellerName?: string): OrderPdfData | null {
  const order = (offlineCache.get<Order[]>(CacheKeys.ORDERS) || []).find((o) => o.id === orderId);
  if (!order) return null;
  const client = (offlineCache.get<Client[]>(CacheKeys.CLIENTS) || []).find((c) => c.id === order.client_id);
  const items = (offlineCache.get<any[]>(CacheKeys.ALL_ORDER_ITEMS) || []).filter((i) => i.order_id === orderId);
  const settings = offlineCache.get<{ logo_url?: string | null }>(CacheKeys.USER_SETTINGS);
  return toPdfData(order, client || order.client || null, items, settings?.logo_url, sellerName);
}

function toPdfData(order: any, client: any, items: any[], logoUrl: string | null | undefined, sellerName?: string): OrderPdfData {
  return {
    orderNumber: order.order_number || String(order.id).slice(0, 8).toUpperCase(),
    date: order.created_at,
    logoUrl,
    sellerName,
    company: order.category,
    client: client || { name: "—" },
    items: items as any[],
    pricing: (order.pricing as OrderPricing | null) ?? null,
    paymentTerms: order.payment_terms,
    notes: order.notes,
  };
}

async function fromNetwork(orderId: string, sellerName?: string): Promise<OrderPdfData | null> {
  const { data: order, error } = await supabase
    .from("orders")
    .select("id, user_id, category, created_at, order_number, payment_terms, notes, pricing, client:clients(name, cnpj, address, phone, email)")
    .eq("id", orderId)
    .single();
  if (error || !order) return null;

  const { data: items } = await supabase
    .from("order_items")
    .select("product_name, product_code, quantity, unit_value, discount_pct")
    .eq("order_id", orderId)
    .order("created_at");

  const { data: cfg } = await supabase.from("user_settings").select("logo_url").eq("user_id", order.user_id).maybeSingle();
  const client = Array.isArray(order.client) ? order.client[0] : order.client;
  return toPdfData(order, client, items || [], cfg?.logo_url, sellerName);
}

/** Dados do PDF do pedido: banco se der, cópia local se não. */
export async function loadOrderPdfData(orderId: string): Promise<OrderPdfData | null> {
  // getSession lê a sessão guardada no aparelho — funciona sem internet.
  let sellerName: string | undefined;
  try {
    const { data } = await withTimeout(supabase.auth.getSession(), 3000);
    sellerName = (data.session?.user?.user_metadata?.full_name as string | undefined) || undefined;
  } catch {
    /* sem nome do representante no PDF, segue */
  }
  if (typeof navigator === "undefined" || navigator.onLine) {
    try {
      const net = await withTimeout(fromNetwork(orderId, sellerName), NETWORK_TIMEOUT_MS);
      if (net) return net;
    } catch (e) {
      console.warn("PDF do pedido: sem resposta do servidor, usando a cópia local", e);
    }
  }
  return fromCache(orderId, sellerName);
}

/** Gera o PDF do pedido, guarda no aparelho e devolve a visualização. null = não deu. */
export async function prepareOrderPdf(orderId: string): Promise<OrderPdfView | null> {
  const data = await loadOrderPdfData(orderId);
  if (!data || data.items.length === 0) return null;
  const blob = await buildOrderPdf(data);
  const fileName = orderPdfFileName(data.orderNumber);

  let localUrl: string | null = null;
  try {
    localUrl = await saveOrderPdfLocal(orderId, blob);
  } catch (e) {
    console.warn("Não foi possível guardar o PDF no aparelho:", e);
  }
  const url = localUrl || URL.createObjectURL(blob);
  return {
    url,
    fileName,
    share: () => shareOrderPdf(orderId, blob, fileName),
    dispose: () => {
      if (!localUrl) URL.revokeObjectURL(url);
    },
  };
}

/** Gera e guarda o PDF de um pedido sem mostrar nada — usado na sincronização. */
export async function cacheOrderPdf(order: Order, client: Client | undefined, items: any[], logoUrl: string | null | undefined): Promise<void> {
  if (!items.length) return;
  const blob = await buildOrderPdf(toPdfData(order, client || order.client || null, items, logoUrl));
  await saveOrderPdfLocal(order.id, blob);
}
