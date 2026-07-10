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
  { id: "recursos",    label: "Recursos",    num: "02" },
  { id: "industrias",  label: "Setores",     num: "03" },
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
  { icon: Layers,        title: "Cada representada num canto",          desc: "WhatsApp de uma, tabela de preço de outra, planilha de uma terceira. Você passa o dia costurando a mão o que deveria estar centralizado." },
  { icon: BarChart3,     title: "Sem visão de quanto rende cada marca", desc: "Quanto você faturou de cada representada esse mês? Quem está perto da meta? Sem isso na tela, você não sabe onde focar." },
  { icon: AlertTriangle, title: "Cliente e pedido escapando",          desc: "No meio de tantas marcas, o pedido sem acompanhamento passa batido — e vira faturamento do concorrente." },
];

/* representadas do painel-demonstração (exemplos visuais do sistema) */
export const representadas = [
  { name: "Tintas Aurora",      faturamento: 48200, meta: 60000, pedidos: 32, color: "#10b981" },
  { name: "AgroMax Insumos",    faturamento: 71500, meta: 75000, pedidos: 41, color: "#0ea5e9" },
  { name: "Farma Distribuidora", faturamento: 23900, meta: 40000, pedidos: 18, color: "#8b5cf6" },
];
export const representadasTotal = representadas.reduce((s, r) => s + r.faturamento, 0);

export const faqs = [
  { question: "Como funciona a garantia de 7 dias?",         answer: "Você começa sem compromisso. Se não se adaptar por qualquer motivo dentro dos primeiros 7 dias, reembolsamos 100% do valor investido." },
  { question: "Posso mudar de plano a qualquer momento?",    answer: "Sim. Upgrade e downgrade disponíveis diretamente nas configurações da conta, sem burocracia e com efeito imediato." },
  { question: "O sistema funciona em dispositivos móveis?",  answer: "Totalmente. App nativo para iOS e Android além da versão web responsiva — gerencie sua carteira de qualquer lugar, inclusive offline." },
  { question: "Preciso instalar alguma coisa?",              answer: "Não. Roda direto no navegador e como app no celular. Seus dados sincronizam automaticamente entre todos os dispositivos." },
  { question: "Como funciona o suporte?",                    answer: "Suporte via e-mail e WhatsApp conforme o plano. Nossa equipe resolve dúvidas técnicas e operacionais com rapidez de verdade." },
  { question: "Meus dados estão seguros?",                   answer: "Utilizamos criptografia de ponta e infraestrutura de alta disponibilidade na Supabase. Seus dados e os de seus clientes ficam protegidos e sob seu controle." },
];

export const bentoFeatures = [
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
