// Login sem internet. Depois de um login válido (online), guarda no aparelho
// uma impressão da senha (PBKDF2 + sal, nunca a senha em si) junto com o
// usuário. Sem sinal, o e-mail e a senha digitados são conferidos contra ela.
// Vale só neste aparelho; um novo login online troca o registro.

const KEY = "rm_offline_cred_v1";
const ITER = 150_000;

interface OfflineCred {
  email: string;
  id: string;
  salt: string;
  hash: string;
}

const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf instanceof Uint8Array ? buf : new Uint8Array(buf))));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const norm = (e: string) => e.trim().toLowerCase();

async function derive(password: string, salt: Uint8Array): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: ITER, hash: "SHA-256" }, key, 256);
  return b64(bits);
}

/** Guarda a credencial verificada pelo servidor. Falha em silêncio (só perde o login offline). */
export async function rememberOfflineLogin(user: { id: string; email?: string | null }, password: string): Promise<void> {
  try {
    if (!user.email || !crypto?.subtle) return;
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const cred: OfflineCred = { email: norm(user.email), id: user.id, salt: b64(salt), hash: await derive(password, salt) };
    localStorage.setItem(KEY, JSON.stringify(cred));
  } catch (e) {
    console.warn("offlineLogin: não foi possível guardar a credencial", e);
  }
}

/** Confere e-mail + senha contra o registro local. Devolve o usuário mínimo, ou null. */
export async function verifyOfflineLogin(email: string, password: string): Promise<{ id: string; email: string } | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw || !crypto?.subtle) return null;
    const cred = JSON.parse(raw) as OfflineCred;
    if (cred.email !== norm(email)) return null;
    const hash = await derive(password, unb64(cred.salt));
    return hash === cred.hash ? { id: cred.id, email: cred.email } : null;
  } catch {
    return null;
  }
}

export function hasOfflineLogin(): boolean {
  try {
    return !!localStorage.getItem(KEY);
  } catch {
    return false;
  }
}
