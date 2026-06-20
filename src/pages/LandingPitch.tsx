import React, { useState, useRef, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
  useSpring,
  useInView,
  useMotionValue,
  animate,
} from "framer-motion";
import {
  Check,
  Building2,
  ShoppingCart,
  Plus as PlusIcon,
  Briefcase,
  Zap,
  Store,
  Star,
  ChevronDown,
  Wheat,
  Play,
  ArrowRight,
  MapPin,
  Calendar,
  Mail,
  Users,
  Brain,
  BarChart3,
  Clock,
  Sparkles,
  ShieldCheck,
  TrendingUp,
  Quote,
  MessageSquare,
  AlertTriangle,
  Monitor,
  Smartphone,
  Laptop,
  Layers,
  Target,
  Wallet,
} from "lucide-react";
import { Logo } from "../components/Logo";
import { BrowserDashboard, PhoneDashboard, CrmListMock } from "../components/LandingMockups";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { plans } from "../lib/plansData";

/* ─── navegação (ordem = ordem dos capítulos na página) ───────── */
const NAV = [
  { id: "diferencial", label: "Diferencial", num: "01" },
  { id: "recursos",    label: "Recursos",    num: "02" },
  { id: "industrias",  label: "Setores",     num: "03" },
  { id: "precos",      label: "Planos",      num: "04" },
  { id: "duvidas",     label: "Dúvidas",     num: "05" },
];
const NAV_IDS = NAV.map((n) => n.id);

/* ─── dados ─────────────────────────────────────────────────── */

const industries = [
  { name: "Construção",     icon: Building2,    image: "/assets/setor_materiais.webp" },
  { name: "Supermercados",  icon: ShoppingCart,  image: "/assets/setor_supermercado.webp" },
  { name: "Farmácias",      icon: PlusIcon,      image: "/assets/setor_farmacia.webp",     objectPosition: "50% 20%" },
  { name: "Distribuidoras", icon: Store,         image: "/assets/setor_distribuidora.webp" },
  { name: "Serviços",       icon: Briefcase,     image: "/assets/setor_servicos.webp",     objectPosition: "50% 15%" },
  { name: "Agronegócio",    icon: Wheat,         image: "/assets/setor_agro.webp" },
  { name: "Outros",         icon: Zap,           image: "/assets/setor_outros.webp" },
];

const integrations = [
  { icon: Calendar,      label: "Google Calendar" },
  { icon: Mail,          label: "Gmail" },
  { icon: MessageSquare, label: "WhatsApp" },
  { icon: Brain,         label: "Assistente IA" },
  { icon: MapPin,        label: "Google Maps" },
  { icon: Building2,     label: "Busca CNPJ" },
  { icon: BarChart3,     label: "BI & Analytics" },
  { icon: ShieldCheck,   label: "Supabase" },
];

const painPoints = [
  { icon: Layers,        title: "Cada representada num canto",          desc: "WhatsApp de uma, tabela de preço de outra, planilha de uma terceira. Você passa o dia costurando a mão o que deveria estar centralizado." },
  { icon: BarChart3,     title: "Sem visão de quanto rende cada marca", desc: "Quanto você faturou de cada representada esse mês? Quem está perto da meta? Sem isso na tela, você não sabe onde focar." },
  { icon: AlertTriangle, title: "Cliente e pedido escapando",          desc: "No meio de tantas marcas, o pedido sem acompanhamento passa batido — e vira faturamento do concorrente." },
];

/* representadas do painel-demonstração (seção diferencial) */
const representadas = [
  { name: "Tintas Aurora",      faturamento: 48200, meta: 60000, pedidos: 32, color: "#10b981" },
  { name: "AgroMax Insumos",    faturamento: 71500, meta: 75000, pedidos: 41, color: "#0ea5e9" },
  { name: "Farma Distribuidora", faturamento: 23900, meta: 40000, pedidos: 18, color: "#8b5cf6" },
];
const representadasTotal = representadas.reduce((s, r) => s + r.faturamento, 0);

