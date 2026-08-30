/* Consentimento de cookies / rastreamento (LGPD).
 *
 * Categorias:
 *  - necessarios : login, segurança, sincronização offline. Sempre ativos, não
 *                  passam por aqui.
 *  - preferencias: lembrar escolhas de UI (tema já é aplicado antes do React, mas
 *                  entra na categoria para transparência).
 *  - analiticos  : PostHog + eventos próprios em `landing_events` / `user_events`.
 *                  Só disparam com aceite explícito.
 *
 * O Sentry NÃO passa por aqui — entra como legítimo interesse (first-party,
 * finalidade de estabilidade, sem publicidade). Fica apenas divulgado em
 * /cookies e na Política de Privacidade.
 *
 * O registro guarda versão + timestamp: se a política de cookies mudar, suba
 * CONSENT_VERSION e o banner reaparece pedindo nova decisão. */

export const CONSENT_VERSION = 1;

const KEY = 'rm_cookie_consent';
/** opt-out antigo por ?notrack=1 — continua sendo respeitado. */
const LEGADO_NOTRACK = 'rs_notrack';

export type ConsentCategories = {
  preferencias: boolean;
  analiticos: boolean;
};

export type ConsentAction = 'accept_all' | 'reject' | 'custom' | 'settings_change' | 'login_sync';

type StoredConsent = {
  v: number;
  ts: string;
  categorias: ConsentCategories;
};

const NEGADO: ConsentCategories = { preferencias: false, analiticos: false };

let cache: StoredConsent | null | undefined;
const listeners = new Set<() => void>();

function ler(): StoredConsent | null {
  if (cache !== undefined) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return (cache = null);
    const parsed = JSON.parse(raw) as StoredConsent;
    // versão antiga do texto → tratar como "ainda não decidiu"
    if (!parsed || parsed.v !== CONSENT_VERSION || !parsed.categorias) return (cache = null);
    return (cache = parsed);
  } catch {
    return (cache = null);
  }
}

function notrackAtivo(): boolean {
  try {
    return localStorage.getItem(LEGADO_NOTRACK) === '1';
  } catch {
    return false;
  }
}

/** true enquanto não houver decisão válida para a versão atual → mostrar o banner. */
export function precisaDecidir(): boolean {
  return ler() === null;
}

export function getConsent(): ConsentCategories {
  const c = ler();
  return c ? c.categorias : NEGADO;
}

/** Registro completo (com data), usado na tela de configurações. */
export function getConsentRecord(): StoredConsent | null {
  return ler();
}

/** Única checagem que os hooks de rastreamento e o PostHog devem usar. */
export function hasAnalyticsConsent(): boolean {
  if (notrackAtivo()) return false;
  return getConsent().analiticos === true;
}

export function setConsent(categorias: ConsentCategories, action: ConsentAction = 'custom'): void {
  const registro: StoredConsent = {
    v: CONSENT_VERSION,
    ts: new Date().toISOString(),
    categorias: { preferencias: !!categorias.preferencias, analiticos: !!categorias.analiticos },
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(registro));
  } catch {
    /* modo privado / storage cheio — decisão vale só para esta sessão */
  }
  cache = registro;
  for (const fn of listeners) fn();

  // Registro no banco (LGPD) — fire-and-forget, não bloqueia a UI.
  import('./consentLog')
    .then((m) => m.registrarConsentimento(registro.categorias, CONSENT_VERSION, action))
    .catch(() => {});
}

export function aceitarTudo(): void {
  setConsent({ preferencias: true, analiticos: true }, 'accept_all');
}

export function recusarNaoEssenciais(): void {
  setConsent({ preferencias: false, analiticos: false }, 'reject');
}

/** Notifica quando a decisão muda (banner some, configurações atualizam, main.tsx
 *  liga o PostHog). Retorna o unsubscribe. */
export function subscribeConsent(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
