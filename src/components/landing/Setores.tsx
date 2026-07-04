/* Capítulo 03 · Setores atendidos — cards com foto sempre visível + nome embaixo. */
import React from "react";
import { FadeUp, Kicker } from "./primitives";
import { industries } from "./data";

export function SetoresSection() {
  return (
    <section id="industrias" className="py-24 px-6 bg-white border-b border-slate-100 scroll-mt-28">
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-14">
          <div className="flex justify-center">
            <Kicker num="03" label="Setores atendidos" center />
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 mb-3">
            Feito para o seu mercado.
          </h2>
          <p className="text-slate-500 font-medium">
            Interface customizada por setor de atuação
          </p>
        </FadeUp>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5">
          {industries.map((item, idx) => (
            <FadeUp key={item.name} delay={idx * 0.05}>
              <div className="group h-full rounded-3xl overflow-hidden border border-slate-200/80 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    style={{ objectPosition: (item as { objectPosition?: string }).objectPosition ?? "center" }}
                  />
                </div>
                <div className="p-4 flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                    <item.icon className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-[11px] sm:text-[13px] font-black uppercase tracking-tight text-slate-900 leading-tight">
                    {item.name}
                  </span>
                </div>
              </div>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}
