/* Menu de sugestões do Assistente IA (tema → submenu de frases prontas).
   Extraído de pages/AssistenteIA.tsx (auditoria 3.1). */
import React, { useState } from "react";
import {
  Calendar,
  ChevronLeft,
  HelpCircle,
  MapPin,
  MoreHorizontal,
  Route,
  ShoppingBag,
  TrendingUp,
  Users,
} from "lucide-react";
import { cn } from "../../lib/utils";

export interface SuggestionTheme {
  id: string;
  icon: typeof Route;
  label: string;
  color: string; // classe de cor do ícone
  items: string[];
  moreItems: string[];
}

const themes: SuggestionTheme[] = [
  {
    id: "sistema",
    icon: HelpCircle,
    label: "Dúvidas do sistema",
    color: "text-violet-600",
    items: [
      "O que você consegue fazer por mim aqui?",
      "Como lanço um pedido tirando foto da nota?",
      "Como funciona o alerta de inatividade dos clientes?",
      "Qual a diferença entre os planos?",
      "Como conecto meu Gmail e a Google Agenda?",
      "O app funciona sem internet?",
    ],
    moreItems: [
      "Como adiciono um novo cliente manualmente?",
      "Como vejo meu histórico de pedidos?",
      "Como configuro meus dados de comissão?",
      "Como exporto um relatório da minha carteira?",
      "Como funciona o ranking entre representantes?",
      "Como faço check-in de visita pelo GPS?",
    ],
  },
  {
    id: "agenda",
    icon: Calendar,
    label: "Agenda",
    color: "text-sky-600",
    items: [
      "O que tenho na agenda esta semana?",
      "Quais visitas estão marcadas para hoje?",
      "Monte uma semana de visitas pelos clientes mais parados.",
      "Quero agendar uma visita — me ajuda?",
      "Reagende meu próximo compromisso.",
      "Crie um lembrete de follow-up para um cliente.",
    ],
    moreItems: [
      "Mostre todos meus compromissos do mês.",
      "Delete um compromisso que não vai mais acontecer.",
      "Quais clientes não recebo visita há mais de 60 dias?",
      "Qual foi minha última visita a cada cliente?",
      "Monte uma agenda semanal otimizada por região.",
      "Crie visitas para todos os clientes críticos desta semana.",
    ],
  },
  {
    id: "mapa",
    icon: MapPin,
    label: "Mapa",
    color: "text-rose-600",
    items: [
      "Monte uma rota pelos clientes que não compram há mais tempo.",
      "Trace uma rota pelos meus 5 maiores clientes.",
      "Crie uma rota pelos clientes de uma cidade.",
      "Monte uma rota curta de visitas para hoje.",
      "Quais clientes ainda estão sem localização no mapa?",
      "Quais clientes ficam perto uns dos outros?",
    ],
    moreItems: [
      "Monte uma rota pelos clientes que nunca visitei.",
      "Quais clientes ficam em determinado bairro?",
      "Monte uma rota para amanhã com menos deslocamento.",
      "Quais clientes ficam fora da minha área habitual?",
      "Trace uma rota pelos clientes com maior ticket médio.",
      "Quais clientes estão sem visita este mês?",
    ],
  },
  {
    id: "pedidos",
    icon: ShoppingBag,
    label: "Pedidos",
    color: "text-emerald-600",
    items: [
      "Quanto vendi este mês por empresa representada?",
      "Quero lançar um pedido — vou mandar a foto.",
      "Gere o relatório PDF da minha carteira.",
      "Quais clientes mais compraram nos últimos 90 dias?",
      "Qual foi o último pedido de cada empresa?",
      "Qual empresa está puxando mais o meu faturamento?",
    ],
    moreItems: [
      "Compare meu faturamento deste mês com o anterior.",
      "Me mostra todos os pedidos de uma empresa.",
      "Qual meu ticket médio por pedido?",
      "Quais clientes não têm nenhum pedido cadastrado?",
      "Quanto faturei no trimestre por empresa?",
      "Quais pedidos foram lançados esta semana?",
    ],
  },
  {
    id: "vendas",
    icon: TrendingUp,
    label: "Vendas e abordagens",
    color: "text-amber-600",
    items: [
      "Escreva um WhatsApp para reativar um cliente parado.",
      "Crie um script de visita para um cliente.",
      "Como abordar quem parou de comprar?",
      "Dê ideias para aumentar meu ticket médio.",
      "Escreva um e-mail apresentando uma novidade.",
      "Monte argumentos para fechar uma venda maior.",
    ],
    moreItems: [
      "Como lidar com uma objeção de preço?",
      "Crie uma proposta de cross-sell para um cliente.",
      "Monte um roteiro de perguntas para uma visita.",
      "Escreva uma mensagem de agradecimento pós-visita.",
      "Como aumentar minha frequência de pedidos?",
      "Dê dicas para melhorar minha taxa de conversão em visitas.",
    ],
  },
  {
    id: "clientes",
    icon: Users,
    label: "Clientes",
    color: "text-blue-600",
    items: [
      "Quais são meus 5 maiores clientes por faturamento?",
      "Quem está há mais tempo sem comprar?",
      "Quais clientes estão em risco de inatividade?",
      "Cadastre um cliente novo — vou passar o CNPJ.",
      "Quero atualizar os dados de um cliente.",
      "Me dê um resumo rápido da minha carteira.",
    ],
    moreItems: [
      "Quantos clientes ativos tenho por empresa?",
      "Quais clientes nunca fizeram um pedido?",
      "Me lista os clientes com status crítico agora.",
      "Quais clientes cadastrei este mês?",
      "Quais clientes têm CNPJ mas sem endereço completo?",
      "Mostre os clientes com maior potencial de reativação.",
    ],
  },
];

