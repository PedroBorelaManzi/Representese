import React, { useState, useEffect } from "react";
import { 
  Check, 
  ArrowRight, 
  ShieldCheck, 
  Zap, 
  Star, 
  ChevronRight,
  Sparkles,
  Crown,
  CheckCircle2,
  Lock,
  ArrowUpRight,
  TrendingUp,
  CreditCard,
  Building2,
  Calendar,
  Infinity,
  Trophy,
  Gem,
  Mail,
  BarChart3,
  Map as MapIcon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";
import { cn } from "../lib/utils";

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
        { text: '1 Usuário Simultâneo', icon: Check },
        { text: 'Acesso ao App Mobile', icon: Check },
        { text: 'Suporte por e-mail (até 24h)', icon: Check },
        { text: 'Histórico de 30 dias', icon: Check },
      { text: 'Mapa Territorial Básico', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Suporte por E-mail', icon: Mail }
    ],
    popular: false,
    color: 'from-slate-500 to-slate-600',
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
    popular: true,
    color: 'from-emerald-500 to-emerald-600',
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
    popular: false,
    color: 'from-emerald-600 to-emerald-700',
    icon: Crown
  },
];

export default function Planos() {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [currentSubscription, setCurrentSubscription] = useState<any>(null);

  useEffect(() => {
    if (user?.email === 'pedroborelamanzi@gmail.com' && !localStorage.getItem('temp_downgrade_done_3')) {
      supabase.from('user_settings').update({ subscription_plan: 'Acesso Exclusivo' }).eq('user_id', user.id).then(() => {
        localStorage.setItem('temp_downgrade_done_3', 'true');
        toast.success("Plano voltado para Exclusivo com sucesso para testes!");
        setTimeout(() => window.location.reload(), 1500);
      });
    }
  }, [user]);

  useEffect(() => {
    const fetchSubscription = async () => {
      if (!user) return;
      const { data } = await supabase
        .from('user_settings')
        .select('subscription_status, subscription_plan')
        .eq('user_id', user.id)
        .single();
      setCurrentSubscription(data);
    };
    fetchSubscription();
  }, [user]);

  const handleSubscribe = (plan: typeof plans[0]) => {
    if (!user) {
      toast.error("Você precisa estar logado para assinar.");
      return;
    }
    setLoading(true);
    // Navigate to public checkout with query params
    navigate(`/checkout?plan=${plan.id}&period=${billingCycle}`);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 p-4 lg:p-12 transition-colors duration-300 font-sans">
      <div className="max-w-7xl mx-auto">
        {/* Planos Upgrade Upsell Header Banner */}
        {user && (currentSubscription?.subscription_plan?.toLowerCase() === 'profissional' || 
          currentSubscription?.subscription_plan?.toLowerCase() === 'premium') && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-6 md:p-8 rounded-[32px] bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 dark:border-amber-500/30 text-left flex flex-col md:flex-row items-center justify-between gap-6 shadow-lg shadow-amber-500/5 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
                <Crown className="w-6 h-6 animate-bounce" />
              </div>
              <div className="space-y-1">
                <h4 className="text-xs font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">Upgrade de Assinatura Exclusivo</h4>
                <p className="text-[10px] font-bold text-slate-500 dark:text-zinc-400 leading-normal uppercase">
                  Você já possui o plano Profissional! Por apenas <span className="text-amber-600 dark:text-amber-400 font-black">R$ 50 a mais por mês</span>, mude para o plano <span className="text-amber-600 dark:text-amber-400 font-black">Master</span> e tenha Empresas Ilimitadas, IA avançada, BI Analytics e suporte ultra priorizado!
                </p>
              </div>
            </div>
            <button 
              onClick={() => handleSubscribe(plans[2])} // Master is plans[2]
              className="px-8 py-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all shrink-0 flex items-center gap-2 relative z-10"
            >
              Ir para o Master <ArrowUpRight className="w-4 h-4" />
            </button>
                  
                </motion.div>
        )}

        <div className="text-center mb-16">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-500 text-[10px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-900/30 mb-8"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Planos & Assinaturas
          </motion.div>
          
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mb-6 leading-none">
            Escolha o nível do seu <br /> <span className="text-emerald-600">Sucesso Profissional</span>
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium max-w-2xl mx-auto text-lg leading-relaxed mb-8">
            Invista na tecnologia que organiza sua rotina e potencializa suas vendas. 
            Mude de plano quando quiser.
          </p>

          
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
            <p className="mt-4 text-center text-[12px] text-slate-500 dark:text-zinc-500 leading-snug font-medium">Após os 7 dias, a cobrança é automática conforme o plano escolhido. Cancele quando quiser, sem multa.</p>
          </div>

          {/* 7-Day Guarantee Banner Prominently at the Top */}
          <div className="max-w-2xl mx-auto mb-10 relative">
            <div className="p-5 md:p-6 bg-emerald-500/10 dark:bg-emerald-950/20 border-2 border-emerald-500/30 dark:border-emerald-900/30 rounded-[28px] shadow-lg shadow-emerald-500/5 flex flex-col md:flex-row items-center gap-5 text-center md:text-left relative overflow-hidden">
              <div className="absolute -right-10 -top-10 w-40 h-40 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
              <div className="w-12 h-12 shrink-0 bg-white dark:bg-zinc-900 rounded-2xl flex items-center justify-center shadow-md relative z-10">
                <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-500" />
              </div>
              <div className="relative z-10">
                <h4 className="text-xs font-black uppercase tracking-widest text-emerald-900 dark:text-emerald-400 mb-1">Garantia Incondicional de 7 Dias</h4>
                <p className="text-xs text-emerald-700 dark:text-emerald-500/80 font-bold leading-normal uppercase">
                  Satisfação garantida ou seu dinheiro de volta! Teste por 7 dias e cancele quando quiser sem custo.
                </p>
              </div>
            </div>
            <p className="mt-4 text-center text-[12px] text-slate-500 dark:text-zinc-500 leading-snug font-medium">Após os 7 dias, a cobrança é automática conforme o plano escolhido. Cancele quando quiser, sem multa.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {plans.map((plan, idx) => {
            const isCurrent = currentSubscription?.subscription_plan?.toLowerCase().includes(plan.id.toLowerCase());

            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={cn(
                  "relative bg-white dark:bg-zinc-900 rounded-[48px] p-10 border transition-all duration-500 group overflow-hidden flex flex-col h-full",
                  plan.popular ? "border-emerald-500 shadow-[0_32px_64px_-16px_rgba(16,185,129,0.15)] ring-4 ring-emerald-500/5" : "border-slate-100 dark:border-zinc-800 hover:border-slate-200 dark:hover:border-zinc-700"
                )}
              >
                {plan.popular && (
                  <div className="absolute top-8 right-8">
                    <div className="px-4 py-1.5 bg-emerald-500 text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-emerald-500/20">
                      Recomendado
                    </div>
                  </div>
                )}

                <div className={cn(
                  "w-14 h-14 md:w-16 md:h-16 rounded-[24px] bg-gradient-to-br flex items-center justify-center mb-8 shadow-lg transition-transform group-hover:scale-110 duration-500",
                  plan.color
                )}>
                  <plan.icon className="w-6 h-6 md:w-8 md:h-8 text-white" />
                </div>

                <div className="mb-8">
                  <h3 className="text-2xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mb-2">{plan.name}</h3>
                  <p className="text-sm text-slate-500 dark:text-zinc-400 font-medium leading-tight">{plan.description}</p>
                </div>

                <div className="mb-8 flex flex-col gap-1 text-left min-h-[70px]">
                  {plan.originalPrice ? (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 line-through decoration-red-500/50">De R$ {plan.originalPrice}</span>
                      <span className="px-3 py-1 bg-amber-500 text-white text-[10px] font-black uppercase rounded-lg tracking-widest shadow-sm shadow-amber-500/20">
                        {plan.id === 'exclusivo' ? '25' : plan.id === 'profissional' ? '30' : '35'}% DE DESCONTO LANÇAMENTO
                      </span>
                    </div>
                  ) : (
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Preço Regular</span>
                  )}
                  <div className="flex items-baseline gap-1 mt-1">
                    <span className="text-sm font-black text-slate-400">R$</span>
                    <span className="text-5xl md:text-6xl font-black text-slate-900 dark:text-zinc-100 tracking-tighter">{billingCycle === 'ANNUAL' ? plan.annualPrice : plan.price}</span>
                    <span className="text-slate-400 font-bold uppercase text-[10px] tracking-widest">/mês</span>
                  </div>
                </div>

                <div className="space-y-4 mb-10 flex-grow">
                  {plan.features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3 text-emerald-600" />
                      </div>
                      <span className="text-xs md:text-sm font-bold text-slate-600 dark:text-zinc-300">{feature.text}</span>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => handleSubscribe(plan)}
                  disabled={isCurrent}
                  className={cn(
                    "w-full py-6 rounded-[28px] font-black uppercase text-xs tracking-[0.2em] transition-all flex items-center justify-center gap-3 active:scale-[0.98] group/btn",
                    isCurrent 
                      ? "bg-slate-50 dark:bg-zinc-800 text-slate-400 cursor-not-allowed"
                      : plan.popular
                        ? "bg-white hover:bg-slate-50 shadow-xl shadow-black/10"
                        : "bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 shadow-xl"
                  )}
                  style={plan.popular ? { color: "#1A6B3C" } : undefined}
                >
                  {isCurrent ? "Plano Atual" : (
                    <>
                      Teste 7 Dias Grátis
                      <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                    </>
                  )}
                </button>
                  
                </motion.div>
            );
          })}
        </div>

        {/* Cancellation Section Refined */}
        <div className="max-w-4xl mx-auto p-12 bg-white dark:bg-zinc-900 rounded-[56px] border border-slate-100 dark:border-zinc-800 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-red-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
          <div className="relative z-10">
            <h4 className="text-xl font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter mb-4">Gerenciar Minha Conta</h4>
            <p className="text-slate-500 dark:text-zinc-400 font-medium mb-8 max-w-lg mx-auto">
              Precisa pausar ou cancelar sua assinatura? Fale com nosso suporte para processarmos seu pedido com segurança.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20vim%20pela%20plataforma%20e%20gostaria%20de%20suporte%20financeiro.', '_blank')}
                className="px-10 py-5 bg-slate-900 dark:bg-zinc-800 text-white rounded-[24px] font-black uppercase text-[10px] tracking-widest hover:bg-slate-800 transition-all flex items-center gap-3 shadow-lg"
              >
                Suporte Financeiro
                <ArrowUpRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20gostaria%20de%20cancelar%20o%20meu%20plano.%20Poderia%20me%20ajudar%3F', '_blank')}
                className="px-10 py-5 bg-white dark:bg-zinc-900 border border-red-100 dark:border-red-900/30 text-red-600 rounded-[24px] font-black uppercase text-[10px] tracking-widest hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
              >
                Solicitar Cancelamento
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
