// src/lib/faturamento.ts

/**
 * Ajusta o faturamento por categoria de um cliente, somando (delta positivo,
 * ao registrar um pedido) ou subtraindo (delta negativo, ao excluir um
 * pedido) o valor. O total nunca fica negativo — excluir um pedido não pode
 * deixar a categoria "devendo".
 */
export function ajustarFaturamento(
  faturamento: Record<string, number> | null | undefined,
  categoria: string,
  delta: number
): Record<string, number> {
  const fat = faturamento || {};
  const atual = Number(fat[categoria]) || 0;
  return { ...fat, [categoria]: Math.max(0, atual + delta) };
}
