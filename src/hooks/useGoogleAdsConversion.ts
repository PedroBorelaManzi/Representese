import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { plans } from '../lib/plansData';
import { isTrackingDisabled } from '../lib/trackingOptOut';
import { subscribeConsent, hasAnalyticsConsent } from '../lib/cookieConsent';
import { trackPaidSubscription, valorPrimeiraCobranca } from '../lib/googleAds';
import { metaSubscribe } from '../lib/metaPixel';

/** Conta criada há mais que isso não é lead de anúncio: é cliente antigo abrindo o app. */
const JANELA_DIAS = 45;

const chave = (userId: string) => `rs_gads_paid_${userId}`;

/** Dispara a conversão "Assinatura paga" do Google Ads uma única vez por usuário,
 *  quando o pagamento é confirmado (status 'active' pelo webhook do Asaas).
 *  Montado junto do PageTracker — sempre dentro de Auth + Settings. */
export function useGoogleAdsConversion() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();

  const userId = user?.id;
  const criadoEm = user?.created_at;
  const { subscription_status: status, subscription_provider: provider, plan_id: planId, billing_cycle: ciclo, is_admin: isAdmin } = settings;

  useEffect(() => {
    if (loading || !userId || isAdmin) return;
    if (status !== 'active' || provider !== 'asaas') return;
    if (isTrackingDisabled()) return;
    if (!criadoEm || Date.now() - new Date(criadoEm).getTime() > JANELA_DIAS * 86_400_000) return;

    const tentar = () => {
      try {
        if (localStorage.getItem(chave(userId))) return true;
      } catch {
        /* storage indisponível: o transaction_id evita duplicata do lado do Google */
      }
      const plano = plans.find((p) => p.id === planId);
      const valor = plano ? valorPrimeiraCobranca(plano.price, plano.annualPrice, ciclo) : 0;
      if (!trackPaidSubscription(userId, valor)) return false;
      metaSubscribe(userId, valor);
      try {
        localStorage.setItem(chave(userId), new Date().toISOString());
      } catch {
        /* idem */
      }
      return true;
    };

    if (hasAnalyticsConsent()) {
      tentar();
      return;
    }
    // Sem decisão ainda: se a pessoa aceitar os cookies depois, tenta de novo.
    const unsub = subscribeConsent(() => {
      if (hasAnalyticsConsent() && tentar()) unsub();
    });
    return unsub;
  }, [loading, userId, criadoEm, status, provider, planId, ciclo, isAdmin]);
}
