/* Segurança & infraestrutura — fatos técnicos que geram confiança (sem prova social inventada). */
import React from "react";
import { FadeUp, Kicker } from "./primitives";
import { trustItems } from "./data";

export function TrustSection() {
  return (
    <section className="py-16 px-6 bg-white border-t border-slate-100">
      <div className="max-w-5xl mx-auto">
        <FadeUp className="text-center mb-10">
          <div className="flex justify-center">
            <Kicker label="Segurança" center />
          </div>
          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 mb-3">
            Seus dados são prioridade.
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Sua carteira é o seu maior ativo — a infraestrutura por trás dela leva isso a sério.
          </p>
        </FadeUp>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {trustItems.map((item, i) => (
            <FadeUp key={item.title} delay={i * 0.06}>
              <div className="h-full rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 text-center">
                <div className="mx-auto w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
                  <item.icon className="w-5 h-5 text-emerald-600" />
                </div>
                <p className="text-[13px] font-black text-slate-900 mb-1">{item.title}</p>
                <p className="text-[12px] text-slate-500 font-medium leading-relaxed">{item.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
