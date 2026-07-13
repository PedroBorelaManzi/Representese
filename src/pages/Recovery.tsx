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
      console.debug("Token de recuperação detectado.");
    }
  }, []);

  const handleSendRecoveryEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      // Enviamos via edge function (Resend). A resposta é neutra de propósito:
      // o servidor não revela se o e-mail tem conta (anti-enumeração da base).
      const { data, error } = await supabase.functions.invoke('send-recovery', {
        body: { email, redirectTo: window.location.origin + '/recovery?reset=true' },
      });

      if (error) throw error;

      if (data?.success === false) {
        toast.error(data.message || "Não foi possível enviar o e-mail de recuperação.");
        return;
      }

      setEmailSent(true);
      toast.success("Se o e-mail estiver cadastrado, o link de recuperação chega em instantes!");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao enviar e-mail de recuperação.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

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
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast.success("Senha atualizada com sucesso! Faça login com sua nova senha.");
      navigate("/login");
    } catch (error: any) {
      toast.error(error?.message || "Erro ao atualizar senha.");
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans">
      {/* Background decorations */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.08),transparent)] pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-emerald-600/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-md w-full bg-white p-7 sm:p-10 rounded-[32px] border border-slate-100 shadow-2xl relative z-10">
        {/* Header: back button + centered logo */}
        <div className="flex items-center justify-between mb-8">
          <Link
            to="/login"
            className="flex items-center justify-center w-11 h-11 rounded-2xl bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-900 border border-slate-100 transition-all group active:scale-95"
            title="Voltar para o Login"
          >
            <ArrowLeft className="w-5 h-5 group-hover:-translate-x-0.5 transition-transform" />
          </Link>
          <Link to="/" className="flex items-center">
            <Logo size="md" showText={true} variant="light" />
          </Link>
          {/* Spacer to keep the logo visually centered against the back button */}
          <div className="w-11 h-11" aria-hidden="true" />
        </div>

        <AnimatePresence mode="wait">
          {!isResetting ? (
            !emailSent ? (
              <motion.div
                key="send-email"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="space-y-7"
              >
                <div className="space-y-2 text-center">
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Recuperar Senha</h2>
                  <p className="text-xs font-medium text-slate-400 leading-relaxed max-w-xs mx-auto">
                    Insira o e-mail da sua conta e enviaremos as instruções para redefinir sua senha.
                  </p>
                </div>

                <form onSubmit={handleSendRecoveryEmail} className="space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">E-mail Cadastrado</label>
                    <div className="relative group">
                      <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                        <Mail className="w-5 h-5" />
                      </div>
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-14 pr-5 py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                      />
                    </div>
                  </div>

                  <button
                    disabled={isLoading}
                    type="submit"
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.25em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Enviar Instruções
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                </form>
              </motion.div>
            ) : (
              <motion.div
                key="email-sent"
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                className="space-y-6 text-center"
              >
                <div className="w-20 h-20 rounded-[28px] bg-emerald-500/10 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-10 h-10 text-emerald-500" />
                </div>

                <div className="space-y-2">
                  <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">E-mail Enviado!</h2>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed">
                    Enviamos um link de recuperação para <span className="text-slate-900 font-bold">{email}</span>. Verifique sua caixa de entrada e a pasta de spam.
                  </p>
                </div>

                <Link
                  to="/login"
                  className="inline-block text-[10px] font-black text-emerald-600 uppercase tracking-widest hover:text-emerald-700 transition-colors pt-2"
                >
                  Voltar para o Login
                </Link>
              </motion.div>
            )
          ) : (
            <motion.div
              key="reset-password"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-7"
            >
              <div className="space-y-2 text-center">
                <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Nova Senha</h2>
                <p className="text-xs font-medium text-slate-400 leading-relaxed max-w-xs mx-auto">
                  Crie uma senha forte e segura para acessar sua conta.
                </p>
              </div>

              <form onSubmit={handleUpdatePassword} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      required
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-14 pr-14 py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
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
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] px-1">Confirmar Nova Senha</label>
                  <div className="relative group">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      required
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl pl-14 pr-5 py-4 text-sm font-bold outline-none focus:ring-4 focus:ring-emerald-500/10 focus:bg-white transition-all"
                    />
                  </div>
                </div>

                <button
                  disabled={isLoading}
                  type="submit"
                  className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase text-xs tracking-[0.25em] hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 group active:scale-[0.98] disabled:opacity-50"
                >
                  {isLoading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      Confirmar Nova Senha
                      <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
