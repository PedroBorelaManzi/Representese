/* Capítulo 01 · Diferencial (dor → solução) + marquee de integrações. */
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Layers, Target, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { FadeUp, Kicker } from "./primitives";
import { integrations, painPoints } from "./data";

export function IntegrationsMarquee() {
  return (
    <section className="bg-white border-y border-slate-100 py-10 overflow-hidden">
      <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-400 mb-7">
        Integrações nativas com as ferramentas que você já usa
      </p>
      <div className="relative">
        <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
        <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
        <motion.div
          animate={{ x: ["0%", "-50%"] }}
          transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
          className="flex gap-4 w-max"
        >
          {[...integrations, ...integrations].map((item, i) => (
            <div key={i} className="flex items-center gap-2.5 px-5 py-3 rounded-2xl border border-slate-200 bg-slate-50 shrink-0">
              <item.icon className="w-4 h-4 text-emerald-600" />
              <span className="text-[13px] font-bold text-slate-700 whitespace-nowrap">{item.label}</span>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}

export function DiferencialSection() {
  return (
    <section id="diferencial" className="relative py-24 px-6 bg-gradient-to-b from-emerald-50/70 via-white to-white scroll-mt-28 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        {/* topo: a dor */}
        <FadeUp className="text-center max-w-2xl mx-auto mb-12">
          <Kicker num="01" label="O diferencial" center />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4 leading-[1.08]">
            Você reconhece isso?
          </h2>
          <p className="text-slate-500 font-medium">
            Cada representada manda de um jeito, num canal diferente. Sem um centro de comando, você vira a “ponte” manual entre todas elas — e é aí que pedido, faturamento e cliente se perdem.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {painPoints.map((p, i) => (
            <FadeUp key={p.title} delay={i * 0.08}>
              <div className="h-full bg-white rounded-3xl p-7 border border-slate-200/80 shadow-sm">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 flex items-center justify-center mb-5">
                  <p.icon className="w-5 h-5 text-rose-500" />
                </div>
                <h3 className="text-[15px] font-black text-slate-900 mb-2">{p.title}</h3>
                <p className="text-[13px] text-slate-500 font-medium leading-relaxed">{p.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>

        {/* divisória de transição: dor → solução */}
        <FadeUp delay={0.1} className="flex items-center justify-center gap-3 mb-16">
          <span className="h-px w-10 bg-slate-200" />
          <p className="text-[13px] font-bold text-slate-600 text-center">
            A Represente-Se resolve os três de uma vez.
          </p>
          <span className="h-px w-10 bg-slate-200" />
        </FadeUp>

        {/* solução: o diferencial multi-representada */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          {/* copy */}
          <FadeUp>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-200 bg-white text-emerald-700 text-[10px] font-black uppercase tracking-widest mb-5 shadow-sm">
              <Layers className="w-3 h-3" /> Feito para representar
            </div>
            <h3 className="text-2xl sm:text-4xl font-black tracking-tight text-slate-900 mb-6 leading-[1.1]">
              Feito para representar,<br />não só para vender.
            </h3>
            <p className="text-slate-600 font-medium leading-relaxed mb-5 max-w-md">
              Um CRM comum enxerga você como <span className="font-bold text-slate-900">uma</span> empresa vendendo para clientes. Mas a sua realidade é outra: você carrega o portfólio de <span className="font-bold text-slate-900">várias representadas ao mesmo tempo</span> — cada uma com seus pedidos, seu faturamento e sua meta.
            </p>
            <p className="text-slate-600 font-medium leading-relaxed mb-8 max-w-md">
              O Represente-Se foi desenhado exatamente para isso: um centro de comando que separa cada marca, sem misturar nada — tudo isso na palma da sua mão.
            </p>

            <ul className="space-y-3.5 mb-10">
              {[
                { icon: Wallet,    text: "Faturamento e pedidos separados por representada" },
                { icon: Target,    text: "Meta (teto) configurável para cada marca" },
                { icon: BarChart3, text: "Veja num relance qual empresa rende mais e onde focar" },
                { icon: Layers,    text: "Adicione quantas representadas precisar conforme cresce" },
              ].map((item) => (
                <li key={item.text} className="flex items-center gap-3.5 text-[14px] text-slate-700 font-semibold">
                  <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
                    <item.icon className="w-4 h-4 text-emerald-600" />
                  </div>
                  {item.text}
                </li>
              ))}
            </ul>

            <Link to="/planos" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[13px] transition-all shadow-lg shadow-emerald-600/20 hover:-translate-y-0.5 group">
              Centralizar minhas representadas
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </FadeUp>

        </div>
      </div>
    </section>
  );
}
