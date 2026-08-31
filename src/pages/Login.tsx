import React, { useState, useEffect } from "react";
import { 
  motion, 
  AnimatePresence,
  useScroll, 
  useMotionValueEvent 
} from "framer-motion";
import { 
  Check,
  ArrowLeft, 
  Mail, 
  HelpCircle, 
  Building2, 
  ShoppingCart, 
  Plus as PlusIcon, 
  Stethoscope, 
  Briefcase,
  Zap,
  TrendingUp,
  Layout as LayoutIcon,
  ShieldCheck,
  Store,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Lock,
  Eye,
  EyeOff,
  Loader2
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, useNavigate, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { isIOSApp } from "../lib/iapPolicy";
import { toast } from "sonner";
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Fingerprint } from 'lucide-react';
import { reportException } from '../lib/sentry';
import { usePageMeta } from '../hooks/usePageMeta';

/* O usuário não deve nunca ver um erro cru do GoTrue/Supabase (ex.:
   "Database error querying schema") sem explicação — já aconteceu de um
   erro interno de infraestrutura (colunas de token NULL na auth.users)
   vazar pro toast sem dizer nada útil. Esta função sempre devolve uma
   mensagem em português que explica o que aconteceu; o detalhe técnico
   real vai pro Sentry/console, nunca é escondido, só não é jogado cru
   na cara do usuário. */
function getFriendlyAuthErrorMessage(error: any): string {
  const rawMessage: string = error?.message || '';
  const lower = rawMessage.toLowerCase();

  if (lower.includes('failed to fetch') || lower.includes('network')) {
    return 'Erro de conexão. Verifique sua internet ou use o Acesso Biométrico.';
  }
  if (error?.status === 400 || lower.includes('invalid login credentials') || lower.includes('invalid')) {
    return 'Senha ou e-mail incorreto. Tente novamente.';
  }
  if (lower.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
  }
  if (lower.includes('too many requests') || error?.status === 429) {
    return 'Muitas tentativas em pouco tempo. Aguarde um instante e tente novamente.';
  }
  if (error?.status && error.status >= 500) {
    return 'Nosso sistema de login está com um problema técnico no momento. Já fomos notificados — tente novamente em alguns minutos.';
  }

  return rawMessage
    ? `Não foi possível entrar: ${rawMessage}`
    : 'Não foi possível entrar por um motivo desconhecido. Tente novamente ou contate o suporte.';
}

const features = [
  {
    icon: Building2,
    title: "Multi-empresas",
    desc: "Carteira de todas as representadas"
  },
  {
    icon: TrendingUp,
    title: "Comissões",
    desc: "Cálculo automático por empresa"
  },
  {
    icon: ShieldCheck,
    title: "Offline First",
    desc: "Funciona sem internet no campo"
  }
];

