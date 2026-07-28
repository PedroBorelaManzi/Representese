const NOTRACK_KEY = 'rs_notrack';

/** Lê a URL uma vez por carregamento e, se tiver ?notrack=1, grava a preferência
 * permanentemente nesse navegador. Chamar uma vez no topo do app (App.tsx). */
export function applyTrackingOptOutFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('notrack') === '1') {
    localStorage.setItem(NOTRACK_KEY, '1');
  } else if (params.get('notrack') === '0') {
    localStorage.removeItem(NOTRACK_KEY);
  }
}

/** Usado pelos hooks de tracking (usePageTracking, useLandingTracking) para saber
 * se esse navegador pediu pra não ser contado — útil quando o próprio time testa
 * o site em outros PCs e não quer poluir os números de visitantes/uso reais. */
export function isTrackingDisabled(): boolean {
  return localStorage.getItem(NOTRACK_KEY) === '1';
}
