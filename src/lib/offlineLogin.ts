// Login sem internet. Depois de um login válido (online), o aparelho guarda:
//  - no app (iOS/Android): e-mail + senha no Keychain/Keystore do sistema
//    (criptografado pelo próprio aparelho). Dá pra conferir sem internet E
//    refazer o login sozinho quando a internet volta;
//  - em qualquer plataforma que tenha WebCrypto: uma impressão da senha
//    (PBKDF2 + sal, nunca a senha em si) — usada no navegador, e no app caso
//    o Keychain falhe.
// Sem sinal, o e-mail e a senha digitados são conferidos contra isso. Vale só
// neste aparelho; um novo login online troca o registro.

import { Capacitor } from "@capacitor/core";
import { NativeBiometric } from "@capgo/capacitor-native-biometric";

const SERVER = "representese.app.offline-login";

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

const isNative = () => Capacitor.isNativePlatform();

/** Guarda a credencial verificada pelo servidor. Falha em silêncio (só perde o login offline). */
export async function rememberOfflineLogin(user: { id: string; email?: string | null }, password: string): Promise<void> {
  if (!user.email) return;
  const email = norm(user.email);
  let hash = "";
  let salt = "";
  try {
    if (typeof crypto !== "undefined" && crypto.subtle) {
      const s = crypto.getRandomValues(new Uint8Array(16));
      salt = b64(s);
      hash = await derive(password, s);
    }
  } catch (e) {
    console.warn("offlineLogin: sem WebCrypto", e);
  }
  if (isNative()) {
    try {
      await NativeBiometric.setCredentials({ username: email, password, server: SERVER });
    } catch (e) {
      console.warn("offlineLogin: Keychain indisponível", e);
    }
  }
  // O registro local (id + impressão) é o que diz "este aparelho tem login offline".
  try {
    const cred: OfflineCred = { email, id: user.id, salt, hash };
    localStorage.setItem(KEY, JSON.stringify(cred));
  } catch (e) {
    console.warn("offlineLogin: não foi possível guardar a credencial", e);
  }
}

/** Confere e-mail + senha contra o registro local. Devolve o usuário mínimo, ou null. */
export async function verifyOfflineLogin(email: string, password: string): Promise<{ id: string; email: string } | null> {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const cred = JSON.parse(raw) as OfflineCred;
    if (cred.email !== norm(email)) return null;
    if (isNative()) {
      try {
        const k = await NativeBiometric.getCredentials({ server: SERVER });
        if (k?.username && norm(k.username) === cred.email && k.password === password) return { id: cred.id, email: cred.email };
      } catch {
        /* Keychain sem registro: tenta a impressão */
      }
    }
    if (cred.hash && cred.salt && typeof crypto !== "undefined" && crypto.subtle) {
      const hash = await derive(password, unb64(cred.salt));
      if (hash === cred.hash) return { id: cred.id, email: cred.email };
    }
    return null;
  } catch {
    return null;
  }
}

/** Só no app: e-mail + senha guardados no Keychain, pra refazer o login quando a internet volta. */
export async function getSavedLogin(): Promise<{ email: string; password: string } | null> {
  if (!isNative()) return null;
  try {
    const k = await NativeBiometric.getCredentials({ server: SERVER });
    return k?.username && k?.password ? { email: k.username, password: k.password } : null;
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
