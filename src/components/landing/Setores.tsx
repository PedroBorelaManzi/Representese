/* Capítulo 03 · Setores atendidos — 7 cards numa linha, foto sempre visível + nome embaixo. */
import React from "react";
import { FadeUp, Kicker } from "./primitives";
import { industries } from "./data";

export function SetoresSection() {
  return (
    <section id="industrias" className="py-10 px-6 bg-white border-b border-slate-100 scroll-mt-28">
      <div className="max-w-[1800px] mx-auto">
        <FadeUp className="text-center mb-5">
          <div className="flex justify-center">
            <Kicker num="02" label="Setores atendidos" center />
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-slate-900 mb-3">
            Feito para o seu mercado.
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Representação é representação, seja qual for o ramo. Atendemos representantes de todos os mercados.
          </p>
        </FadeUp>

        {/* 2 colunas no celular, 4 no tablet, todas as 7 lado a lado no desktop */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 sm:gap-6">
          {industries.map((item, idx) => (
            <FadeUp key={item.name} delay={idx * 0.05}>
              <div className="group h-full rounded-2xl overflow-hidden border border-slate-200/80 bg-white shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
                <div className="aspect-[4/3] overflow-hidden bg-slate-100">
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                    style={{ objectPosition: (item as { objectPosition?: string }).objectPosition ?? "center" }}
                  />
                </div>
                <div className="p-2.5 flex items-center justify-center gap-1.5 text-center">
                  <item.icon className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-[12px] sm:text-[13px] font-black uppercase tracking-tight text-slate-900 leading-tight">
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
