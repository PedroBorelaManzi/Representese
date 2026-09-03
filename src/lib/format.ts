// Formatadores curtos reaproveitáveis. (Historicamente cada tela reimplementava
// o seu — os novos componentes de pedidos usam estes.)

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** Valor em reais: `brl(1234.5)` → "R$ 1.234,50". Null/undefined/NaN → "R$ 0,00". */
export const brl = (v: number | string | null | undefined): string =>
  BRL.format(Number(v) || 0);

/** Data curta pt-BR a partir de string ISO/date. Vazio → "—". */
export const dateBR = (v: string | null | undefined): string => {
  if (!v) return "—";
  const d = new Date(v);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR");
};
