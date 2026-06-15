import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { plans } from '../../lib/plansData';

interface PlanCardsProps {
  billingCycle: 'MONTHLY' | 'ANNUAL';
  currentSubscriptionPlan?: string;
  onSubscribe: (plan: typeof plans[0]) => void;
  buttonLabel?: string;
}

export function PlanCards({ billingCycle, currentSubscriptionPlan, onSubscribe, buttonLabel }: PlanCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
      {plans.map((plan, idx) => {
        const isCurrent = currentSubscriptionPlan?.toLowerCase().includes(plan.id.toLowerCase());

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
              onClick={() => onSubscribe(plan)}
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
                  {buttonLabel || "Teste 7 Dias Grátis"}
                  <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                </>
              )}
            </button>
          </motion.div>
        );
      })}
    </div>
  );
}
