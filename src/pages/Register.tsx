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
import { cn } from '../lib/utils';

const plans = [
  {
    id: 'exclusivo',
    name: 'Exclusivo',
    price: '97',
    annualPrice: '87',
    originalPrice: '134',
    period: '/mês',
    description: 'Para quem está começando.',
    justification: 'Ideal para validar sua operação com baixo investimento e organização básica.',
    features: [
      { text: '1 Empresa cadastrada', icon: Building2 },
      { text: 'Mapa Territorial Básico', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Suporte por E-mail', icon: Mail }
    ],
    featured: false,
    color: 'slate',
    icon: Trophy
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: '147',
    annualPrice: '132',
    originalPrice: '210',
    period: '/mês',
    description: 'Ideal para equipes em crescimento.',
    justification: 'A automação de busca de CNPJ economiza cerca de 10 horas de trabalho manual por mês.',
    features: [
      { text: 'Até 5 Empresas', icon: Building2 },
      { text: 'Mapa Territorial Básico', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Busca CNPJ Automática', icon: Zap },
      { text: 'Dashboard de Faturamento', icon: BarChart3 },
      { text: 'Exportação de Relatórios', icon: Check },
      { text: 'Suporte via WhatsApp', icon: Star }
    ],
    featured: true,
    color: 'emerald',
    icon: Gem
  },
  {
    id: 'master',
    name: 'Master',
    price: '197',
    annualPrice: '177',
    originalPrice: '303',
    period: '/mês',
    description: 'Para grandes volumes e IA.',
    justification: 'Potencializado por Inteligência Artificial para processar pedidos e analisar mercado em tempo real.',
    features: [
      { text: 'Empresas Ilimitadas', icon: Infinity },
      { text: 'Radar Territorial Avançado', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Busca CNPJ Automática', icon: Zap },
      { text: 'BI & Analytics Avançado', icon: BarChart3 },
      { text: 'Exportação de Relatórios', icon: Check },
      { text: 'Lançamento via IA (Gemini)', icon: Sparkles },
      { text: 'Automação de Pedidos', icon: Zap },
      { text: 'Integração com Inbox', icon: Mail },
      { text: 'Suporte via WhatsApp Prioritário', icon: Star }
    ],
    featured: false,
    color: 'zinc',
    icon: Crown
  },
];


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

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
                {plans.map((plan) => (
                  <motion.div
                    key={plan.id}
                    whileHover={{ y: -8 }}
                    onClick={() => navigate(`/checkout?plan=${plan.id}&period=${billingCycle}`)}
                    className={cn(
                      "relative flex flex-col p-6 rounded-[40px] border transition-all duration-500 cursor-pointer",
                      plan.featured 
                        ? "bg-emerald-600 border-emerald-500 shadow-2xl text-white scale-105 z-10" 
                        : "bg-white dark:bg-zinc-900 border-slate-100 dark:border-zinc-800 shadow-xl"
                    )}
                    
                  >
                    {plan.featured && (
                      <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-2 bg-amber-400 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg whitespace-nowrap">
                        Mais escolhido!
                      </div>
                    )}
                    <div className="mb-6">
                      <h3 className="text-lg font-black uppercase tracking-tight mb-2">{plan.name}</h3>
                      <p className={cn("text-[9px] font-bold uppercase opacity-70 leading-tight", plan.featured ? "text-emerald-50" : "text-slate-400")}>
                        {plan.description}
                      </p>
                    </div>
                    <div className="mb-2 flex flex-col gap-1 min-h-[30px]">
                      {plan.originalPrice && (
                        <div className="flex items-center gap-2">
                          <span className={cn("text-xs font-bold line-through", plan.featured ? "text-emerald-100/70" : "text-slate-400")}>De R$ {plan.originalPrice}</span>
                          <span className="px-3 py-1 bg-amber-500 text-white text-[10px] font-black uppercase rounded-lg tracking-widest shadow-sm shadow-amber-500/20">
                            {plan.id === 'exclusivo' ? '25' : plan.id === 'profissional' ? '30' : '35'}% DE DESCONTO LANÇAMENTO
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-baseline gap-1 mb-6">
                      <span className="text-xs font-black opacity-50">R$</span>
                      <span className="text-4xl font-black tracking-tighter">{billingCycle === 'ANNUAL' ? plan.annualPrice : plan.price}</span>
                      <span className="text-[10px] font-black uppercase opacity-50">{plan.period}</span>
                    </div>
                    
                    <div className={cn("p-4 rounded-2xl mb-6 text-[10px] font-bold leading-relaxed", plan.featured ? "bg-white/10" : "bg-slate-50 dark:bg-zinc-800")}>
                      <Sparkles className="w-4 h-4 mb-2 inline-block mr-2" />
                      {plan.justification}
                    </div>

                    <div className="space-y-3 flex-1 mb-6">
                      {plan.features.map((feat, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <div className={cn("p-1.5 rounded-lg shrink-0", plan.featured ? "bg-white/20" : "bg-emerald-50 dark:bg-emerald-950/30")}>
                            <feat.icon className={cn("w-3 h-3", plan.featured ? "text-white" : "text-emerald-600")} />
                          </div>
                          <span className="text-[9px] font-black uppercase tracking-tight leading-none">{feat.text}</span>
                        </div>
                      ))}
                    </div>
                    <button className={cn(
                      "w-full py-4 rounded-2xl font-black uppercase text-[9px] tracking-widest transition-all",
                      plan.featured ? "bg-white hover:bg-slate-50" : "bg-slate-900 text-white"
                    )}>
                      Selecionar
                    </button>
                  </motion.div>
                ))}
              </div>
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
