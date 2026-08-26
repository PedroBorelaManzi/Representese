// src/lib/commissionPrivacy.ts
//
// Hash da senha que esconde/revela valores de comissão na tela. É proteção
// visual (evitar que alguém olhando por cima do ombro, ou com o celular
// emprestado, veja quanto o representante ganhou) — não é autenticação de
// sistema, por isso o hash roda inteiramente no cliente (Web Crypto), sem
// round-trip de servidor, e funciona offline. O user_id entra como "sal"
// implícito, só pra não gravar um hash puro de senha reconhecível.

/** SHA-256(senha + userId) em hex. */
export async function hashCommissionPassword(password: string, userId: string): Promise<string> {
  const enc = new TextEncoder().encode(`${password}::${userId}`);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyCommissionPassword(password: string, userId: string, storedHash: string): Promise<boolean> {
  if (!storedHash) return false;
  const hash = await hashCommissionPassword(password, userId);
  return hash === storedHash;
}
