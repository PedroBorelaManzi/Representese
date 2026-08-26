// src/lib/commissions.ts
//
// Cálculo de comissão por empresa a partir dos pedidos do mês — extraído de
// Comissoes.tsx pra poder ser testado sem montar a página inteira (query do
// Supabase, contexto de auth/settings, etc.).

export interface MonthOrder {
  category: string;
  value: number;
  created_at: string;
  /** Comissão já calculada pra esta parcela quando a empresa está em modo
   *  "por produto" (blend dos % de cada item do pedido) — presente, substitui
   *  o cálculo padrão (valor × percentual da empresa) só nesta linha. Ausente
   *  = comportamento de sempre (fixo por empresa). */
  commissionOverride?: number;
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

function computeByCompany(orders: MonthOrder[], commissions: Record<string, number>) {
  const value = new Map<string, number>();
  const count = new Map<string, number>();
  const comissao = new Map<string, number>();
  orders.forEach((o) => {
    const key = normalizeCompanyName(o.category);
    const rowValue = Number(o.value) || 0;
    const pct = Number(commissions[o.category] ?? commissions[key] ?? 0);
    // Linha com override (comissão por produto, já calculada fora daqui) usa
    // o valor pronto; senão, o cálculo de sempre — valor × % da empresa.
    const rowComissao = o.commissionOverride ?? rowValue * (pct / 100);
    value.set(key, (value.get(key) || 0) + rowValue);
    count.set(key, (count.get(key) || 0) + 1);
    comissao.set(key, (comissao.get(key) || 0) + rowComissao);
  });
  return { value, count, comissao };
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
  const cur = computeByCompany(currentOrders, commissions);
  const prev = computeByCompany(previousOrders, commissions);

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
      // Soma já pronta do computeByCompany — respeita override por produto
      // linha a linha; sem override em nenhuma linha, é idêntico a
      // faturamento × pct (mesma conta de sempre, só calculada por pedido).
      const comissao = cur.comissao.get(key) || 0;
      return { key, name, faturamento, faturamentoPrev, pedidos, pct, comissao };
    })
    .sort((a, b) => b.comissao - a.comissao);
}

export function computeCommissionTotals(rows: CommissionRow[]): CommissionTotals {
  const faturamento = rows.reduce((s, r) => s + r.faturamento, 0);
  const comissao = rows.reduce((s, r) => s + r.comissao, 0);
  const comissaoPrev = rows.reduce((s, r) => s + r.faturamentoPrev * (r.pct / 100), 0);
  // pct===0 sozinho não basta mais: empresa em modo "por produto" pode não
  // ter % de empresa configurado (não precisa, cada produto tem o seu) e
  // ainda assim já estar rendendo comissão de verdade via override.
  const semConfig = rows.filter((r) => r.faturamento > 0 && r.pct === 0 && r.comissao === 0).length;
  return { faturamento, comissao, comissaoPrev, semConfig };
}
