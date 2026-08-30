import { Geolocation } from '@capacitor/geolocation';
import { supabase } from './supabase';

/* Captura a localização do dispositivo e grava em user_settings (last_lat/lng).
 *
 * Finalidades (ver Política de Privacidade › Localização):
 *  1. centralizar o mapa de clientes na posição do usuário;
 *  2. o Represente-Se acompanhar a cobertura geográfica da rede de representantes.
 *
 * Regras:
 *  - só com "Compartilhar localização" ligado (Configurações › Privacidade) E
 *    permissão do SO concedida;
 *  - no máximo 1 leitura a cada 3h;
 *  - só com o app em primeiro plano — nunca em segundo plano / rastreamento contínuo.
 */

const THROTTLE_MS = 3 * 60 * 60 * 1000;
const KEY = 'rm_geo_captured_at';

export async function capturarLocalizacao(userId: string, permitido: boolean): Promise<void> {
  if (!userId || !permitido) return;
  try {
    const ultimo = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - ultimo < THROTTLE_MS) return;

    // Só dispara o prompt do SO enquanto a decisão ainda não foi tomada.
    let status = await Geolocation.checkPermissions();
    if (status.location === 'prompt' || status.location === 'prompt-with-rationale') {
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== 'granted') return;

    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 5 * 60 * 1000,
    });

    // Grava o timestamp antes do upsert: se a rede falhar, ainda respeita o
    // throttle e não fica tentando de novo a cada foco.
    localStorage.setItem(KEY, String(Date.now()));

    await supabase.from('user_settings').upsert({
      user_id: userId,
      last_lat: pos.coords.latitude,
      last_lng: pos.coords.longitude,
      location_accuracy_m: pos.coords.accuracy ?? null,
      last_location_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* sem sinal / permissão negada / timeout — silencioso */
  }
}

/** Chamado ao desligar "Compartilhar localização": apaga o último ponto. */
export async function limparLocalizacao(userId: string): Promise<void> {
  if (!userId) return;
  try {
    localStorage.removeItem(KEY);
    await supabase.from('user_settings').upsert({
      user_id: userId,
      last_lat: null,
      last_lng: null,
      location_accuracy_m: null,
      last_location_at: null,
      updated_at: new Date().toISOString(),
    });
  } catch {
    /* silencioso */
  }
}
