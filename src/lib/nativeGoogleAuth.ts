import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { App, type URLOpenListenerEvent } from '@capacitor/app';
import { supabase } from './supabase';
import { exchangeGoogleCodeNative } from './googleTokenExchange';
import { generateCodeChallenge, generateCodeVerifier } from './pkce';

// Custom URI scheme redirect — must match CFBundleURLTypes (iOS) and the
// intent-filter (Android), and must be registered as a redirect URI on the
// matching native OAuth Client ID in the Google Cloud Console.
export const NATIVE_GOOGLE_REDIRECT_URI = 'com.representese.app:/oauth2redirect';

export type GoogleAuthPurpose = 'calendar' | 'email';

interface PendingGoogleAuth {
  purpose: GoogleAuthPurpose;
  verifier: string;
}

const PENDING_KEY = 'representese_native_google_oauth_pending';

function getNativeGoogleClientId(): string | null {
  const platform = Capacitor.getPlatform();
  if (platform === 'ios') return import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID || null;
  if (platform === 'android') return import.meta.env.VITE_GOOGLE_ANDROID_CLIENT_ID || null;
  return null;
}

function parseUrlParams(url: string): URLSearchParams {
  const queryIndex = url.indexOf('?');
  if (queryIndex === -1) return new URLSearchParams();
  return new URLSearchParams(url.substring(queryIndex + 1));
}

/**
 * Kicks off the native Google OAuth flow: opens the system browser
 * (SFSafariViewController/Custom Tabs) with a PKCE challenge. Google requires
 * this for native apps — an embedded WebView is blocked for sign-in.
 */
export async function startNativeGoogleAuth(purpose: GoogleAuthPurpose, scope: string) {
  const clientId = getNativeGoogleClientId();
  if (!clientId) {
    throw new Error('Google Client ID nativo não configurado para esta plataforma.');
  }

  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);

  const pending: PendingGoogleAuth = { purpose, verifier };
  localStorage.setItem(PENDING_KEY, JSON.stringify(pending));

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: NATIVE_GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope,
    access_type: 'offline',
    prompt: 'consent',
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  await Browser.open({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}

interface NativeGoogleAuthHandlers {
  onSuccess: (purpose: GoogleAuthPurpose) => void;
  onError: (purpose: GoogleAuthPurpose | null, message: string) => void;
}

/**
 * Registers the deep-link listener that catches the redirect back from the
 * system browser after the user approves/denies access on Google's page.
 * Call once near the root of the app. Returns a cleanup function.
 */
export function initNativeGoogleAuthListener(handlers: NativeGoogleAuthHandlers): () => void {
  if (!Capacitor.isNativePlatform()) return () => {};

  const listenerHandle = App.addListener('appUrlOpen', async (event: URLOpenListenerEvent) => {
    if (!event.url.startsWith('com.representese.app:')) return;

    await Browser.close().catch(() => {});

    const params = parseUrlParams(event.url);
    const code = params.get('code');
    const errorParam = params.get('error');

    const pendingRaw = localStorage.getItem(PENDING_KEY);
    localStorage.removeItem(PENDING_KEY);
    const pending: PendingGoogleAuth | null = pendingRaw ? JSON.parse(pendingRaw) : null;

    if (errorParam) {
      handlers.onError(pending?.purpose ?? null, 'Autorização negada pelo Google.');
      return;
    }
    if (!code || !pending) {
      handlers.onError(pending?.purpose ?? null, 'Código de autorização não encontrado.');
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Sessão não identificada. Faça login novamente.');

      const tokens = await exchangeGoogleCodeNative(
        code,
        NATIVE_GOOGLE_REDIRECT_URI,
        pending.verifier,
        Capacitor.getPlatform()
      );

      if (pending.purpose === 'calendar') {
        const { error } = await supabase.from('user_google_tokens').upsert({
          user_id: user.id,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });
        if (error) throw error;
      } else {
        let emailAddress = 'Conectado';
        try {
          const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
            headers: { Authorization: `Bearer ${tokens.access_token}` },
          });
          if (res.ok) {
            const info = await res.json();
            emailAddress = info.email || emailAddress;
          }
        } catch (e) {
          console.error('Erro ao buscar email do Google:', e);
        }

        const { error } = await supabase.from('user_email_tokens').upsert({
          user_id: user.id,
          provider: 'google',
          email_address: emailAddress,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id, email_address' });
        if (error) throw error;
      }

      handlers.onSuccess(pending.purpose);
    } catch (err: any) {
      console.error('Erro no callback nativo do Google:', err);
      handlers.onError(pending?.purpose ?? null, err.message || 'Falha na conexão com o Google.');
    }
  });

  return () => {
    listenerHandle.then((handle) => handle.remove());
  };
}
