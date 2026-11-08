// Regras do aviso flutuante "Indique e ganhe" da página de início. Fica separado do
// componente para ser testável sem DOM.

export const REFERRAL_NUDGE_KEY = 'rm_referral_nudge_until';
const DAY_MS = 24 * 60 * 60 * 1000;
export const REFERRAL_NUDGE_DISMISS_DAYS = 14;
export const REFERRAL_NUDGE_CLICK_DAYS = 30;

interface NudgeInput {
  pathname: string;
  subscriptionStatus?: string;
  // Timestamp (ms) até quando o aviso está silenciado; null/undefined = nunca dispensado.
  hiddenUntil?: number | null;
  now?: number;
}

/**
 * Só aparece na página de início e só para quem pode gerar código de indicação
 * (assinante pagante, mesma regra de SettingsReferral) — mostrar para quem ainda
 * não assina levaria a uma tela que pede "assine um plano".
 */
export function shouldShowReferralNudge({ pathname, subscriptionStatus, hiddenUntil, now = Date.now() }: NudgeInput): boolean {
  if (pathname !== '/dashboard') return false;
  if (subscriptionStatus !== 'active' && subscriptionStatus !== 'past_due') return false;
  if (hiddenUntil && hiddenUntil > now) return false;
  return true;
}

export function referralNudgeHiddenUntil(days: number, now = Date.now()): number {
  return now + days * DAY_MS;
}

export function readReferralNudgeHiddenUntil(): number | null {
  try {
    const n = Number(localStorage.getItem(REFERRAL_NUDGE_KEY));
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export function writeReferralNudgeHiddenUntil(days: number): void {
  try {
    localStorage.setItem(REFERRAL_NUDGE_KEY, String(referralNudgeHiddenUntil(days)));
  } catch {
    // Sem localStorage (janela privada) o aviso só volta no próximo carregamento — sem problema.
  }
}
