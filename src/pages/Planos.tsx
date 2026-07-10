import React, { useState, useEffect } from "react";
import {
  ArrowUpRight,
  Sparkles,
  Crown,
  ShieldCheck,
  RefreshCw,
  CalendarClock,
  ChevronDown,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { cn } from "../lib/utils";
import { plans } from "../lib/plansData";
import { PlanCards } from "../components/plans/PlanCards";

const faqItems = [
  {
    q: "Posso cancelar quando quiser?",
    a: "Sim. Não há fidelidade nem multa de cancelamento. Você pode cancelar a qualquer momento pelo suporte, e o acesso continua até o fim do período já pago.",
  },
  {
    q: "Como funciona o teste de 7 dias?",
    a: "Você usa o sistema completo por 7 dias sem cobrança. A cobrança só acontece automaticamente após esse período, conforme o plano e ciclo (mensal ou anual) escolhidos no cadastro.",
  },
  {
    q: "Posso trocar de plano depois?",
    a: "Sim, a qualquer momento. Se você representa mais empresas do que seu plano permite, é só fazer upgrade — o valor é ajustado proporcionalmente na próxima cobrança.",
  },
  {
    q: "O que acontece se eu ultrapassar o limite de empresas do meu plano?",
    a: "Você recebe um aviso no painel e pode fazer upgrade a qualquer momento. Seus dados nunca são apagados ou bloqueados por causa disso.",
  },
  {
    q: "Meus dados ficam seguros?",
    a: "Sim. Toda a infraestrutura roda em nuvem com criptografia e backups automáticos, e cada conta só acessa os próprios dados — clientes, pedidos e agenda ficam isolados por usuário.",
  },
];

const trustItems = [
  { icon: ShieldCheck, title: "7 dias de garantia", desc: "Satisfação garantida ou seu dinheiro de volta." },
  { icon: RefreshCw, title: "Sem fidelidade", desc: "Cancele quando quiser, sem multa." },
  { icon: CalendarClock, title: "Cobrança só após o teste", desc: "Após os 7 dias, a renovação é automática conforme o plano." },
];

export default function Planos() {
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'ANNUAL'>('MONTHLY');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { user } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);

  const handleSubscribe = (plan: typeof plans[0]) => {
    // Checkout público: cria a conta (passo 1) e processa o pagamento (passo 2).
    // Não exige login prévio — a pessoa escolhe o plano, se cadastra e paga.
    navigate(`/checkout?plan=${plan.id}&period=${billingCycle}`);
  };

  // Fonte de verdade é user_entitlements.plan_id (via SettingsContext) — a
  // coluna user_settings.subscription_plan que era usada aqui antes nunca é
  // escrita após o cadastro e ficava travada no valor padrão, fazendo o badge
  // "plano atual" e o upsell para Master nunca refletirem a assinatura real.
  const isPayingCustomer = settings.subscription_status === 'active' || settings.subscription_status === 'trialing';
  const currentPlanId = user && isPayingCustomer ? settings.plan_id : undefined;
  const isProfissional = currentPlanId === 'profissional';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-zinc-950 px-4 py-10 lg:px-8 lg:py-14 transition-colors duration-300 font-sans">
      <div className="max-w-6xl mx-auto">

        {/* Upsell para quem já é Profissional */}
        {isProfissional && (
          <motion.div
            initial={{ opacity: 0, y: -16 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-12 p-6 md:p-7 rounded-3xl bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/20 dark:border-amber-500/30 flex flex-col md:flex-row items-center justify-between gap-5 relative overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-2xl pointer-events-none" />
            <div className="flex items-center gap-4 relative z-10">
              <div className="w-12 h-12 rounded-2xl bg-amber-500 flex items-center justify-center text-white shrink-0 shadow-lg shadow-amber-500/20">
                <Crown className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-black text-amber-700 dark:text-amber-400">Suba para o Master</h4>
                <p className="text-[13px] font-medium text-slate-600 dark:text-zinc-400 leading-relaxed">
                  Por apenas <span className="text-amber-600 dark:text-amber-400 font-bold">R$ 50 a mais por mês</span>, tenha empresas ilimitadas, IA avançada, BI Analytics e suporte prioritário.
                </p>
              </div>
            </div>
            <button
              onClick={() => handleSubscribe(plans[2])}
              className="px-7 py-3.5 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-[12px] font-black uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-95 transition-all shrink-0 flex items-center gap-2 relative z-10"
            >
              Ir para o Master <ArrowUpRight className="w-4 h-4" />
            </button>
          </motion.div>
        )}

        {/* Header */}
        <div className="text-center mb-10">
          <motion.span
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[11px] font-black uppercase tracking-widest border border-emerald-100 dark:border-emerald-900/30 mb-6"
          >
            <Sparkles className="w-3.5 h-3.5" />
            Planos & assinaturas
          </motion.span>

          <h1 className="text-4xl md:text-5xl font-black text-slate-900 dark:text-zinc-100 tracking-tight mb-4 leading-[1.05]">
            Escolha o nível do seu <br className="hidden sm:block" />
            <span className="text-emerald-600">sucesso profissional</span>
          </h1>
          <p className="text-slate-500 dark:text-zinc-400 font-medium max-w-xl mx-auto text-base md:text-lg leading-relaxed">
            Seu plano acompanha o número de empresas que você representa. Mude de plano quando quiser, sem fidelidade.
          </p>
        </div>

        {/* Toggle Mensal / Anual */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800">
            <button
              onClick={() => setBillingCycle('MONTHLY')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[13px] font-black transition-all",
                billingCycle === 'MONTHLY'
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setBillingCycle('ANNUAL')}
              className={cn(
                "px-6 py-2.5 rounded-xl text-[13px] font-black transition-all flex items-center gap-2",
                billingCycle === 'ANNUAL'
                  ? "bg-white dark:bg-zinc-800 text-slate-900 dark:text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 dark:hover:text-zinc-300"
              )}
            >
              Anual
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-black">-10%</span>
            </button>
          </div>
        </div>

        {/* Cards */}
        <PlanCards
          billingCycle={billingCycle}
          currentSubscriptionPlan={currentPlanId}
          onSubscribe={handleSubscribe}
        />

        {/* Selos de confiança */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-4xl mx-auto mb-16">
          {trustItems.map((item) => (
            <div
              key={item.title}
              className="flex items-start gap-3 p-5 rounded-2xl bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center shrink-0">
                <item.icon className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h4 className="text-[13px] font-black text-slate-900 dark:text-zinc-100 mb-0.5">{item.title}</h4>
                <p className="text-[12px] font-medium text-slate-500 dark:text-zinc-400 leading-snug">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* FAQ — objeções comuns antes de assinar */}
        <div className="max-w-2xl mx-auto mb-16">
          <h3 className="text-center text-lg font-black text-slate-900 dark:text-zinc-100 mb-6">
            Perguntas frequentes
          </h3>
          <div className="space-y-3">
            {faqItems.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div
                  key={item.q}
                  className="rounded-2xl border border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-sm font-bold text-slate-800 dark:text-zinc-200">{item.q}</span>
                    <ChevronDown className={cn("w-4 h-4 text-slate-400 shrink-0 transition-transform", isOpen && "rotate-180")} />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <p className="px-5 pb-4 text-[13px] text-slate-500 dark:text-zinc-400 font-medium leading-relaxed">
                          {item.a}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        {/* Gerenciar conta */}
        <div className="max-w-3xl mx-auto p-8 md:p-10 bg-white dark:bg-zinc-900 rounded-3xl border border-slate-100 dark:border-zinc-800 text-center">
          <h4 className="text-lg font-black text-slate-900 dark:text-zinc-100 mb-2">Precisa de ajuda com sua conta?</h4>
          <p className="text-slate-500 dark:text-zinc-400 font-medium mb-7 max-w-md mx-auto text-sm leading-relaxed">
            Quer pausar, trocar ou cancelar sua assinatura? Fale com o suporte e a gente resolve com segurança.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20vim%20pela%20plataforma%20e%20gostaria%20de%20suporte%20financeiro.', '_blank')}
              className="w-full sm:w-auto px-8 py-3.5 bg-slate-900 dark:bg-zinc-800 text-white rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
            >
              Suporte Financeiro
              <ArrowUpRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => window.open('https://wa.me/5515997472785?text=Ol%C3%A1%2C%20gostaria%20de%20cancelar%20o%20meu%20plano.%20Poderia%20me%20ajudar%3F', '_blank')}
              className="w-full sm:w-auto px-8 py-3.5 bg-white dark:bg-zinc-900 border border-red-100 dark:border-red-900/30 text-red-600 rounded-2xl font-black text-[12px] uppercase tracking-widest hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
            >
              Solicitar Cancelamento
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
