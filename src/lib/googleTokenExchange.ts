import { Capacitor } from '@capacitor/core';
import { supabase } from './supabase';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

/**
 * Exchange an OAuth authorization code for tokens via secure Edge Function.
 * The Google Client Secret never leaves the server.
 */
export async function exchangeGoogleCode(code: string, redirectUri: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/exchange-auth-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Token exchange failed');
  return data;
}

/**
 * Exchange an authorization code obtained via the native (system browser + PKCE)
 * flow. Uses the platform-specific public OAuth client — no client_secret involved.
 */
export async function exchangeGoogleCodeNative(code: string, redirectUri: string, codeVerifier: string, platform: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");

  const response = await fetch(`${SUPABASE_URL}/functions/v1/exchange-auth-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ code, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: codeVerifier, platform }),
  });

  const data = await response.json();
  if (!response.ok || data.error) throw new Error(data.error || 'Token exchange failed');
  return data;
}

/**
 * Refresh a Google access token via secure Edge Function. Tokens issued to the
 * native app (PKCE, public client) must be refreshed against the same
 * platform-specific client_id, so we auto-detect the platform we're running on.
 */
export async function refreshGoogleToken(refreshToken: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) return null;

  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : undefined;

  const response = await fetch(`${SUPABASE_URL}/functions/v1/exchange-auth-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ refresh_token: refreshToken, grant_type: 'refresh_token', platform }),
  });

  const data = await response.json();
  if (!response.ok || data.error) return null;
  return data.access_token || null;
}
