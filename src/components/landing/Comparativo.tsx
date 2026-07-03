import React from "react";
import { X, Check, ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { FadeUp, Kicker } from "./primitives";

/* Comparativo "antes vs. depois" — padrão clássico de landing SaaS:
   coluna da esquerda apagada (o caos atual), coluna da direita elevada
   em verde (a vida com o produto). */

const ANTES = [
  "Pedido chega pelo WhatsApp e se perde na conversa",
  "Faturamento de cada representada numa planilha diferente",
  "Cliente fica meses sem comprar e ninguém percebe",
  "Comissão calculada na mão, no fim do mês, com erro",
  "Agenda no papel, visita esquecida, rota improvisada",
];

const DEPOIS = [
  "Pedido digitalizado por IA a partir de foto ou PDF",
  "Dashboard separa faturamento e meta por representada",
  "Alerta automático de inatividade antes de perder o cliente",
  "Comissões calculadas automaticamente, empresa por empresa",
  "Agenda integrada ao Google Calendar com clientes no mapa",
];

export function ComparativoSection() {
  return (
    <section className="py-24 px-6 bg-white border-b border-slate-100">
      <div className="max-w-6xl mx-auto">
        <FadeUp className="text-center max-w-2xl mx-auto mb-14">
          <div className="flex justify-center">
            <Kicker label="Antes e depois" center />
          </div>
          <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
            Aposente a planilha.<br />De verdade.
          </h2>
          <p className="text-slate-500 font-medium">
            O dia a dia de quem representa sem sistema — e o mesmo dia com o Represente-Se.
          </p>
        </FadeUp>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-stretch">
          {/* O jeito antigo */}
          <FadeUp>
            <div className="h-full rounded-3xl border border-slate-200 bg-slate-50/80 p-8">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-6">
                Do jeito antigo
              </p>
              <ul className="space-y-4">
                {ANTES.map((item) => (
                  <li key={item} className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                      <X className="w-3 h-3 text-rose-500" />
                    </span>
                    <span className="text-[14px] font-medium text-slate-500 leading-relaxed">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </FadeUp>

          {/* Com o Represente-Se */}
          <FadeUp delay={0.12}>
            <div className="relative h-full rounded-3xl bg-slate-900 p-8 shadow-2xl shadow-emerald-900/20 ring-1 ring-emerald-500/30 overflow-hidden">
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: "radial-gradient(ellipse 80% 60% at 80% 0%, rgba(16,185,129,0.18) 0%, transparent 60%)" }}
              />
              <div className="relative">
                <p className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-6">
                  <Sparkles className="w-3.5 h-3.5" /> Com o Represente-Se
                </p>
                <ul className="space-y-4">
                  {DEPOIS.map((item) => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="mt-0.5 w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-emerald-400" />
                      </span>
                      <span className="text-[14px] font-semibold text-white leading-relaxed">{item}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  to="/planos"
                  className="mt-8 inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[13px] transition-all shadow-lg shadow-emerald-500/25 hover:-translate-y-0.5 group"
                >
                  Quero essa versão do meu dia
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
              </div>
            </div>
          </FadeUp>
        </div>
      </div>
    </section>
  );
}
