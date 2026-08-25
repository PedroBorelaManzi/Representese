// api/_lib/authUser.ts
//
// Lê o usuário da resposta do GET /auth/v1/user do Supabase.
//
// Existe por causa de um bug que custou caro: o endpoint devolve o usuário
// na RAIZ do JSON —
//
//     {"id":"4d78...","aud":"authenticated","email":"...", ...}
//
// — e não embrulhado em {"user": {...}}. Os dois endpoints da pasta api/
// faziam `const { user } = await res.json()`, que nesse formato dá
// undefined. Em api/order-intake.ts isso derrubava o "Definir PIN" da tela
// de Equipe com "Sessão inválida." mesmo com o login perfeitamente válido
// (confirmado em produção: resposta 200, corpo com o id do usuário certo,
// e ainda assim rejeitado).
//
// Centralizado aqui pra que a forma da resposta seja interpretada num lugar
// só, com teste, em vez de repetida à mão em cada endpoint.

export interface UsuarioAutenticado {
  id: string;
  email?: string;
}

/**
 * Devolve o usuário do corpo já parseado, ou null se o corpo não descrever
 * um usuário válido (erro do GoTrue, JSON inesperado, id ausente).
 *
 * Aceita tanto o formato da raiz quanto o embrulhado em `user` — assim um
 * eventual retorno via SDK, que embrulha, também funciona.
 */
export function extrairUsuario(corpo: unknown): UsuarioAutenticado | null {
  if (!corpo || typeof corpo !== "object") return null;

  const raiz = corpo as Record<string, unknown>;
  const embrulhado = raiz.user;
  const alvo =
    embrulhado && typeof embrulhado === "object"
      ? (embrulhado as Record<string, unknown>)
      : raiz;

  const id = alvo.id;
  if (typeof id !== "string" || id.length === 0) return null;

  return alvo as unknown as UsuarioAutenticado;
}
