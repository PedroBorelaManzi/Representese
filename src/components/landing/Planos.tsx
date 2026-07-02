/* Capítulo 04 · Planos (toggle mensal/anual + cards). */
import React, { useState } from "react";
import { ArrowRight, Building2, Check } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { plans } from "../../lib/plansData";
import { FadeUp, Kicker } from "./primitives";

export function PlanosSection() {
  const [annual, setAnnual] = useState(true);

  return (
    <section id="precos" className="py-24 px-6 bg-white scroll-mt-28">
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-10">
          <Kicker num="04" label="Planos & preços" center />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Planos que crescem com você.
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Seu plano acompanha o número de empresas que você representa — de 1 a ilimitadas. 7 dias de garantia, sem fidelidade.
          </p>
        </FadeUp>

        {/* toggle */}
        <FadeUp delay={0.1} className="flex justify-center mb-12">
          <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200">
            <button
              onClick={() => setAnnual(false)}
              className={cn(
                "px-5 py-2 rounded-xl text-[13px] font-black transition-all",
                !annual ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Mensal
            </button>
            <button
              onClick={() => setAnnual(true)}
              className={cn(
                "px-5 py-2 rounded-xl text-[13px] font-black transition-all flex items-center gap-2",
                annual ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Anual
              <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">-10%</span>
            </button>
          </div>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          {plans.map((plan, i) => {
            const price = annual ? plan.annualPrice : plan.price;
            const discount = Math.round((1 - Number(price) / Number(plan.originalPrice)) * 100);
            const repLabel =
              plan.id === "master"
                ? "Representadas ilimitadas"
                : plan.id === "profissional"
                  ? "Até 5 representadas"
                  : "1 representada";
            return (
              <FadeUp key={plan.id} delay={i * 0.08} className={plan.popular ? "md:-mt-4" : ""}>
                <div
                  className={cn(
                    "relative h-full rounded-3xl border p-8 flex flex-col transition-all duration-300",
                    plan.popular
                      ? "bg-slate-950 border-slate-800 text-white shadow-2xl shadow-emerald-900/20"
                      : "bg-white border-slate-200 hover:border-emerald-200 hover:shadow-xl"
                  )}
                >
                  {plan.popular && (
                    <>
                      <div
                        className="absolute inset-0 rounded-3xl opacity-60 pointer-events-none"
                        style={{ background: "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(16,185,129,0.2), transparent 60%)" }}
                      />
                      <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white text-[10px] font-black uppercase tracking-widest shadow-lg whitespace-nowrap">
                        Mais escolhido
                      </div>
                    </>
                  )}

                  <div className="relative z-10 flex flex-col h-full">
                    <div className="flex items-center gap-3 mb-5">
                      <div className={cn(
                        "w-11 h-11 rounded-2xl flex items-center justify-center",
                        plan.popular ? "bg-emerald-500/20" : "bg-emerald-50"
                      )}>
                        <plan.icon className={cn("w-5 h-5", plan.popular ? "text-emerald-400" : "text-emerald-600")} />
                      </div>
                      <div>
                        <p className={cn("text-[10px] font-black uppercase tracking-widest", plan.popular ? "text-emerald-400" : "text-emerald-600")}>
                          Acesso
                        </p>
                        <h3 className={cn("text-lg font-black", plan.popular ? "text-white" : "text-slate-900")}>{plan.name}</h3>
                      </div>
                    </div>

                    <div className={cn(
                      "inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-[11px] font-black mb-4",
                      plan.popular ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                    )}>
                      <Building2 className="w-3 h-3" />
                      {repLabel}
                    </div>

                    <p className={cn("text-[13px] font-medium mb-6", plan.popular ? "text-slate-400" : "text-slate-500")}>
                      {plan.description}
                    </p>

                    <div className="mb-1 flex items-end gap-2">
                      <span className={cn("text-[15px] font-bold line-through", plan.popular ? "text-slate-500" : "text-slate-400")}>
                        R${plan.originalPrice}
                      </span>
                      {discount > 0 && (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black mb-1">
                          {discount}% OFF
                        </span>
                      )}
                    </div>
                    <div className="flex items-end gap-1 mb-1">
                      <span className={cn("text-2xl font-black mb-1", plan.popular ? "text-white" : "text-slate-900")}>R$</span>
                      <span className={cn("text-5xl font-black tracking-tight", plan.popular ? "text-white" : "text-slate-900")}>{price}</span>
                      <span className={cn("text-[14px] font-bold mb-2", plan.popular ? "text-slate-400" : "text-slate-500")}>/mês</span>
                    </div>
                    <p className={cn("text-[11px] font-medium mb-6 h-4", plan.popular ? "text-slate-500" : "text-slate-400")}>
                      {annual ? "cobrado anualmente" : "no plano mensal"}
                    </p>

                    <Link
                      to={`/checkout?plan=${plan.id}&period=${annual ? 'annual' : 'monthly'}`}
                      className={cn(
                        "group flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-[13px] font-black transition-all mb-7",
                        plan.popular
                          ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30"
                          : "bg-slate-900 hover:bg-slate-800 text-white"
                      )}
                    >
                      Começar agora
                      <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                    </Link>

                    <ul className="space-y-3 mt-auto">
                      {plan.features.map((feat) => (
                        <li key={feat.text} className={cn("flex items-center gap-3 text-[12.5px] font-medium", plan.popular ? "text-slate-300" : "text-slate-600")}>
                          <div className={cn(
                            "w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0",
                            plan.popular ? "bg-emerald-500/20" : "bg-emerald-100"
                          )}>
                            <Check className={cn("w-2.5 h-2.5", plan.popular ? "text-emerald-400" : "text-emerald-600")} />
                          </div>
                          {feat.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </FadeUp>
            );
          })}
        </div>
      </div>
    </section>
  );
}
