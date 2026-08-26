// src/lib/cepLookup.ts
//
// Busca de endereço por CEP na BrasilAPI — mesmo provedor já usado em
// cnpjLookup.ts (já liberado no CSP connect-src), só que o endpoint de CEP
// em vez do de CNPJ.

export interface CepLookupResult {
  cep: string;
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

/**
 * Busca um CEP na BrasilAPI. Devolve `null` se o CEP não tiver 8 dígitos ou
 * a API não encontrar nada — quem chama decide como tratar (deixar os
 * campos em branco pra digitação manual), esta função não lança nem mostra
 * toast.
 */
export async function lookupCep(rawCep: string): Promise<CepLookupResult | null> {
  const cleanCep = rawCep.replace(/\D/g, "");
  if (cleanCep.length !== 8) return null;

  try {
    const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${cleanCep}`);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      cep: cleanCep,
      street: data.street || "",
      neighborhood: data.neighborhood || "",
      city: data.city || "",
      state: data.state || "",
    };
  } catch {
    return null;
  }
}