const faqs = [
  { question: "Como funciona a garantia de 7 dias?",         answer: "Você começa sem compromisso. Se não se adaptar por qualquer motivo dentro dos primeiros 7 dias, reembolsamos 100% do valor investido." },
  { question: "Posso mudar de plano a qualquer momento?",    answer: "Sim. Upgrade e downgrade disponíveis diretamente nas configurações da conta, sem burocracia e com efeito imediato." },
  { question: "O sistema funciona em dispositivos móveis?",  answer: "Totalmente. App nativo para iOS e Android além da versão web responsiva — gerencie sua carteira de qualquer lugar, inclusive offline." },
  { question: "Preciso instalar alguma coisa?",              answer: "Não. Roda direto no navegador e como app no celular. Seus dados sincronizam automaticamente entre todos os dispositivos." },
  { question: "Como funciona o suporte?",                    answer: "Suporte via e-mail e WhatsApp conforme o plano. Nossa equipe resolve dúvidas técnicas e operacionais com rapidez de verdade." },
  { question: "Meus dados estão seguros?",                   answer: "Utilizamos criptografia de ponta e infraestrutura de alta disponibilidade na Supabase. Seus dados e os de seus clientes ficam protegidos e sob seu controle." },
];

const stats = [
  { to: 2000, prefix: "+", suffix: "",      sep: true,  label: "representantes ativos" },
  { to: 50,   prefix: "+", suffix: "k",     sep: false, label: "clientes gerenciados" },
  { to: 98,   prefix: "",  suffix: "%",     sep: false, label: "satisfação dos usuários" },
  { to: 20,   prefix: "+", suffix: "h",     sep: false, label: "economizadas por mês" },
];

const bentoFeatures = [
  {
    icon: Brain,
    title: "Inteligência Artificial",
    desc: "Nossa IA gera resumos de clientes, categoriza e-mails e antecipa quem precisa de atenção — antes do concorrente.",
    span: "lg:col-span-2 lg:row-span-2",
    dark: true,
  },
  {
    icon: Users,
    title: "CRM completo",
    desc: "Carteira organizada com histórico, alertas de inatividade e resumo individual por cliente.",
    span: "lg:col-span-2",
  },
  {
    icon: Calendar,
    title: "Agenda inteligente",
    desc: "Importe seus compromissos em um só clique.",
    span: "",
  },
  {
    icon: MapPin,
    title: "Mapa de clientes",
    desc: "Toda a carteira no mapa, com rotas inteligentes.",
    span: "",
  },
  {
    icon: BarChart3,
    title: "Faturamento por empresa",
    desc: "Gráfico mensal por representada, teto configurável e histórico de performance.",
    span: "lg:col-span-2",
  },
  {
    icon: Mail,
    title: "E-mail vinculado",
    desc: "Caixa de entrada integrada ao Gmail, cada e-mail no cliente certo.",
    span: "lg:col-span-2",
  },
];

const testimonials = [
  {
    quote: "O controle que tenho hoje sobre minha carteira é algo que eu nunca imaginei ser possível. Recuperei mais de 20 horas por mês.",
    name: "Ricardo Moreira",
    role: "Representante · São Paulo",
    initials: "RM",
  },
  {
    quote: "A IA gera o resumo do cliente em segundos. Chego na visita sabendo exatamente o que falar. Fechei 30% mais pedidos.",
    name: "Juliana Castro",
    role: "Representante · Curitiba",
    initials: "JC",
  },
  {
    quote: "Parei de perder cliente por esquecimento. O alerta de inatividade me avisa antes do prejuízo acontecer. Mudou meu jogo.",
    name: "André Ferreira",
    role: "Representante · Goiânia",
    initials: "AF",
  },
];

const avatars = ["RM", "JC", "AF", "PS", "LB"];

/* ─── helpers ───────────────────────────────────────────────── */

