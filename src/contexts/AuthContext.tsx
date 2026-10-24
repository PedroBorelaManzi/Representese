import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";
import { posthog } from "../lib/posthog";
import { setSentryUser } from "../lib/sentry";
import { offlineCache } from "../lib/offlineCache";
import { trackSessionOpen } from "../lib/sessionTracking";
import { releaseSessionSlot } from "../lib/sessionGate";
import { iapLogIn, iapLogOut } from "../lib/iap";
import { toast } from "sonner";
import { rememberOfflineLogin, getSavedLogin } from "../lib/offlineLogin";

type AuthContextType = {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
  signIn: (email: string, pass: string) => Promise<any>;
  signInOffline: (cachedUser: any) => void;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Verdadeiro quando o app está aberto com o usuário guardado no aparelho (sem
// sessão do servidor) — acontece ao abrir/entrar sem internet.
let offlineSessionActive = false;

// Usuário da última sessão guardada no aparelho (a que o supabase-js grava).
// Lido de forma síncrona no boot: o app abre na hora com ele, sem esperar o
// supabase-js conferir/renovar o token — sem internet essa espera chegava a ~15s
// (várias tentativas de renovar o token) e a tela ficava só girando.
const readStoredUser = (): User | null => {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split(".")[0];
    const key = `sb-${ref}-auth-token`;
    const raw = localStorage.getItem(key) || sessionStorage.getItem(key);
    const u = raw ? JSON.parse(raw)?.user : null;
    return u?.id ? (u as User) : null;
  } catch {
    return null;
  }
};

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
  const [storedUser] = useState<User | null>(readStoredUser);
  const [user, setUser] = useState<User | null>(storedUser);
  const [loading, setLoading] = useState(!storedUser);

  useEffect(() => {
    // Liga o consentimento de cookies (gravado antes do login, sem user_id) à
    // conta — uma vez por sessão do navegador. Ver src/lib/consentLog.ts.
    const sincronizarConsentimento = () => {
      if (sessionStorage.getItem('rm_consent_synced')) return;
      sessionStorage.setItem('rm_consent_synced', '1');
      import('../lib/consentLog').then((m) => m.sincronizarConsentimentoNoLogin()).catch(() => {});
    };

    // Mantém a MESMA referência de `user` quando o id não muda. O Supabase
    // dispara onAuthStateChange a cada refresh de token e ao focar a aba —
    // sem isso, cada um desses eventos gerava um objeto novo, os efeitos que
    // dependem de [user] recarregavam (SettingsContext, etc.) e a tela piscava.
    let idAtual: string | null = null;
    const aplicarSessao = (session: import('@supabase/supabase-js').Session | null) => {
      const novo = session?.user ?? null;
      // Aberto offline com o usuário do aparelho: um "sem sessão" do servidor
      // (token vencido, sem rede pra renovar) não pode derrubar a pessoa.
      if (!novo && offlineSessionActive) { setLoading(false); return; }
      if (novo?.id === idAtual) {
        setLoading(false);
        return; // mesma conta (ou continua deslogado) — nada muda
      }
      idAtual = novo?.id ?? null;
      offlineSessionActive = false;

      if (novo) {
        saveOfflineUser(novo);
        posthog.identify(novo.id, { email: novo.email });
        setSentryUser({ id: novo.id, email: novo.email });
        trackSessionOpen();
        sincronizarConsentimento();
        // No-op fora do app nativo iOS — ver isIOSApp() em src/lib/iapPolicy.ts.
        void iapLogIn(novo.id);
      } else {
        posthog.reset();
        setSentryUser(null);
        void iapLogOut();
      }
      // Mesmo usuário que já abriu o app na hora: mantém a referência pra não
      // reiniciar tudo que depende de `user`.
      setUser((atual) => (atual && novo && atual.id === novo.id ? atual : novo));
      setLoading(false);
    };

    if (storedUser && !navigator.onLine) offlineSessionActive = true;

    // Sem internet o token pode ter vencido e não dá pra renová-lo: em vez de
    // jogar na tela de login, abre com o usuário que já entrou neste aparelho
    // ("lembrar de mim"). Voltando a internet, pedimos o login de novo.
    const abrirComUsuarioDoAparelho = (): boolean => {
      if (navigator.onLine) return false;
      try {
        const raw = localStorage.getItem("rm_cached_user");
        const cached = storedUser || (raw ? JSON.parse(raw) : null);
        if (!cached?.id || !cached?.email) return false;
        offlineSessionActive = true;
        idAtual = cached.id;
        setUser(cached);
        setLoading(false);
        return true;
      } catch {
        return false;
      }
    };

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!session && abrirComUsuarioDoAparelho()) return;
        aplicarSessao(session);
      })
      .catch((err) => {
        console.error("Erro ao carregar sessão:", err);
        if (!abrirComUsuarioDoAparelho()) setLoading(false); // Destrava o loading
      });

    const aoVoltarOnline = () => {
      if (!offlineSessionActive) return;
      setTimeout(async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            offlineSessionActive = false;
            idAtual = null; // força aplicarSessao a registrar a sessão real
            aplicarSessao(session);
          } else {
            // Sem sessão do servidor: refaz o login sozinho com a senha guardada
            // no Keychain (só no app). Se não houver, pede o login de novo.
            const saved = await getSavedLogin();
            if (saved) {
              const { data, error } = await supabase.auth.signInWithPassword({ email: saved.email, password: saved.password });
              if (!error && data.session) {
                offlineSessionActive = false;
                idAtual = null;
                aplicarSessao(data.session);
                return;
              }
            }
            offlineSessionActive = false;
            idAtual = null;
            setUser(null);
            toast.info("Conexão voltou. Entre de novo com sua senha para sincronizar os dados.");
          }
        } catch {
          /* ainda sem rede de verdade: tenta no próximo evento */
        }
      }, 1500);
    };
    window.addEventListener("online", aoVoltarOnline);

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      aplicarSessao(session);
    });

    return () => {
      window.removeEventListener("online", aoVoltarOnline);
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
      // Senha conferida pelo servidor: guarda a impressão dela no aparelho pra
      // permitir entrar sem internet depois (ver lib/offlineLogin.ts).
      void rememberOfflineLogin(data.user, pass);
    }
    return data;
  };

  const signInOffline = (cachedUser: any) => {
    offlineSessionActive = true;
    setUser(cachedUser);
    setLoading(false);
  };

  const signOut = async () => {
    // Libera a vaga no teto global de sessões antes de derrubar o token.
    await releaseSessionSlot().catch(() => {});
    offlineSessionActive = false;
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
