// src/lib/commissions.ts
//
// Cálculo de comissão por empresa a partir dos pedidos do mês — extraído de
// Comissoes.tsx pra poder ser testado sem montar a página inteira (query do
// Supabase, contexto de auth/settings, etc.).

export interface MonthOrder {
  category: string;
  value: number;
  created_at: string;
}

export interface CommissionRow {
  key: string;
  name: string;
  faturamento: number;
  faturamentoPrev: number;
  pedidos: number;
  pct: number;
  comissao: number;
}

export interface CommissionTotals {
  faturamento: number;
  comissao: number;
  comissaoPrev: number;
  semConfig: number;
}

/** Normaliza nome de empresa para casar pedidos com categorias mesmo com caixa diferente. */
export const normalizeCompanyName = (s: string) => (s || "").trim().toUpperCase();

function computeByCompany(orders: MonthOrder[]) {
  const value = new Map<string, number>();
  const count = new Map<string, number>();
  orders.forEach((o) => {
    const key = normalizeCompanyName(o.category);
    value.set(key, (value.get(key) || 0) + (Number(o.value) || 0));
    count.set(key, (count.get(key) || 0) + 1);
  });
  return { value, count };
}

/**
 * Monta uma linha por empresa (cadastrada ou só citada nos pedidos) com
 * faturamento do mês atual/anterior, nº de pedidos e comissão calculada
 * (faturamento × percentual configurado). Ordenado por maior comissão.
 */
export function computeCommissionRows(
  currentOrders: MonthOrder[],
  previousOrders: MonthOrder[],
  companies: string[],
  commissions: Record<string, number>
): CommissionRow[] {
  const cur = computeByCompany(currentOrders);
  const prev = computeByCompany(previousOrders);

  // Considera todas as empresas: as cadastradas + quaisquer que apareçam nos pedidos
  const allKeys = new Set<string>();
  companies.forEach((c) => allKeys.add(normalizeCompanyName(c)));
  cur.value.forEach((_, k) => allKeys.add(k));

  // Mapeia a chave normalizada de volta para o nome "bonito" cadastrado
  const prettyName = new Map<string, string>();
  companies.forEach((c) => prettyName.set(normalizeCompanyName(c), c));
  currentOrders.forEach((o) => {
    const k = normalizeCompanyName(o.category);
    if (!prettyName.has(k)) prettyName.set(k, o.category.trim());
  });

  return Array.from(allKeys)
    .map((key) => {
      const name = prettyName.get(key) || key;
      const faturamento = cur.value.get(key) || 0;
      const faturamentoPrev = prev.value.get(key) || 0;
      const pedidos = cur.count.get(key) || 0;
      const pct = Number(commissions[name] ?? commissions[key] ?? 0);
      const comissao = faturamento * (pct / 100);
      return { key, name, faturamento, faturamentoPrev, pedidos, pct, comissao };
    })
    .sort((a, b) => b.comissao - a.comissao);
}

export function computeCommissionTotals(rows: CommissionRow[]): CommissionTotals {
  const faturamento = rows.reduce((s, r) => s + r.faturamento, 0);
  const comissao = rows.reduce((s, r) => s + r.comissao, 0);
  const comissaoPrev = rows.reduce((s, r) => s + r.faturamentoPrev * (r.pct / 100), 0);
  const semConfig = rows.filter((r) => r.faturamento > 0 && r.pct === 0).length;
  return { faturamento, comissao, comissaoPrev, semConfig };
}
