/* Dados estáticos da landing — separados do JSX para facilitar edição de copy. */
import {
  Building2,
  ShoppingCart,
  Plus as PlusIcon,
  Briefcase,
  Zap,
  Store,
  Wheat,
  MapPin,
  Calendar,
  Mail,
  Users,
  Brain,
  BarChart3,
  TrendingUp,
  MessageSquare,
  AlertTriangle,
  Layers,
  Route,
  Trophy,
  Bell,
  FileText,
  Package,
  Percent,
  ClipboardList,
} from "lucide-react";

/* ─── navegação (ordem = ordem dos capítulos na página) ───────── */
export const NAV = [
  { id: "diferencial", label: "Diferencial", num: "01" },
  { id: "industrias",  label: "Setores",     num: "02" },
  { id: "recursos",    label: "Recursos",    num: "03" },
  { id: "precos",      label: "Planos",      num: "04" },
  { id: "duvidas",     label: "Dúvidas",     num: "05" },
];
export const NAV_IDS = NAV.map((n) => n.id);

export const industries = [
  { name: "Construção",     icon: Building2,    image: "/assets/setor_materiais.webp",     objectPosition: "center" },
  { name: "Supermercados",  icon: ShoppingCart,  image: "/assets/setor_supermercado.webp", objectPosition: "center" },
  { name: "Farmácias",      icon: PlusIcon,      image: "/assets/setor_farmacia.webp",     objectPosition: "center" },
  { name: "Distribuidoras", icon: Store,         image: "/assets/setor_distribuidora.webp", objectPosition: "center" },
  { name: "Serviços",       icon: Briefcase,     image: "/assets/setor_servicos.webp",     objectPosition: "center" },
  { name: "Agronegócio",    icon: Wheat,         image: "/assets/setor_agro.webp",         objectPosition: "center" },
  { name: "Outros",         icon: Zap,           image: "/assets/setor_outros.webp",       objectPosition: "center" },
];

export const integrations = [
  { icon: Users,         label: "Controle de Clientes" },
  { icon: Calendar,      label: "Agenda Inteligente" },
  { icon: Route,         label: "Roteiro de Visitas" },
  { icon: TrendingUp,    label: "Faturamento por Marca" },
  { icon: Brain,         label: "Assistente IA" },
  { icon: MessageSquare, label: "WhatsApp Integrado" },
  { icon: Bell,          label: "Alerta de Inatividade" },
  { icon: Package,       label: "Pedidos com Foto" },
  { icon: MapPin,        label: "Check-in por GPS" },
  { icon: FileText,      label: "Relatório em PDF" },
  { icon: Percent,       label: "Comissões Automáticas" },
  { icon: Trophy,        label: "Ranking de Desempenho" },
  { icon: Mail,          label: "Gmail Integrado" },
  { icon: ClipboardList, label: "Ciclo de Compra" },
  { icon: Building2,     label: "Busca por CNPJ" },
  { icon: BarChart3,     label: "BI & Analytics" },
];

export const painPoints = [
  { icon: Layers,        title: "Cada representada num canto",          desc: "WhatsApp de uma, planilha de outra, tabela de preço de uma terceira. Tudo espalhado, nada centralizado." },
  { icon: BarChart3,     title: "Sem visão de quanto rende cada marca", desc: "Quanto você faturou por marca esse mês? Sem isso na tela, você não sabe onde focar." },
  { icon: AlertTriangle, title: "Cliente e pedido escapando",          desc: "Pedido sem acompanhamento passa batido — e vira faturamento do concorrente." },
];

/* representadas do painel-demonstração (exemplos visuais do sistema) */
export const representadas = [
  { name: "Tintas Aurora",      faturamento: 48200, meta: 60000, pedidos: 32, color: "#10b981" },
  { name: "AgroMax Insumos",    faturamento: 71500, meta: 75000, pedidos: 41, color: "#0ea5e9" },
  { name: "Farma Distribuidora", faturamento: 23900, meta: 40000, pedidos: 18, color: "#8b5cf6" },
];
export const representadasTotal = representadas.reduce((s, r) => s + r.faturamento, 0);

export const faqs = [
  { question: "Como funciona a garantia de 7 dias?",         answer: "Comece sem compromisso. Não se adaptou nos primeiros 7 dias? Reembolsamos 100% do valor." },
  { question: "Quanto tempo leva para começar?",             answer: "Minutos. Cadastre suas representadas, importe a carteira e o painel já está rodando — sem implantação nem consultoria." },
  { question: "Posso importar meus dados antigos?",          answer: "Sim. Suba sua carteira por planilha e a IA organiza os dados por você." },
  { question: "Posso mudar de plano a qualquer momento?",    answer: "Sim, direto nas configurações da conta — sem burocracia e com efeito imediato." },
  { question: "Posso cancelar quando quiser?",               answer: "Sim. Sem fidelidade e sem multa — você cancela direto na conta, quando quiser." },
  { question: "O sistema funciona em dispositivos móveis?",  answer: "Sim. App nativo para iOS e Android, além da versão web — gerencie sua carteira de qualquer lugar, até offline." },
  { question: "Preciso instalar alguma coisa?",              answer: "Não. Roda no navegador e como app no celular, com sincronização automática entre dispositivos." },
  { question: "O sistema integra com meu ERP?",              answer: "Ainda não há integração direta com ERPs — a importação é feita por planilha, e novas integrações estão no roadmap." },
  { question: "Como funciona o suporte?",                    answer: "Via e-mail e WhatsApp, conforme o plano — com resposta rápida de verdade." },
  { question: "Meus dados estão seguros?",                   answer: "Sim. Criptografia de ponta e infraestrutura Supabase — seus dados protegidos e sob seu controle." },
];

/* pontes narrativas entre seções (usadas via SectionBridge no LandingPitch) */
export const sectionBridges = {
  paraSetores:    "Seja qual for o seu ramo, a dor é a mesma — e a solução também.",
  paraRecursos:   "Independente do setor, as ferramentas que resolvem são as mesmas.",
  paraTecnologia: "E por trás de cada ferramenta, uma IA trabalhando pela sua carteira.",
};

export const bentoFeatures = [
  {
    icon: Brain,
    title: "Menos tempo digitando, mais tempo vendendo",
    desc: "A IA gera o resumo de cada cliente, categoriza e-mails e avisa quem precisa de atenção — antes do concorrente chegar.",
    span: "lg:col-span-2 lg:row-span-2",
    dark: true,
  },
  {
    icon: Users,
    title: "Nenhum cliente esquecido",
    desc: "Histórico completo, alerta de inatividade e resumo individual. Nada cai no vácuo.",
    span: "lg:col-span-2",
  },
  {
    icon: Calendar,
    title: "Sua semana já planejada",
    desc: "Importe compromissos em um clique e visite quem importa.",
    span: "",
  },
  {
    icon: MapPin,
    title: "Rotas que rendem mais visitas",
    desc: "Carteira inteira no mapa, com o melhor caminho traçado.",
    span: "",
  },
  {
    icon: BarChart3,
    title: "Saiba qual marca rende mais",
    desc: "Faturamento mês a mês por representada, com meta e histórico — decida onde focar num relance.",
    span: "lg:col-span-2",
  },
  {
    icon: Mail,
    title: "Cada e-mail no cliente certo",
    desc: "Gmail integrado e organizado por representada — chega de caçar conversa.",
    span: "lg:col-span-2",
  },
];
