import React, { useState, useEffect } from "react";
import { 
  motion, 
  AnimatePresence,
  useScroll, 
  useMotionValueEvent 
} from "framer-motion";
import { 
  Check, 
  Mail, 
  HelpCircle, 
  Building2, 
  ShoppingCart, 
  Plus as PlusIcon, 
  Stethoscope, 
  Briefcase,
  Zap,
  TrendingUp,
  Layout as LayoutIcon,
  ShieldCheck,
  Store,
  Star,
  Sparkles,
  ChevronRight,
  ChevronDown,
  Wheat
} from "lucide-react";
import { Logo } from "../components/Logo";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";

const industries = [
  { 
    name: "Materiais de Construção", 
    icon: Building2, 
    color: "bg-orange-50 text-orange-600",
    image: "/assets/setor_materiais.webp"
  },
  { 
    name: "Supermercados", 
    icon: ShoppingCart, 
    color: "bg-emerald-50 text-emerald-600",
    image: "/assets/setor_supermercado.webp"
  },
  { 
    name: "Farmácias", 
    icon: PlusIcon, 
    color: "bg-red-50 text-red-600",
    image: "/assets/setor_farmacia.webp",
    objectPosition: "50% 20%"
  },
  { 
    name: "Distribuidoras", 
    icon: Store, 
    color: "bg-blue-50 text-blue-600",
    image: "/assets/setor_distribuidora.webp"
  },
  { 
    name: "Serviços", 
    icon: Briefcase, 
    color: "bg-emerald-50 text-emerald-600",
    image: "/assets/setor_servicos.webp",
    objectPosition: "50% 15%"
  },
  { 
    name: "Agronegócio", 
    icon: Wheat, 
    color: "bg-amber-50 text-amber-700",
    image: "/assets/setor_agro.webp"
  },
  { 
    name: "Outros", 
    icon: Zap, 
    color: "bg-slate-50 text-slate-600",
    image: "/assets/setor_outros.webp"
  },
];

const faqs = [
  {
    question: "Como funciona a garantia de 7 dias?",
    answer: "Você pode começar seu teste de 7 dias de forma simples. Se não se adaptar à ferramenta por qualquer motivo dentro desse período, nós reembolsamos 100% do seu investimento."
  },
  {
    question: "Posso mudar de plano a qualquer momento?",
    answer: "Sim! Você pode fazer o upgrade ou downgrade do seu plano diretamente nas configurações da sua conta, sem burocracia."
  },
  {
    question: "O sistema funciona em dispositivos móveis?",
    answer: "Sim, nossa plataforma é totalmente responsiva e foi otimizada para tablets e smartphones, permitindo que você gerencie suas vendas de onde estiver."
  },
  {
    question: "Como é feito o suporte aos usuários?",
    answer: "Oferecemos suporte via e-mail e WhatsApp, dependendo do plano escolhido. Nossa equipe está pronta para ajudar com qualquer dúvida técnica ou operacional."
  },
  {
    question: "Meus dados estão seguros?",
    answer: "Utilizamos criptografia de ponta e infraestrutura de alta segurança para garantir que todas as informações da sua carteira e de seus clientes estejam protegidas."
  }
];

const features = [
  {
    icon: ShieldCheck,
    title: "Segurança Total",
    desc: "Criptografia avançada"
  },
  {
    icon: Zap,
    title: "Agilidade",
    desc: "Interface ultra-rápida"
  },
  {
    icon: LayoutIcon,
    title: "Organização",
    desc: "Gestão completa"
  }
];

