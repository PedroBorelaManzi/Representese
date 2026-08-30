import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { capturarLocalizacao } from '../lib/geoTracking';

const INTERVALO_MS = 10 * 60 * 1000; // enquanto o app está aberto

/* Gatilho da captura de localização (ver src/lib/geoTracking.ts):
 *  - ao abrir o app;
 *  - a cada 10 min enquanto continua aberto;
 *  - quando volta ao primeiro plano.
 * O throttle e a checagem de permissão/opt-in ficam no geoTracking. */
export default function GeoCapture() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();

  useEffect(() => {
    if (loading || !user) return;
    const permitido = () => settings.share_location !== false;

    capturarLocalizacao(user.id, permitido());

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        capturarLocalizacao(user.id, permitido());
      }
    }, INTERVALO_MS);

    const aoFocar = () => {
      if (document.visibilityState === 'visible') {
        capturarLocalizacao(user.id, permitido());
      }
    };
    document.addEventListener('visibilitychange', aoFocar);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', aoFocar);
    };
  }, [user, loading, settings.share_location]);

  return null;
}
