/* Consentimento para envio de dados a um serviço de IA de terceiros (Google Gemini).
 *
 * O Assistente de IA, a importação inteligente de clientes/catálogo e a leitura de pedidos mandam
 * texto, imagens e dados do CRM do usuário (nomes e contatos de clientes, pedidos, agenda) para os
 * nossos servidores, que repassam à API Gemini do Google. A App Store (5.1.1/5.1.2) exige que o app
 * diga O QUE é enviado, PARA QUEM e peça permissão ANTES do primeiro envio.
 *
 * O aceite fica salvo neste aparelho; o usuário pode revogar em Configurações. Chamadas em segundo
 * plano (sem ação do usuário) nunca abrem o diálogo: só rodam se o aceite já existir. */

const KEY = 'rm_ai_consent_v1';
const EVENTO = 'rs-ai-consent-request';

export function hasAiConsent(): boolean {
  try {
    return localStorage.getItem(KEY) === 'granted';
  } catch {
    return false;
  }
}

export function setAiConsent(concedido: boolean): void {
  try {
    if (concedido) localStorage.setItem(KEY, 'granted');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage indisponível: o diálogo volta a perguntar na próxima vez */
  }
}

let pendente: Promise<boolean> | null = null;

/** Garante o consentimento antes de enviar dados à IA. Abre o diálogo se ainda não houver aceite. */
export function requestAiConsent(): Promise<boolean> {
  if (hasAiConsent()) return Promise.resolve(true);
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (pendente) return pendente;
  pendente = new Promise<boolean>((resolve) => {
    window.dispatchEvent(new CustomEvent(EVENTO, { detail: { resolve } }));
    // Sem diálogo montado (ex.: tela pública), nega em vez de ficar pendurado.
    setTimeout(() => resolve(hasAiConsent()), 120_000);
  }).finally(() => {
    pendente = null;
  });
  return pendente;
}

export const AI_CONSENT_EVENT = EVENTO;

export class AiConsentDeniedError extends Error {
  constructor() {
    super('Para usar a IA, autorize o envio dos dados necessários ao serviço Google Gemini.');
    this.name = 'AiConsentDeniedError';
  }
}