export default function LandingPitch() {
  const { scrollY } = useScroll();
  const [billingCycle, setBillingCycle] = useState<"monthly" | "annual">("annual");
  const [scrolled, setScrolled] = useState(false);
  const [hoveredIndustry, setHoveredIndustry] = useState<number | null>(null);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const { user } = useAuth();
  const navigate = useNavigate();

  useMotionValueEvent(scrollY, "change", (latest) => {
    setScrolled(latest > 50);
  });

  return (
    <div className="min-h-screen bg-slate-50 selection:bg-emerald-100 selection:text-emerald-900 font-sans cursor-default overflow-x-hidden text-slate-900 dark:text-white">
      {/* Navbar Smart */}
      <motion.nav
        initial={{ y: 0 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.35, ease: "easeInOut" }}
        className={cn(
          "fixed top-0 w-full z-50 transition-all duration-300",
          scrolled ? "bg-white/90 backdrop-blur-xl border-b border-slate-200/50 shadow-sm" : "bg-transparent"
        )}
        style={{
          paddingTop: scrolled 
            ? "calc(env(safe-area-inset-top, 0px) + 12px)" 
            : "calc(env(safe-area-inset-top, 0px) + 24px)",
          paddingBottom: scrolled ? "12px" : "24px"
        }}
      >
        <div className="max-w-7xl mx-auto px-4 md:px-6 flex items-center justify-between gap-2 md:gap-4">
          <Link to={user ? "/dashboard" : "/"} className="flex-shrink-0 flex items-center gap-3">
            <Logo 
              size={typeof window !== "undefined" && window.innerWidth < 768 ? "md" : "lg"} 
              showText={true} 
              variant="light"
            />
          </Link>
          
          <div className="hidden lg:flex items-center gap-10">
            <a href="#industrias" className="text-[11px] font-black uppercase tracking-widest text-slate-700 hover:text-slate-900 dark:text-white transition-colors">Setores</a>
            <a href="#tecnologia" className="text-[11px] font-black uppercase tracking-widest text-slate-700 hover:text-slate-900 dark:text-white transition-colors">Tecnologia</a>
            <a href="#planos" className="text-[11px] font-black uppercase tracking-widest text-slate-700 hover:text-slate-900 dark:text-white transition-colors">Planos</a>
            <a href="#duvidas" className="text-[11px] font-black uppercase tracking-widest text-slate-700 hover:text-slate-900 dark:text-white transition-colors">Dúvidas</a>
          </div>

          <div className="flex items-center gap-4">
            <Link to="/login" className="px-4 md:px-6 py-2.5 md:py-3 rounded-xl md:rounded-2xl bg-slate-900 text-white hover:bg-emerald-600 transition-all shadow-xl shadow-slate-200 text-[9px] md:text-[10px] font-black uppercase tracking-widest">
              Entrar
            </Link>
          </div>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <section className="pt-[calc(env(safe-area-inset-top,0px)+120px)] md:pt-48 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 1, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.8 }}
          >
            <span className="px-4 py-1.5 rounded-full bg-emerald-50 text-emerald-600 text-xs font-black uppercase tracking-widest border border-emerald-100 mb-8 inline-block shadow-sm">
              ✨ A revolução tecnológica do representante
            </span>
            <h1 className="text-3xl sm:text-5xl md:text-8xl font-black tracking-tight text-slate-900 dark:text-white mb-6 md:mb-8 leading-[1.1] md:leading-[0.9] text-balance">
              Domine suas vendas com <span className="text-transparent bg-clip-text bg-gradient-to-br from-emerald-600 via-emerald-500 to-emerald-400">inteligência</span>
            </h1>
            <p className="text-lg text-slate-700 font-medium leading-relaxed max-w-2xl mx-auto mb-12">
              Domine sua carteira de clientes e recupere horas preciosas do seu dia. Nossa inteligência avançada gerencia a memória da sua operação, antecipando necessidades e garantindo controle total para que nenhum pedido ou cliente fique para trás — além de diversas outras ferramentas que te ajudarão a vender mais e vender melhor!
            </p>
            <div className='flex flex-col sm:flex-row items-center justify-center gap-5'>
              <Link to='/register' className='w-full sm:w-auto px-10 h-[58px] rounded-2xl bg-emerald-600 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all hover:-translate-y-1 flex items-center justify-center shadow-xl shadow-emerald-500/20'>
                TESTE GRÁTIS POR 7 DIAS
              </Link>
              <button className='w-full sm:w-auto px-10 h-[58px] rounded-2xl bg-white border border-slate-200 text-slate-600 font-black text-xs uppercase tracking-widest hover:border-slate-300 hover:bg-slate-50 transition-all hover:-translate-y-1 flex items-center justify-center'>
                Ver Vídeo Explicativo
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Industry Selection */}
      <section id="industrias" className="min-h-[80vh] py-32 bg-white border-y border-slate-100 relative overflow-hidden transition-all duration-700 flex items-center">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle_at_30%_30%,rgba(16,185,129,0.03),transparent)] pointer-events-none z-10" />
        
        {/* Background Photo Overlay */}
        <AnimatePresence>
          {hoveredIndustry !== null && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.7, ease: "easeInOut" }}
              className="absolute inset-0 z-0"
            >
              <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] z-10 transition-all" />
              <motion.img 
                key={industries[hoveredIndustry].image}
                initial={{ scale: 1.1 }}
                animate={{ scale: 1 }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                src={industries[hoveredIndustry].image} 
                alt="" 
                className="w-full h-full object-cover"
                style={{ objectPosition: (industries[hoveredIndustry] as any).objectPosition || "center" }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="max-w-7xl mx-auto px-6 relative z-20 w-full">
          <div className="text-center mb-16">
            <h2 className={`text-2xl sm:text-4xl md:text-7xl font-black uppercase tracking-tighter mb-4 transition-all duration-500 ${hoveredIndustry !== null ? "text-white drop-shadow-lg" : "text-slate-900 dark:text-white"}`}>
              Adaptável à sua realidade
            </h2>
            <p className={`font-bold uppercase text-[10px] md:text-sm tracking-[0.3em] transition-all duration-500 ${hoveredIndustry !== null ? "text-white/80" : "text-slate-600"}`}>
              Interface customizada por setor de atuação
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4 md:gap-6 max-w-7xl mx-auto">
            {industries.map((item, idx) => (
              <motion.button
                key={idx}
                onMouseEnter={() => setHoveredIndustry(idx)}
                onMouseLeave={() => setHoveredIndustry(null)}
                whileHover={{ y: -12, scale: 1.15 }}
                className={`p-4 md:p-12 rounded-[32px] md:rounded-[56px] border-2 flex flex-col items-center gap-4 md:gap-6 transition-all duration-500 group shadow-lg ${
                  hoveredIndustry === null 
                    ? "bg-white border-slate-50 hover:shadow-2xl" 
                    : hoveredIndustry === idx
                      ? "bg-white border-white scale-125 z-30 shadow-2xl"
                      : "bg-white/5 border-white/10 opacity-30 blur-sm scale-90 grayscale"
                }`}
              >
                <div className={`p-4 md:p-7 rounded-[28px] ${item.color} group-hover:scale-110 transition-transform shadow-md`}>
                  <item.icon className="w-6 h-6 md:w-9 md:h-9" />
                </div>
                <span className={`text-[10px] md:text-[11px] font-black uppercase tracking-tight text-center leading-tight break-words px-1 transition-all duration-500 ${
                  hoveredIndustry === idx ? "text-slate-900 dark:text-white" : (hoveredIndustry === null ? "text-slate-900 dark:text-white" : "text-white/0")
                }`}>
                  {item.name}
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Technology Section Refined */}
      <section id="tecnologia" className="py-32 bg-slate-50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col lg:flex-row items-center gap-20">
            <motion.div 
              initial={{ opacity: 1, x: -30 }}
              whileInView={{ opacity: 1, x: 0 }}
              className="lg:w-[40%] text-center lg:text-left"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-black uppercase tracking-widest mb-6">
                <TrendingUp className="w-3 h-3" /> Faturamento Inteligente
              </div>
              <h2 className="text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-8 leading-[1.1]">
                Controle total da sua <span className="text-emerald-600">Comunicação</span>
              </h2>
              <p className="text-lg text-slate-700 font-medium leading-relaxed mb-10">
                O único CRM que centraliza sua caixa de entrada e vincula automaticamente cada e-mail ao histórico do cliente. Chega de perder pedidos enterrados em threads infinitas.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-left max-w-lg mx-auto lg:mx-0">
                 <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center mb-3">
                       <Check className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">IA Integration</p>
                    <p className="text-xs text-slate-600 font-bold leading-tight">Gemini lê e categoriza seus e-mails.</p>
                 </div>
                 <div className="p-4 rounded-2xl bg-white border border-slate-100 shadow-sm">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
                       <Check className="w-4 h-4" />
                    </div>
                    <p className="text-[10px] font-black uppercase tracking-tight text-slate-900 dark:text-white mb-1">Histórico Real</p>
                    <p className="text-xs text-slate-600 font-bold leading-tight">Cada resposta vira um evento no CRM.</p>
                 </div>
              </div>
            </motion.div>
            
            <motion.div 
              initial={{ opacity: 1, y: 50 }}
              whileInView={{ opacity: 1, y: 0 }}
              className="lg:w-[60%] w-full relative group"
            >
              <div className="absolute inset-0 bg-emerald-600/5 blur-[120px] rounded-full group-hover:bg-emerald-600/10 transition-all pointer-events-none" />
              <div className="relative transform lg:rotate-2 hover:rotate-0 transition-transform duration-700">
                <img src="/assets/dashboard_mockup.webp" alt="Dashboard" className="rounded-[32px] shadow-2xl border border-white/20" />
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* FAQ Section Moved Here */}
      <section id="duvidas" className="py-32 bg-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-6xl font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-4">
              Dúvidas Frequentes
            </h2>
            <p className="text-slate-700 font-medium uppercase text-xs tracking-[0.3em]">
              Tudo o que você precisa saber sobre a plataforma
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <motion.div 
                key={idx}
                initial={{ opacity: 1, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.05 }}
                className="bg-slate-50 rounded-[32px] border border-slate-100 overflow-hidden transition-all shadow-sm"
              >
                <button 
                  onClick={() => setOpenFaq(openFaq === idx ? null : idx)}
                  className="w-full px-8 py-6 flex items-center justify-between text-left group"
                >
                  <span className="text-xs sm:text-sm md:text-base font-black text-slate-900 dark:text-white tracking-tight group-hover:text-emerald-600 transition-colors">
                    {faq.question}
                  </span>
                  <div className={cn(
                    "p-2 rounded-xl bg-white text-slate-600 transition-all",
                    openFaq === idx && "bg-emerald-50 text-emerald-600 rotate-180"
                  )}>
                    <ChevronDown className="w-5 h-5 shrink-0 ml-4" />
                  </div>
                </button>
                <AnimatePresence>
                  {openFaq === idx && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div className="px-8 pb-8 text-sm md:text-base text-slate-700 font-medium leading-relaxed border-t border-slate-50 pt-6">
                        {faq.answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Future Section (From Login Page) */}
      <section className="py-32 bg-slate-50 relative overflow-hidden">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <h2 className="text-3xl sm:text-5xl lg:text-7xl font-black text-slate-900 dark:text-white uppercase tracking-tighter leading-none">
                O futuro da <br />
                <span className="text-emerald-600">Representação</span>
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {features.map((feature, idx) => (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 1, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm group hover:-translate-y-1 transition-all duration-500"
                  >
                    <div className="w-12 h-12 rounded-[20px] bg-emerald-50 flex items-center justify-center mb-6 group-hover:scale-110 group-hover:rotate-6 transition-all duration-500">
                      <feature.icon className="w-6 h-6 text-emerald-600" />
                    </div>
                    <h3 className="text-base font-black text-slate-900 dark:text-white uppercase tracking-tighter mb-1">{feature.title}</h3>
                    <p className="text-xs font-medium text-slate-700 leading-tight">{feature.desc}</p>
                  </motion.div>
                ))}
              </div>
            </div>

            <motion.div
              initial={{ opacity: 1, y: 20, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              className="bg-slate-900 p-12 lg:p-16 rounded-[64px] text-white space-y-8 shadow-2xl relative overflow-hidden group"
            >
              <div className="absolute inset-0 bg-emerald-600/10 blur-[80px] group-hover:bg-emerald-600/20 transition-all" />
              <div className="relative space-y-6">
                <div className="flex gap-1">
                  {[1,2,3,4,5].map(i => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                </div>
                <p className="text-xl md:text-2xl font-medium italic opacity-90 leading-relaxed">
                  "O controle que tenho hoje sobre minha carteira de clientes é algo que eu nunca imaginei ser possível."
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-emerald-500 flex items-center justify-center font-black text-sm text-white">RM</div>
                  <div>
                    <p className="text-sm font-black uppercase tracking-widest">Ricardo Moreira</p>
                    <p className="text-[10px] font-bold opacity-50 uppercase tracking-tight">Representante Comercial</p>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="planos" className="py-32 px-6">
        <div className="max-w-5xl mx-auto rounded-[64px] bg-slate-900 p-12 md:p-24 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-emerald-600/10 blur-[100px] group-hover:bg-emerald-600/20 transition-all" />
          <motion.div initial={{ opacity: 1, y: 20 }} whileInView={{ opacity: 1, y: 0 }} className="relative">
            <h2 className="text-2xl sm:text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-8 leading-none">
              Pronto para ser um <br /> <span className="text-emerald-400 text-3xl sm:text-5xl md:text-8xl">SUPER REPRESENTANTE?</span>
            </h2>
            <p className="text-slate-600 font-medium text-lg max-w-xl mx-auto mb-12">
              Junte-se a mais de 2.000 que já alavancaram mais de 150% de suas vendas com a Representese
            </p>
            <div className="flex flex-col items-center gap-4">
              <Link to="/register" className="px-12 py-6 rounded-2xl bg-emerald-500 text-white font-black text-xs uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-2xl shadow-emerald-500/20 inline-block">
                Começar agora mesmo
              </Link>
              <p className="text-[10px] font-bold text-slate-700 uppercase tracking-widest opacity-60">Satisfação Garantida ou seu dinheiro de volta em até 7 dias</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-slate-100 bg-white">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-8">
          <Logo className="opacity-50 h-8 md:h-10" showText={true} variant="light" />
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-widest text-center">
            © 2026 Representese — Tecnologia para Representações Comerciais
          </p>
          <div className="flex gap-8">
            <Link to="/privacy" className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-900 dark:text-white transition-colors">Privacidade</Link>
            <Link to="/terms" className="text-[10px] font-black text-slate-600 uppercase tracking-widest hover:text-slate-900 dark:text-white transition-colors">Termos</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
