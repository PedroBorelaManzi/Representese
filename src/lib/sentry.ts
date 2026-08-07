import * as Sentry from '@sentry/react';

/* Auditoria 2026-08-07 (PAG-02): o checkout manda número do cartão, CVV e
   validade para a edge function process-checkout. Hoje esses campos não são
   logados nem persistidos em lugar nenhum do código — mas o Sentry, por
   padrão, guarda breadcrumbs de toda chamada fetch/XHR da sessão, e uma
   mudança futura de versão do SDK ou de config (ex.: sendDefaultPii) poderia
   passar a incluir o corpo da requisição sem ninguém perceber. Esta função
   redige defensivamente qualquer evento ou breadcrumb ligado ao checkout ou a
   um payload com cara de cartão, então esse vazamento nunca chega a existir
   mesmo se o comportamento padrão do SDK mudar. */
const CAMPOS_SENSIVEIS = ['cardnumber', 'number', 'ccv', 'cvv', 'expiry', 'expirymonth', 'expiryyear', 'password', 'holdername'];
const ROTA_CHECKOUT = /process-checkout|\/checkout\b/i;

function redigirObjeto(obj: unknown, profundidade = 0): unknown {
  if (obj == null || profundidade > 4) return obj;
  if (Array.isArray(obj)) return obj.map((v) => redigirObjeto(v, profundidade + 1));
  if (typeof obj !== 'object') return obj;

  const resultado: Record<string, unknown> = {};
  for (const [chave, valor] of Object.entries(obj as Record<string, unknown>)) {
    if (CAMPOS_SENSIVEIS.includes(chave.toLowerCase())) {
      resultado[chave] = '[redigido]';
    } else if (valor && typeof valor === 'object') {
      resultado[chave] = redigirObjeto(valor, profundidade + 1);
    } else {
      resultado[chave] = valor;
    }
  }
  return resultado;
}

/* Sem VITE_SENTRY_DSN configurado, tudo aqui vira no-op silencioso —
   nada quebra localmente ou antes de a env var existir no Vercel. */
export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0.1,

    beforeBreadcrumb(breadcrumb) {
      const url = String((breadcrumb.data as { url?: string } | undefined)?.url || '');
      if (ROTA_CHECKOUT.test(url) && breadcrumb.data) {
        breadcrumb.data = redigirObjeto(breadcrumb.data) as Record<string, unknown>;
      }
      return breadcrumb;
    },

    beforeSend(event) {
      if (event.request) {
        event.request = redigirObjeto(event.request) as typeof event.request;
      }
      if (event.extra) {
        event.extra = redigirObjeto(event.extra) as typeof event.extra;
      }
      return event;
    },
  });
}

export { Sentry };
