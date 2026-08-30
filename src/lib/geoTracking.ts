import { Capacitor } from '@capacitor/core';
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
 *    permissão do dispositivo concedida;
 *  - enquanto o app está aberto: 1 leitura ao abrir + a cada ~10 min (o gatilho
 *    periódico está no GeoCapture.tsx). O THROTTLE aqui é só uma trava mínima
 *    contra disparos repetidos (troca de aba, foco/desfoco);
 *  - nunca em segundo plano / rastreamento contínuo.
 *  - funciona no app nativo (GPS + WiFi + torre) e no site (WiFi/IP do navegador).
 */

const THROTTLE_MS = 5 * 60 * 1000;
const KEY = 'rm_geo_captured_at';

type Ponto = { lat: number; lng: number; accuracy: number | null };

async function lerPosicao(): Promise<Ponto | null> {
  // App nativo: plugin do Capacitor (localização combinada do SO).
  if (Capacitor.isNativePlatform()) {
    let status = await Geolocation.checkPermissions();
    if (status.location === 'prompt' || status.location === 'prompt-with-rationale') {
      status = await Geolocation.requestPermissions();
    }
    if (status.location !== 'granted') return null;
    const pos = await Geolocation.getCurrentPosition({
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60_000,
    });
    return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  }

  // Site/desktop: API do navegador. O próprio navegador cuida do prompt e do
  // "negado" — se negar, cai no catch e não faz nada.
  if (typeof navigator === 'undefined' || !navigator.geolocation) return null;
  return new Promise<Ponto | null>((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60_000 },
    );
  });
}

export async function capturarLocalizacao(userId: string, permitido: boolean): Promise<void> {
  if (!userId || !permitido) return;
  try {
    const ultimo = Number(localStorage.getItem(KEY) || 0);
    if (Date.now() - ultimo < THROTTLE_MS) return;

    const p = await lerPosicao();
    if (!p) return;

    localStorage.setItem(KEY, String(Date.now()));

    await supabase.from('user_settings').upsert({
      user_id: userId,
      last_lat: p.lat,
      last_lng: p.lng,
      location_accuracy_m: p.accuracy,
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