export function SuggestionMenu({
  onPick,
  disabled,
  compact,
}: {
  onPick: (text: string) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [showExtra, setShowExtra] = useState<Record<string, boolean>>({});
  const active = themes.find((t) => t.id === openId) || null;

  if (active) {
    const expanded = showExtra[active.id] ?? false;
    const items = expanded ? [...active.items, ...active.moreItems] : active.items;

    return (
      <div className="w-full max-w-xl">
        <button
          onClick={() => setOpenId(null)}
          className="flex items-center gap-1.5 mb-3 text-[11px] font-black uppercase tracking-widest text-slate-400 hover:text-emerald-600 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" /> Menus
        </button>
        <div className="flex items-center gap-2 mb-3">
          <active.icon className={cn("w-4 h-4", active.color)} />
          <span className="text-[12px] font-black uppercase tracking-widest text-slate-600 dark:text-zinc-300">{active.label}</span>
        </div>
        <div className={cn("grid gap-2", compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
          {items.map((text) => (
            <button
              key={text}
              onClick={() => onPick(text)}
              disabled={disabled}
              className={cn(
                "group text-left rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                compact ? "p-3" : "p-4"
              )}
            >
              <span className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200 leading-snug">{text}</span>
            </button>
          ))}
          {!expanded && (
            <button
              onClick={() => setShowExtra((prev) => ({ ...prev, [active.id]: true }))}
              disabled={disabled}
              title="Ver mais sugestões"
              className={cn(
                "group flex items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 dark:border-zinc-700 text-slate-400 hover:text-emerald-600 hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
                compact ? "p-3" : "p-4"
              )}
            >
              <MoreHorizontal className="w-4 h-4" />
              <span className="text-[11px] font-black uppercase tracking-widest">Mais frases</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 w-full max-w-xl">
      {themes.map((t) => (
        <button
          key={t.id}
          onClick={() => setOpenId(t.id)}
          disabled={disabled}
          className={cn(
            "group flex flex-col items-start gap-2 text-left rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            compact ? "p-3" : "p-4"
          )}
        >
          <span className={cn("rounded-xl bg-slate-50 dark:bg-zinc-800 group-hover:bg-emerald-100 flex items-center justify-center flex-shrink-0 transition-colors", compact ? "w-7 h-7" : "w-9 h-9")}>
            <t.icon className={cn(compact ? "w-3.5 h-3.5" : "w-4 h-4", t.color)} />
          </span>
          <span className={cn("font-bold text-slate-700 dark:text-zinc-200 leading-snug", compact ? "text-[11px]" : "text-[12.5px]")}>{t.label}</span>
        </button>
      ))}
    </div>
  );
}
