import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useSettings } from '../contexts/SettingsContext';
import { hasAnalyticsConsent, subscribeConsent } from '../lib/cookieConsent';
import { initMetaPixel, metaInitiateCheckout, metaTrack } from '../lib/metaPixel';

/** Liga o pixel da Meta (só depois do aceite de cookies) e marca PageView a cada tela;
 *  na rota /checkout também dispara InitiateCheckout. Admin nunca conta. */
export function useMetaPixel() {
  const { pathname } = useLocation();
  const { settings, loading } = useSettings();
  const isAdmin = settings.is_admin;

  useEffect(() => {
    if (loading || isAdmin) return;
    const rodar = () => {
      if (!hasAnalyticsConsent() || !initMetaPixel()) return;
      metaTrack('PageView');
      if (pathname.startsWith('/checkout')) metaInitiateCheckout();
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
  }, [pathname, loading, isAdmin]);
}
