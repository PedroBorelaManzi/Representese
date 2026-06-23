/* ────────────────────────────────────────────────────────────────
   Ciclo de compra inteligente.

   A partir do histórico de pedidos (tabela `orders`), descobre o ritmo
   de compra de cada cliente POR EMPRESA representada e prevê a próxima
   compra — virando o alerta de inatividade de cabeça pra baixo:
   em vez de só reagir ("X dias sem contato"), antecipa ("atrasado 9 dias
   pra comprar a Empresa A — ligue hoje").

   Regras (decididas com o Pedro):
   - Só estabelece um padrão após MIN_PURCHASES (3) compras da empresa.
   - Só considera a previsão confiável se o histórico abrange ao menos
     MIN_SPAN_DAYS (60) dias — evita reagir a uma rajada de compras.
   ──────────────────────────────────────────────────────────────── */

export interface OrderLike {
  category: string;
  value?: number;
  created_at: string;
}

export type CycleStatus =
  | "observando" // ainda aprendendo (poucas compras ou janela curta)
  | "no_prazo" // comprou há pouco, longe do previsto
  | "previsto" // próxima compra se aproximando
  | "atrasado"; // passou da data prevista

export interface CompanyCycle {
  category: string;
  purchases: number;
  avgIntervalDays: number; // intervalo médio entre compras (0 se observando)
  spanDays: number; // dias entre a 1ª e a última compra
  lastPurchase: string | null; // ISO date
  nextPredicted: string | null; // ISO date prevista
  daysUntilNext: number | null; // negativo = atrasado
  status: CycleStatus;
}

export const MIN_PURCHASES = 3;
export const MIN_SPAN_DAYS = 60;
// "previsto" quando faltam até este nº de dias para a data estimada
const SOON_WINDOW_DAYS = 7;

const DAY = 86_400_000;

/** Calcula o ciclo de compra de cada empresa para um cliente. */
export function computeCompanyCycles(
  orders: OrderLike[],
  now: Date = new Date()
): CompanyCycle[] {
  const byCategory = new Map<string, number[]>();

  for (const o of orders) {
    const t = new Date(o.created_at).getTime();
    if (Number.isNaN(t)) continue;
    const key = (o.category || "GERAL").trim() || "GERAL";
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key)!.push(t);
  }

  const cycles: CompanyCycle[] = [];

  for (const [category, timesRaw] of byCategory) {
    const times = [...timesRaw].sort((a, b) => a - b);
    const purchases = times.length;
    const last = times[times.length - 1];
    const first = times[0];
    const spanDays = (last - first) / DAY;

    // Sem padrão estabelecido ainda
    if (purchases < MIN_PURCHASES || spanDays < MIN_SPAN_DAYS) {
      cycles.push({
        category,
        purchases,
        avgIntervalDays: 0,
        spanDays: Math.round(spanDays),
        lastPurchase: last ? new Date(last).toISOString() : null,
        nextPredicted: null,
        daysUntilNext: null,
        status: "observando",
      });
      continue;
    }

    // Intervalo médio entre compras consecutivas
    let sum = 0;
    for (let i = 1; i < times.length; i++) sum += (times[i] - times[i - 1]) / DAY;
    const avgIntervalDays = sum / (times.length - 1);

    const nextPredictedMs = last + avgIntervalDays * DAY;
    const daysUntilNext = Math.round((nextPredictedMs - now.getTime()) / DAY);

    let status: CycleStatus;
    if (daysUntilNext < 0) status = "atrasado";
    else if (daysUntilNext <= SOON_WINDOW_DAYS) status = "previsto";
    else status = "no_prazo";

    cycles.push({
      category,
      purchases,
      avgIntervalDays: Math.round(avgIntervalDays),
      spanDays: Math.round(spanDays),
      lastPurchase: new Date(last).toISOString(),
      nextPredicted: new Date(nextPredictedMs).toISOString(),
      daysUntilNext,
      status,
    });
  }

  // Mais urgente primeiro: atrasados, depois previstos, depois o resto
  const rank: Record<CycleStatus, number> = {
    atrasado: 0,
    previsto: 1,
    no_prazo: 2,
    observando: 3,
  };
  return cycles.sort((a, b) => {
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
    return (a.daysUntilNext ?? 999) - (b.daysUntilNext ?? 999);
  });
}

/** Resumo do cliente: o ciclo mais urgente (pra listas e ordenação). */
export function headlineCycle(cycles: CompanyCycle[]): CompanyCycle | null {
  if (!cycles.length) return null;
  // já vem ordenado por urgência
  const actionable = cycles.find((c) => c.status === "atrasado" || c.status === "previsto");
  return actionable || cycles[0];
}

/** Texto curto pra exibir o status de um ciclo. */
export function cycleLabel(c: CompanyCycle): string {
  switch (c.status) {
    case "atrasado":
      return `Atrasado ${Math.abs(c.daysUntilNext ?? 0)} dia(s)`;
    case "previsto":
      return c.daysUntilNext === 0 ? "Compra prevista hoje" : `Previsto em ${c.daysUntilNext} dia(s)`;
    case "no_prazo":
      return `Em dia · ~${c.avgIntervalDays}d entre compras`;
    case "observando":
      return c.purchases < MIN_PURCHASES
        ? `Aprendendo o ritmo (${c.purchases}/${MIN_PURCHASES} compras)`
        : "Aprendendo o ritmo";
  }
}
