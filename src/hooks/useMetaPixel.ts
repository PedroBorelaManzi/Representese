import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { hasAnalyticsConsent, subscribeConsent } from '../lib/cookieConsent';
import { initMetaPixel, metaInitiateCheckout, metaTrack, metaViewContent } from '../lib/metaPixel';
import { plans } from '../lib/plansData';

/** Liga o pixel da Meta (só depois do aceite de cookies) e marca PageView a cada tela;
 *  na rota /checkout também dispara InitiateCheckout. Admin nunca conta. */
export function useMetaPixel() {
  const { pathname, search } = useLocation();
  const { settings, loading } = useSettings();
  const isAdmin = settings.is_admin;

  useEffect(() => {
    if (loading || isAdmin) return;
    const rodar = () => {
      if (!hasAnalyticsConsent() || !initMetaPixel()) return;
      metaTrack('PageView');
      if (pathname.startsWith('/planos')) metaViewContent();
      if (pathname.startsWith('/checkout')) {
        const q = new URLSearchParams(search);
        const plano = plans.find((p) => p.id === q.get('plan'));
        const ciclo = q.get('period') === 'annual' ? 'ANNUAL' : 'MONTHLY';
        metaInitiateCheckout(plano ? {
          planId: plano.id, planName: plano.name, ciclo,
          value: Number(ciclo === 'ANNUAL' ? plano.annualPrice : plano.price) * (ciclo === 'ANNUAL' ? 12 : 1),
        } : undefined);
      }
    };
    rodar();
    // Se o aceite vier depois, tenta uma vez (initMetaPixel é idempotente; PageView só se ainda não saiu).
    let enviouPorConsent = false;
    const unsub = subscribeConsent(() => {
      if (enviouPorConsent || !hasAnalyticsConsent()) return;
      enviouPorConsent = true;
      rodar();
    });
    return unsub;
  }, [pathname, search, loading, isAdmin]);
}
