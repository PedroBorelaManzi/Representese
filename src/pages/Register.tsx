import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Check, 
  Zap, 
  Shield, 
  Star, 
  Building2, 
  Users2, 
  Map as MapIcon, 
  ArrowRight,
  Sparkles,
  Infinity,
  Trophy,
  Crown,
  Gem,
  ChevronLeft,
  Mail,
  Lock,
  User as UserIcon,
  CheckCircle2,
  Box,
  BarChart3
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { toast } from "sonner";
import { Logo } from '../components/Logo';
import { cn } from "../lib/utils";
import { plans } from "../lib/plansData";
import { PlanCards } from "../components/plans/PlanCards";



const PasswordRequirementsDisplay = ({ requirements }: { requirements: any }) => {
  const items = [
    { label: "Mínimo de 8 caracteres", met: requirements.length },
    { label: "Uma letra maiúscula", met: requirements.uppercase },
    { label: "Um número", met: requirements.number },
    { label: "Um caractere especial", met: requirements.special },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 mt-4 px-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className={cn(
            "w-4 h-4 rounded-full flex items-center justify-center transition-colors",
            item.met ? "bg-emerald-500 text-white" : "bg-slate-100 dark:bg-zinc-800 text-slate-300"
          )}>
            <Check className="w-3 h-3" />
          </div>
          <span className={cn(
            "text-[9px] font-bold uppercase tracking-tight transition-colors",
            item.met ? "text-emerald-600" : "text-slate-400"
          )}>{item.label}</span>
        </div>
      ))}
    </div>
  );
};

