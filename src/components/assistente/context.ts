/* Builders do contexto de carteira enviado à IA.
   Extraído de pages/AssistenteIA.tsx (auditoria 3.1). */
import type { AIActionClient } from "../../lib/aiActions";

export const MAX_CLIENTS_IN_CONTEXT = 1500;

export function totalFaturamento(fat: Record<string, number> | null): number {
  if (!fat || typeof fat !== "object") return 0;
  return Object.values(fat).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

export interface RecentOrder {
  id: string;
  client_id: string;
  category: string;
  value: number;
  created_at: string;
}

export function buildClientContext(
  clients: AIActionClient[],
  recentOrders: RecentOrder[] = []
): { context: string; total: number; truncated: boolean } {
  const total = clients.length;
  const ordered = [...clients].sort((a, b) => totalFaturamento(b.faturamento) - totalFaturamento(a.faturamento));
  const slice = ordered.slice(0, MAX_CLIENTS_IN_CONTEXT);

  // Agrupa pedidos por cliente para acesso rápido
  const ordersByClient = new Map<string, RecentOrder[]>();
  recentOrders.forEach((o) => {
    if (!ordersByClient.has(o.client_id)) ordersByClient.set(o.client_id, []);
    ordersByClient.get(o.client_id)!.push(o);
  });

  const lines = slice.map((c, i) => {
    const fat = totalFaturamento(c.faturamento);
    const inactive = daysSince(c.last_contact);
    const local = [c.city, c.state].filter(Boolean).join("/") || "?";

    const cnpj = c.cnpj ? ` | CNPJ: ${c.cnpj}` : "";
    const phone = c.phone ? ` | tel: ${c.phone}` : "";
    const email = c.email ? ` | email: ${c.email}` : "";
    const address = c.address ? ` | end: ${c.address.slice(0, 80)}` : "";

    // Faturamento acumulado por empresa representada
    const fatBreakdown =
      c.faturamento && Object.keys(c.faturamento).length > 1
        ? ` (${Object.entries(c.faturamento)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .map(([k, v]) => `${k}: R$${Number(v).toLocaleString("pt-BR")}`)
            .join(" | ")})`
        : "";

    // Últimos 3 pedidos deste cliente (dos pedidos recentes carregados)
    const clientOrders = ordersByClient.get(c.id) || [];
    const ordersStr =
      clientOrders.length > 0
        ? ` | pedidos recentes: ${clientOrders
            .slice(0, 3)
            .map((o) => `${o.category} R$${Number(o.value).toLocaleString("pt-BR")} em ${o.created_at.slice(0, 10)}`)
            .join("; ")}`
        : "";

    const notes = c.notes ? ` | notas: ${c.notes.replace(/\s+/g, " ").slice(0, 120)}` : "";

    return (
      `${i + 1}. ${c.name}${cnpj}${phone}${email} | local: ${local}${address}` +
      ` | status: ${c.status || "ativo"} | fat total: R$${fat.toLocaleString("pt-BR")}${fatBreakdown}` +
      ` | sem contato: ${inactive != null ? `${inactive}d` : "sem registro"}${ordersStr}${notes}`
    );
  });

  return { context: lines.join("\n"), total, truncated: total > MAX_CLIENTS_IN_CONTEXT };
}
