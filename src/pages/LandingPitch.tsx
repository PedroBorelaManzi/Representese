import React, { useState } from "react";
import {
  motion,
  useScroll,
  useMotionValueEvent,
  useSpring,
} from "framer-motion";
import { Star, Play, ArrowRight, Brain, TrendingUp } from "lucide-react";
import { Logo } from "../components/Logo";
import { BrowserDashboard } from "../components/LandingMockups";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { NAV, NAV_IDS, avatars } from "../components/landing/data";
import { useActiveSection } from "../components/landing/primitives";
import { IntegrationsMarquee, DiferencialSection } from "../components/landing/Diferencial";
import { RecursosBentoSection, CrmHighlightSection, IaSection } from "../components/landing/Recursos";
import { SetoresSection } from "../components/landing/Setores";
import { MultiplataformaSection, ComoFuncionaSection, ProvaSocialSection } from "../components/landing/Plataforma";
import { PlanosSection } from "../components/landing/Planos";
import { FaqSection } from "../components/landing/Faq";
import { CtaFinalSection, LandingFooter } from "../components/landing/CtaFooter";

/* Página composta por seções em src/components/landing/ (auditoria 3.1).
   Aqui ficam só a nav e o hero, que dependem do estado de scroll da página. */
export default function LandingPitch() {
  const { scrollY, scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  const [scrolled, setScrolled] = useState(false);
  const { user } = useAuth();
  const active = useActiveSection(NAV_IDS);

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden font-sans selection:bg-emerald-100 selection:text-emerald-900">

      {/* ── SCROLL PROGRESS ─────────────────────────────────── */}
      <motion.div
        style={{ scaleX: progressX }}
        className="fixed top-0 left-0 right-0 h-[3px] origin-left bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-500 z-[60]"
      />

      {/* ── NAV ─────────────────────────────────────────────── */}
      <motion.nav
        style={{
          paddingTop:    scrolled ? "10px" : "18px",
          paddingBottom: scrolled ? "10px" : "18px",
        }}
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrolled
            ? "bg-white/85 backdrop-blur-xl border-b border-slate-200/60 shadow-[0_4px_24px_rgba(0,0,0,0.04)]"
            : "bg-white/50 backdrop-blur-md"
        )}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link to={user ? "/dashboard" : "/"}>
            {/* No mobile só o ícone: logo com texto + Entrar + CTA não cabem em 390px */}
            <Logo size="sm" showText variant="light" className="hidden sm:flex" />
            <Logo size="sm" iconOnly variant="light" className="sm:hidden" />
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {NAV.map((item) => {
              const isActive = active === item.id;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={cn(
                    "text-[13px] font-semibold transition-colors relative group",
                    isActive ? "text-emerald-600" : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {item.label}
                  <span
                    className={cn(
                      "absolute -bottom-1 left-0 h-0.5 bg-emerald-500 transition-all duration-300",
                      isActive ? "w-full" : "w-0 group-hover:w-full"
                    )}
                  />
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            <Link to="/login" className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors px-2.5 sm:px-4 py-2">Entrar</Link>
            <Link to="/planos" className="group text-[13px] font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-all px-3.5 sm:px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:-translate-y-0.5 flex items-center gap-1.5 whitespace-nowrap">
              Cadastre-se
              <ArrowRight className="hidden sm:block w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-32 pb-16 px-6 overflow-hidden bg-white">
        {/* fundo premium: grade arquitetural + brilho suave */}
        <div className="absolute inset-0 pointer-events-none">
          {/* grade fina com máscara radial */}
          <div
            className="absolute inset-0 [mask-image:radial-gradient(ellipse_70%_60%_at_50%_0%,black,transparent_80%)]"
            style={{
              backgroundImage:
                "linear-gradient(to right, rgba(100,116,139,0.10) 1px, transparent 1px), linear-gradient(to bottom, rgba(100,116,139,0.10) 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />
          {/* spotlight suave no topo */}
          <div
            className="absolute inset-0"
            style={{ background: "radial-gradient(ellipse 65% 55% at 50% -8%, rgba(16,185,129,0.12) 0%, transparent 60%)" }}
          />
          {/* halos discretos */}
          <motion.div
            animate={{ x: [0, 40, 0], y: [0, -24, 0], scale: [1, 1.12, 1] }}
            transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[20%] left-[10%] w-80 h-80 bg-emerald-300/25 blur-[120px] rounded-full"
          />
          <motion.div
            animate={{ x: [0, -34, 0], y: [0, 30, 0], scale: [1, 1.15, 1] }}
            transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
            className="absolute top-[16%] right-[10%] w-72 h-72 bg-teal-300/25 blur-[120px] rounded-full"
          />
          {/* fade para branco embaixo */}
          <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-white via-white to-transparent" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-200 bg-emerald-50/80 backdrop-blur text-emerald-700 text-[11px] font-black uppercase tracking-widest mb-8 shadow-sm"
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            A plataforma de quem representa várias marcas
          </motion.div>

          {/* headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-6xl md:text-[76px] font-black tracking-[-0.04em] leading-[1.03] text-slate-900 mb-6"
          >
            <span className="block">
              Você que representa{" "}
              <span className="relative inline-block">
                <span className="bg-gradient-to-br from-emerald-500 via-emerald-500 to-teal-400 bg-clip-text text-transparent">
                  várias
                </span>
                <svg className="absolute -bottom-1.5 left-0 w-full" height="12" viewBox="0 0 200 12" fill="none" preserveAspectRatio="none">
                  <motion.path
                    d="M2 9C50 3 150 3 198 9"
                    stroke="url(#g)"
                    strokeWidth="4"
                    strokeLinecap="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 1, delay: 0.8, ease: "easeInOut" }}
                  />
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#10b981" />
                      <stop offset="1" stopColor="#2dd4bf" />
                    </linearGradient>
                  </defs>
                </svg>
              </span>{" "}
              empresas.
            </span>
            <span className="block">Comande todas em um só lugar.</span>
          </motion.h1>

          {/* subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg sm:text-xl text-slate-500 font-medium leading-relaxed max-w-2xl mx-auto mb-10"
          >
            O Represente-Se é a central de quem carrega um portfólio de marcas.
            Pedidos, faturamento e metas separados por representada — com CRM, agenda,
            e-mail e IA trabalhando junto por você.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10"
          >
            <Link
              to="/planos"
              className="group relative flex items-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition-all shadow-xl shadow-emerald-600/25 hover:shadow-2xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 overflow-hidden"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              Criar minha conta
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <a href="#recursos" className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-slate-200 bg-white/70 backdrop-blur hover:bg-white hover:border-slate-300 text-slate-700 font-semibold text-sm transition-all shadow-sm">
              <span className="w-7 h-7 rounded-full bg-emerald-50 flex items-center justify-center">
                <Play className="w-3 h-3 text-emerald-600 fill-emerald-600" />
              </span>
              Ver demonstração
            </a>
          </motion.div>

          {/* social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <div className="flex -space-x-2.5">
              {avatars.map((a) => (
                <div key={a} className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 border-2 border-white flex items-center justify-center text-white text-[9px] font-black shadow-sm">
                  {a}
                </div>
              ))}
            </div>
            <div className="flex flex-col items-center sm:items-start">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                ))}
                <span className="text-[13px] font-black text-slate-800 ml-1">4.9/5</span>
              </div>
              <p className="text-slate-500 text-[12px] font-medium">
                <span className="text-slate-800 font-semibold">2.000+ representantes</span> confiam na plataforma
              </p>
            </div>
          </motion.div>
        </div>

        {/* dashboard mockup (codado, janela de navegador) */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mt-16 max-w-3xl mx-auto w-full px-4"
        >
          <div className="relative">
            <div className="absolute -inset-4 bg-gradient-to-b from-emerald-200/50 to-transparent blur-3xl rounded-3xl -z-10" />
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-[0_30px_90px_rgba(0,0,0,0.14),0_6px_20px_rgba(0,0,0,0.06)] ring-1 ring-slate-900/5">
              <BrowserDashboard />
            </div>

            {/* floating cards */}
            <motion.div
              animate={{ y: [-6, 6, -6] }}
              transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
              className="hidden md:flex absolute -top-5 -left-6 bg-white rounded-2xl shadow-xl border border-slate-100 p-3.5 items-center gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] font-black text-slate-900 leading-none">+32% pedidos</p>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">este mês</p>
              </div>
            </motion.div>

            <motion.div
              animate={{ y: [6, -6, 6] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
              className="hidden md:flex absolute -bottom-5 -right-6 bg-white rounded-2xl shadow-xl border border-slate-100 p-3.5 items-center gap-3"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                <Brain className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-[11px] font-black text-slate-900 leading-none">Resumo pronto</p>
                <p className="text-[10px] text-slate-500 font-medium mt-0.5">gerado por IA</p>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </section>

      <IntegrationsMarquee />
      <DiferencialSection />
      <RecursosBentoSection />
      <CrmHighlightSection />
      <IaSection />
      <SetoresSection />
      <MultiplataformaSection />
      <ComoFuncionaSection />
      <ProvaSocialSection />
      <PlanosSection />
      <FaqSection />
      <CtaFinalSection />
      <LandingFooter />
    </div>
  );
}
