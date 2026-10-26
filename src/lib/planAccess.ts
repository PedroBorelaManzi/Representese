// Quais telas cada plano libera. Exclusivo é o plano de entrada: as telas abaixo
// começam no Profissional (Master inclui tudo do Profissional).
const PROFISSIONAL_OU_MAIS = ['/dashboard/relatorios', '/dashboard/comissoes', '/dashboard/produtos', '/dashboard/ranking', '/dashboard/email'];

/** Só o plano Exclusivo fica de fora; plano desconhecido nunca é bloqueado por engano. */
export function planBloqueiaRota(planId: string | undefined | null, path: string): boolean {
  return planId === 'exclusivo' && PROFISSIONAL_OU_MAIS.includes(path);
}