export default function Login() {
  usePageMeta(
    "Entrar",
    "Acesse sua conta Represente-Se! e gerencie sua carteira de clientes, pedidos e agenda em um só lugar.",
    "/login"
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { user, signIn, signInOffline } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Rota que o usuário tentou abrir antes de cair aqui (guardada pelo
  // ProtectedRoute). Sem isso, link direto para um cliente sempre terminava
  // na home do painel.
  const destinoAposLogin = (location.state as { from?: { pathname?: string } } | null)
    ?.from?.pathname || "/dashboard";

  const [isBiometricAvailable, setIsBiometricAvailable] = useState(false);

  useEffect(() => {
    const checkBiometrics = async () => {
      try {
        const result = await NativeBiometric.isAvailable();
        if (result.isAvailable) {
          const isEnabled = localStorage.getItem("rm_biometric_enabled") === "true";
          if (isEnabled) {
            setIsBiometricAvailable(true);
            setTimeout(() => {
              handleBiometricLogin();
            }, 800);
          }
        }
      } catch (e) {
        console.debug("Biometria não suportada na web");
      }
    };
    checkBiometrics();
  }, []);

  // Quem já tem sessão não deve ficar preso na tela de senha — acontecia com
  // quem acabava de se cadastrar no checkout e era mandado para cá.
  if (user) {
    return <Navigate to={destinoAposLogin} replace />;
  }

  const handleBiometricLogin = async () => {
    try {
      localStorage.setItem("rm_remember_me", rememberMe ? "true" : "false");

      await NativeBiometric.verifyIdentity({
        reason: "Autentique-se para entrar de forma rápida",
        title: "Acesso Biométrico",
        subtitle: "Use a digital ou Face ID",
        description: "Confirme sua identidade para entrar no Representese!",
        maxAttempts: 3,
      });

      const creds = await NativeBiometric.getCredentials({
        server: "representese.app",
      });

      if (creds && creds.username && creds.password) {
        setIsLoading(true);

        const isOnline = navigator.onLine;

        if (isOnline) {
          try {
            await signIn(creds.username, creds.password);
            toast.success("Autenticado via Biometria!");
            navigate(destinoAposLogin, { replace: true });
            return;
          } catch (onlineError) {
            console.warn("Online sign in failed, trying offline fallback...", onlineError);
          }
        }

        // Offline fallback
        const cachedUserStr = localStorage.getItem("rm_cached_user") || sessionStorage.getItem("rm_cached_user");
        if (cachedUserStr) {
          const cachedUser = JSON.parse(cachedUserStr);
          if (cachedUser && cachedUser.email === creds.username) {
            signInOffline(cachedUser);
            toast.success("Autenticado offline via Biometria!");
            navigate(destinoAposLogin, { replace: true });
            return;
          }
        }
        
        throw new Error("Usuário não encontrado localmente ou credenciais incompatíveis.");
      }
    } catch (error: any) {
      console.error("Biometric failed", error);
      toast.error(error.message || "Falha na autenticação biométrica. Digite sua senha.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    localStorage.setItem("rm_remember_me", rememberMe ? "true" : "false");

    const isOnline = navigator.onLine;
    
    if (!isOnline) {
      const cachedUserStr = localStorage.getItem("rm_cached_user") || sessionStorage.getItem("rm_cached_user");
      if (cachedUserStr) {
        const cachedUser = JSON.parse(cachedUserStr);
        if (cachedUser && cachedUser.email === email) {
          try {
            const result = await NativeBiometric.isAvailable();
            if (result.isAvailable) {
              const isEnabled = localStorage.getItem("rm_biometric_enabled") === "true";
              if (isEnabled) {
                const creds = await NativeBiometric.getCredentials({
                  server: "representese.app",
                });
                if (creds && creds.username === email && creds.password === password) {
                  signInOffline(cachedUser);
                  toast.success("Autenticado offline!");
                  navigate(destinoAposLogin, { replace: true });
                  setIsLoading(false);
                  return;
                }
              }
            }
          } catch (biometricErr) {
            console.error("Biometric verification offline failed:", biometricErr);
          }
        }
      }
      
      toast.error("Senha ou e-mail incorreto. Tente novamente.");
      setIsLoading(false);
      return;
    }

    try {
      await signIn(email, password);
      toast.success("Bem-vindo de volta!");
      navigate(destinoAposLogin, { replace: true });
    } catch (error: any) {
      console.error('Erro ao fazer login:', error);
      reportException(error, { tags: { origem: 'Login_handleLogin' } });
      toast.error(getFriendlyAuthErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch overflow-hidden font-sans [color-scheme:light]">
      <div className="w-full lg:w-[45%] bg-white p-8 md:p-16 lg:p-24 flex flex-col justify-center relative z-10 shadow-2xl">
        <Link to="/landing" className="absolute top-6 left-6 md:top-8 md:left-8 flex items-center justify-center p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 border border-slate-100/50 transition-all group z-50 hover:scale-105 active:scale-95 shadow-sm" title="Voltar para a página inicial"><ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" /></Link>
        <div className="max-w-md mx-auto w-full space-y-12">
          <div className="flex justify-center">
            <Link to="/landing">
              <Logo size="lg" showText={true} variant="light" />
            </Link>
          </div>

          <div className="space-y-4 text-center">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">
              Acesse sua conta para gerenciar sua carteira de clientes
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="login-email" className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-4">E-mail</label>
              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="login-email"
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-8 py-5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-4">
                <label htmlFor="login-password" className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Senha</label>
                <Link to="/recovery" className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors">Esqueci a senha</Link>
              </div>
              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="login-password"
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-16 py-5 text-sm font-bold text-slate-900 outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" 
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div className="flex items-center px-4">
              <input
                id="remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 text-emerald-600 bg-slate-200 border-slate-300 rounded focus:ring-emerald-500 focus:ring-2 cursor-pointer"
              />
              <label htmlFor="remember" className="ml-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest cursor-pointer">
                Mantenha-me conectado
              </label>
            </div>

            <button 
              disabled={isLoading}
              type="submit" 
              className="w-full bg-slate-900 text-white py-6 rounded-[32px] font-black uppercase text-xs tracking-[0.3em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-4 group active:scale-95 disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Entrar na Dashboard
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                </>
              )}
            </button>

            {/* Único caminho de biometria: as credenciais são gravadas em
                Configurações → Segurança/Celular no server "representese.app".
                Havia um segundo botão vindo do hook useBiometric, que lia de um
                server diferente ("representese") onde nada nunca era gravado. */}
            {isBiometricAvailable && (
              <button
                type="button"
                onClick={handleBiometricLogin}
                className="w-full mt-4 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400 py-5 rounded-[32px] font-black uppercase text-xs tracking-[0.2em] hover:bg-emerald-100 transition-all border border-emerald-100 dark:border-emerald-900/30 flex items-center justify-center gap-3 active:scale-95"
              >
                <Fingerprint className="w-5 h-5" />
                Acessar com Biometria
              </button>
            )}
          </form>

          <div className="pt-12 text-center">
            <p className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 mt-2">
              {isIOSApp() ? (
                <>Ainda não tem conta? Crie a sua em representese.com pelo navegador.</>
              ) : (
                <>
                  Não tem uma conta ainda?{" "}
                  <Link to="/register" className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline">
                    Crie sua conta
                  </Link>
                </>
              )}
            </p>
          </div>
        </div>

      </div>

      <div className="hidden lg:flex lg:w-[55%] bg-slate-900 relative items-center justify-center p-24 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.1),transparent)]" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/10 blur-[120px] rounded-full" />
        
        <div className="max-w-xl w-full relative z-10 space-y-16">
          <div className="space-y-10">
            <div className="space-y-6">
              <h2 className="text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-none">
                O futuro da <br />
                <span className="text-emerald-500">Representação</span>
              </h2>
              <p className="text-lg text-slate-400 font-medium leading-relaxed">
                Centralize sua operação, automatize sua burocracia e foque no que realmente importa: <span className="text-white">Fechar Negócios.</span>
              </p>
            </div>

            <div className="grid grid-cols-3 gap-6">
              {features.map((feature, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * idx }}
                  className="bg-white/5 p-8 rounded-[40px] border border-white/10 backdrop-blur-md group hover:bg-white/10 transition-all duration-500"
                >
                  <div className="w-12 h-12 rounded-[20px] bg-emerald-500/10 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                    <feature.icon className="w-6 h-6 text-emerald-500" />
                  </div>
                  <h3 className="text-sm font-black text-white uppercase tracking-tighter mb-1">{feature.title}</h3>
                  <p className="text-[10px] font-medium text-slate-500 leading-tight">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>

          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white p-10 rounded-[48px] shadow-2xl relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-emerald-500/5" />
            <div className="relative space-y-5">
              <div className="flex items-center gap-2 text-emerald-600">
                <TrendingUp className="w-4 h-4" />
                <p className="text-[10px] font-black uppercase tracking-widest">Faturamento por empresa</p>
              </div>
              {[
                { name: 'Empresa A', pct: 78 },
                { name: 'Empresa B', pct: 52 },
                { name: 'Empresa C', pct: 30 },
              ].map((row) => (
                <div key={row.name} className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-black text-slate-500 uppercase tracking-tight">
                    <span>{row.name}</span>
                  </div>
                  <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${row.pct}%` }}
                      transition={{ duration: 0.8, ease: 'easeOut' }}
                      className="h-full bg-emerald-500 rounded-full"
                    />
                  </div>
                </div>
              ))}
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pt-2 border-t border-slate-100">
                Relatórios, comissões e follow-up automáticos — direto no seu painel
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
