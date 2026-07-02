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
  Star,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Lock,
  Eye,
  EyeOff,
  Loader2
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useBiometric } from "../hooks/useBiometric";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { Fingerprint } from 'lucide-react';

const features = [
  {
    icon: ShieldCheck,
    title: "Segurança Total",
    desc: "Criptografia avançada"
  },
  {
    icon: Zap,
    title: "Agilidade",
    desc: "Interface ultra-rápida"
  },
  {
    icon: LayoutIcon,
    title: "Organização",
    desc: "Gestão completa"
  }
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { isAvailable, isEnabled, setupBiometric, authenticate } = useBiometric();
  const { signIn, signInOffline, user } = useAuth();
  const navigate = useNavigate();

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
            navigate("/dashboard");
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
            navigate("/dashboard");
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
                  navigate("/dashboard");
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
      navigate("/dashboard");
    } catch (error: any) {
      if (error.message && error.message.includes("Failed to fetch")) {
        toast.error("Erro de conexão. Verifique sua internet ou use o Acesso Biométrico.");
      } else if (error.status === 400 || (error.message && error.message.toLowerCase().includes("invalid"))) {
        toast.error("Senha ou e-mail incorreto. Tente novamente.");
      } else {
        toast.error(error.message || "Erro ao entrar");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-stretch overflow-hidden font-sans">
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
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-4">E-mail</label>
              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  required
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-8 py-5 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" 
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center px-4">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Senha</label>
                <Link to="/recovery" className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors">Esqueci a senha</Link>
              </div>
              <div className="relative group">
                <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  required
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-16 py-5 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" 
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

            {isAvailable && isEnabled && (
              <button
                type="button"
                onClick={async () => {
                  const success = await authenticate();
                  if (success) navigate('/dashboard');
                  else toast.error('Falha na biometria');
                }}
                className="w-full flex items-center justify-center gap-2 py-4 bg-slate-100 dark:bg-zinc-800 text-emerald-600 dark:text-emerald-400 rounded-[24px] font-black uppercase text-xs tracking-widest mt-4"
              >
                <Fingerprint className="w-5 h-5" />
                Login com Biometria
              </button>
            )}

          <div className="pt-12 text-center">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              Ainda não tem conta? <br />
              <Link to="/planos" className="text-emerald-600 font-black mt-2 inline-block hover:text-emerald-700">Comece seu teste grátis agora</Link>
            </p>
          </div>
        </div>

        <div className="mt-auto pt-16 pb-8 text-center">
           <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] whitespace-nowrap">
              
           </p>
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
            className="bg-white p-12 rounded-[64px] space-y-8 shadow-2xl relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="relative space-y-6">
              <div className="flex gap-1">
                {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
              </div>
              <p className="text-xl font-medium italic text-slate-900 leading-relaxed">
                "O controle que tenho hoje sobre minha carteira de clientes é algo que eu nunca imaginei ser possível."
              </p>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-slate-900 flex items-center justify-center font-black text-sm text-white">RM</div>
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase tracking-widest">Ricardo Moreira</p>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Representante Comercial</p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
