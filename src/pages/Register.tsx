import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Mail,
  Lock,
  User,
  Phone,
  Building2,
  Loader2,
  ArrowRight,
  Eye,
  EyeOff,
  Check
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { passwordStrength } from "../lib/validators";
import { cn } from "../lib/utils";

function Requirement({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center transition-all duration-300", met ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400 dark:bg-zinc-800 dark:text-zinc-500")}>
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      </div>
      <span className={cn("text-[11px] font-bold transition-colors", met ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400 dark:text-zinc-500")}>{label}</span>
    </div>
  );
}

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  const [passwordRequirements, setPasswordRequirements] = useState({
    length: false, upper: false, lower: false, number: false, special: false
  });

  React.useEffect(() => {
    setPasswordRequirements({
      length: password.length >= 8,
      upper: /[A-Z]/.test(password),
      lower: /[a-z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[!@#$%^&*(),.?":{}|<>]/.test(password)
    });
  }, [password]);

  const isPasswordValid = Object.values(passwordRequirements).every(req => req);

  // Se já estiver logado, manda pros planos
  if (user) {
    navigate("/planos", { replace: true });
    return null;
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name || !email || !phone || !password) {
      toast.error("Preencha os campos obrigatórios");
      return;
    }

    if (!isPasswordValid) {
      toast.error("A senha não atende aos requisitos de segurança");
      return;
    }

    setIsLoading(true);

    try {
      // Cria a conta no Supabase Auth e salva metadados que a Trigger vai ler
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            phone: phone,
            company: company,
          },
        },
      });

      if (error) {
        if (error.message.includes("User already registered")) {
          toast.error("Este e-mail já possui uma conta. Faça o login!");
          navigate("/login");
        } else {
          toast.error(error.message);
        }
        return;
      }

      if (data?.user) {
        toast.success("Conta criada! Agora escolha o seu plano.");
        // Como o signup já loga o usuário automaticamente (se não tiver verificação de email ativada),
        // redirecionamos para a tela de planos, onde ele finaliza o fluxo (assinatura).
        navigate("/planos");
      }
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar conta");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 flex flex-col items-center justify-center p-4 selection:bg-emerald-100 selection:text-emerald-900 font-sans">
      <Link to="/" className="absolute top-6 left-6 flex items-center gap-2 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors text-sm font-semibold group z-10">
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        Voltar para a página inicial
      </Link>

      <div className="w-full max-w-md">
        <div className="flex justify-center mb-10">
          <Logo size="lg" showText />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-8 sm:p-10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.05)]"
        >
          <div className="text-center space-y-2 mb-8">
            <h1 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
              Crie sua conta
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">
              Preencha os dados abaixo para ter acesso aos planos.
            </p>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                Nome completo *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                  placeholder="Ex: João da Silva"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                WhatsApp *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                  placeholder="(00) 00000-0000"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                Empresas que você trabalha (Opcional)
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Building2 className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                  placeholder="Ex: Empresa A, Empresa B..."
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                E-mail corporativo *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                  placeholder="voce@empresa.com.br"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                Crie uma senha forte *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                  placeholder="••••••••"
                  required
                />
                <button 
                  type="button" 
                  onClick={() => setShowPassword(!showPassword)} 
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              {/* Barra de força da senha */}
              {password && (() => {
                const strength = passwordStrength(password);
                const colors = ['bg-red-500', 'bg-red-400', 'bg-amber-400', 'bg-emerald-400', 'bg-emerald-500'];
                const textColors = ['text-red-500', 'text-red-400', 'text-amber-500', 'text-emerald-500', 'text-emerald-600', 'dark:text-emerald-400'];
                return (
                  <div className="pt-2 px-1" aria-live="polite">
                    <div className="flex gap-1.5">
                      {[1, 2, 3, 4].map((i) => (
                        <div key={i} className={cn(
                          "h-1.5 flex-1 rounded-full transition-colors duration-300",
                          strength.score >= i ? colors[strength.score] : "bg-slate-200 dark:bg-zinc-800"
                        )} />
                      ))}
                    </div>
                    <p className={cn("text-[11px] font-bold pt-1.5 transition-colors", textColors[strength.score] || textColors[4])}>
                      Força da senha: {strength.label}
                    </p>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2.5 pt-2.5 px-1">
                <Requirement label="Mín. 8 caracteres" met={passwordRequirements.length} />
                <Requirement label="Letra maiúscula" met={passwordRequirements.upper} />
                <Requirement label="Letra minúscula" met={passwordRequirements.lower} />
                <Requirement label="Número" met={passwordRequirements.number} />
                <Requirement label="Símbolo especial" met={passwordRequirements.special} />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-4 group"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Ver Planos Disponíveis
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </form>
        </motion.div>

        <p className="text-center mt-8 text-[13px] font-medium text-slate-500 dark:text-zinc-400">
          Já tem uma conta?{" "}
          <Link
            to="/login"
            className="text-emerald-600 dark:text-emerald-400 font-bold hover:underline"
          >
            Faça login
          </Link>
        </p>
      </div>
    </div>
  );
}
