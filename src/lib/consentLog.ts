/* Grava cada decisão de consentimento na tabela `consent_log` do Supabase.
 *
 * Por que separado de cookieConsent.ts: aquele módulo é dependency-free e
 * carrega cedo (main.tsx, hooks de tracking, posthog.ts). Este importa o
 * client do Supabase, então fica isolado e é chamado via import() dinâmico.
 *
 * A fonte de verdade da UI continua sendo o localStorage — este registro é
 * só para poder DEMONSTRAR o consentimento (LGPD art. 8º §2º). Nunca lança. */

import { supabase } from './supabase';
import type { ConsentCategories, ConsentAction } from './cookieConsent';

const ANON_KEY = 'rm_anon_id';

function anonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return 'sem-storage';
  }
}

export async function registrarConsentimento(
  categorias: ConsentCategories,
  version: number,
  action: ConsentAction,
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    await supabase.from('consent_log').insert({
      user_id: data.session?.user?.id ?? null,
      anon_id: anonId(),
      consent_version: version,
      preferencias: categorias.preferencias,
      analiticos: categorias.analiticos,
      action,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 500) : null,
      page_url: typeof location !== 'undefined' ? location.pathname : null,
    });
  } catch {
    /* silencioso */
  }
}

/** Chamado uma vez por sessão logada (AuthContext): reescreve a decisão atual
 *  com o user_id preenchido, para a decisão ficar ligada à conta. */
export async function sincronizarConsentimentoNoLogin(): Promise<void> {
  try {
    const { getConsentRecord } = await import('./cookieConsent');
    const rec = getConsentRecord();
    if (!rec) return; // ainda não decidiu — nada a ligar
    await registrarConsentimento(rec.categorias, rec.v, 'login_sync');
  } catch {
    /* silencioso */
  }
}
