// src/lib/sessionGate.ts
//
// Cliente do teto global de sessões simultâneas (ver api/_lib/sessionGate.ts).
//
// Regra de ouro: FAIL-OPEN. Qualquer erro de rede, endpoint fora do ar, app
// nativo que não alcança /api/... etc. → o usuário TRABALHA normalmente. Só
// mostramos a tela de "sistema cheio" quando o servidor responde 503 de
// propósito.

import { supabase } from './supabase';

export type GateStatus = 'ok' | 'full' | 'skip';

export interface GateResponse {
  status: GateStatus;
  active?: number;
  limit?: number;
}

async function call(action: 'acquire' | 'release'): Promise<GateResponse> {
  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch {
    /* sem sessão → skip */
  }
  if (!token) return { status: 'skip' };

  try {
    const res = await fetch('/api/session-gate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action }),
      // keepalive: deixa o 'release' terminar mesmo com a aba fechando
      keepalive: action === 'release',
    });

    if (action === 'release') return { status: 'skip' };

    if (res.status === 503) {
      const body = await res.json().catch(() => ({}));
      return { status: 'full', active: body.active, limit: body.limit };
    }
    if (res.ok) {
      const body = await res.json().catch(() => ({}));
      return { status: 'ok', active: body.active, limit: body.limit };
    }
    // 401, 500, etc. → não é o nosso "cheio" → libera
    return { status: 'skip' };
  } catch {
    // rede caiu / endpoint inalcançável → libera
    return { status: 'skip' };
  }
}

/** Pega ou renova a vaga. Serve tanto pro primeiro acesso quanto pro heartbeat. */
export function acquireSessionSlot(): Promise<GateResponse> {
  return call('acquire');
}

/** Libera a vaga (logout / aba fechando). Best-effort. */
export function releaseSessionSlot(): Promise<GateResponse> {
  return call('release');
}

/** Intervalo entre heartbeats (o TTL no servidor é 180s — 2 chances antes de
 *  perder a vaga). Mantido alto de propósito: cada heartbeat é uma invocação
 *  serverless, e isso só pesa quando há MUITA gente online ao mesmo tempo. */
export const SESSION_HEARTBEAT_MS = 70_000;
