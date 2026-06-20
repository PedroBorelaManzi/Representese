import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Check, Building2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { plans } from '../../lib/plansData';

interface PlanCardsProps {
  billingCycle: 'MONTHLY' | 'ANNUAL';
  currentSubscriptionPlan?: string;
  onSubscribe: (plan: typeof plans[0]) => void;
  buttonLabel?: string;
}

const repLabels: Record<string, string> = {
  exclusivo: '1 representada',
  profissional: 'Até 5 representadas',
  master: 'Representadas ilimitadas',
};

export function PlanCards({ billingCycle, currentSubscriptionPlan, onSubscribe, buttonLabel }: PlanCardsProps) {
  const annual = billingCycle === 'ANNUAL';

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8 items-stretch mb-14">
      {plans.map((plan, idx) => {
        const price = annual ? plan.annualPrice : plan.price;
        const discount = Math.round((1 - Number(price) / Number(plan.originalPrice)) * 100);
        const isCurrent = currentSubscriptionPlan?.toLowerCase().includes(plan.id.toLowerCase());
        const isUserMaster = currentSubscriptionPlan?.toLowerCase().includes('master');
        const showAlreadyBestPlan = isUserMaster && plan.id === 'master';
        const popular = plan.popular;

        return (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.08 }}
            className={cn(
              "relative rounded-3xl border p-8 flex flex-col h-full transition-all duration-300",
              popular
                ? "bg-slate-950 border-slate-800 text-white shadow-2xl shadow-emerald-900/20 md:-mt-4"
                : "bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 hover:border-emerald-200 dark:hover:border-zinc-700 hover:shadow-xl"
            )}
          >
            {popular && (
              <div className="absolute top-6 right-6 px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-500/30">
                Recomendado
              </div>
            )}

            {/* ícone + nome */}
            <div className="flex items-center gap-3 mb-5">
              <div className={cn(
                "w-12 h-12 rounded-2xl bg-gradient-to-br flex items-center justify-center shadow-lg shrink-0",
                plan.color
              )}>
                <plan.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className={cn("text-xl font-black tracking-tight", popular ? "text-white" : "text-slate-900 dark:text-zinc-100")}>
                {plan.name}
              </h3>
            </div>

            {/* limite de representadas */}
            <div className={cn(
              "inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-[11px] font-black mb-4",
              popular ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            )}>
              <Building2 className="w-3 h-3" />
              {repLabels[plan.id]}
            </div>

            <p className={cn("text-[13px] font-medium mb-6 leading-relaxed", popular ? "text-slate-400" : "text-slate-500 dark:text-zinc-400")}>
              {plan.description}
            </p>

            {/* preço */}
            <div className="mb-1 flex items-center gap-2">
              <span className={cn("text-[15px] font-bold line-through", popular ? "text-slate-500" : "text-slate-400")}>
                R${plan.originalPrice}
              </span>
              {discount > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black">
                  {discount}% OFF
                </span>
              )}
            </div>
            <div className="flex items-end gap-1 mb-1">
              <span className={cn("text-2xl font-black mb-1", popular ? "text-white" : "text-slate-900 dark:text-zinc-100")}>R$</span>
              <span className={cn("text-5xl font-black tracking-tight", popular ? "text-white" : "text-slate-900 dark:text-zinc-100")}>{price}</span>
              <span className={cn("text-[14px] font-bold mb-2", popular ? "text-slate-400" : "text-slate-500 dark:text-zinc-400")}>/mês</span>
            </div>
            <p className={cn("text-[11px] font-medium mb-6 h-4", popular ? "text-slate-500" : "text-slate-400")}>
              {annual ? "cobrado anualmente" : "no plano mensal"}
            </p>

            {/* CTA */}
            <button
              onClick={() => onSubscribe(plan)}
              disabled={isCurrent}
              className={cn(
                "group/btn flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-[13px] font-black transition-all mb-7",
                isCurrent
                  ? "bg-slate-100 dark:bg-zinc-800 text-slate-400 cursor-not-allowed"
                  : popular
                    ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30"
                    : "bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200"
              )}
            >
              {isCurrent
                ? (showAlreadyBestPlan ? "Você já está no melhor plano" : "Plano atual")
                : (
                  <>
                    {buttonLabel || "Assinar agora"}
                    <ArrowRight className="w-4 h-4 group-hover/btn:translate-x-1 transition-transform" />
                  </>
                )}
            </button>

            {/* features */}
            <ul className="space-y-3 mt-auto">
              {plan.features.map((feat, i) => (
                <li key={i} className={cn("flex items-center gap-3 text-[12.5px] font-medium", popular ? "text-slate-300" : "text-slate-600 dark:text-zinc-300")}>
                  <div className={cn(
                    "w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0",
                    popular ? "bg-emerald-500/20" : "bg-emerald-100 dark:bg-emerald-500/10"
                  )}>
                    <Check className={cn("w-2.5 h-2.5", popular ? "text-emerald-400" : "text-emerald-600")} />
                  </div>
                  {feat.text}
                </li>
              ))}
            </ul>
          </motion.div>
        );
      })}
    </div>
  );
}
