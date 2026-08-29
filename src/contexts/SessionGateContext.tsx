// src/contexts/SessionGateContext.tsx
//
// Aplica o teto global de sessões simultâneas enquanto o usuário está logado:
//  - no primeiro acesso, tenta pegar uma vaga
//  - mantém a vaga viva com um heartbeat a cada SESSION_HEARTBEAT_MS
//  - libera a vaga no logout e ao fechar a aba
//
// Se o servidor responder "cheio" (503), `blocked` vira true e o app mostra a
// tela <SystemFull/> em vez do conteúdo (ver ProtectedRoute). Continua
// tentando em segundo plano, então assim que abrir vaga o usuário entra
// sozinho.
//
// FAIL-OPEN: qualquer erro que não seja um 503 explícito = usuário liberado.

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import {
  acquireSessionSlot,
  releaseSessionSlot,
  SESSION_HEARTBEAT_MS,
  type GateResponse,
} from '../lib/sessionGate';

interface SessionGateValue {
  blocked: boolean;
  active: number | null;
  limit: number | null;
  retryNow: () => void;
}

const SessionGateContext = createContext<SessionGateValue>({
  blocked: false,
  active: null,
  limit: null,
  retryNow: () => {},
});

export function SessionGateProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [blocked, setBlocked] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const [limit, setLimit] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const apply = (r: GateResponse) => {
    if (typeof r.active === 'number') setActive(r.active);
    if (typeof r.limit === 'number') setLimit(r.limit);
    // 'skip' (erro/sem sessão/nativo) nunca bloqueia
    setBlocked(r.status === 'full');
  };

  const ping = async () => {
    apply(await acquireSessionSlot());
  };

  useEffect(() => {
    if (!user) {
      setBlocked(false);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      return;
    }

    let cancelled = false;
    (async () => {
      const r = await acquireSessionSlot();
      if (!cancelled) apply(r);
    })();

    // Só bate heartbeat com a aba visível — aba em background re-adquire a
    // vaga no 'visibilitychange' abaixo. Economiza invocações serverless.
    timerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') void ping();
    }, SESSION_HEARTBEAT_MS);

    // Renova a vaga na volta pra aba (o heartbeat pode ter perdido o ritmo
    // com a aba em background / notebook suspenso).
    const onVisible = () => {
      if (document.visibilityState === 'visible') void ping();
    };
    document.addEventListener('visibilitychange', onVisible);

    // Libera a vaga ao fechar. 'pagehide' cobre desktop e o Safari do iOS
    // melhor que 'beforeunload'.
    const onLeave = () => {
      void releaseSessionSlot();
    };
    window.addEventListener('pagehide', onLeave);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pagehide', onLeave);
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = null;
      void releaseSessionSlot();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  return (
    <SessionGateContext.Provider value={{ blocked, active, limit, retryNow: () => void ping() }}>
      {children}
    </SessionGateContext.Provider>
  );
}

export const useSessionGate = () => useContext(SessionGateContext);
