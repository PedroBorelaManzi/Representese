import { describe, it, expect } from "vitest";
import { extrairUsuario } from "./authUser";

/* O bug que estes testes travam: o GET /auth/v1/user do Supabase devolve o
   usuário na raiz do JSON, e o código lia `corpo.user` — que nesse formato é
   undefined. Resultado em produção: "Sessão inválida." ao definir o PIN de um
   link de equipe, com a sessão do dono perfeitamente válida. */
describe("extrairUsuario", () => {
  // Corpo real capturado dos logs de produção (encurtado).
  const corpoReal = {
    id: "4d7832ee-a240-440e-a69d-c56fe462af6a",
    aud: "authenticated",
    role: "authenticated",
    email: "pedroborelamanzi@gmail.com",
    email_confirmed_at: "2026-03-22T01:31:37.808371Z",
  };

  it("lê o usuário quando ele vem na raiz (formato do /auth/v1/user)", () => {
    expect(extrairUsuario(corpoReal)?.id).toBe("4d7832ee-a240-440e-a69d-c56fe462af6a");
  });

  it("lê o usuário quando ele vem embrulhado em `user`", () => {
    expect(extrairUsuario({ user: corpoReal })?.id).toBe("4d7832ee-a240-440e-a69d-c56fe462af6a");
  });

  it("preserva o e-mail junto do id", () => {
    expect(extrairUsuario(corpoReal)?.email).toBe("pedroborelamanzi@gmail.com");
  });

  it("recusa o corpo de erro do GoTrue, que não tem id", () => {
    expect(extrairUsuario({ code: 401, msg: "invalid claim: missing sub claim" })).toBeNull();
  });

  it("recusa id vazio, ausente ou de outro tipo", () => {
    expect(extrairUsuario({ id: "" })).toBeNull();
    expect(extrairUsuario({ email: "a@b.com" })).toBeNull();
    expect(extrairUsuario({ id: 123 })).toBeNull();
  });

  it("recusa corpo que não é objeto", () => {
    expect(extrairUsuario(null)).toBeNull();
    expect(extrairUsuario(undefined)).toBeNull();
    expect(extrairUsuario("texto")).toBeNull();
    expect(extrairUsuario(42)).toBeNull();
  });

  it("recusa `user: null` sem cair no formato da raiz por engano", () => {
    // Se o endpoint disser explicitamente que não há usuário, o objeto de
    // fora não pode ser aceito como se fosse o próprio usuário.
    expect(extrairUsuario({ user: null })).toBeNull();
  });
});
