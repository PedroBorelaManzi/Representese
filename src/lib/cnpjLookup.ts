// src/lib/cnpjLookup.ts
//
// Busca de dados de empresa por CNPJ. Centralizado aqui (antes copiado em 3
// lugares). Estratégia: BrasilAPI primeiro; se ela falhar/limitar (429/5xx),
// tenta de novo e cai pra minhareceita.org — assim um cliente não é salvo
// "sem nome" só porque uma API estava fora do ar no momento.

export interface CnpjLookupResult {
  cnpj: string;
  /** Razão social (nome legal — é o que casa com a NF). Pode vir vazio se a
   *  Receita não devolver; quem chama decide o que fazer. */
  name: string;
  /** Nome fantasia / apelido comercial. "" quando não há. */
  nomeFantasia: string;
  city: string;
  state: string;
  address: string;
  raw: {
    razaoSocial?: string;
    nomeFantasia?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cep?: string;
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Normaliza a resposta (BrasilAPI e minhareceita.org usam os mesmos nomes de
 *  campo da Receita Federal). */
function normalize(cleanCnpj: string, data: any): CnpjLookupResult {
  const razao = (data.razao_social || "").trim();
  const fantasia = (data.nome_fantasia || "").trim();
  const city = data.municipio || "";
  const state = data.uf || "";
  const address = `${data.logradouro || ""}, ${data.numero || "S/N"} - ${data.bairro || ""}, ${city} - ${state}`.trim();
  return {
    cnpj: cleanCnpj,
    name: razao,
    nomeFantasia: fantasia,
    city,
    state,
    address,
    raw: {
      razaoSocial: razao || undefined,
      nomeFantasia: fantasia || undefined,
      logradouro: data.logradouro || undefined,
      numero: data.numero || undefined,
      bairro: data.bairro || undefined,
      cep: data.cep ? String(data.cep).replace(/\D/g, "") : undefined,
    },
  };
}

async function tryFetch(url: string): Promise<any | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    // BrasilAPI devolve 200 com `{ message, type }` em alguns erros
    if (!data || (data.message && !data.razao_social)) return null;
    return data;
  } catch {
    return null;
  }
}

/**
 * Busca um CNPJ. `null` só se: CNPJ inválido (≠ 14 dígitos) OU todas as fontes
 * falharam. Um resultado com `name: ""` significa que a fonte respondeu mas não
 * trouxe a razão social — quem chama deve pedir o nome ao usuário, não salvar
 * "sem nome".
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjLookupResult | null> {
  const cleanCnpj = rawCnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) return null;

  const sources = [
    `https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`,
    `https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`, // 2ª tentativa (rate limit é frequente)
    `https://minhareceita.org/${cleanCnpj}`,
  ];

  for (let i = 0; i < sources.length; i++) {
    if (i > 0) await sleep(600);
    const data = await tryFetch(sources[i]);
    if (data) return normalize(cleanCnpj, data);
  }

  return null;
}
