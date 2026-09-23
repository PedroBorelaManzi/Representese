import React, { useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Mail, User, Phone, Building2, Loader2, ArrowRight, Lock, Eye, EyeOff, Check } from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { useAuth } from "../contexts/AuthContext";
import { isValidPhone, formatPhone } from "../lib/validators";
import { cn } from "../lib/utils";
import { usePageMeta } from "../hooks/usePageMeta";
import { saveLeadData } from "../lib/leadStorage";
import { isIOSApp } from "../lib/iapPolicy";
import { checkPassword, PASSWORD_MIN_LENGTH } from "../lib/passwordPolicy";

function PasswordRequirement({ label, met }: { label: string; met: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={cn("w-4 h-4 rounded-full flex items-center justify-center transition-all", met ? "bg-emerald-500 text-white" : "bg-slate-200 dark:bg-zinc-700 text-slate-400")}>
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      </div>
      <span className={cn("text-[11px] font-bold", met ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400")}>{label}</span>
    </div>
  );
}

export default function Register() {
  usePageMeta(
    "Criar Conta Grátis",
    "Cadastre-se gratuitamente no Represente-Se! e comece a organizar sua carteira de clientes como representante comercial.",
    "/register"
  );
  const iosApp = isIOSApp();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [aceitouTermos, setAceitouTermos] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  // Se já estiver logado (cliente com conta ativa), pula direto pros planos.
  // Precisa ser <Navigate>: chamar navigate() durante a renderização atualiza
  // outro componente no meio do render e o React reclama.
  if (user) {
    return <Navigate to="/planos" replace />;
  }

  const cleanPhone = phone.replace(/\D/g, "");
  const isPhoneValid = isValidPhone(cleanPhone);
  const showPhoneError = cleanPhone.length >= 10 && !isPhoneValid;
  const passwordChecks = checkPassword(password);
  const isPasswordValid = Object.values(passwordChecks).every(Boolean);
  const isFormValid = iosApp
    ? name.trim().length >= 3 && email.trim() && isPhoneValid && isPasswordValid && aceitouTermos
    : name.trim().length >= 3 && email.trim() && isPhoneValid;

  // No iOS não existe o formulário de checkout do Asaas (CPF/CNPJ, endereço,
  // cartão) — a assinatura é via In-App Purchase, então a conta é criada
  // aqui mesmo, sem cobrança nenhuma. A pessoa entra como lead
  // (plan_id='none', subscription_status='inactive', ver a trigger
  // handle_new_user_entitlement) e escolhe/compra o plano em /planos, que
  // já mostra os preços e o botão de IAP.
  const handleSubmitIOS = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: name.trim(),
            phone,
            company: company.trim() || undefined,
            termos_aceitos_em: new Date().toISOString(),
          },
        },
      });
      if (error) {
        const m = error.message.toLowerCase();
        throw new Error(m.includes("already") || m.includes("duplicate") ? "E-mail já cadastrado. Faça login." : error.message);
      }
      toast.success("Conta criada! Agora escolha o seu plano.");
      navigate("/planos");
    } catch (err: any) {
      toast.error(err.message || "Erro ao criar sua conta");
    } finally {
      setIsLoading(false);
    }
  };

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

      // Pro Checkout reaproveitar (nome/e-mail/telefone), em vez de pedir
      // tudo de novo do zero minutos depois.
      saveLeadData({ name: name.trim(), email: email.trim(), phone, company: company.trim() || undefined });

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

      {/* Atalho discreto pra quem só quer ver os planos sem preencher o
          cadastro — /planos já é uma rota pública, então isso não pula
          nenhuma checagem, só evita esse formulário de captura de lead.
          No iOS não existe: sem conta criada aqui, não tem como comprar
          via IAP em /planos. */}
      {!iosApp && (
        <Link to="/planos" className="absolute top-6 right-6 text-slate-300 hover:text-slate-400 dark:text-zinc-700 dark:hover:text-zinc-500 transition-colors text-[11px] font-normal z-10">
          pular
        </Link>
      )}

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
              {iosApp ? "Crie sua conta" : "Ver planos disponíveis"}
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium">
              {iosApp ? "Leva menos de um minuto. Depois é só escolher o plano." : "Deixe seu contato para liberar o acesso aos planos"}
            </p>
          </div>

          <form onSubmit={iosApp ? handleSubmitIOS : handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="register-name" className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                Nome completo *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  id="register-name"
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
              <label htmlFor="register-phone" className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                WhatsApp *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Phone className="w-5 h-5" />
                </div>
                <input
                  id="register-phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  className={cn(
                    "w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border rounded-2xl text-sm font-medium focus:ring-2 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600",
                    showPhoneError
                      ? "border-red-400 focus:ring-red-500/20 focus:border-red-500"
                      : "border-slate-200 dark:border-zinc-800 focus:ring-emerald-500/20 focus:border-emerald-500"
                  )}
                  placeholder="(00) 00000-0000"
                  required
                />
              </div>
              {showPhoneError && (
                <p className="text-[12px] text-red-500 font-bold pt-1 ml-1">
                  Informe um WhatsApp válido, com DDD (ex: (11) 98765-4321)
                </p>
              )}
            </div>

            {/* Apple rejeitou a v1.78 (guideline 3.1.1) por este campo aparecer
                na tela de criação de conta como se fosse um cadastro de conta
                para empresas/organizações. Ele nunca foi um tipo de conta —
                só metadado de lead pro CRM — mas some no app iOS (App Store
                review) e continua no site/Android, onde não é revisado. */}
            {!iosApp && (
              <div className="space-y-1.5">
                <label htmlFor="register-company" className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                  Empresas que você trabalha (Opcional)
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <input
                    id="register-company"
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                    placeholder="Ex: Empresa A, Empresa B..."
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="register-email" className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                E-mail *
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                  <Mail className="w-5 h-5" />
                </div>
                <input
                  id="register-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-11 pr-4 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                  placeholder="voce@empresa.com.br"
                  required
                />
              </div>
            </div>

            {iosApp && (
              <>
                <div className="space-y-1.5">
                  <label htmlFor="register-password" className="text-[13px] font-bold text-slate-700 dark:text-zinc-300 ml-1">
                    Crie uma senha forte *
                  </label>
                  <div className="relative group">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-slate-400 group-focus-within:text-emerald-500 transition-colors">
                      <Lock className="w-5 h-5" />
                    </div>
                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-11 pr-12 py-3.5 bg-slate-50 dark:bg-zinc-950/50 border border-slate-200 dark:border-zinc-800 rounded-2xl text-sm font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all dark:text-white placeholder:text-slate-400 dark:placeholder:text-zinc-600"
                      placeholder="••••••••"
                      required
                    />
                    <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {password && (
                    <div className="grid grid-cols-2 gap-2.5 pt-2.5">
                      <PasswordRequirement label={`Mín. ${PASSWORD_MIN_LENGTH} caracteres`} met={passwordChecks.length} />
                      <PasswordRequirement label="Letra maiúscula" met={passwordChecks.upper} />
                      <PasswordRequirement label="Letra minúscula" met={passwordChecks.lower} />
                      <PasswordRequirement label="Número" met={passwordChecks.number} />
                      <PasswordRequirement label="Símbolo especial" met={passwordChecks.symbol} />
                    </div>
                  )}
                </div>

                <label className="flex items-start gap-3 px-1 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aceitouTermos}
                    onChange={(e) => setAceitouTermos(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 cursor-pointer"
                  />
                  <span className="text-[13px] text-slate-600 dark:text-zinc-400 leading-snug">
                    Li e aceito os{" "}
                    <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-600 hover:underline">
                      Termos de Serviço
                    </a>{" "}
                    e a{" "}
                    <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-600 hover:underline">
                      Política de Privacidade
                    </a>
                    .
                  </span>
                </label>
              </>
            )}

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
                  {iosApp ? "Criar Conta" : "Ver Planos Disponíveis"}
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
