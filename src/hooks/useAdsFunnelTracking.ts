import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { hasAnalyticsConsent, subscribeConsent } from '../lib/cookieConsent';
import { trackFunnelStep } from '../lib/adsFunnel';
import { trackCheckoutStartConversion } from '../lib/googleAds';

/** Marca as etapas do funil de anúncios conforme a rota: qualquer página = visita,
 *  /register = viu o cadastro, /checkout = viu o checkout (+ conversão secundária no Google Ads).
 *  Admin nunca conta. Se o aceite de cookies vier depois, tenta de novo. */
export function useAdsFunnelTracking() {
  const { pathname } = useLocation();
  const { settings, loading } = useSettings();
  const isAdmin = settings.is_admin;

  useEffect(() => {
    if (loading || isAdmin) return;
    const rodar = () => {
      if (!hasAnalyticsConsent()) return;
      trackFunnelStep('visit');
      if (pathname.startsWith('/register')) trackFunnelStep('register_view');
      if (pathname.startsWith('/checkout')) {
        trackFunnelStep('checkout_view');
        trackCheckoutStartConversion();
      }
    };
    rodar();
    return subscribeConsent(rodar);
  }, [pathname, loading, isAdmin]);
}
