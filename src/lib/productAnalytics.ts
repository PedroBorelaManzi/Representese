// src/lib/productAnalytics.ts
//
// Agregação pura (sem Supabase, sem React) dos itens de pedido pra área de
// Produtos: ranking de mais vendidos e série mensal, sempre SEPARADOS POR
// REPRESENTADA — o mesmo nome de produto em duas fábricas diferentes conta
// como dois produtos, nunca um só. Extraído da página pra poder ser testado
// direto com linhas fabricadas, sem montar UI nem mockar Supabase.

export interface OrderItemRow {
  product_key: string;
  product_name: string;
  category: string;
  client_id: string | null;
  quantity: number;
  unit_value: number | null;
  total_value: number | null;
  order_date: string;
  order_id: string;
}

export interface RankedProduct {
  /** Chave de agrupamento: product_key + representada — é isso que garante
   *  "separado por representada" mesmo se duas fábricas venderem produtos
   *  com nome parecido. */
  groupKey: string;
  productKey: string;
  category: string;
  /** Grafia mais frequente entre as linhas do grupo — se o documento variou
   *  a escrita, mostra a versão que mais apareceu, não a última ao acaso. */
  productName: string;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
  lastSaleDate: string;
  avgUnitValue: number;
}

function receitaDoItem(row: OrderItemRow): number {
  if (typeof row.total_value === "number" && row.total_value > 0) return row.total_value;
  if (typeof row.unit_value === "number" && row.unit_value > 0) return row.unit_value * row.quantity;
  return 0;
}

/** Agrupa por produto+representada e soma quantidade/receita. Ordenado por
 *  quantidade vendida (o que "quantas peças eu vendo" pede), maior primeiro. */
export function aggregateProductRanking(rows: OrderItemRow[]): RankedProduct[] {
  interface Acc {
    category: string;
    productKey: string;
    totalQuantity: number;
    totalRevenue: number;
    orderIds: Set<string>;
    lastSaleDate: string;
    nomes: Map<string, number>;
  }
  const grupos = new Map<string, Acc>();

  for (const row of rows) {
    if (!row.product_key || !(row.quantity > 0)) continue;
    const groupKey = `${row.category}::${row.product_key}`;
    let acc = grupos.get(groupKey);
    if (!acc) {
      acc = {
        category: row.category,
        productKey: row.product_key,
        totalQuantity: 0,
        totalRevenue: 0,
        orderIds: new Set(),
        lastSaleDate: row.order_date,
        nomes: new Map(),
      };
      grupos.set(groupKey, acc);
    }
    acc.totalQuantity += row.quantity;
    acc.totalRevenue += receitaDoItem(row);
    acc.orderIds.add(row.order_id);
    if (row.order_date > acc.lastSaleDate) acc.lastSaleDate = row.order_date;
    acc.nomes.set(row.product_name, (acc.nomes.get(row.product_name) || 0) + 1);
  }

  const resultado: RankedProduct[] = [];
  for (const [groupKey, acc] of grupos) {
    // Grafia mais frequente vence; empate, a que apareceu primeiro no Map
    // (ordem de inserção do JS) — determinístico.
    let melhorNome = "";
    let melhorContagem = -1;
    for (const [nome, contagem] of acc.nomes) {
      if (contagem > melhorContagem) {
        melhorNome = nome;
        melhorContagem = contagem;
      }
    }
    resultado.push({
      groupKey,
      productKey: acc.productKey,
      category: acc.category,
      productName: melhorNome,
      totalQuantity: acc.totalQuantity,
      totalRevenue: acc.totalRevenue,
      orderCount: acc.orderIds.size,
      lastSaleDate: acc.lastSaleDate,
      avgUnitValue: acc.totalQuantity > 0 ? acc.totalRevenue / acc.totalQuantity : 0,
    });
  }

  return resultado.sort((a, b) => b.totalQuantity - a.totalQuantity);
}

export interface MonthPoint {
  /** "2026-08" */
  monthKey: string;
  label: string;
  quantity: number;
  revenue: number;
}

const NOMES_MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

/** Série mensal de quantidade/receita, sempre com TODOS os meses da janela
 *  presentes (mesmo com 0) — é o que faz um gráfico de barras não pular mês
 *  vazio e confundir a leitura da evolução. */
export function monthlySeries(rows: OrderItemRow[], monthsBack: number, refDate: Date): MonthPoint[] {
  const pontos: MonthPoint[] = [];
  const porMes = new Map<string, { quantity: number; revenue: number }>();

  for (const row of rows) {
    if (!(row.quantity > 0)) continue;
    const d = new Date(row.order_date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const atual = porMes.get(key) || { quantity: 0, revenue: 0 };
    atual.quantity += row.quantity;
    atual.revenue += receitaDoItem(row);
    porMes.set(key, atual);
  }

  for (let i = monthsBack - 1; i >= 0; i--) {
    const d = new Date(refDate.getFullYear(), refDate.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const valores = porMes.get(key) || { quantity: 0, revenue: 0 };
    pontos.push({ monthKey: key, label: NOMES_MES[d.getMonth()], quantity: valores.quantity, revenue: valores.revenue });
  }

  return pontos;
}

export type PeriodoTipo = "mes" | "trimestre" | "ano" | "tudo";

/** Início/fim (inclusive) do período selecionado, ancorado em refDate. */
export function periodoRange(tipo: PeriodoTipo, refDate: Date): { start: Date; end: Date } | null {
  if (tipo === "tudo") return null;

  if (tipo === "mes") {
    return {
      start: new Date(refDate.getFullYear(), refDate.getMonth(), 1),
      end: new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0, 23, 59, 59, 999),
    };
  }

  if (tipo === "trimestre") {
    const trimestreInicio = Math.floor(refDate.getMonth() / 3) * 3;
    return {
      start: new Date(refDate.getFullYear(), trimestreInicio, 1),
      end: new Date(refDate.getFullYear(), trimestreInicio + 3, 0, 23, 59, 59, 999),
    };
  }

  // ano
  return {
    start: new Date(refDate.getFullYear(), 0, 1),
    end: new Date(refDate.getFullYear(), 11, 31, 23, 59, 59, 999),
  };
}

export function filterByPeriod(rows: OrderItemRow[], tipo: PeriodoTipo, refDate: Date): OrderItemRow[] {
  const range = periodoRange(tipo, refDate);
  if (!range) return rows;
  return rows.filter((row) => {
    const t = new Date(row.order_date).getTime();
    return t >= range.start.getTime() && t <= range.end.getTime();
  });
}
