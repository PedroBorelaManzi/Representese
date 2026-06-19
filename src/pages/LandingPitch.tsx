import React, { useState } from "react";
import {
  motion,
  AnimatePresence,
  useScroll,
  useMotionValueEvent,
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
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";

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

const faqs = [
  { question: "Como funciona a garantia de 7 dias?",         answer: "Você começa sem compromisso. Se não se adaptar por qualquer motivo dentro dos primeiros 7 dias, reembolsamos 100% do valor investido." },
  { question: "Posso mudar de plano a qualquer momento?",    answer: "Sim. Upgrade e downgrade disponíveis diretamente nas configurações da conta, sem burocracia." },
  { question: "O sistema funciona em dispositivos móveis?",  answer: "Totalmente. A plataforma é responsiva e otimizada para tablets e smartphones — gerencie de qualquer lugar." },
  { question: "Como funciona o suporte?",                    answer: "Suporte via e-mail e WhatsApp conforme o plano. Nossa equipe resolve dúvidas técnicas e operacionais rapidamente." },
  { question: "Meus dados estão seguros?",                   answer: "Utilizamos criptografia de ponta e infraestrutura de alta disponibilidade. Seus dados e os de seus clientes ficam protegidos." },
];

const stats = [
  { value: "+2.000",  label: "representantes ativos" },
  { value: "+50k",    label: "clientes gerenciados" },
  { value: "98%",     label: "satisfação dos usuários" },
  { value: "7 dias",  label: "de teste gratuito" },
];

const coreFeatures = [
  { icon: Users,     title: "CRM completo",           desc: "Carteira de clientes organizada com histórico, alertas de inatividade e dossiê individual." },
  { icon: Calendar,  title: "Agenda inteligente",      desc: "Visitas, feriados e compromissos integrados ao Google Calendar, visíveis por semana." },
  { icon: Mail,      title: "E-mail vinculado",        desc: "Caixa de entrada integrada ao Gmail. Cada e-mail automaticamente vinculado ao cliente." },
  { icon: MapPin,    title: "Mapa de clientes",        desc: "Visualize toda sua carteira no mapa. Planeje rotas com inteligência geográfica." },
  { icon: BarChart3, title: "Faturamento por empresa", desc: "Gráfico mensal por representada. Teto configurável e histórico de performance." },
  { icon: Brain,     title: "IA Neural Engine",        desc: "Gemini categoriza e-mails, sugere dossiês e antecipa necessidades da carteira." },
];

const avatars = ["RM", "JC", "AF", "PS", "LB"];

/* ─── fade-in helper ────────────────────────────────────────── */
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

/* ─── componente principal ──────────────────────────────────── */
export default function LandingPitch() {
  const { scrollY } = useScroll();
  const [scrolled, setScrolled]               = useState(false);
  const [hoveredIndustry, setHoveredIndustry] = useState<number | null>(null);
  const [openFaq, setOpenFaq]                 = useState<number | null>(null);
  const { user }                              = useAuth();

  useMotionValueEvent(scrollY, "change", (v) => setScrolled(v > 40));

  return (
    <div className="min-h-screen bg-white text-slate-900 overflow-x-hidden font-sans selection:bg-emerald-100 selection:text-emerald-900">

      {/* ── NAV ─────────────────────────────────────────────── */}
      <motion.nav
        style={{
          paddingTop:    scrolled ? "12px" : "20px",
          paddingBottom: scrolled ? "12px" : "20px",
        }}
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrolled
            ? "bg-white/80 backdrop-blur-xl border-b border-slate-200/60 shadow-sm"
            : "bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
          <Link to={user ? "/dashboard" : "/"}>
            <Logo size="lg" showText variant="light" />
          </Link>

          <div className="hidden lg:flex items-center gap-8">
            {["#industrias:Setores", "#tecnologia:Tecnologia", "#planos:Planos", "#duvidas:Dúvidas"].map((item) => {
              const [href, label] = item.split(":");
              return (
                <a key={href} href={href} className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors">
                  {label}
                </a>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            <Link to="/login"    className="text-[13px] font-semibold text-slate-600 hover:text-slate-900 transition-colors px-4 py-2">Entrar</Link>
            <Link to="/register" className="text-[13px] font-black text-white bg-slate-900 hover:bg-emerald-600 transition-all px-5 py-2.5 rounded-xl shadow-sm">
              Teste grátis
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* ── HERO ────────────────────────────────────────────── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center pt-24 pb-16 px-6 bg-slate-950 overflow-hidden">
        {/* glows */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-emerald-500/10 blur-[140px] rounded-full" />
          <div className="absolute top-1/3 left-1/4 w-[400px] h-[400px] bg-teal-500/6 blur-[100px] rounded-full" />
          <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-emerald-600/8 blur-[80px] rounded-full" />
          {/* grid */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: `linear-gradient(rgba(255,255,255,.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.3) 1px, transparent 1px)`,
              backgroundSize: "60px 60px",
            }}
          />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto text-center">
          {/* badge */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 text-[11px] font-black uppercase tracking-widest mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Neural Engine 2026 · Nova versão disponível
          </motion.div>

          {/* headline */}
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="text-4xl sm:text-6xl md:text-[82px] font-black tracking-[-0.03em] leading-[1.0] text-white mb-6"
          >
            Sua operação{" "}
            <span className="bg-gradient-to-br from-emerald-400 to-teal-300 bg-clip-text text-transparent">
              comercial
            </span>
            ,<br />centralizada e inteligente.
          </motion.h1>

          {/* subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.25 }}
            className="text-lg sm:text-xl text-slate-400 font-medium leading-relaxed max-w-2xl mx-auto mb-10"
          >
            CRM, agenda, e-mail, WhatsApp e IA em um único lugar.
            Nunca mais perca um cliente, um pedido ou uma oportunidade.
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
              className="group flex items-center gap-2 px-8 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-sm transition-all shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:shadow-[0_0_60px_rgba(16,185,129,0.45)] hover:-translate-y-0.5"
            >
              Começar gratuitamente
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
            <button className="flex items-center gap-2 px-8 py-4 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-white font-semibold text-sm transition-all">
              <Play className="w-4 h-4 text-emerald-400" />
              Ver demonstração
            </button>
          </motion.div>

          {/* social proof */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="flex flex-col items-center gap-2"
          >
            <div className="flex -space-x-2.5">
              {avatars.map((a) => (
                <div key={a} className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 border-2 border-slate-950 flex items-center justify-center text-white text-[9px] font-black">
                  {a}
                </div>
              ))}
            </div>
            <p className="text-slate-500 text-[13px] font-medium">
              Mais de <span className="text-white font-semibold">2.000 representantes</span> já confiam na plataforma
            </p>
          </motion.div>
        </div>

        {/* dashboard mockup */}
        <motion.div
          initial={{ opacity: 0, y: 60, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 mt-16 max-w-5xl mx-auto w-full px-4"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-emerald-500/10 blur-[80px] rounded-3xl -z-10 scale-95" />
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-[0_40px_120px_rgba(0,0,0,0.8)]">
              <img
                src="/assets/dashboard_mockup.webp"
                alt="Dashboard Represente-Se"
                className="w-full"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-slate-950 to-transparent rounded-b-2xl" />
          </div>
        </motion.div>
      </section>

      {/* ── STATS ───────────────────────────────────────────── */}
      <section className="bg-white border-b border-slate-100 py-14 px-6">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((s, i) => (
            <FadeUp key={s.label} delay={i * 0.05}>
              <div className="text-center">
                <p className="text-3xl md:text-4xl font-black text-slate-900 mb-1">{s.value}</p>
                <p className="text-[12px] text-slate-500 font-medium uppercase tracking-wider">{s.label}</p>
              </div>
            </FadeUp>
          ))}
        </div>
      </section>

      {/* ── CORE FEATURES GRID ──────────────────────────────── */}
      <section id="tecnologia" className="py-24 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <FadeUp className="text-center mb-16">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mb-3">Plataforma completa</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-4">
              Tudo que você precisa,<br />em um único lugar.
            </h2>
            <p className="text-slate-500 font-medium max-w-xl mx-auto">
              Ferramentas integradas que eliminam o retrabalho e devolvem horas do seu dia.
            </p>
          </FadeUp>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {coreFeatures.map((f, i) => (
              <FadeUp key={f.title} delay={i * 0.07}>
                <div className="group bg-white rounded-3xl p-7 border border-slate-200/80 hover:border-emerald-200 hover:shadow-lg hover:shadow-emerald-50 transition-all duration-300 cursor-default">
                  <div className="w-11 h-11 rounded-2xl bg-emerald-50 flex items-center justify-center mb-5 group-hover:bg-emerald-100 transition-colors">
                    <f.icon className="w-5 h-5 text-emerald-600" />
                  </div>
                  <h3 className="text-[15px] font-black text-slate-900 mb-2">{f.title}</h3>
                  <p className="text-[13px] text-slate-500 font-medium leading-relaxed">{f.desc}</p>
                </div>
              </FadeUp>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURE SHOWCASE 1 — CRM ────────────────────────── */}
      <section className="py-24 px-6 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
          <FadeUp>
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mb-4">Gestão de clientes</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900 mb-6 leading-tight">
              Toda sua carteira,<br />organizada e viva.
            </h2>
            <p className="text-slate-500 font-medium leading-relaxed mb-8 max-w-md">
              Cada cliente com seu histórico completo, alertas de inatividade e dossiê gerado por IA. Saiba exatamente com quem falar, quando e por quê.
            </p>
            <ul className="space-y-3 mb-10">
              {[
                "Alerta automático de clientes inativos",
                "Dossiê gerado pelo Gemini com um clique",
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
              <div className="absolute inset-0 bg-emerald-500/6 blur-[80px] rounded-full" />
              <div className="relative bg-slate-50 rounded-3xl border border-slate-200 overflow-hidden shadow-xl">
                <img src="/assets/dashboard_mockup.webp" alt="CRM" className="w-full" />
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

      {/* ── FEATURE SHOWCASE 2 — IA ─────────────────────────── */}
      <section className="py-24 px-6 bg-slate-950 overflow-hidden relative">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[400px] bg-emerald-500/8 blur-[120px] rounded-full" />
        </div>
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 items-center relative z-10">
          <FadeUp delay={0.1} className="order-2 lg:order-1">
            <div className="bg-slate-900 rounded-3xl border border-white/10 p-8 shadow-2xl">
              <div className="flex items-center gap-2 mb-6 pb-4 border-b border-white/10">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-white" />
                </div>
                <div>
                  <p className="text-white text-[13px] font-black">Neural Engine</p>
                  <p className="text-emerald-400 text-[10px] font-medium">● Online</p>
                </div>
              </div>
              <div className="space-y-4">
                {[
                  { role: "user", text: "Gere o dossiê do cliente CAETANO TIETE" },
                  { role: "ai",   text: "📋 Analisando histórico de 47 interações... Cliente ativo há 14 meses. Última compra: R$ 8.200 em novembro. Pedido pendente de follow-up. Recomendo contato esta semana." },
                  { role: "user", text: "Quais clientes não compram há mais de 30 dias?" },
                  { role: "ai",   text: "Encontrei 12 clientes inativos. Os 3 de maior valor: RIVAIL COZIMAX (R$12k), GRANTEL ONIX (R$9k), SS MATERIAIS (R$7k). Deseja gerar uma lista de visitas?" },
                ].map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[85%] px-4 py-3 rounded-2xl text-[12px] font-medium leading-relaxed",
                        msg.role === "user"
                          ? "bg-emerald-600 text-white rounded-br-sm"
                          : "bg-white/8 text-slate-300 rounded-bl-sm border border-white/10"
                      )}
                    >
                      {msg.text}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </FadeUp>

          <FadeUp className="order-1 lg:order-2">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-4">Inteligência artificial</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-white mb-6 leading-tight">
              O Gemini trabalha<br />
              <span className="text-emerald-400">enquanto você vende.</span>
            </h2>
            <p className="text-slate-400 font-medium leading-relaxed mb-8 max-w-md">
              O Neural Engine analisa sua carteira, gera dossiês, categoriza e-mails e antecipa qual cliente precisa de atenção — antes que ele vá para o concorrente.
            </p>
            <ul className="space-y-3">
              {[
                "Dossiê de cliente gerado automaticamente com IA",
                "Categorização de e-mails por representada",
                "Alertas proativos de inatividade",
                "Sugestão de pauta para visitas",
              ].map((item) => (
                <li key={item} className="flex items-center gap-3 text-[13px] text-slate-400 font-medium">
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

      {/* ── SETORES ─────────────────────────────────────────── */}
      <section id="industrias" className="min-h-[80vh] py-20 bg-white border-y border-slate-100 relative overflow-hidden flex items-center transition-all duration-700">
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
              <p className={cn("text-[11px] font-black uppercase tracking-widest mb-3 transition-colors duration-500", hoveredIndustry !== null ? "text-emerald-300" : "text-emerald-600")}>
                Setores atendidos
              </p>
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

      {/* ── TESTIMONIAL ─────────────────────────────────────── */}
      <section className="py-24 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <FadeUp>
            <div className="bg-white rounded-[40px] border border-slate-200 p-10 md:p-16 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 blur-[80px] rounded-full" />
              <div className="relative">
                <div className="flex gap-1 mb-8">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <Star key={i} className="w-5 h-5 fill-amber-400 text-amber-400" />
                  ))}
                </div>
                <blockquote className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight leading-snug mb-8">
                  "O controle que tenho hoje sobre minha carteira de clientes é algo que eu nunca imaginei ser possível. Recuperei mais de 20 horas por mês."
                </blockquote>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center font-black text-white text-sm">RM</div>
                  <div>
                    <p className="text-[14px] font-black text-slate-900">Ricardo Moreira</p>
                    <p className="text-[12px] text-slate-500 font-medium">Representante Comercial · São Paulo</p>
                  </div>
                </div>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────────────── */}
      <section id="duvidas" className="py-24 px-6 bg-white">
        <div className="max-w-3xl mx-auto">
          <FadeUp className="text-center mb-12">
            <p className="text-[11px] font-black uppercase tracking-widest text-emerald-600 mb-3">Perguntas frequentes</p>
            <h2 className="text-3xl sm:text-5xl font-black tracking-tight text-slate-900">
              Dúvidas frequentes
            </h2>
          </FadeUp>

          <div className="space-y-3">
            {faqs.map((faq, idx) => (
              <FadeUp key={idx} delay={idx * 0.04}>
                <div
                  className={cn(
                    "rounded-2xl border transition-all duration-200 overflow-hidden",
                    openFaq === idx ? "border-emerald-200 bg-emerald-50/50" : "border-slate-200 bg-white hover:border-slate-300"
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
      <section id="planos" className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          <FadeUp>
            <div className="relative rounded-[48px] overflow-hidden bg-slate-950 px-10 md:px-20 py-20 text-center shadow-[0_40px_120px_rgba(0,0,0,0.3)]">
              <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-emerald-500/15 blur-[100px] rounded-full" />
                <div className="absolute bottom-0 left-1/4 w-[300px] h-[200px] bg-teal-500/10 blur-[80px] rounded-full" />
              </div>

              <div className="relative z-10">
                <p className="text-[11px] font-black uppercase tracking-widest text-emerald-400 mb-5">Comece hoje</p>
                <h2 className="text-3xl sm:text-5xl md:text-6xl font-black tracking-tight text-white mb-6 leading-tight">
                  Pronto para transformar<br />
                  <span className="bg-gradient-to-r from-emerald-400 to-teal-300 bg-clip-text text-transparent">
                    sua operação comercial?
                  </span>
                </h2>
                <p className="text-slate-400 font-medium text-lg max-w-lg mx-auto mb-10">
                  Junte-se a mais de 2.000 representantes que já alavancaram seus resultados com a Represente-Se.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Link
                    to="/register"
                    className="group flex items-center gap-2 px-10 py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-black text-[14px] transition-all shadow-[0_0_40px_rgba(16,185,129,0.35)] hover:shadow-[0_0_60px_rgba(16,185,129,0.5)] hover:-translate-y-0.5"
                  >
                    Teste grátis por 7 dias
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </Link>
                </div>
                <p className="text-slate-600 text-[11px] font-medium uppercase tracking-widest mt-5">
                  Satisfação garantida · Sem compromisso · Cancele quando quiser
                </p>
              </div>
            </div>
          </FadeUp>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────────────────── */}
      <footer className="py-14 border-t border-slate-100 bg-white px-6">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <Logo showText variant="light" />
          <p className="text-[12px] font-medium text-slate-400 text-center">
            © 2026 Represente-Se — Tecnologia para Representações Comerciais
          </p>
          <div className="flex gap-6">
            <Link to="/privacy" className="text-[12px] font-medium text-slate-500 hover:text-slate-900 transition-colors">Privacidade</Link>
            <Link to="/terms"   className="text-[12px] font-medium text-slate-500 hover:text-slate-900 transition-colors">Termos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
