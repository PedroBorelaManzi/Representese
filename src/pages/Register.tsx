import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, User, Phone, Building2, Loader2, ArrowRight } from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { isValidPhone, formatPhone } from "../lib/validators";
import { cn } from "../lib/utils";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Se já estiver logado (cliente com conta ativa), pula direto pros planos
  if (user) {
    navigate("/planos", { replace: true });
    return null;
  }

  const cleanPhone = phone.replace(/\D/g, "");
  const isFormValid = name.trim().length >= 3 && email.trim() && isValidPhone(cleanPhone);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name || !email || !phone) {
      toast.error("Preencha todos os campos");
      return;
    }

    if (!isValidPhone(cleanPhone)) {
      toast.error("Informe um WhatsApp válido");
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase.rpc("upsert_lead", {
        p_name: name.trim(),
        p_email: email.trim(),
        p_phone: phone,
        p_company: company.trim() || null,
      });

      if (error) throw error;

      toast.success("Agora escolha o seu plano!");
      navigate("/planos");
    } catch (err: any) {
      toast.error(err.message || "Erro ao salvar seus dados");
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
              Ver planos disponíveis
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">
              Deixe seu contato para liberar o acesso aos planos
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
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
                E-mail *
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

            <button
              type="submit"
              disabled={isLoading || !isFormValid}
              className={cn(
                "w-full bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white py-4 rounded-2xl font-black text-sm transition-all shadow-xl shadow-emerald-600/20 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-2 mt-4 group"
              )}
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
