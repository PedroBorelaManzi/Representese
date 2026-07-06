import { createContext, useContext, useEffect, useState, useMemo, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { User } from "@supabase/supabase-js";
import { posthog } from "../lib/posthog";

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
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          saveOfflineUser(session.user);
          posthog.identify(session.user.id, { email: session.user.email });
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
      } else {
        posthog.reset();
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
    await supabase.auth.signOut();
    localStorage.removeItem("rm_cached_user");
    sessionStorage.removeItem("rm_cached_user");
    localStorage.removeItem('has_completed_onboarding');
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
