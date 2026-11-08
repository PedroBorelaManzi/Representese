// Busca de clientes na tela Clientes. A pessoa escolhe UM campo (Nome, Cidade ou CNPJ) e só
// ele é consultado — antes digitar "Itapeva" varria nome, CNPJ e cidade ao mesmo tempo e
// misturava cliente chamado "Itapeva Peças" com clientes que moram em Itapeva.

export type ClientSearchField = 'nome' | 'cidade' | 'cnpj';

export const CLIENT_SEARCH_FIELDS: { id: ClientSearchField; label: string; placeholder: string }[] = [
  { id: 'nome', label: 'Nome', placeholder: 'Buscar pelo nome do cliente...' },
  { id: 'cidade', label: 'Cidade', placeholder: 'Buscar pela cidade...' },
  { id: 'cnpj', label: 'CNPJ', placeholder: 'Buscar pelo CNPJ (só números)...' },
];

/** minúsculas e sem acento: "Itapevá", "itapeva" e "ITAPEVA" são a mesma busca. */
export function normalizeText(s: string | null | undefined): string {
  return (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const onlyDigits = (s: string | null | undefined) => (s || '').replace(/\D/g, '');

export function matchesClientSearch(
  client: { name?: string | null; city?: string | null; cnpj?: string | null },
  term: string,
  field: ClientSearchField,
): boolean {
  if (!term.trim()) return true;
  if (field === 'cnpj') {
    const q = onlyDigits(term);
    // Texto sem nenhum número não pode "casar" com todos os CNPJs.
    return q.length > 0 && onlyDigits(client.cnpj).includes(q);
  }
  const q = normalizeText(term);
  return normalizeText(field === 'cidade' ? client.city : client.name).includes(q);
}
