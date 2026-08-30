import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { capturarLocalizacao } from '../lib/geoTracking';

/* Dispara a captura de localização (ver src/lib/geoTracking.ts) quando o app
 * abre e quando volta ao primeiro plano. O throttle de 3h e a checagem de
 * permissão/opt-in ficam no geoTracking — aqui é só o gatilho. */
export default function GeoCapture() {
  const { user } = useAuth();
  const { settings, loading } = useSettings();

  useEffect(() => {
    if (loading || !user) return;
    const permitido = settings.share_location !== false;

    capturarLocalizacao(user.id, permitido);

    const aoFocar = () => {
      if (document.visibilityState === 'visible') {
        capturarLocalizacao(user.id, settings.share_location !== false);
      }
    };
    document.addEventListener('visibilitychange', aoFocar);
    return () => document.removeEventListener('visibilitychange', aoFocar);
  }, [user, loading, settings.share_location]);

  return null;
}
