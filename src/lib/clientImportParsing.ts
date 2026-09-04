// src/lib/clientImportParsing.ts
//
// Detecção de colunas e leitura de célula pro importador de clientes
// (ClientImportModal.tsx). Extraído pra cá pra poder testar sem precisar
// montar o componente inteiro — foi aqui que morava o bug real: uma
// planilha com coluna "CLIENTE" (em vez de "Name"/"Empresa") fazia o
// ExcelJS quebrar com "A Cell needs a Row" porque `row.getCell(undefined)`
// não devolve célula vazia, lança exceção.

import type { Row as ExcelRow } from "exceljs";

/** Sinônimos aceitos por campo — únicos, reusados tanto pelo parser de CSV
 *  quanto pelo de Excel, pra planilha real (nem sempre em inglês nem sempre
 *  com o nome exato sugerido na tela) não cair em "nenhum cliente válido". */
export const HEADER_SYNONYMS = {
  name: ["name", "empresa", "cliente", "nome", "razao", "razão"],
  fantasia: ["fantasia"],
  cnpj: ["cnpj"],
  address: ["address", "endereco", "endereço"],
  city: ["city", "cidade"],
  state: ["state", "estado", "uf"],
  phone: ["phone", "telefone", "fone"],
  email: ["email", "e-mail"],
} as const;

export type ClientImportField = keyof typeof HEADER_SYNONYMS;

/** Verifica se um cabeçalho (já em minúsculo) bate com algum sinônimo do campo.
 *  "name" e "fantasia" competem pelo mesmo texto de coluna ("nome fantasia" tem
 *  os dois) — por isso "fantasia" é checado primeiro por quem chama, que já
 *  vem numa ordem que resolve esse empate a favor do campo mais específico. */
export function headerMatchesField(header: string, field: ClientImportField): boolean {
  return HEADER_SYNONYMS[field].some((hint) => header.includes(hint));
}

/** Lê o valor de uma célula do Excel com segurança: sem coluna mapeada
 *  (undefined) o ExcelJS lança "A Cell needs a Row" em vez de devolver
 *  vazio — era isso que derrubava a importação inteira quando uma coluna
 *  esperada (endereço, telefone etc.) simplesmente não existia na planilha.
 *  Também normaliza texto rico e resultado de fórmula, que vêm como objeto
 *  em vez de string puro. */
export function cellText(row: ExcelRow, col: number | undefined): string {
  if (!col) return "";
  const value = row.getCell(col)?.value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("text" in value) return String((value as any).text ?? "").trim();
    if ("result" in value) return String((value as any).result ?? "").trim();
    if (value instanceof Date) return value.toLocaleDateString("pt-BR");
  }
  return String(value).trim();
}

/** Acha o valor de uma coluna do CSV por trecho do cabeçalho, sem ligar pra
 *  maiúscula/minúscula — mesma lista de sinônimos usada no Excel, pra
 *  "CLIENTE"/"Nome"/"Razão Social" funcionarem aqui também. */
export function findCsvValue(row: Record<string, unknown>, field: ClientImportField): string {
  const key = Object.keys(row).find((k) => {
    const normalized = k.toLowerCase();
    // "Nome Fantasia" contém "nome" — sem essa exceção, cairia tanto em
    // "name" quanto em "fantasia" e o nome principal viraria o fantasia.
    if (field === "name" && headerMatchesField(normalized, "fantasia")) return false;
    return headerMatchesField(normalized, field);
  });
  return key ? String(row[key] ?? "").trim() : "";
}
