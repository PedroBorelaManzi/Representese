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
    <section id="recursos" className="py-24 px-6 bg-white scroll-mt-20 border-t border-slate-100">
      <div className="max-w-7xl mx-auto">
        <FadeUp className="text-center mb-16">
          <Kicker num="02" label="A plataforma" center />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Tudo que você precisa,<br />em um único lugar.
          </h2>
          <p className="text-slate-500 font-medium max-w-xl mx-auto">
            Ferramentas integradas que eliminam o retrabalho e devolvem horas do seu dia.
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
                    ? "bg-slate-950 border-slate-800 text-white"
                    : "bg-white border-slate-200/80 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50"
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

export function CrmHighlightSection() {
  return (
    <section className="py-24 px-6 bg-slate-50 border-y border-slate-100 overflow-hidden">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
        <FadeUp>
          <Kicker label="Gestão de clientes" />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-6 leading-tight">
            Toda sua carteira,<br />organizada e viva.
          </h2>
          <p className="text-slate-500 font-medium leading-relaxed mb-8 max-w-md">
            Cada cliente com seu histórico completo, alertas de inatividade e resumo gerado por IA. Saiba exatamente com quem falar, quando e por quê.
          </p>
          <ul className="space-y-3 mb-10">
            {[
              "Alerta automático de clientes inativos",
              "Resumo gerado pela IA com um clique",
              "Filtros por status, cidade e empresa",
              "Importação de lista via planilha",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[13px] text-slate-700 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-600" />
                </div>
                {item}
              </li>
            ))}
          </ul>
          <Link to="/planos" className="inline-flex items-center gap-2 text-[13px] font-black text-emerald-600 hover:text-emerald-700 transition-colors group">
            Começar agora <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </Link>
        </FadeUp>

        <FadeUp delay={0.15}>
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-400/10 blur-[80px] rounded-full" />
            <div className="relative bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xl ring-1 ring-slate-900/5">
              <CrmListMock />
            </div>
            <motion.div
              animate={{ y: [-4, 4, -4] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-5 -left-5 bg-white rounded-2xl shadow-xl border border-slate-100 p-4 flex items-center gap-3"
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
      </div>
    </section>
  );
}

export function IaSection() {
  return (
    <section id="tecnologia" className="py-28 px-6 bg-slate-950 overflow-hidden relative scroll-mt-20">
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

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
        <FadeUp delay={0.1} className="order-2 lg:order-1">
          <div className="bg-white/[0.03] backdrop-blur-xl rounded-3xl border border-white/10 p-7 shadow-2xl">
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

        <FadeUp className="order-1 lg:order-2">
          <Kicker label="Inteligência artificial" dark />
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-6 leading-tight">
            A IA trabalha<br />
            <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">enquanto você vende.</span>
          </h2>
          <p className="text-slate-400 font-medium leading-relaxed mb-8 max-w-md">
            Nossa IA analisa sua carteira, gera resumos, categoriza e-mails e antecipa qual cliente precisa de atenção — antes que ele vá para o concorrente.
          </p>
          <ul className="space-y-3">
            {[
              "Resumo de cliente gerado automaticamente com IA",
              "Categorização de e-mails por representada",
              "Alertas proativos de inatividade",
              "Sugestão de pauta para visitas",
            ].map((item) => (
              <li key={item} className="flex items-center gap-3 text-[13px] text-slate-300 font-medium">
                <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-emerald-400" />
                </div>
                {item}
              </li>
            ))}
          </ul>
        </FadeUp>
      </div>
    </section>
  );
}
