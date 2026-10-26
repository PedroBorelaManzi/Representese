// Quais telas cada plano libera. Exclusivo é o plano de entrada: o que está abaixo
// começa no Profissional (Master inclui tudo do Profissional). Comissões, E-mails e o
// catálogo de Produtos são liberados para todos; a análise de vendas por produto
// (/produtos/analise) não é uma rota, é a parte borrada da tela de Produtos.
const PROFISSIONAL_OU_MAIS = ['/dashboard/relatorios', '/dashboard/ranking', '/dashboard/produtos/analise'];

/** Só o plano Exclusivo fica de fora; plano desconhecido nunca é bloqueado por engano. */
export function planBloqueiaRota(planId: string | undefined | null, path: string): boolean {
  return planId === 'exclusivo' && PROFISSIONAL_OU_MAIS.includes(path);
}
