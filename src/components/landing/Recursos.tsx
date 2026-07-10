/* Capítulo 02 · Recursos: bento grid, destaque CRM e seção de IA (dark). */
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Brain, Check, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";
import { CrmListMock } from "../LandingMockups";
import { FadeUp, Kicker, SpotlightCard } from "./primitives";
import { bentoFeatures } from "./data";

export function RecursosBentoSection() {
  return (
    <section id="recursos" className="py-24 px-6 bg-white scroll-mt-28 border-t border-slate-100">
      <div className="max-w-7xl mx-auto">
        <FadeUp className="text-center mb-16">
          <Kicker num="03" label="A plataforma" center />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Menos retrabalho.<br />Mais tempo na rua vendendo.
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            CRM, agenda, mapa, e-mail e faturamento integrados — para devolver horas do seu dia.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[206px] gap-4">
          {bentoFeatures.map((f, i) => (
            <FadeUp key={f.title} delay={i * 0.06} className={f.span}>
              <SpotlightCard
                glow={f.dark ? "rgba(45,212,191,0.18)" : "rgba(16,185,129,0.12)"}
                className={cn(
                  "group h-full rounded-3xl p-7 border transition-all duration-300 flex flex-col",
                  f.dark
                    ? "bg-slate-950 border-slate-800 text-white hover:ring-1 hover:ring-emerald-500/40 hover:-translate-y-1"
                    : "bg-white border-slate-200/80 hover:border-emerald-200 hover:shadow-xl hover:shadow-emerald-100/60 hover:-translate-y-1"
                )}
              >
                {f.dark && (
                  <div
                    className="absolute inset-0 opacity-50 pointer-events-none"
                    style={{ background: "radial-gradient(ellipse 100% 80% at 80% 0%, rgba(16,185,129,0.18), transparent 60%)" }}
                  />
                )}
                <div className="relative z-10 flex flex-col h-full">
                  <div className={cn(
                    "w-11 h-11 rounded-2xl flex items-center justify-center mb-5 transition-colors",
                    f.dark ? "bg-emerald-500/20" : "bg-emerald-50 group-hover:bg-emerald-100"
                  )}>
                    <f.icon className={cn("w-5 h-5", f.dark ? "text-emerald-400" : "text-emerald-600")} />
                  </div>
                  <h3 className={cn("font-black mb-2", f.dark ? "text-xl text-white" : "text-[15px] text-slate-900")}>
                    {f.title}
                  </h3>
                  <p className={cn("font-medium leading-relaxed", f.dark ? "text-[14px] text-slate-300" : "text-[13px] text-slate-500")}>
                    {f.desc}
                  </p>

                  {f.dark && (
                    <div className="mt-auto pt-6">
                      <div className="rounded-2xl bg-white/5 border border-white/10 p-4 backdrop-blur">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Assistente IA · Online</span>
                        </div>
                        <p className="text-[12px] text-slate-300 font-medium leading-relaxed">
                          "Cliente ativo há 14 meses. Última compra R$ 8.200. Recomendo follow-up esta semana."
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </SpotlightCard>
            </FadeUp>
          ))}
        </div>
      </div>
    </section>
  );
}

export function GestaoInteligenteSection() {
  return (
    <section id="tecnologia" className="py-28 px-6 bg-slate-950 overflow-hidden relative scroll-mt-28">
      {/* glow + grid */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[500px] bg-emerald-500/15 blur-[150px] rounded-full" />
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: `linear-gradient(#10b981 1px, transparent 1px), linear-gradient(90deg, #10b981 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
            maskImage: "radial-gradient(ellipse 60% 60% at 50% 40%, black, transparent)",
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10">
        <FadeUp className="text-center max-w-2xl mx-auto mb-16">
          <div className="flex justify-center">
            <Kicker label="Carteira + Inteligência artificial" dark center />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-4 leading-tight">
            Carteira organizada.<br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">IA cuidando do resto.</span>
          </h2>
          <p className="text-slate-400 font-medium leading-relaxed max-w-lg mx-auto">
            A IA sabe qual cliente precisa de atenção — e avisa você antes do concorrente.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch mb-14">
          {/* mockup: lista de clientes */}
          <FadeUp delay={0.1}>
            <div className="relative h-full">
              <div className="absolute inset-0 bg-emerald-400/10 blur-[80px] rounded-full" />
              <div className="relative h-full bg-white rounded-3xl border border-white/10 overflow-hidden shadow-2xl">
                <CrmListMock />
              </div>
              <motion.div
                animate={{ y: [-4, 4, -4] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="hidden md:flex absolute -bottom-5 -left-5 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 items-center gap-3"
              >
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[11px] font-black text-slate-900 uppercase tracking-tight">Alerta automático</p>
                  <p className="text-[10px] text-slate-500 font-medium">Cliente inativo há 15 dias</p>
                </div>
              </motion.div>
            </div>
          </FadeUp>

          {/* mockup: chat com IA */}
          <FadeUp delay={0.2}>
            <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 p-7 shadow-2xl h-full">
              <div className="flex items-center gap-3 mb-6 pb-5 border-b border-white/10">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="text-white text-[13px] font-black">Assistente IA</p>
                  <p className="text-emerald-400 text-[10px] font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
                    Online · respondendo
                  </p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { role: "user", text: "Gere o resumo do cliente MERCADO BOA VISTA" },
                  { role: "ai",   text: "📋 Analisando 47 interações... Cliente ativo há 14 meses. Última compra: R$ 8.200 em novembro. Pedido pendente de follow-up. Recomendo contato esta semana." },
                  { role: "user", text: "Quais clientes não compram há mais de 30 dias?" },
                  { role: "ai",   text: "Encontrei 12 clientes inativos. Os 3 de maior valor: COMERCIAL VALE VERDE (R$12k), DISTRIBUIDORA HORIZONTE (R$9k), MERCANTIL BANDEIRANTE (R$7k). Deseja gerar uma lista de visitas?" },
                ].map((msg, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.15, duration: 0.4 }}
                    className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] px-4 py-3 rounded-2xl text-[12px] font-medium leading-relaxed",
                        msg.role === "user"
                          ? "bg-emerald-600 text-white rounded-br-sm shadow-lg shadow-emerald-600/20"
                          : "bg-white/5 text-slate-200 rounded-bl-sm border border-white/10"
                      )}
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </FadeUp>
        </div>

        <FadeUp delay={0.1}>
          <ul className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            {[
              "Filtros por status, cidade e empresa",
              "Resumo de cliente gerado por IA",
              "Alerta automático de inatividade",
              "E-mails categorizados por representada",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-[13px] text-slate-300 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </FadeUp>

        <FadeUp delay={0.15} className="text-center mt-12">
          <Link to="/planos" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[13px] transition-all shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 group">
            Ativar minha carteira inteligente
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </FadeUp>
      </div>
    </section>
  );
}