const Register = () => {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [step, setStep] = useState(1);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [passwordRequirements, setPasswordRequirements] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false
  });

  useEffect(() => {
    setPasswordRequirements({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password)
    });
  }, [password]);


  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            selected_plan: selectedPlan,
          }
        }
      });

      if (error) throw error;

      if (data.user && data.session) {
        toast.success("Conta criada com sucesso!");
        navigate("/dashboard");
      } else {
        toast.success("Verifique seu e-mail para confirmar o cadastro.");
        setStep(3);
      }
    } catch (error) {
      toast.error(error.message || "Erro ao criar conta");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-50 dark:bg-zinc-950 transition-colors duration-500 overflow-x-hidden relative">
      <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-emerald-100/30 dark:bg-emerald-900/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-50/30 dark:bg-emerald-950/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-12 relative z-10">
        <div className="flex justify-between items-center mb-16">
          <button 
            onClick={() => step > 1 ? setStep(step - 1) : navigate("/landing")} 
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-zinc-900 rounded-xl text-slate-500 hover:text-emerald-600 transition-all border border-slate-100 dark:border-zinc-800"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="text-[10px] font-black uppercase tracking-widest">Voltar</span>
          </button>
          <Logo showText={true} />
          <div className="w-20" />
        </div>

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              <div className="text-center space-y-4">
                <h1 className="text-5xl md:text-6xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">
                  Selecione o plano ideal para o <span className="text-emerald-600">seu negócio</span>
                </h1>
                <p className="text-slate-500 dark:text-zinc-400 font-bold uppercase text-xs tracking-widest">
                  Selecione o plano que melhor se adapta à sua realidade atual.
                </p>
              </div>

              {/* 7-Day Guarantee Prominently at the Top */}
              <div className="max-w-2xl mx-auto relative">
                <div className="p-5 md:p-6 bg-emerald-500/10 dark:bg-emerald-950/20 border-2 border-emerald-500/30 dark:border-emerald-900/30 rounded-[28px] shadow-lg shadow-emerald-500/5 flex flex-col md:flex-row items-center gap-5 text-center md:text-left relative overflow-hidden">
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
                  <div className="w-12 h-12 shrink-0 bg-white dark:bg-zinc-900 rounded-2xl flex items-center justify-center shadow-md relative z-10">
                    <Shield className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
                  </div>
                  <div className="relative z-10">
                    <h4 className="text-xs font-black uppercase tracking-widest text-emerald-900 dark:text-emerald-400 mb-1">Garantia Incondicional de 7 Dias</h4>
                    <p className="text-xs text-emerald-700 dark:text-emerald-500/80 font-bold leading-normal uppercase">
                      Satisfação garantida ou seu dinheiro de volta! Teste por 7 dias e cancele quando quiser sem custo.
                    </p>
                  </div>
                </div>
              </div>

              
                {/* Toggle Mensal/Anual */}
                <div className="flex justify-center items-center gap-4 mb-8">
                  <span className={cn("text-sm font-bold transition-colors", billingCycle === 'MONTHLY' ? "text-slate-900 dark:text-white" : "text-slate-400")}>
                    Mensal
                  </span>
                  <button 
                    onClick={() => setBillingCycle(prev => prev === 'MONTHLY' ? 'ANNUAL' : 'MONTHLY')}
                    className="relative w-16 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 p-1 cursor-pointer transition-colors"
                  >
                    <div className={cn("w-6 h-6 rounded-full bg-emerald-500 shadow-md transition-transform duration-300", billingCycle === 'ANNUAL' ? "translate-x-8" : "translate-x-0")} />
                  </button>
                  <div className="flex items-center gap-2">
                    <span className={cn("text-sm font-bold transition-colors", billingCycle === 'ANNUAL' ? "text-slate-900 dark:text-white" : "text-slate-400")}>
                      Anual
                    </span>
                    <span className="px-2 py-0.5 bg-emerald-500/10 text-emerald-600 text-[9px] font-black uppercase rounded-full tracking-widest animate-pulse">
                      -10% OFF
                    </span>
                  </div>
                </div>

                <PlanCards 
                  billingCycle={billingCycle} 
                  onSubscribe={(plan) => {
                    setSelectedPlan(plan.id);
                    setStep(2);
                  }} 
                  buttonLabel="Selecionar"
                />
              </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="max-w-md mx-auto"
            >
              <div className="bg-white dark:bg-zinc-900 rounded-[48px] p-10 border border-slate-100 dark:border-zinc-800 shadow-2xl space-y-8">
                <div className="text-center space-y-2">
                  <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Crie sua Conta</h2>
                  <p className="text-slate-500 dark:text-zinc-400 font-bold uppercase text-[10px] tracking-widest">
                    Plano selecionado: <span className="text-emerald-600">{plans.find(p => p.id === selectedPlan)?.name}</span>
                  </p>
                </div>

                <form onSubmit={handleRegister} className="space-y-5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Nome Completo</label>
                    <div className="relative group">
                      <UserIcon className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        required
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50/50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 text-sm font-bold outline-none"
                        placeholder="Seu Nome"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">E-mail Corporativo</label>
                    <div className="relative group">
                      <Mail className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        required
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50/50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 text-sm font-bold outline-none"
                        placeholder="email@empresa.com"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Senha de Acesso</label>
                    <div className="relative group">
                      <Lock className="absolute left-5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300 group-focus-within:text-emerald-600 transition-colors" />
                      <input
                        required
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full pl-12 pr-6 py-4 bg-slate-50/50 dark:bg-zinc-950/50 border border-slate-100 dark:border-zinc-800/50 rounded-2xl focus:ring-4 focus:ring-emerald-500/10 focus:border-emerald-500/50 text-sm font-bold outline-none"
                        placeholder=""
                      />
                        <PasswordRequirementsDisplay requirements={passwordRequirements} />
                    </div>
                  </div>

                  <button
                    disabled={loading}
                    type="submit"
                    className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {loading ? (
                      <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        Finalizar Cadastro
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>

                <div className="text-center">
                  <button 
                    onClick={() => setStep(1)} 
                    className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-emerald-600 transition-colors"
                  >
                    Mudar de Plano
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto text-center space-y-8 bg-white dark:bg-zinc-900 p-12 rounded-[48px] border border-slate-100 dark:border-zinc-800 shadow-2xl"
            >
              <div className="w-20 h-20 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <div className="space-y-4">
                <h2 className="text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Quase pronto!</h2>
                <p className="text-slate-500 dark:text-zinc-400 font-medium text-sm leading-relaxed">
                  Enviamos um e-mail de confirmação para <strong>{email}</strong>. Por favor, valide sua conta para começar a usar o sistema.
                </p>
              </div>
              <button
                onClick={() => navigate("/login")}
                className="w-full py-5 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all"
              >
                Voltar para Login
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Register;
