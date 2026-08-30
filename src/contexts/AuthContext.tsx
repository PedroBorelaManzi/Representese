import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";
import { posthog } from "../lib/posthog";
import { setSentryUser } from "../lib/sentry";
import { offlineCache } from "../lib/offlineCache";
import { trackSessionOpen } from "../lib/sessionTracking";
import { releaseSessionSlot } from "../lib/sessionGate";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<any>;
  signInOffline: (cachedUser: any) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const saveOfflineUser = (user: User) => {
  const minimalUser = { id: user.id, email: user.email };
  const rememberMe = localStorage.getItem("rm_remember_me") === "true";
  
  if (rememberMe) {
    localStorage.setItem("rm_cached_user", JSON.stringify(minimalUser));
    localStorage.setItem("rm_has_logged_in_once", "true");
  } else {
    sessionStorage.setItem("rm_cached_user", JSON.stringify(minimalUser));
    // Se não quis lembrar, garantimos que não fica no localstorage
    localStorage.removeItem("rm_cached_user");
  }
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Liga o consentimento de cookies (gravado antes do login, sem user_id) à
    // conta — uma vez por sessão do navegador. Ver src/lib/consentLog.ts.
    const sincronizarConsentimento = () => {
      if (sessionStorage.getItem('rm_consent_synced')) return;
      sessionStorage.setItem('rm_consent_synced', '1');
      import('../lib/consentLog').then((m) => m.sincronizarConsentimentoNoLogin()).catch(() => {});
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          saveOfflineUser(session.user);
          posthog.identify(session.user.id, { email: session.user.email });
          setSentryUser({ id: session.user.id, email: session.user.email });
          trackSessionOpen();
          sincronizarConsentimento();
        }
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Erro ao carregar sessão:", err);
        setLoading(false); // Destrava o loading
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        saveOfflineUser(session.user);
        posthog.identify(session.user.id, { email: session.user.email });
        setSentryUser({ id: session.user.id, email: session.user.email });
        trackSessionOpen();
        sincronizarConsentimento();
      } else {
        posthog.reset();
        setSentryUser(null);
      }
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      if (subscription) subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, pass: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password: pass,
    });
    if (error) throw error;
    if (data?.user) {
      saveOfflineUser(data.user);
    }
    return data;
  };

  const signInOffline = (cachedUser: any) => {
    setUser(cachedUser);
    setLoading(false);
  };

  const signOut = async () => {
    // Libera a vaga no teto global de sessões antes de derrubar o token.
    await releaseSessionSlot().catch(() => {});
    await supabase.auth.signOut();
    localStorage.removeItem("rm_cached_user");
    sessionStorage.removeItem("rm_cached_user");
    localStorage.removeItem('has_completed_onboarding');
    // offlineCache agora é persistente (localStorage) pra sobreviver ao app
    // Android sendo morto pelo sistema — sem limpar no logout, os dados
    // cacheados de um usuário (clientes, pedidos) ficavam visíveis pro
    // próximo que logasse no mesmo aparelho, mesmo em dispositivo compartilhado.
    offlineCache.clear();
  };

  // signIn/signOut/signInOffline não dependem de estado — valor só muda com user/loading
  const contextValue = useMemo(() => ({ user, loading, signOut, signIn, signInOffline }), [user, loading]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
