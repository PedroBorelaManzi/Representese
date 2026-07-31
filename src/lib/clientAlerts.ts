import { normalizeKey } from "./utils";

export type AlertType = "Alerta" | "Crítico" | "Inativo";

export interface AlertLike {
  company: string;
  type: AlertType;
  days: number;
}

export interface OrderLike {
  client_id: string;
  created_at: string;
  category?: string | null;
  file_name?: string | null;
  file_path?: string | null;
}

export interface ClientRef {
  id: string;
  name?: string | null;
}

export interface AlertThresholds {
  alerta: number;
  critico: number;
  inativo: number;
}

export interface ClientAlertResult {
  alerts: AlertLike[];
  /** Último pedido de cada representada, com a chave normalizada (usado no Mapa). */
  lastOrdersByCategory: Record<string, OrderLike>;
}

/**
 * Descobre a representada de um pedido. O nome do arquivo carrega a empresa no
 * prefixo ("EMPRESA___VALOR_x___arquivo.pdf"); sem esse prefixo vale a coluna
 * category. O nome cadastrado pelo usuário tem precedência sobre a grafia crua,
 * para "cozimax" e "Cozimax" não virarem duas empresas.
 */
export function resolveOrderCategory(order: OrderLike, categories: string[] = []): string {
  const lookup = new Map<string, string>();
  categories.forEach(c => { if (c) lookup.set(c.toLowerCase(), c); });
  const parts = (order.file_name || "").split("___");
  const raw = parts.length > 1 ? parts[0] : (order.category || "GERAL");
  return lookup.get(String(raw).toLowerCase()) || String(raw);
}

/**
 * Calcula os alertas de inatividade por cliente.
 *
 * Duas regras importantes:
 *
 * 1. O cálculo é sempre feito a partir dos pedidos atuais e da data de hoje —
 *    guardar o alerta pronto faz ele envelhecer e passar a mentir.
 * 2. Matriz e filiais são cadastros distintos com o mesmo nome. Como o cliente
 *    costuma comprar por um CNPJ só, a compra de qualquer cadastro do grupo
 *    conta para todos: senão os outros aparecem como crítico/inativo mesmo o
 *    cliente tendo comprado.
 */
export function computeClientAlerts(
  clients: ClientRef[],
  orders: OrderLike[],
  thresholds: AlertThresholds,
  categories: string[] = [],
  now: number = Date.now()
): Map<string, ClientAlertResult> {
  const perClient = new Map<string, { lastDates: Record<string, number>; lastOrders: Record<string, OrderLike> }>();

  for (const order of orders) {
    if (!order?.client_id || !order.created_at) continue;
    const time = new Date(order.created_at).getTime();
    if (!Number.isFinite(time)) continue;

    const category = resolveOrderCategory(order, categories);
    const catKey = normalizeKey(category);

    let entry = perClient.get(order.client_id);
    if (!entry) {
      entry = { lastDates: {}, lastOrders: {} };
      perClient.set(order.client_id, entry);
    }

    if (!entry.lastDates[category] || time > entry.lastDates[category]) {
      entry.lastDates[category] = time;
    }
    const previous = entry.lastOrders[catKey];
    if (!previous || time > new Date(previous.created_at).getTime()) {
      entry.lastOrders[catKey] = order;
    }
  }

  // Agrupa cadastros de mesmo nome (matriz + filiais) pela compra mais recente
  const groupKeyOf = (client: ClientRef) => normalizeKey(client.name || "") || `id:${client.id}`;
  const groupLastDates = new Map<string, Record<string, number>>();

  for (const client of clients) {
    const entry = perClient.get(client.id);
    if (!entry) continue;
    const key = groupKeyOf(client);
    const acc = groupLastDates.get(key) || {};
    for (const [category, time] of Object.entries(entry.lastDates)) {
      if (!acc[category] || time > acc[category]) acc[category] = time;
    }
    groupLastDates.set(key, acc);
  }

  const result = new Map<string, ClientAlertResult>();
  for (const client of clients) {
    const lastDates = groupLastDates.get(groupKeyOf(client)) || {};
    const alerts: AlertLike[] = [];

    for (const [category, time] of Object.entries(lastDates)) {
      const days = Math.floor((now - time) / (1000 * 60 * 60 * 24));
      if (days >= thresholds.inativo) alerts.push({ company: category, type: "Inativo", days });
      else if (days >= thresholds.critico) alerts.push({ company: category, type: "Crítico", days });
      else if (days >= thresholds.alerta) alerts.push({ company: category, type: "Alerta", days });
    }

    result.set(client.id, {
      alerts: alerts.sort((a, b) => b.days - a.days),
      lastOrdersByCategory: perClient.get(client.id)?.lastOrders || {},
    });
  }

  return result;
}
