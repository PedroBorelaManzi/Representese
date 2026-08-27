import { normalizeKey } from "./utils";

export type AlertType = "Alerta" | "Crítico" | "Inativo";

export interface AlertLike {
  company: string;
  type: AlertType;
  days: number;
  /** Data (ISO) da compra que este alerta está considerando — usada para "ignorar" o aviso. */
  lastOrderAt: string;
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
  /** Nome da rede (matriz + filiais que compram por um lugar só) — ver clientGroupKey. */
  network_name?: string | null;
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

/** Um aviso de inatividade "ignorado" pelo usuário para um cliente + representada. */
export interface DismissalLike {
  /** Chave normalizada do nome do cliente (mesmo agrupamento de matriz/filiais). */
  clientNameKey: string;
  company: string;
  /** Data (ISO) do último pedido no momento em que o aviso foi ignorado. */
  lastOrderAt: string;
}

/**
 * Chave de agrupamento de um cliente (matriz + filiais compartilham a mesma).
 *
 * Prioridade: `network_name` (rede cadastrada manualmente — cobre filiais com
 * nomes diferentes entre si, ex. "Cliente X SP" e "Cliente X RJ", que só
 * compram por um lugar); se vazio, cai pro nome normalizado (matriz e filial
 * cadastradas com o nome idêntico); por fim o próprio id, se nem nome houver.
 */
export function clientGroupKey(client: ClientRef): string {
  const network = normalizeKey(client.network_name || "");
  if (network) return `rede:${network}`;
  return normalizeKey(client.name || "") || `id:${client.id}`;
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
 * 3. Um aviso "ignorado" pelo usuário (ex.: "esse cliente trocou de fornecedor")
 *    fica fora da lista até o cliente comprar de novo daquela representada
 *    depois da data em que o aviso foi ignorado — aí ele reaparece sozinho se
 *    ficar inativo outra vez.
 */
export function computeClientAlerts(
  clients: ClientRef[],
  orders: OrderLike[],
  thresholds: AlertThresholds,
  categories: string[] = [],
  now: number = Date.now(),
  dismissals: DismissalLike[] = []
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
  const groupLastDates = new Map<string, Record<string, number>>();

  for (const client of clients) {
    const entry = perClient.get(client.id);
    if (!entry) continue;
    const key = clientGroupKey(client);
    const acc = groupLastDates.get(key) || {};
    for (const [category, time] of Object.entries(entry.lastDates)) {
      if (!acc[category] || time > acc[category]) acc[category] = time;
    }
    groupLastDates.set(key, acc);
  }

  // dismiss[grupo|empresa] = timestamp do último pedido no momento em que o aviso foi ignorado
  const dismissedAt = new Map<string, number>();
  for (const d of dismissals) {
    const t = new Date(d.lastOrderAt).getTime();
    if (Number.isFinite(t)) dismissedAt.set(`${d.clientNameKey}|${normalizeKey(d.company)}`, t);
  }

  const result = new Map<string, ClientAlertResult>();
  for (const client of clients) {
    const key = clientGroupKey(client);
    const lastDates = groupLastDates.get(key) || {};
    const alerts: AlertLike[] = [];

    for (const [category, time] of Object.entries(lastDates)) {
      const dismissedTime = dismissedAt.get(`${key}|${normalizeKey(category)}`);
      // Sem compra nova desde que o aviso foi ignorado: continua escondido.
      if (dismissedTime !== undefined && dismissedTime >= time) continue;

      const days = Math.floor((now - time) / (1000 * 60 * 60 * 24));
      const lastOrderAt = new Date(time).toISOString();
      if (days >= thresholds.inativo) alerts.push({ company: category, type: "Inativo", days, lastOrderAt });
      else if (days >= thresholds.critico) alerts.push({ company: category, type: "Crítico", days, lastOrderAt });
      else if (days >= thresholds.alerta) alerts.push({ company: category, type: "Alerta", days, lastOrderAt });
    }

    result.set(client.id, {
      alerts: alerts.sort((a, b) => b.days - a.days),
      lastOrdersByCategory: perClient.get(client.id)?.lastOrders || {},
    });
  }

  return result;
}

export type HealthBucket = "emDia" | "alerta" | "critico" | "inativo";

/**
 * Última compra (em qualquer representada) de cada GRUPO de cliente — matriz
 * e filiais de mesmo nome contam como um só. `undefined` quer dizer que
 * nenhum cadastro do grupo tem pedido nenhum registrado.
 */
function groupLastPurchase(clients: ClientRef[], orders: OrderLike[]): Map<string, number> {
  const perClientLast = new Map<string, number>();
  for (const order of orders) {
    if (!order?.client_id || !order.created_at) continue;
    const time = new Date(order.created_at).getTime();
    if (!Number.isFinite(time)) continue;
    const current = perClientLast.get(order.client_id);
    if (current === undefined || time > current) perClientLast.set(order.client_id, time);
  }

  const groupLast = new Map<string, number>();
  for (const client of clients) {
    const time = perClientLast.get(client.id);
    if (time === undefined) continue;
    const key = clientGroupKey(client);
    const current = groupLast.get(key);
    if (current === undefined || time > current) groupLast.set(key, time);
  }
  return groupLast;
}

function bucketFor(time: number | undefined, thresholds: AlertThresholds, now: number): HealthBucket {
  if (time === undefined) return "inativo";
  const days = Math.floor((now - time) / (1000 * 60 * 60 * 24));
  if (days >= thresholds.inativo) return "inativo";
  if (days >= thresholds.critico) return "critico";
  if (days >= thresholds.alerta) return "alerta";
  return "emDia";
}

/**
 * Classifica cada CLIENTE (cada cadastro/linha) pela compra mais recente do
 * seu grupo (matriz + filiais de mesmo nome). Cliente sem nenhum pedido
 * registrado no grupo conta como inativo: nunca comprou, não tem como estar
 * "em dia".
 *
 * Não usa client.last_contact: esse campo só muda em ações manuais de
 * follow-up, então ficava desencontrado de quem realmente comprou — daí a
 * carteira aparecer quase toda "inativa" mesmo com pedido lançado há dias.
 */
export function computeWalletHealth(
  clients: ClientRef[],
  orders: OrderLike[],
  thresholds: AlertThresholds,
  now: number = Date.now()
): Map<string, HealthBucket> {
  const groupLast = groupLastPurchase(clients, orders);
  const result = new Map<string, HealthBucket>();
  for (const client of clients) {
    result.set(client.id, bucketFor(groupLast.get(clientGroupKey(client)), thresholds, now));
  }
  return result;
}

/**
 * Mesma classificação, mas UMA linha por nome de cliente (matriz + filiais
 * agrupadas), não uma por cadastro. Evita que um cliente com várias filiais
 * duplicadas infle o número de "inativos" na visão geral da carteira — usada
 * no card "Saúde da Carteira" dos Relatórios.
 */
export function computeWalletHealthGrouped(
  clients: ClientRef[],
  orders: OrderLike[],
  thresholds: AlertThresholds,
  now: number = Date.now()
): Map<string, HealthBucket> {
  const groupLast = groupLastPurchase(clients, orders);
  const seenGroups = new Set<string>();
  const result = new Map<string, HealthBucket>();
  for (const client of clients) {
    const key = clientGroupKey(client);
    if (seenGroups.has(key)) continue;
    seenGroups.add(key);
    result.set(key, bucketFor(groupLast.get(key), thresholds, now));
  }
  return result;
}

