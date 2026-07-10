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
          <div className="relative rounded-[48px] overflow-hidden px-10 md:px-20 py-20 text-center bg-slate-950 ring-1 ring-emerald-500/20">
            {/* glow esmeralda vindo do topo + grade fina */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{ background: "radial-gradient(ellipse 75% 60% at 50% -10%, rgba(16,185,129,0.35) 0%, rgba(16,185,129,0.08) 45%, transparent 70%)" }}
            />
            <div
              className="absolute inset-0 pointer-events-none opacity-[0.35] [mask-image:radial-gradient(ellipse_70%_70%_at_50%_0%,black,transparent_75%)]"
              style={{
                backgroundImage:
                  "linear-gradient(to right, rgba(148,163,184,0.14) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.14) 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />
            <motion.div
              animate={{ opacity: [0.35, 0.6, 0.35] }}
              transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -top-24 left-1/2 -translate-x-1/2 w-[480px] h-[280px] bg-emerald-500/25 blur-[110px] rounded-full pointer-events-none"
            />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 backdrop-blur text-emerald-300 text-[10px] font-black uppercase tracking-widest mb-7">
                <Sparkles className="w-3 h-3" />
                Comece hoje
              </div>
              <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white mb-6 leading-[1.06]">
                Pronto para transformar
                <br />
                <span className="bg-gradient-to-br from-emerald-300 via-emerald-400 to-teal-300 bg-clip-text text-transparent">sua operação comercial?</span>
              </h2>
              <p className="text-slate-400 font-medium text-lg max-w-lg mx-auto mb-10">
                Centralize sua carteira, sua agenda e seu faturamento em um só lugar com a Represente-Se.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                <Link
                  to="/register"
                  className="group flex items-center gap-2 px-10 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-[14px] transition-all shadow-[0_12px_40px_-8px_rgba(16,185,129,0.55)] hover:-translate-y-0.5"
                >
                  Criar minha conta agora
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </Link>
                <Link to="/register" className="px-10 py-4 rounded-2xl border border-white/15 bg-white/5 backdrop-blur text-white font-black text-[14px] transition-all hover:bg-white/10 hover:border-white/25">
                  Ver planos
                </Link>
              </div>
              <p className="text-slate-500 text-[11px] font-medium uppercase tracking-widest mt-7">
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
              <li><Link to="/register" className="hover:text-emerald-600 transition-colors">Planos</Link></li>
              <li><a href="#duvidas" className="hover:text-emerald-600 transition-colors">Dúvidas</a></li>
            </ul>
          </div>
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 mb-4">Conta</p>
            <ul className="space-y-2.5 text-[13px] font-medium">
              <li><Link to="/login" className="hover:text-emerald-600 transition-colors">Entrar</Link></li>
              <li><Link to="/register" className="hover:text-emerald-600 transition-colors">Criar conta</Link></li>
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
