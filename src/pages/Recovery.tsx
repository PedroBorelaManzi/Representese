import React, { useState, useEffect } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Check, 
  ArrowLeft, 
  Mail, 
  Lock, 
  Loader2, 
  ShieldCheck, 
  Sparkles,
  ChevronRight,
  Eye,
  EyeOff
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { Logo } from '../components/Logo';
import { cn } from '../lib/utils';

export default function Recovery() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  
  // Detect if we are in the password reset stage
  const isResetting = searchParams.get("reset") === "true" || window.location.hash.includes("access_token");

  // If redirected with hash token, Supabase automatically sets the session
  useEffect(() => {
    if (window.location.hash.includes("access_token")) {
      // Just log or ensure we are ready
      console.debug("Token de recuperação detectado.");
    }
  }, []);

  const handleSendRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/recovery?reset=true',
      });
      if (error) throw error;
      
      setEmailSent(true);
      toast.success("E-mail de recuperação enviado com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao enviar e-mail de recuperação.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const isLength = newPassword.length >= 8;
    const isUppercase = /[A-Z]/.test(newPassword);
    const isNumber = /[0-9]/.test(newPassword);
    const isSpecial = /[^A-Za-z0-9]/.test(newPassword);

    if (!isLength || !isUppercase || !isNumber || !isSpecial) {
      toast.error("A senha não atende a todos os requisitos de segurança!");
      return;
    }

    if (newPassword !== confirmPassword) {
      toast.error("As senhas não coincidem!");
      return;
    }

    setIsLoading(true);
    try {
      // Verifica se a senha nova é a mesma da atual fazendo um signIn rápido (já que ele não sabe a atual, mas podemos testar)
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: newPassword
      });

      if (!signInError && signInData.session) {
        toast.error("A nova senha não pode ser igual à senha atual.");
        setIsLoading(false);
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      
      toast.success("Senha atualizada com sucesso! Por favor, faça login com sua nova senha.");
      navigate("/login");
    } catch (error: any) {
      toast.error(error.message || "Erro ao atualizar senha.");
    } finally {
      setIsLoading(false);
    }
  };

  // Password requirements calculation
  const isLength = newPassword.length >= 8;
  const isUppercase = /[A-Z]/.test(newPassword);
  const isNumber = /[0-9]/.test(newPassword);
  const isSpecial = /[^A-Za-z0-9]/.test(newPassword);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-md w-full bg-white p-8 md:p-12 rounded-[40px] border border-slate-100/50 shadow-2xl relative z-10 space-y-10">
        <Link 
          to="/login" 
          className="absolute top-6 left-6 flex items-center justify-center p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 border border-slate-100/50 transition-all group z-50 hover:scale-105 active:scale-95 shadow-sm"
          title="Voltar para o Login"
        >
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
        </Link>

        <div className="flex justify-center pt-4">
          <Link to="/">
            <Logo size="lg" showText={true} variant="light" />
          </Link>
        </div>

        <AnimatePresence mode="wait">
          {!isResetting ? (
            !emailSent ? (
              <motion.div
                key="send-email"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15 }}
                className="space-y-8"
              >
                <div className="space-y-3 text-center">
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Recuperar Senha</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                    Insira seu e-mail abaixo e enviaremos as instruções de redefinição de senha.
                  </p>
                </div>

                <form onSubmit={handleSendRecoveryEmail} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-4">E-mail Cadastrado</label>
                    <div className="relative group">
                      <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                        <Mail className="w-5 h-5" />
                      </div>
                      <input 
                        required
                        type="email" 
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-8 py-5 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" 
                      />
                    </div>
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
                        Enviar Instruções
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="email-sent"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-8 text-center"
              >
                <div className="w-20 h-20 rounded-[32px] bg-emerald-500/10 flex items-center justify-center mx-auto mb-6">
                  <ShieldCheck className="w-10 h-10 text-emerald-500" />
                </div>
                
                <div className="space-y-3">
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">E-mail Enviado!</h2>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    Enviamos um link de recuperação para <span className="text-slate-900 font-bold">{email}</span>. Verifique sua caixa de entrada e spam.
                  </p>
                </div>

                <div className="pt-6">
                  <Link 
                    to="/login" 
                    className="text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors"
                  >
                    Voltar para o Login
                  </Link>
                </div>
              </motion.div>
            )
          ) : (
            <motion.div
              key="reset-password"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="space-y-3 text-center">
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Nova Senha</h2>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-relaxed">
                  Crie uma senha forte e segura de acesso.
                </p>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-4">Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input 
                      required
                      type={showPassword ? "text" : "password"} 
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-16 py-5 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" 
                    />
                    <button 
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>

                  {/* Password requirements */}
                  <div className="grid grid-cols-2 gap-2 mt-3 px-3 py-3 bg-slate-50 rounded-2xl border border-slate-100">
                    {[
                      { label: "Mínimo de 8 caracteres", met: isLength },
                      { label: "Uma letra maiúscula", met: isUppercase },
                      { label: "Um número", met: isNumber },
                      { label: "Um caractere especial", met: isSpecial },
                    ].map((item, i) => (
                      <div key={i} className="flex items-center gap-2 px-1">
                        <div className={cn(
                          "w-3.5 h-3.5 rounded-full flex items-center justify-center transition-colors shrink-0",
                          item.met ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400"
                        )}>
                          <Check className="w-2.5 h-2.5" />
                        </div>
                        <span className={cn(
                          "text-[8px] font-black uppercase tracking-wider transition-colors leading-none",
                          item.met ? "text-emerald-600" : "text-slate-400"
                        )}>{item.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-4">Confirmar Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input 
                      required
                      type="password" 
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-[24px] pl-16 pr-8 py-5 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all" 
                    />
                  </div>
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
                      Confirmar Nova Senha
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-2 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-center pt-4">
          <p className="text-[8px] font-black text-slate-300 uppercase tracking-[0.5em] whitespace-nowrap">
            
          </p>
        </div>
      </div>
    </div>
  );
}
