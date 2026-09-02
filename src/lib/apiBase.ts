import { Capacitor } from '@capacitor/core';

// No app nativo (Capacitor) o webview serve de `capacitor://localhost` (iOS) ou
// `http://localhost` (Android), então um `fetch('/api/...')` relativo NÃO alcança
// as serverless functions no Vercel — o servidor local devolve o index.html
// (fallback do SPA) com status 200, e o JSON.parse falha silenciosamente.
//
// Aqui prefixamos o domínio de produção quando estamos no app nativo. No site
// (web) o caminho segue relativo, como antes. A API já libera as origens
// `capacitor://` e `http(s)://localhost` no CORS (ver api/_lib/cors.ts).
const NATIVE_API_ORIGIN = 'https://www.representese.com';

/** Resolve o caminho de uma serverless function (`/api/...`) para uma URL que
 *  funciona tanto no site quanto no app nativo. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return Capacitor.isNativePlatform() ? `${NATIVE_API_ORIGIN}${normalized}` : normalized;
}
