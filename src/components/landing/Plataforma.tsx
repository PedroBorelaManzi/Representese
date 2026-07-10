/* Multiplataforma (dispositivos codados) + Como funciona (3 passos). */
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, BarChart3, Building2, Laptop, Monitor, Smartphone, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { BrowserDashboard, PhoneDashboard } from "../LandingMockups";
import { FadeUp, Kicker } from "./primitives";

export function MultiplataformaSection() {
  return (
    <section className="relative py-28 px-6 bg-slate-950 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[500px] bg-emerald-500/15 blur-[150px] rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: `linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 70% 60% at 50% 50%, black, transparent)",
          }}
        />
      </div>

      <div className="max-w-6xl mx-auto relative z-10">
        <FadeUp className="text-center mb-20">
          <div className="flex justify-center">
            <Kicker label="Multiplataforma" dark />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-4 leading-tight">
            Onde você estiver,<br />sua operação vai junto.
          </h2>
          <p className="text-slate-400 font-medium max-w-xl mx-auto">
            No computador, no notebook e no celular. Web responsiva e app nativo para iOS e Android — tudo sincronizado em tempo real.
          </p>
        </FadeUp>

        <FadeUp delay={0.15}>
          <div className="flex items-end justify-center">
            {/* Monitor — computador (somente desktop) */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6.5, repeat: Infinity, ease: "easeInOut" }}
              className="hidden md:flex flex-col items-center relative z-10 mr-[-44px] lg:mr-[-64px]"
            >
              <div className="w-[224px] lg:w-[300px] rounded-xl border-[9px] border-slate-800 bg-slate-800 shadow-2xl ring-1 ring-white/5 overflow-hidden">
                <BrowserDashboard />
              </div>
              <div className="w-2.5 h-6 bg-slate-800" />
              <div className="w-24 h-2 bg-slate-800 rounded-full" />
            </motion.div>

            {/* Notebook — janela do app codada */}
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="relative z-20 w-[250px] sm:w-[380px] lg:w-[460px]"
            >
              <div className="rounded-t-xl border-[10px] border-b-0 border-slate-800 bg-slate-800 shadow-2xl ring-1 ring-white/5 overflow-hidden">
                <BrowserDashboard />
              </div>
              <div className="relative h-3.5 -mx-6 bg-gradient-to-b from-slate-700 to-slate-800 rounded-b-xl shadow-lg">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-20 h-2 bg-slate-900/60 rounded-b-lg" />
              </div>
            </motion.div>

            {/* Celular — app mobile codado */}
            <motion.div
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 0.4 }}
              className="relative z-30 ml-[-26px] sm:ml-[-44px] lg:ml-[-56px] mb-2 w-[108px] sm:w-[150px] lg:w-[172px]"
            >
              <div className="relative rounded-[2.2rem] border-[7px] border-slate-800 bg-slate-800 shadow-2xl ring-1 ring-white/5 overflow-hidden">
                <PhoneDashboard />
              </div>
            </motion.div>
          </div>
        </FadeUp>

        <FadeUp delay={0.25}>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-16">
            {[
              { icon: Monitor,    label: "Web no computador" },
              { icon: Laptop,     label: "Notebook" },
              { icon: Smartphone, label: "App iOS & Android" },
            ].map((p) => (
              <div key={p.label} className="flex items-center gap-2.5 px-5 py-2.5 rounded-2xl border border-white/10 bg-white/5 backdrop-blur">
                <p.icon className="w-4 h-4 text-emerald-400" />
                <span className="text-[13px] font-bold text-slate-200">{p.label}</span>
              </div>
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

export function ComoFuncionaSection() {
  return (
    <section className="py-24 px-6 bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center mb-16">
          <div className="flex justify-center">
            <Kicker label="Como funciona" center />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Do zero ao controle<br />em 3 passos.
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Sem migração complicada e sem curva de aprendizado. Em minutos sua operação já está rodando.
          </p>
        </FadeUp>

        <div className="relative grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* linha conectora (desktop) */}
          <div className="hidden md:block absolute top-[52px] left-[16%] right-[16%] h-0.5 bg-gradient-to-r from-emerald-200 via-emerald-300 to-emerald-200" />
          {[
            { n: "01", icon: Building2, title: "Cadastre suas representadas", desc: "Adicione as marcas que você representa — cada uma com sua meta e seu espaço, sem misturar nada." },
            { n: "02", icon: Users,     title: "Importe sua carteira",         desc: "Suba seus clientes por planilha ou cadastre na hora. A IA organiza e enriquece os dados por você." },
            { n: "03", icon: BarChart3, title: "Comande tudo num painel",      desc: "Pedidos, faturamento, agenda e alertas — separados por marca, num lugar só, em qualquer tela." },
          ].map((s, i) => (
            <FadeUp key={s.n} delay={i * 0.1}>
              <div className="relative h-full bg-white rounded-3xl border border-slate-200/80 shadow-sm p-7 text-center md:text-left overflow-hidden">
                <span className="absolute top-5 right-6 text-5xl font-black text-emerald-50 leading-none select-none pointer-events-none">{s.n}</span>
                <div className="relative z-10 mx-auto md:mx-0 w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center shadow-lg shadow-emerald-600/25 mb-5">
                  <s.icon className="w-5 h-5 text-white" />
                </div>
                <h3 className="relative z-10 text-[16px] font-black text-slate-900 mb-2">{s.title}</h3>
                <p className="relative z-10 text-[13px] text-slate-500 font-medium leading-relaxed">{s.desc}</p>
              </div>
            </FadeUp>
          ))}
        </div>

        <FadeUp delay={0.3} className="text-center mt-12">
          <Link to="/planos" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[13px] transition-all shadow-lg shadow-emerald-600/20 hover:-translate-y-0.5 group">
            Criar minha conta
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}