function FadeUp({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* eyebrow/kicker padronizado — dá identidade de "capítulo" a cada seção */
function Kicker({
  num,
  label,
  dark = false,
  center = false,
  tone = "emerald",
}: {
  num?: string;
  label: string;
  dark?: boolean;
  center?: boolean;
  tone?: "emerald" | "rose";
}) {
  const text = dark
    ? "text-emerald-400"
    : tone === "rose"
      ? "text-rose-500"
      : "text-emerald-600";
  const line = dark ? "bg-emerald-400/30" : tone === "rose" ? "bg-rose-400/40" : "bg-emerald-500/30";
  const numC = dark ? "text-emerald-400/60" : tone === "rose" ? "text-rose-400/70" : "text-emerald-500/60";
  return (
    <div className={cn("inline-flex items-center gap-2.5 mb-4", center && "justify-center")}>
      {num && <span className={cn("text-[12px] font-black tabular-nums", numC)}>{num}</span>}
      {num && <span className={cn("h-px w-7", line)} />}
      <span className={cn("text-[11px] font-black uppercase tracking-widest", text)}>{label}</span>
    </div>
  );
}

/* destaca o item de menu da seção que o usuário está vendo.
   abordagem por posição de scroll = determinística (sem flicker em saltos) */
function useActiveSection(ids: string[]) {
  const [active, setActive] = useState<string>("");
  useEffect(() => {
    const onScroll = () => {
      const line = window.innerHeight * 0.35;
      let current = "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [ids]);
  return active;
}

/* contador animado que dispara ao entrar na viewport */
function Counter({
  to,
  prefix = "",
  suffix = "",
  sep = false,
  duration = 2,
}: {
  to: number;
  prefix?: string;
  suffix?: string;
  sep?: boolean;
  duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const mv = useMotionValue(0);
  const [display, setDisplay] = useState(`${prefix}0${suffix}`);

  useEffect(() => {
    if (!inView) return;
    const controls = animate(mv, to, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => {
        const n = Math.round(v);
        const num = sep ? n.toLocaleString("pt-BR") : String(n);
        setDisplay(`${prefix}${num}${suffix}`);
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, to]);

  return <span ref={ref}>{display}</span>;
}

/* card com brilho que segue o cursor */
function SpotlightCard({
  children,
  className = "",
  glow = "rgba(16,185,129,0.12)",
}: {
  children: React.ReactNode;
  className?: string;
  glow?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [opacity, setOpacity] = useState(0);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={cn("relative overflow-hidden", className)}
    >
      <div
        className="pointer-events-none absolute -inset-px transition-opacity duration-300"
        style={{
          opacity,
          background: `radial-gradient(450px circle at ${pos.x}px ${pos.y}px, ${glow}, transparent 45%)`,
        }}
      />
      {children}
    </div>
  );
}

/* ─── componente principal ──────────────────────────────────── */
export default function LandingPitch() {
  const { scrollY, scrollYProgress } = useScroll();
  const progressX = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });
  const [scrolled, setScrolled]               = useState(false);
  const [hoveredIndustry, setHoveredIndustry] = useState<number | null>(null);
  const [openFaq, setOpenFaq]                 = useState<number | null>(0);
  const [annual, setAnnual]                   = useState(true);
  const { user }                              = useAuth();
  const active                                = useActiveSection(NAV_IDS);

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
            <Logo size="sm" showText variant="light" />
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

          <div className="flex items-center gap-3">
            <Link to="/login" className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors px-4 py-2">Entrar</Link>
            <Link to="/register" className="group text-[13px] font-black text-white bg-emerald-600 hover:bg-emerald-500 transition-all px-5 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30 hover:-translate-y-0.5 flex items-center gap-1.5 whitespace-nowrap">
              Cadastre-se
              <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
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
              to="/register"
              className="group relative flex items-center gap-2 px-8 py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm transition-all shadow-xl shadow-emerald-600/25 hover:shadow-2xl hover:shadow-emerald-600/30 hover:-translate-y-0.5 overflow-hidden"
            >
              <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
              Criar minha conta grátis
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

      {/* ── INTEGRAÇÕES MARQUEE (faixa de confiança) ────────── */}
      <section className="bg-white border-y border-slate-100 py-10 overflow-hidden">
        <p className="text-center text-[11px] font-black uppercase tracking-widest text-slate-400 mb-7">
          Integrações nativas com as ferramentas que você já usa
        </p>
        <div className="relative">
          <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-white to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-24 bg-gradient-to-l from-white to-transparent z-10" />
          <motion.div
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 28, repeat: Infinity, ease: "linear" }}
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

      {/* ══════════════════════════════════════════════════════
          CAPÍTULO 01 · DIFERENCIAL (problema → solução juntos)
          ══════════════════════════════════════════════════════ */}
      <section id="diferencial" className="relative py-24 px-6 bg-gradient-to-b from-emerald-50/70 via-white to-white scroll-mt-20 overflow-hidden">
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

              <Link to="/register" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[13px] transition-all shadow-lg shadow-emerald-600/20 hover:-translate-y-0.5 group">
                Centralizar minhas representadas
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
            </FadeUp>

            {/* painel de representadas */}
            <FadeUp delay={0.15}>
              <div className="relative">
                <div className="absolute -inset-4 bg-emerald-400/10 blur-[80px] rounded-full -z-10" />
                <div className="relative bg-white rounded-[28px] border border-slate-200 shadow-xl ring-1 ring-slate-900/5 overflow-hidden">
                  {/* header */}
                  <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600">Painel de representadas</p>
                      <p className="text-[15px] font-black text-slate-900">Faturamento de junho</p>
                    </div>
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 flex items-center justify-center">
                      <Layers className="w-5 h-5 text-emerald-600" />
                    </div>
                  </div>

                  {/* linhas */}
                  <div className="p-5 space-y-3.5">
                    {representadas.map((r, i) => {
                      const pct = Math.min(100, Math.round((r.faturamento / r.meta) * 100));
                      return (
                        <div key={r.name} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
                          <div className="flex items-center justify-between mb-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className="w-2.5 h-2.5 rounded-full" style={{ background: r.color }} />
                              <span className="text-[13px] font-black text-slate-800">{r.name}</span>
                            </div>
                            <span className="text-[11px] font-bold text-slate-400">{r.pedidos} pedidos</span>
                          </div>
                          <div className="flex items-end justify-between mb-2">
                            <span className="text-[17px] font-black text-slate-900">
                              R$ {r.faturamento.toLocaleString("pt-BR")}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500">
                              {pct}% da meta
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                            <motion.div
                              initial={{ width: 0 }}
                              whileInView={{ width: `${pct}%` }}
                              viewport={{ once: true }}
                              transition={{ duration: 1.1, delay: 0.2 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
                              className="h-full rounded-full"
                              style={{ background: r.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* total */}
                  <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-white">
                    <span className="text-[12px] font-bold text-slate-500 uppercase tracking-wider">Total no mês</span>
                    <span className="text-[19px] font-black text-emerald-600">
                      R$ {representadasTotal.toLocaleString("pt-BR")}
                    </span>
                  </div>
                </div>

                {/* badge flutuante */}
                <motion.div
                  animate={{ y: [-5, 5, -5] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="hidden sm:flex absolute -top-5 -right-5 bg-white rounded-2xl shadow-xl border border-slate-100 p-3.5 items-center gap-3"
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-[11px] font-black text-slate-900 leading-none">{representadas.length} representadas</p>
                    <p className="text-[10px] text-slate-500 font-medium mt-0.5">controladas num lugar</p>
                  </div>
                </motion.div>
              </div>
            </FadeUp>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CAPÍTULO 02 · RECURSOS (plataforma completa)
          ══════════════════════════════════════════════════════ */}
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

      {/* ── RECURSOS · destaque CRM ─────────────────────────── */}
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
            <Link to="/register" className="inline-flex items-center gap-2 text-[13px] font-black text-emerald-600 hover:text-emerald-700 transition-colors group">
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

      {/* ── RECURSOS · IA (dark) ────────────────────────────── */}
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

      {/* ══════════════════════════════════════════════════════
          CAPÍTULO 03 · SETORES
          ══════════════════════════════════════════════════════ */}
      <section id="industrias" className="min-h-[80vh] py-20 bg-white border-b border-slate-100 relative overflow-hidden flex items-center transition-all duration-700 scroll-mt-20">
        <AnimatePresence>
          {hoveredIndustry !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
              className="absolute inset-0 z-0"
            >
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px] z-10" />
              <motion.img
                key={industries[hoveredIndustry].image}
                initial={{ scale: 1.08 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                src={industries[hoveredIndustry].image}
                alt=""
                className="w-full h-full object-cover"
                style={{ objectPosition: (industries[hoveredIndustry] as { objectPosition?: string }).objectPosition ?? "center" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto px-6 relative z-20 w-full">
          <div className="text-center mb-14">
            <FadeUp>
              <div className="flex justify-center">
                <Kicker num="03" label="Setores atendidos" dark={hoveredIndustry !== null} />
              </div>
              <h2 className={cn("text-3xl sm:text-5xl md:text-7xl font-black tracking-tight mb-3 transition-colors duration-500", hoveredIndustry !== null ? "text-white" : "text-slate-900")}>
                Feito para o seu mercado.
              </h2>
              <p className={cn("font-medium transition-colors duration-500", hoveredIndustry !== null ? "text-white/60" : "text-slate-500")}>
                Interface customizada por setor de atuação
              </p>
            </FadeUp>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {industries.map((item, idx) => (
              <motion.button
                key={idx}
                onMouseEnter={() => setHoveredIndustry(idx)}
                onMouseLeave={() => setHoveredIndustry(null)}
                whileHover={{ y: -10, scale: 1.12 }}
                transition={{ duration: 0.2 }}
                className={cn(
                  "p-5 md:p-8 rounded-[28px] border-2 flex flex-col items-center gap-3 transition-all duration-400 shadow-md",
                  hoveredIndustry === null
                    ? "bg-white border-slate-100 hover:shadow-xl hover:border-emerald-200"
                    : hoveredIndustry === idx
                      ? "bg-white border-white scale-110 z-30 shadow-2xl"
                      : "bg-white/5 border-white/10 opacity-25 blur-[1px] scale-95 grayscale"
                )}
              >
                <div className={cn(
                  "p-4 rounded-2xl transition-all",
                  hoveredIndustry === idx ? "bg-emerald-100" : "bg-emerald-50"
                )}>
                  <item.icon className={cn("w-6 h-6", hoveredIndustry === idx ? "text-emerald-700" : "text-emerald-600")} />
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-tight text-center leading-tight transition-colors duration-400",
                  hoveredIndustry !== null && hoveredIndustry !== idx ? "text-transparent" : "text-slate-900"
                )}>
                  {item.name}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* ── MULTIPLATAFORMA (dispositivos codados) ──────────── */}
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

      {/* ── COMO FUNCIONA · 3 passos ────────────────────────── */}
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
            <Link to="/register" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-[13px] transition-all shadow-lg shadow-emerald-600/20 hover:-translate-y-0.5 group">
              Criar minha conta grátis
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </FadeUp>
        </div>
      </section>

      {/* ── PROVA SOCIAL · números + depoimentos ────────────── */}
      <section className="py-24 px-6 bg-slate-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto">
          {/* números */}
          <FadeUp className="text-center mb-14">
            <Kicker label="Resultados reais" center />
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
              Representantes que<br />mudaram o jogo.
            </h2>
          </FadeUp>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 max-w-5xl mx-auto mb-20">
            {stats.map((s, i) => (
              <FadeUp key={s.label} delay={i * 0.05}>
                <div className="text-center">
                  <p className="text-4xl md:text-5xl font-black bg-gradient-to-br from-slate-900 to-slate-600 bg-clip-text text-transparent mb-1">
                    <Counter to={s.to} prefix={s.prefix} suffix={s.suffix} sep={s.sep} />
                  </p>
                  <p className="text-[12px] text-slate-500 font-medium uppercase tracking-wider">{s.label}</p>
                </div>
              </FadeUp>
            ))}
          </div>

          {/* depoimentos */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {testimonials.map((t, i) => (
              <FadeUp key={t.name} delay={i * 0.1}>
                <div className="h-full bg-white rounded-3xl border border-slate-200 p-8 shadow-sm relative overflow-hidden flex flex-col">
                  <Quote className="absolute top-6 right-6 w-10 h-10 text-emerald-50 fill-emerald-50" />
                  <div className="flex gap-1 mb-5 relative z-10">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <Star key={s} className="w-4 h-4 fill-amber-400 text-amber-400" />
                    ))}
                  </div>
                  <blockquote className="text-[15px] font-bold text-slate-800 leading-relaxed mb-6 relative z-10 flex-1">
                    "{t.quote}"
                  </blockquote>
                  <div className="flex items-center gap-3 relative z-10">
                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-black text-white text-xs">
                      {t.initials}
                    </div>
                    <div>
                      <p className="text-[13px] font-black text-slate-900">{t.name}</p>
                      <p className="text-[11px] text-slate-500 font-medium">{t.role}</p>
                    </div>
                  </div>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CAPÍTULO 04 · PLANOS
          ══════════════════════════════════════════════════════ */}
      <section id="precos" className="py-24 px-6 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto">
          <FadeUp className="text-center mb-10">
            <Kicker num="04" label="Planos & preços" center />
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
              Planos que crescem com você.
            </h2>
            <p className="text-slate-500 font-medium max-w-xl mx-auto">
              Seu plano acompanha o número de empresas que você representa — de 1 a ilimitadas. 7 dias de garantia, sem fidelidade.
            </p>
          </FadeUp>

          {/* toggle */}
          <FadeUp delay={0.1} className="flex justify-center mb-12">
            <div className="inline-flex items-center gap-1 p-1 rounded-2xl bg-slate-100 border border-slate-200">
              <button
                onClick={() => setAnnual(false)}
                className={cn(
                  "px-5 py-2 rounded-xl text-[13px] font-black transition-all",
                  !annual ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Mensal
              </button>
              <button
                onClick={() => setAnnual(true)}
                className={cn(
                  "px-5 py-2 rounded-xl text-[13px] font-black transition-all flex items-center gap-2",
                  annual ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                )}
              >
                Anual
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black">-10%</span>
              </button>
            </div>
          </FadeUp>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
            {plans.map((plan, i) => {
              const price = annual ? plan.annualPrice : plan.price;
              const discount = Math.round((1 - Number(price) / Number(plan.originalPrice)) * 100);
              const repLabel =
                plan.id === "master"
                  ? "Representadas ilimitadas"
                  : plan.id === "profissional"
                    ? "Até 5 representadas"
                    : "1 representada";
              return (
                <FadeUp key={plan.id} delay={i * 0.08} className={plan.popular ? "md:-mt-4" : ""}>
                  <div
                    className={cn(
                      "relative h-full rounded-3xl border p-8 flex flex-col transition-all duration-300",
                      plan.popular
                        ? "bg-slate-950 border-slate-800 text-white shadow-2xl shadow-emerald-900/20"
                        : "bg-white border-slate-200 hover:border-emerald-200 hover:shadow-xl"
                    )}
                  >
                    {plan.popular && (
                      <>
                        <div
                          className="absolute inset-0 rounded-3xl opacity-60 pointer-events-none"
                          style={{ background: "radial-gradient(ellipse 90% 60% at 50% 0%, rgba(16,185,129,0.2), transparent 60%)" }}
                        />
                        <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white text-[10px] font-black uppercase tracking-widest shadow-lg whitespace-nowrap">
                          Mais escolhido
                        </div>
                      </>
                    )}

                    <div className="relative z-10 flex flex-col h-full">
                      <div className="flex items-center gap-3 mb-5">
                        <div className={cn(
                          "w-11 h-11 rounded-2xl flex items-center justify-center",
                          plan.popular ? "bg-emerald-500/20" : "bg-emerald-50"
                        )}>
                          <plan.icon className={cn("w-5 h-5", plan.popular ? "text-emerald-400" : "text-emerald-600")} />
                        </div>
                        <div>
                          <p className={cn("text-[10px] font-black uppercase tracking-widest", plan.popular ? "text-emerald-400" : "text-emerald-600")}>
                            Acesso
                          </p>
                          <h3 className={cn("text-lg font-black", plan.popular ? "text-white" : "text-slate-900")}>{plan.name}</h3>
                        </div>
                      </div>

                      <div className={cn(
                        "inline-flex items-center gap-1.5 self-start px-3 py-1 rounded-full text-[11px] font-black mb-4",
                        plan.popular ? "bg-emerald-500/15 text-emerald-300" : "bg-emerald-50 text-emerald-700"
                      )}>
                        <Building2 className="w-3 h-3" />
                        {repLabel}
                      </div>

                      <p className={cn("text-[13px] font-medium mb-6", plan.popular ? "text-slate-400" : "text-slate-500")}>
                        {plan.description}
                      </p>

                      <div className="mb-1 flex items-end gap-2">
                        <span className={cn("text-[15px] font-bold line-through", plan.popular ? "text-slate-500" : "text-slate-400")}>
                          R${plan.originalPrice}
                        </span>
                        {discount > 0 && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-700 text-[10px] font-black mb-1">
                            {discount}% OFF
                          </span>
                        )}
                      </div>
                      <div className="flex items-end gap-1 mb-1">
                        <span className={cn("text-2xl font-black mb-1", plan.popular ? "text-white" : "text-slate-900")}>R$</span>
                        <span className={cn("text-5xl font-black tracking-tight", plan.popular ? "text-white" : "text-slate-900")}>{price}</span>
                        <span className={cn("text-[14px] font-bold mb-2", plan.popular ? "text-slate-400" : "text-slate-500")}>/mês</span>
                      </div>
                      <p className={cn("text-[11px] font-medium mb-6 h-4", plan.popular ? "text-slate-500" : "text-slate-400")}>
                        {annual ? "cobrado anualmente" : "no plano mensal"}
                      </p>

                      <Link
                        to="/register"
                        className={cn(
                          "group flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl text-[13px] font-black transition-all mb-7",
                          plan.popular
                            ? "bg-emerald-500 hover:bg-emerald-400 text-white shadow-lg shadow-emerald-500/30"
                            : "bg-slate-900 hover:bg-slate-800 text-white"
                        )}
                      >
                        Começar agora
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                      </Link>

                      <ul className="space-y-3 mt-auto">
                        {plan.features.map((feat) => (
                          <li key={feat.text} className={cn("flex items-center gap-3 text-[12.5px] font-medium", plan.popular ? "text-slate-300" : "text-slate-600")}>
                            <div className={cn(
                              "w-[18px] h-[18px] rounded-full flex items-center justify-center flex-shrink-0",
                              plan.popular ? "bg-emerald-500/20" : "bg-emerald-100"
                            )}>
                              <Check className={cn("w-2.5 h-2.5", plan.popular ? "text-emerald-400" : "text-emerald-600")} />
                            </div>
                            {feat.text}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </FadeUp>
              );
            })}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════
          CAPÍTULO 05 · DÚVIDAS
          ══════════════════════════════════════════════════════ */}
      <section id="duvidas" className="py-24 px-6 bg-slate-50 border-y border-slate-100 scroll-mt-20">
        <div className="max-w-3xl mx-auto">
          <FadeUp className="text-center mb-12">
            <Kicker num="05" label="Perguntas frequentes" center />
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900">
              Ainda em dúvida?
            </h2>
          </FadeUp>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <FadeUp key={idx} delay={idx * 0.04}>
                <div
                  className={cn(
                    "rounded-2xl border transition-all duration-200 overflow-hidden",
                    openFaq === idx ? "border-emerald-200 bg-white shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                  )}
                >
                  <button
                    onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                    className="w-full px-7 py-5 flex items-center justify-between text-left"
                  >
                    <span className={cn("text-[14px] font-bold transition-colors", openFaq === idx ? "text-emerald-700" : "text-slate-900")}>
                      {faq.question}
                    </span>
                    <ChevronDown className={cn("w-4 h-4 flex-shrink-0 ml-4 transition-transform text-slate-400", openFaq === idx && "rotate-180 text-emerald-600")} />
                  </button>
                  <AnimatePresence>
                    {openFaq === idx && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                        style={{ overflow: "hidden" }}
                      >
                        <p className="px-7 pb-6 text-[13px] text-slate-600 font-medium leading-relaxed border-t border-emerald-100 pt-4">
                          {faq.answer}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA FINAL ───────────────────────────────────────── */}
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
                    to="/register"
                    className="group flex items-center gap-2 px-10 py-4 rounded-2xl bg-white hover:bg-emerald-50 text-emerald-700 font-black text-[14px] transition-all shadow-xl hover:-translate-y-0.5"
                  >
                    Teste grátis por 7 dias
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

      {/* ── FOOTER ──────────────────────────────────────────── */}
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
    </div>
  );
}
