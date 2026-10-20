/** Contas de demonstração da revisão da Apple que não devem aparecer nos painéis de admin
 *  (lista de usuários, ficha completa, mapa). A conta `applereview.expirada@…` é a que o
 *  revisor usa hoje no campo de login da ficha, por isso fica visível. As duas abaixo
 *  continuam existindo e funcionando — só ficam escondidas aqui. Para reexibir, tire da lista. */
const HIDDEN_ADMIN_EMAILS = new Set([
  'applereview@representese.com',
  'applereview.compra@representese.com',
]);

export function isHiddenAdminAccount(email?: string | null): boolean {
  return !!email && HIDDEN_ADMIN_EMAILS.has(email.trim().toLowerCase());
}
