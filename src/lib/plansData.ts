import { Building2, Check, Zap, Map as MapIcon, Mail, BarChart3, Star, Infinity, Sparkles, Trophy, Gem, Crown } from 'lucide-react';

export const plans = [
  {
    id: 'exclusivo',
    name: 'Exclusivo',
    price: '49.90',
    annualPrice: '44.90',
    originalPrice: '97',
    period: '/mês',
    description: 'Para quem está começando.',
    justification: 'Ideal para validar sua operação com baixo investimento e organização básica.',
    features: [
      { text: '1 Empresa cadastrada', icon: Building2 },
      { text: '1 Usuário Simultâneo', icon: Check },
      { text: 'Acesso ao App Mobile', icon: Check },
      { text: 'Suporte por e-mail (até 24h)', icon: Check },
      { text: 'Histórico de 30 dias', icon: Check },
      { text: 'Mapa Territorial Básico', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Busca CNPJ Automática', icon: Zap },
      { text: 'E-mails, Comissões e Catálogo de Produtos', icon: Mail },
      { text: 'Assistente IA (10 perguntas por dia)', icon: Sparkles }
    ],
    popular: false,
    color: 'from-slate-500 to-slate-600',
    icon: Trophy
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: '79.90',
    annualPrice: '71.90',
    originalPrice: '147',
    period: '/mês',
    description: 'Ideal para equipes em crescimento.',
    justification: 'A automação de busca de CNPJ economiza cerca de 10 horas de trabalho manual por mês.',
    features: [
      { text: 'Até 5 Empresas', icon: Building2 },
      { text: 'Mapa Territorial Básico', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Busca CNPJ Automática', icon: Zap },
      { text: 'Dashboard de Faturamento', icon: BarChart3 },
      { text: 'Relatórios com exportação', icon: Check },
      { text: 'Ranking de clientes e vendas', icon: Trophy },
      { text: 'Análise de vendas por produto', icon: BarChart3 },
      { text: 'Suporte via WhatsApp', icon: Star }
    ],
    popular: true,
    color: 'from-emerald-500 to-emerald-600',
    icon: Gem
  },
  {
    id: 'master',
    name: 'Master',
    price: '99.90',
    annualPrice: '89.90',
    originalPrice: '197',
    period: '/mês',
    description: 'Para grandes volumes e IA.',
    justification: 'Potencializado por Inteligência Artificial para processar pedidos e analisar mercado em tempo real.',
    features: [
      { text: 'Empresas Ilimitadas', icon: Infinity },
      { text: 'Radar Territorial Avançado', icon: MapIcon },
      { text: 'CRM Essencial', icon: Check },
      { text: 'Busca CNPJ Automática', icon: Zap },
      { text: 'BI & Analytics Avançado', icon: BarChart3 },
      { text: 'Relatórios, Ranking e Análise de produtos', icon: Check },
      { text: 'Assistente IA sem limite diário', icon: Sparkles },
      { text: 'Digitalização de Pedidos por IA', icon: Zap },
      { text: 'Integração com Inbox', icon: Mail },
      { text: 'Suporte via WhatsApp Prioritário', icon: Star }
    ],
    popular: false,
    color: 'from-emerald-600 to-emerald-700',
    icon: Crown
  }
];
/** Preço em reais no formato brasileiro, sempre com centavos: '49.90' -> '49,90'. */
export const fmtPreco = (v: string | number): string => Number(v).toFixed(2).replace('.', ',');
