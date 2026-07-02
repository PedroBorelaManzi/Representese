/* CTA final + footer da landing. */
import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { Logo } from "../Logo";
import { FadeUp } from "./primitives";

export function CtaFinalSection() {
  return (
    <section className="py-24 px-6 bg-white">
      <div className="max-w-5xl mx-auto">
        <FadeUp>
          <div className="relative rounded-[48px] overflow-hidden px-10 md:px-20 py-20 text-center"
            style={{ background: "linear-gradient(135deg, #059669 0%, #0d9488 50%, #10b981 100%)" }}
          >
            <div className="absolute inset-0 pointer-events-none opacity-10"
              style={{
                backgroundImage: `radial-gradient(circle, white 1px, transparent 1px)`,
                backgroundSize: "28px 28px",
              }}
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0.8, 0.5] }}
              transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute top-0 right-0 w-80 h-80 bg-white/10 blur-[80px] rounded-full"
            />
            <motion.div
              animate={{ scale: [1, 1.3, 1], opacity: [0.4, 0.7, 0.4] }}
              transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }}
              className="absolute bottom-0 left-0 w-60 h-60 bg-white/10 blur-[60px] rounded-full"
            />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur text-white text-[10px] font-black uppercase tracking-widest mb-6">
                <Sparkles className="w-3 h-3" />
                Comece hoje
              </div>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white mb-6 leading-tight">
                Pronto para transformar<br />sua operação comercial?
              </h2>
              <p className="text-emerald-50 font-medium text-lg max-w-lg mx-auto mb-10">
                Junte-se a mais de 2.000 representantes que já alavancaram seus resultados com a Represente-Se.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/planos"
                  className="group flex items-center gap-2 px-10 py-4 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-700 font-black text-[14px] transition-all shadow-xl hover:-translate-y-0.5"
                >
                  Escolher meu plano
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <a href="#precos" className="px-10 py-4 rounded-2xl border border-white/30 bg-white/10 backdrop-blur text-white font-black text-[14px] transition-all hover:bg-white/20">
                  Ver planos
                </a>
              </div>
              <p className="text-emerald-100/80 text-[11px] font-medium uppercase tracking-widest mt-6">
                Satisfação garantida · Sem compromisso · Cancele quando quiser
              </p>
            </div>
          </div>
        </FadeUp>
      </div>
    </section>
  );
}

export function LandingFooter() {
  return (
    <footer className="bg-slate-50 border-t border-slate-200 text-slate-500 px-6 pt-16 pb-10">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-10 mb-12">
          <div className="col-span-2 md:col-span-1">
            <Logo showText variant="light" />
            <p className="text-[13px] font-medium leading-relaxed mt-4 max-w-xs">
              A plataforma completa para representantes comerciais brasileiros.
            </p>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">Produto</p>
            <ul className="space-y-2.5 text-[13px] font-medium">
              <li><a href="#diferencial" className="hover:text-emerald-600 transition-colors">Diferencial</a></li>
              <li><a href="#recursos" className="hover:text-emerald-600 transition-colors">Recursos</a></li>
              <li><a href="#industrias" className="hover:text-emerald-600 transition-colors">Setores</a></li>
              <li><a href="#precos" className="hover:text-emerald-600 transition-colors">Planos</a></li>
              <li><a href="#duvidas" className="hover:text-emerald-600 transition-colors">Dúvidas</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">Conta</p>
            <ul className="space-y-2.5 text-[13px] font-medium">
              <li><Link to="/login" className="hover:text-emerald-600 transition-colors">Entrar</Link></li>
              <li><Link to="/planos" className="hover:text-emerald-600 transition-colors">Criar conta</Link></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">Legal</p>
            <ul className="space-y-2.5 text-[13px] font-medium">
              <li><Link to="/privacy" className="hover:text-emerald-600 transition-colors">Privacidade</Link></li>
              <li><Link to="/terms" className="hover:text-emerald-600 transition-colors">Termos</Link></li>
            </ul>
          </div>
        </div>
        <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[12px] font-medium text-slate-400">
            © 2026 Represente-Se — Tecnologia para Representações Comerciais
          </p>
          <p className="text-[12px] font-medium text-slate-400 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Todos os sistemas operacionais
          </p>
        </div>
      </div>
    </footer>
  );
}
