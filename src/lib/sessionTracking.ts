import { Capacitor } from "@capacitor/core";
import { supabase } from "./supabase";

/** Nome de dispositivo/navegador a partir do userAgent — só o essencial pra
 *  identificar "de onde" o usuário abriu o app, sem trazer uma lib de
 *  parsing de user-agent só pra isso. */
function parseDeviceLabel(): { os: string; browser: string } {
  const ua = navigator.userAgent;
  let os = "Desconhecido";
  if (/android/i.test(ua)) os = "Android";
  else if (/iphone|ipad|ipod/i.test(ua)) os = "iOS";
  else if (/mac os/i.test(ua)) os = "macOS";
  else if (/windows/i.test(ua)) os = "Windows";
  else if (/linux/i.test(ua)) os = "Linux";

  let browser = "Navegador";
  if (/edg\//i.test(ua)) browser = "Edge";
  else if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) browser = "Chrome";
  else if (/firefox\//i.test(ua)) browser = "Firefox";
  else if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) browser = "Safari";

  return { os, browser };
}

/** Rótulo curto do dispositivo/app, pra identificar sessões distintas no
 *  painel Gerenciar Usuários (Admin). App nativo (Android/iOS) já entrega o
 *  SO certo pelo Capacitor; no navegador, usa o que dá pra ler do userAgent. */
export function getDeviceInfo(): { platform: string; os: string; browser: string; label: string } {
  const isNative = Capacitor.isNativePlatform();
  const platform = isNative ? Capacitor.getPlatform() : "web"; // 'android' | 'ios' | 'web'
  const { os, browser } = parseDeviceLabel();
  const label = isNative
    ? `App ${platform === "android" ? "Android" : "iOS"}`
    : `${browser} · ${os}`;
  return { platform, os, browser, label };
}

const LAST_TRACKED_KEY = "rm_session_tracked_at";
const THROTTLE_MS = 12 * 60 * 60 * 1000; // 12h — não precisa registrar a cada reload/resume

/** Registra a abertura desta sessão (dispositivo + localização aproximada) pro
 *  painel Gerenciar Usuários poder mostrar de onde e de quantos aparelhos
 *  cada usuário abriu o sistema. A localização vem dos headers de geo que a
 *  própria Vercel injeta em toda requisição (x-vercel-ip-city/…) — sem isso,
 *  um serviço de geo-IP de terceiro chamado a partir de infra compartilhada
 *  (testado via Supabase Edge Functions) devolvia erro/rate-limit quase
 *  sempre, porque o IP que chega nele é o do datacenter, não o do usuário.
 *  Throttled por dispositivo — no máximo uma vez a cada 12h, pra não bater
 *  o endpoint a cada reload/resume do app. Nunca lança: é telemetria
 *  auxiliar, uma falha aqui não pode atrapalhar o login de ninguém. */
export function trackSessionOpen(): void {
  try {
    const last = localStorage.getItem(LAST_TRACKED_KEY);
    if (last && Date.now() - Number(last) < THROTTLE_MS) return;
    localStorage.setItem(LAST_TRACKED_KEY, String(Date.now()));

    supabase.auth.getSession().then(({ data }) => {
      const token = data.session?.access_token;
      if (!token) return;
      fetch(`/api/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: "track_session", payload: { device: getDeviceInfo() } }),
      }).catch(() => {});
    });
  } catch {
    // localStorage indisponível ou outro erro — só não registra desta vez.
  }
}
