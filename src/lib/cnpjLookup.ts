// src/lib/cnpjLookup.ts
//
// Busca de dados de empresa por CNPJ na BrasilAPI — antes copiado e colado em
// 3 lugares (duas vezes no CRM, uma vez no Mapa), cada um montando o nome e o
// endereço na mão do jeito próprio. Centralizado aqui: se a BrasilAPI mudar o
// formato da resposta um dia, é um lugar só pra corrigir.

export interface CnpjLookupResult {
  cnpj: string;
  name: string;
  city: string;
  state: string;
  address: string;
  /** Dados crus da Receita Federal, pra quem precisar de mais campos (ex.:
   *  CEP e logradouro separados, usados pela geocodificação de alta precisão). */
  raw: {
    razaoSocial?: string;
    nomeFantasia?: string;
    logradouro?: string;
    numero?: string;
    bairro?: string;
    cep?: string;
  };
}

/**
 * Busca um CNPJ na BrasilAPI. Devolve `null` se o CNPJ não tiver 14 dígitos
 * ou a API não encontrar nada — quem chama decide como tratar (usar nome
 * padrão, avisar o usuário, etc.), esta função não lança nem mostra toast.
 */
export async function lookupCnpj(rawCnpj: string): Promise<CnpjLookupResult | null> {
  const cleanCnpj = rawCnpj.replace(/\D/g, "");
  if (cleanCnpj.length !== 14) return null;

  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cleanCnpj}`);
  if (!response.ok) return null;

  const data = await response.json();
  const name = data.razao_social || data.nome_fantasia || "";
  const city = data.municipio || "";
  const state = data.uf || "";
  const address = `${data.logradouro || ""}, ${data.numero || "S/N"} - ${data.bairro || ""}, ${city} - ${state}`.trim();

  return {
    cnpj: cleanCnpj,
    name,
    city,
    state,
    address,
    raw: {
      razaoSocial: data.razao_social,
      nomeFantasia: data.nome_fantasia,
      logradouro: data.logradouro,
      numero: data.numero,
      bairro: data.bairro,
      cep: data.cep ? String(data.cep).replace(/\D/g, "") : undefined,
    },
  };
}
