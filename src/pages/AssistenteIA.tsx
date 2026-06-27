import React, { useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles,
  Send,
  Brain,
  User,
  Loader2,
  Trash2,
  Users,
  TrendingUp,
  Crown,
  Route,
  MessageCircle,
  FileText,
  ShoppingBag,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  ChevronLeft,
  Square,
  HelpCircle,
  Calendar,
  MapPin,
  MoreHorizontal,
  Mic,
  Pencil,
  UserPlus,
  Paperclip,
  Image as ImageIcon,
  CalendarClock,
  X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { geminiWithSystem, geminiText } from "../lib/geminiProxy";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import {
  type AIAction,
  type AIActionClient,
  type AIAppointment,
  parseActions,
  findClient,
  buildRoute,
  buildWhatsapp,
  buildOrderDraft,
  commitOrder,
  openCarteiraReport,
  buildDailyBriefing,
  commitUpdateClient,
  commitRelocateClient,
  commitCreateClient,
  commitDeleteClient,
  commitCreateAppointment,
  commitUpdateAppointment,
  commitDeleteAppointment,
  BRL,
} from "../lib/aiActions";

/* ─── tipos ─────────────────────────────────────────────────── */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
  image?: string; // dataURL (apenas exibição na sessão atual)
}

type AIClient = AIActionClient;

const MAX_CLIENTS_IN_CONTEXT = 1500;

/* ─── menu de sugestões por tema → submenu ──────────────────── */
interface SuggestionTheme {
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

function SuggestionMenu({
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

/* ─── render de texto com **negrito** ───────────────────────── */
function FormattedText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <span className="whitespace-pre-wrap break-words">
      {parts.map((p, i) =>
        p.startsWith("**") && p.endsWith("**") ? (
          <strong key={i} className="font-bold">{p.slice(2, -2)}</strong>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        )
      )}
    </span>
  );
}

/* ─── cartão de ação executável ─────────────────────────────── */
function ActionCard({
  action,
  clients,
  appointments,
  inativoDays,
  userId,
  onCommitted,
}: {
  action: AIAction;
  clients: AIActionClient[];
  appointments: AIAppointment[];
  inativoDays: number;
  userId: string | undefined;
  onCommitted: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [done, setDone] = useState(false);

  const wrap = "mt-2 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-3.5";
  const dangerWrap = "mt-2 rounded-2xl border border-red-200 dark:border-red-900/40 bg-red-50/60 dark:bg-red-950/20 p-3.5";
  const primaryBtn = "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-[12px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const dangerBtn = "flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[12px] font-black uppercase tracking-wider transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";

  // Executor genérico: roda o commit, trata loading/erro/sucesso e refaz a query
  const runCommit = async (fn: () => Promise<any>, successMsg: string) => {
    if (!userId || committing || done) return;
    setCommitting(true);
    try {
      await fn();
      setDone(true);
      toast.success(successMsg);
      onCommitted();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao executar a ação.");
    } finally {
      setCommitting(false);
    }
  };

  const doneRow = (label: string) => (
    <div className="flex items-center gap-2 text-emerald-600 text-[12px] font-black uppercase tracking-wider">
      <Check className="w-4 h-4" /> {label}
    </div>
  );

  /* ── ROTA ── */
  if (action.type === "route") {
    const { url, matched, missingCoords, notFound } = buildRoute(clients, action.clients);
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Route className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Rota · {matched.length} parada{matched.length === 1 ? "" : "s"}
          </span>
        </div>
        {matched.length > 0 && (
          <ol className="flex flex-wrap gap-1.5 mb-3">
            {matched.map((c, i) => (
              <li key={c.id} className="flex items-center gap-1 bg-white dark:bg-zinc-800 border border-emerald-100 dark:border-zinc-700 rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-700 dark:text-zinc-200">
                <span className="bg-emerald-600 text-white rounded-full w-4 h-4 flex items-center justify-center text-[9px]">{i + 1}</span>
                {c.name}
              </li>
            ))}
          </ol>
        )}
        {(notFound.length > 0 || missingCoords.length > 0) && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-start gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>
              {notFound.length > 0 && <>Não encontrei: {notFound.join(", ")}. </>}
              {missingCoords.length > 0 && <>Sem localização no mapa: {missingCoords.join(", ")}.</>}
            </span>
          </p>
        )}
        {url ? (
          <a href={url} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
            Abrir rota no Google Maps <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <p className="text-[12px] font-semibold text-slate-500">Nenhum cliente com localização para montar a rota.</p>
        )}
      </div>
    );
  }

  /* ── WHATSAPP ── */
  if (action.type === "whatsapp") {
    const { url, client, message, hasPhone } = buildWhatsapp(clients, action.client, action.message);
    const copy = async () => {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch {
        toast.error("Não consegui copiar a mensagem.");
      }
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <MessageCircle className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Mensagem · {client?.name || action.client}
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-800 border border-emerald-100 dark:border-zinc-700 rounded-xl p-3 text-[12.5px] text-slate-700 dark:text-zinc-200 whitespace-pre-wrap mb-3">
          {message}
        </div>
        <div className="flex gap-2">
          <button onClick={copy} className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-[12px] font-black uppercase tracking-wider hover:bg-emerald-100/50 transition-all active:scale-95">
            {copied ? <><Check className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
          </button>
          {hasPhone && url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" className={primaryBtn}>
              Abrir WhatsApp <ExternalLink className="w-3.5 h-3.5" />
            </a>
          ) : (
            <span className="flex items-center text-[11px] text-amber-600 dark:text-amber-400 px-1">
              {client ? "Cliente sem telefone cadastrado." : "Cliente não encontrado."}
            </span>
          )}
        </div>
      </div>
    );
  }

  /* ── PEDIDO ── */
  if (action.type === "order") {
    const draft = buildOrderDraft(clients, action.client, action.category, action.value);
    const valid = !!draft.client && draft.value > 0;
    const confirm = async () => {
      if (!userId || !draft.client) return;
      setCommitting(true);
      try {
        await commitOrder(userId, draft);
        setDone(true);
        toast.success("Pedido lançado com sucesso!");
        onCommitted();
      } catch (e: any) {
        toast.error(e?.message || "Erro ao lançar o pedido.");
      } finally {
        setCommitting(false);
      }
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <ShoppingBag className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Lançar pedido
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Cliente</p>
            <p className="text-[12px] font-bold text-slate-800 dark:text-zinc-100 truncate">{draft.client?.name || action.client}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Empresa</p>
            <p className="text-[12px] font-bold text-slate-800 dark:text-zinc-100 truncate">{draft.category}</p>
          </div>
          <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700">
            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Valor</p>
            <p className="text-[12px] font-black text-emerald-600">{BRL(draft.value)}</p>
          </div>
        </div>
        {!draft.client && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cliente "{action.client}" não encontrado na carteira.
          </p>
        )}
        {done ? (
          <div className="flex items-center gap-2 text-emerald-600 text-[12px] font-black uppercase tracking-wider">
            <Check className="w-4 h-4" /> Pedido lançado
          </div>
        ) : (
          <button onClick={confirm} disabled={!valid || committing} className={primaryBtn}>
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Lançando...</> : <>Confirmar lançamento <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── RELATÓRIO ── */
  if (action.type === "report") {
    const open = () => {
      try {
        openCarteiraReport(clients, inativoDays);
      } catch (e: any) {
        toast.error(e?.message || "Erro ao gerar o relatório.");
      }
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <FileText className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Relatório da carteira
          </span>
        </div>
        <p className="text-[12px] text-slate-600 dark:text-zinc-300 mb-3">
          Resumo com top clientes, faturamento por empresa e inativos — pronto para salvar em PDF.
        </p>
        <button onClick={open} className={primaryBtn}>
          Gerar relatório PDF <FileText className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  /* ── EDITAR CLIENTE ── */
  if (action.type === "update_client") {
    const client = findClient(clients, action.client);
    const entries = Object.entries(action.changes || {}).filter(([, v]) => v != null && String(v).trim() !== "");
    const fieldLabel: Record<string, string> = {
      name: "Nome", phone: "Telefone", email: "E-mail", address: "Endereço",
      status: "Status", notes: "Notas", city: "Cidade", state: "UF", cnpj: "CNPJ",
    };
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Pencil className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Editar cliente · {client?.name || action.client}
          </span>
        </div>
        <div className="space-y-1.5 mb-3">
          {entries.map(([k, v]) => (
            <div key={k} className="flex items-start justify-between gap-2 bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 mt-0.5">{fieldLabel[k] || k}</span>
              <span className="text-[12px] font-bold text-slate-800 dark:text-zinc-100 text-right">{String(v)}</span>
            </div>
          ))}
        </div>
        {!client && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cliente "{action.client}" não encontrado.
          </p>
        )}
        {done ? doneRow("Cliente atualizado") : (
          <button
            onClick={() => client && runCommit(() => commitUpdateClient(userId!, client.id, action.changes), "Cliente atualizado!")}
            disabled={!client || !entries.length || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <>Confirmar alteração <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── MUDAR LOCALIZAÇÃO ── */
  if (action.type === "relocate_client") {
    const client = findClient(clients, action.client);
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <MapPin className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Mudar localização · {client?.name || action.client}
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700 mb-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Novo local</p>
          <p className="text-[12.5px] font-bold text-slate-800 dark:text-zinc-100">{action.location}</p>
        </div>
        {!client && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Cliente "{action.client}" não encontrado.
          </p>
        )}
        {done ? doneRow("Localização atualizada") : (
          <button
            onClick={() => client && runCommit(() => commitRelocateClient(userId!, client, action.location), "Localização atualizada no mapa!")}
            disabled={!client || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Localizando...</> : <>Confirmar novo local <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── CADASTRAR CLIENTE ── */
  if (action.type === "create_client") {
    const cnpjClean = (action.cnpj || "").replace(/\D/g, "");
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <UserPlus className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Cadastrar cliente
          </span>
        </div>
        <div className="space-y-1.5 mb-3">
          {action.name && (
            <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Nome</p>
              <p className="text-[12.5px] font-bold text-slate-800 dark:text-zinc-100">{action.name}</p>
            </div>
          )}
          {cnpjClean && (
            <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2 border border-emerald-100 dark:border-zinc-700">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">CNPJ {action.name ? "" : "(buscarei os dados na Receita)"}</p>
              <p className="text-[12.5px] font-bold text-slate-800 dark:text-zinc-100">{action.cnpj}</p>
            </div>
          )}
        </div>
        {!action.name && !cnpjClean && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Informe ao menos um nome ou CNPJ.
          </p>
        )}
        {done ? doneRow("Cliente cadastrado") : (
          <button
            onClick={() => runCommit(() => commitCreateClient(userId!, { cnpj: action.cnpj, name: action.name, address: action.address }), "Cliente cadastrado!")}
            disabled={(!action.name && !cnpjClean) || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Cadastrando...</> : <>Confirmar cadastro <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── EXCLUIR CLIENTE (destrutivo) ── */
  if (action.type === "delete_client") {
    const client = findClient(clients, action.client);
    return (
      <div className={dangerWrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Trash2 className="w-4 h-4 text-red-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
            Excluir cliente
          </span>
        </div>
        <p className="text-[12.5px] text-slate-700 dark:text-zinc-200 mb-3">
          {client
            ? <>Isto vai excluir <b>{client.name}</b> em definitivo. Esta ação não pode ser desfeita.</>
            : <>Cliente "{action.client}" não encontrado na carteira.</>}
        </p>
        {done ? doneRow("Cliente excluído") : (
          <button
            onClick={() => client && runCommit(() => commitDeleteClient(userId!, client.id), "Cliente excluído.")}
            disabled={!client || committing}
            className={dangerBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Excluindo...</> : <>Confirmar exclusão <Trash2 className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── CRIAR COMPROMISSO ── */
  if (action.type === "create_appointment") {
    const client = action.client ? findClient(clients, action.client) : undefined;
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(action.date)
      ? new Date(action.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })
      : action.date;
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Calendar className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Novo compromisso
          </span>
        </div>
        <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2.5 border border-emerald-100 dark:border-zinc-700 mb-3">
          <p className="text-[13px] font-black text-slate-800 dark:text-zinc-100">{action.title}</p>
          <p className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5 capitalize">{dateLabel} · {action.time || "09:00"}</p>
          {client && <p className="text-[11px] font-semibold text-emerald-600 mt-1">Cliente: {client.name}</p>}
        </div>
        {done ? doneRow("Compromisso criado") : (
          <button
            onClick={() => runCommit(() => commitCreateAppointment(userId!, { title: action.title, date: action.date, time: action.time, client_id: client?.id || null }), "Compromisso agendado!")}
            disabled={committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Agendando...</> : <>Confirmar agendamento <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── REAGENDAR / EDITAR COMPROMISSO ── */
  if (action.type === "update_appointment") {
    const appt = appointments.find((a) => a.id === action.id);
    const c = action.changes || {};
    const newDateLabel = c.date && /^\d{4}-\d{2}-\d{2}$/.test(c.date)
      ? new Date(c.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })
      : c.date;
    return (
      <div className={wrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <CalendarClock className="w-4 h-4 text-emerald-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">
            Reagendar compromisso
          </span>
        </div>
        {appt ? (
          <div className="bg-white dark:bg-zinc-800 rounded-xl px-3 py-2.5 border border-emerald-100 dark:border-zinc-700 mb-3">
            <p className="text-[13px] font-black text-slate-800 dark:text-zinc-100">{c.title || appt.title}</p>
            <p className="text-[12px] font-bold text-slate-500 dark:text-zinc-400 mt-0.5 capitalize">
              {newDateLabel || new Date(appt.date + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "long" })} · {c.time || appt.time}
            </p>
          </div>
        ) : (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 mb-2.5 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" /> Compromisso não encontrado.
          </p>
        )}
        {done ? doneRow("Compromisso atualizado") : (
          <button
            onClick={() => appt && runCommit(() => commitUpdateAppointment(userId!, appt, action.changes), "Compromisso atualizado!")}
            disabled={!appt || committing}
            className={primaryBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Salvando...</> : <>Confirmar mudança <Check className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  /* ── EXCLUIR COMPROMISSO (destrutivo) ── */
  if (action.type === "delete_appointment") {
    const appt = appointments.find((a) => a.id === action.id);
    return (
      <div className={dangerWrap}>
        <div className="flex items-center gap-2 mb-2.5">
          <Trash2 className="w-4 h-4 text-red-600" />
          <span className="text-[11px] font-black uppercase tracking-widest text-red-600 dark:text-red-400">
            Excluir compromisso
          </span>
        </div>
        <p className="text-[12.5px] text-slate-700 dark:text-zinc-200 mb-3">
          {appt
            ? <>Excluir <b>{appt.title}</b> ({new Date(appt.date + "T00:00:00").toLocaleDateString("pt-BR")} · {appt.time})?</>
            : <>Compromisso não encontrado.</>}
        </p>
        {done ? doneRow("Compromisso excluído") : (
          <button
            onClick={() => appt && runCommit(() => commitDeleteAppointment(userId!, appt), "Compromisso excluído.")}
            disabled={!appt || committing}
            className={dangerBtn}
          >
            {committing ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Excluindo...</> : <>Confirmar exclusão <Trash2 className="w-3.5 h-3.5" /></>}
          </button>
        )}
      </div>
    );
  }

  return null;
}

/* ─── helpers de contexto ───────────────────────────────────── */
function totalFaturamento(fat: Record<string, number> | null): number {
  if (!fat || typeof fat !== "object") return 0;
  return Object.values(fat).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const t = new Date(dateStr).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / 86_400_000);
}

interface RecentOrder {
  id: string;
  client_id: string;
  category: string;
  value: number;
  created_at: string;
}

function buildClientContext(
  clients: AIClient[],
  recentOrders: RecentOrder[] = []
): { context: string; total: number; truncated: boolean } {
  const total = clients.length;
  const ordered = [...clients].sort((a, b) => totalFaturamento(b.faturamento) - totalFaturamento(a.faturamento));
  const slice = ordered.slice(0, MAX_CLIENTS_IN_CONTEXT);

  // Agrupa pedidos por cliente para acesso rápido
  const ordersByClient = new Map<string, RecentOrder[]>();
  recentOrders.forEach((o) => {
    if (!ordersByClient.has(o.client_id)) ordersByClient.set(o.client_id, []);
    ordersByClient.get(o.client_id)!.push(o);
  });

  const lines = slice.map((c, i) => {
    const fat = totalFaturamento(c.faturamento);
    const inactive = daysSince(c.last_contact);
    const local = [c.city, c.state].filter(Boolean).join("/") || "?";

    const cnpj = c.cnpj ? ` | CNPJ: ${c.cnpj}` : "";
    const phone = c.phone ? ` | tel: ${c.phone}` : "";
    const email = c.email ? ` | email: ${c.email}` : "";
    const address = c.address ? ` | end: ${c.address.slice(0, 80)}` : "";

    // Faturamento acumulado por empresa representada
    const fatBreakdown =
      c.faturamento && Object.keys(c.faturamento).length > 1
        ? ` (${Object.entries(c.faturamento)
            .sort((a, b) => Number(b[1]) - Number(a[1]))
            .map(([k, v]) => `${k}: R$${Number(v).toLocaleString("pt-BR")}`)
            .join(" | ")})`
        : "";

    // Últimos 3 pedidos deste cliente (dos pedidos recentes carregados)
    const clientOrders = ordersByClient.get(c.id) || [];
    const ordersStr =
      clientOrders.length > 0
        ? ` | pedidos recentes: ${clientOrders
            .slice(0, 3)
            .map((o) => `${o.category} R$${Number(o.value).toLocaleString("pt-BR")} em ${o.created_at.slice(0, 10)}`)
            .join("; ")}`
        : "";

    const notes = c.notes ? ` | notas: ${c.notes.replace(/\s+/g, " ").slice(0, 120)}` : "";

    return (
      `${i + 1}. ${c.name}${cnpj}${phone}${email} | local: ${local}${address}` +
      ` | status: ${c.status || "ativo"} | fat total: R$${fat.toLocaleString("pt-BR")}${fatBreakdown}` +
      ` | sem contato: ${inactive != null ? `${inactive}d` : "sem registro"}${ordersStr}${notes}`
    );
  });

  return { context: lines.join("\n"), total, truncated: total > MAX_CLIENTS_IN_CONTEXT };
}

/* ─── página ────────────────────────────────────────────────── */
/* Master ativo = uso ilimitado; demais planos/trial = limite diário.
   Ajuste DAILY_LIMIT ou a regra isUnlimited conforme a estratégia comercial. */
const DAILY_LIMIT = 10;

export default function AssistenteIA() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const voiceSupported =
    typeof window !== "undefined" &&
    !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; base64: string; mime: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUnlimited =
    settings?.plan_id === "master" && settings?.subscription_status === "active";
  const todayStr = new Date().toISOString().slice(0, 10);
  const usageKey = user ? `rm_ai_usage_${user.id}` : "rm_ai_usage";
  const [usedToday, setUsedToday] = useState(0);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(usageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      setUsedToday(parsed && parsed.date === todayStr ? parsed.count || 0 : 0);
    } catch {
      setUsedToday(0);
    }
  }, [usageKey, todayStr]);

  const remaining = isUnlimited ? Infinity : Math.max(0, DAILY_LIMIT - usedToday);
  const limitReached = !isUnlimited && usedToday >= DAILY_LIMIT;

  const bumpUsage = () => {
    if (isUnlimited) return;
    setUsedToday((prev) => {
      const next = prev + 1;
      try {
        localStorage.setItem(usageKey, JSON.stringify({ date: todayStr, count: next }));
      } catch {}
      return next;
    });
  };

  // Carregar histórico de chats ao montar (isolado por user)
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from("ai_chats")
        .select("id, role, content, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });
      if (!error && data) {
        setMessages(data.map(msg => ({ role: msg.role as "user" | "assistant", content: msg.content })));
      }
    })();
  }, [user]);

  // Salvar mensagem no banco (isolada por user)
  const saveChat = async (role: "user" | "assistant", content: string) => {
    if (!user) return;
    await supabase.from("ai_chats").insert({
      user_id: user.id,
      role,
      content,
    });
  };

  const { data: clients = [], isLoading: clientsLoading, refetch: refetchClients } = useQuery({
    queryKey: ["ai-assistant-clients", user?.id],
    queryFn: async (): Promise<AIClient[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, cnpj, city, state, status, last_contact, notes, faturamento, phone, email, address, lat, lng")
        .eq("user_id", user!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as AIClient[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { data: appointments = [], refetch: refetchAppointments } = useQuery({
    queryKey: ["ai-assistant-appointments", user?.id],
    queryFn: async (): Promise<AIAppointment[]> => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, title, date, time, client_id, google_event_id")
        .eq("user_id", user!.id)
        .order("date", { ascending: true });
      if (error) throw error;
      return (data || []) as AIAppointment[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  // Pedidos dos últimos 90 dias para enriquecer o contexto da IA
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const { data: recentOrders = [] } = useQuery({
    queryKey: ["ai-assistant-orders", user?.id],
    queryFn: async (): Promise<RecentOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, client_id, category, value, created_at")
        .eq("user_id", user!.id)
        .gte("created_at", ninetyDaysAgo)
        .order("created_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data || []) as RecentOrder[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { systemInstruction, total, truncated } = useMemo(() => {
    const { context, total, truncated } = buildClientContext(clients, recentOrders);
    const categoriesLine =
      settings?.categories && settings.categories.length > 0
        ? settings.categories.join(", ")
        : "nenhuma empresa cadastrada ainda";
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = appointments
      .filter((a) => a.date >= today)
      .slice(0, 40)
      .map((a) => {
        const cli = a.client_id ? clients.find((c) => c.id === a.client_id)?.name : null;
        return `- id:${a.id} | ${a.date} ${a.time} | ${a.title}${cli ? ` | cliente: ${cli}` : ""}`;
      });
    const appointmentsLine = upcoming.length ? upcoming.join("\n") : "Nenhum compromisso futuro.";

    // Resumo de pedidos recentes (últimos 90 dias) para contexto da IA
    const ordersLine = recentOrders.length > 0
      ? recentOrders.slice(0, 60).map((o) => {
          const clientName = clients.find((c) => c.id === o.client_id)?.name ?? o.client_id;
          return `- ${clientName} | ${o.category} | R$${Number(o.value).toLocaleString("pt-BR")} | ${o.created_at.slice(0, 10)}`;
        }).join("\n")
      : "Nenhum pedido nos últimos 90 dias.";
    const instruction = `Você é o Assistente IA do Represente-Se, um assistente inteligente dentro de uma plataforma de gestão para representantes comerciais brasileiros. Você conversa com o representante (o usuário) como um assistente geral — no estilo do ChatGPT — mas com dois diferenciais: você conhece a CARTEIRA DE CLIENTES deste usuário e conhece o SISTEMA Represente-Se.

Como você deve agir:
- Responda QUALQUER pergunta do usuário, seja ela relacionada aos clientes, ao sistema, a vendas, ou a qualquer assunto geral. Pode ajudar a escrever mensagens, dar ideias de abordagem comercial, fazer cálculos, explicar conceitos, etc.
- Sempre em português do Brasil, com tom profissional, claro e prático. Use **negrito** e listas quando ajudar a clareza.
- Quando a pergunta for sobre os CLIENTES do usuário, baseie-se nos dados da carteira fornecidos abaixo. Não invente fatos sobre clientes que não estejam nos dados; se faltar a informação, diga que não há registro.
- Quando a pergunta for sobre COMO USAR o sistema, use o conhecimento sobre o Represente-Se abaixo.
- Para assuntos gerais (fora do app), responda normalmente com seu próprio conhecimento, como um bom assistente.
- Valores de faturamento estão em reais (R$). Em rankings e contagens sobre clientes, seja preciso com os números. "dias sem contato" alto indica cliente em risco de inatividade.

SOBRE O SISTEMA REPRESENTE-SE (para tirar dúvidas de uso):
- Clientes (CRM): carteira com ficha individual, histórico, anotações, status e alertas automáticos de inatividade.
- Mapa: mostra os clientes no mapa para planejar rotas e visitas por região.
- Agenda: compromissos e visitas da semana, com integração ao Google Calendar.
- E-mails: caixa de entrada integrada ao Gmail, vinculada aos clientes.
- Empresas e Pedidos: empresas representadas e lançamento de pedidos — a IA ajuda a digitalizar pedidos a partir de foto ou PDF.
- Faturamento: gráfico mensal de faturamento por empresa representada, com teto configurável.
- Assistente IA (você): responde sobre a carteira, sobre o sistema e sobre qualquer assunto.
- Planos: Exclusivo (1 empresa), Profissional (até 5 empresas) e Master (empresas ilimitadas + recursos de IA).

AÇÕES QUE VOCÊ PODE EXECUTAR NO APP:
Quando o usuário pedir uma das ações abaixo, escreva primeiro uma resposta curta e natural confirmando o que vai fazer e, NA ÚLTIMA LINHA da resposta, inclua UM bloco de ação no formato exato (cerca por crases triplas com a palavra "action"). Use os NOMES dos clientes exatamente como aparecem na carteira. Só emita o bloco quando o usuário realmente pedir a ação — em conversa normal, nunca emita.

1. TRAÇAR ROTA de visitas → escolha os clientes pertinentes (por região, inatividade, etc.) e ordene-os de forma lógica:
\`\`\`action
{"type":"route","clients":["Nome Cliente A","Nome Cliente B"]}
\`\`\`

2. LANÇAR PEDIDO → quando informar cliente, empresa representada e valor. A categoria deve ser uma das empresas representadas do usuário:
\`\`\`action
{"type":"order","client":"Nome do Cliente","category":"Empresa Representada","value":1234.56}
\`\`\`
Se faltar cliente, empresa ou valor, PERGUNTE antes — não emita o bloco incompleto.

3. MENSAGEM DE WHATSAPP → escreva a mensagem pronta (cordial, em português) e identifique o cliente:
\`\`\`action
{"type":"whatsapp","client":"Nome do Cliente","message":"Texto completo da mensagem aqui"}
\`\`\`

4. RELATÓRIO DA CARTEIRA em PDF → quando pedirem um resumo/relatório geral da carteira:
\`\`\`action
{"type":"report"}
\`\`\`

5. EDITAR CLIENTE → quando pedir para mudar telefone, e-mail, endereço, status, notas, nome, cidade ou CNPJ de um cliente. Inclua só os campos que mudam:
\`\`\`action
{"type":"update_client","client":"Nome do Cliente","changes":{"phone":"(11) 99999-0000","email":"novo@email.com"}}
\`\`\`

6. MUDAR LOCALIZAÇÃO de um cliente no mapa → informe a cidade ou endereço novo (eu geocodifico):
\`\`\`action
{"type":"relocate_client","client":"Nome do Cliente","location":"Campinas - SP"}
\`\`\`

7. CADASTRAR CLIENTE NOVO → por CNPJ (eu puxo nome e endereço na Receita) ou por nome:
\`\`\`action
{"type":"create_client","cnpj":"00.000.000/0000-00"}
\`\`\`

8. EXCLUIR CLIENTE → ação destrutiva, confirme que é isso que o usuário quer no texto:
\`\`\`action
{"type":"delete_client","client":"Nome do Cliente"}
\`\`\`

9. CRIAR COMPROMISSO na agenda → título, data (AAAA-MM-DD) e hora (HH:MM); cliente é opcional:
\`\`\`action
{"type":"create_appointment","title":"Visita ao cliente X","date":"2026-06-25","time":"14:00","client":"Nome do Cliente"}
\`\`\`

10. REAGENDAR / EDITAR COMPROMISSO → use o "id" exato do compromisso da lista AGENDA abaixo; mande só o que muda:
\`\`\`action
{"type":"update_appointment","id":"uuid-do-compromisso","changes":{"date":"2026-06-26","time":"10:00"}}
\`\`\`

11. EXCLUIR COMPROMISSO → use o "id" exato da lista AGENDA:
\`\`\`action
{"type":"delete_appointment","id":"uuid-do-compromisso"}
\`\`\`

LANÇAR PEDIDO POR FOTO: se o usuário anexar uma imagem de um pedido/nota e pedir para lançar, LEIA a imagem, extraia cliente, empresa representada e valor total, e emita o bloco de "order". Se o usuário já disser o cliente/empresa, use o que ele falou. Se algum dado não estiver claro na imagem nem na fala, pergunte antes de emitir.

Regras gerais das ações: no máximo um bloco por resposta; o bloco vai sempre no final; o texto acima deve fazer sentido sozinho; o usuário SEMPRE confirma clicando num botão antes de a ação acontecer — então pode emitir com confiança quando ele pediu. Hoje é ${new Date().toISOString().slice(0, 10)} (use para interpretar "amanhã", "sexta", etc.). Datas sempre no formato AAAA-MM-DD.

DADOS DA CARTEIRA DESTE USUÁRIO (total de ${total} cliente(s)${truncated ? `, exibindo os ${MAX_CLIENTS_IN_CONTEXT} de maior faturamento` : ""}):
${context || "Nenhum cliente cadastrado ainda."}

AGENDA — PRÓXIMOS COMPROMISSOS (use o "id" exato para editar/excluir):
${appointmentsLine}

PEDIDOS RECENTES — ÚLTIMOS 90 DIAS (${recentOrders.length} pedido(s) — use para responder perguntas sobre vendas, histórico e frequência de compra):
${ordersLine}

EMPRESAS REPRESENTADAS DO USUÁRIO (use exatamente estes nomes como "category" ao lançar pedidos): ${categoriesLine}`;
    return { systemInstruction: instruction, total, truncated };
  }, [clients, appointments, recentOrders, settings?.categories]);

  // Briefing diário (calculado localmente, sem gastar IA)
  const briefing = useMemo(() => {
    if (!clients.length) return null;
    return buildDailyBriefing(clients, {
      alerta: settings?.alerta_days ?? 30,
      critico: settings?.critico_days ?? 45,
      inativo: settings?.inativo_days ?? 90,
    });
  }, [clients, settings?.alerta_days, settings?.critico_days, settings?.inativo_days]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const send = async (raw: string) => {
    const question = raw.trim();
    const image = attachedImage;
    if ((!question && !image) || thinking) return;

    if (!navigator.onLine) {
      toast.error("O assistente precisa de conexão com a internet.");
      return;
    }

    if (limitReached) {
      toast.error(`Você atingiu o limite diário de ${DAILY_LIMIT} mensagens. Faça upgrade para o Master para uso ilimitado.`);
      return;
    }

    const displayQuestion = question || (image ? "(foto enviada)" : "");
    const userMsg: ChatMessage = { role: "user", content: displayQuestion, image: image?.dataUrl };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setAttachedImage(null);
    setThinking(true);

    // Salva a mensagem do user no banco (com marcador se houve foto)
    await saveChat("user", image ? `${displayQuestion} [foto anexada]` : displayQuestion);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const history = nextMessages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Representante" : "Assistente"}: ${m.content}`)
        .join("\n");
      const prompt = image
        ? `${history}\n(O representante anexou uma imagem nesta mensagem — analise-a.)\nAssistente:`
        : `${history}\nAssistente:`;

      const answer = await geminiWithSystem(prompt, systemInstruction, {
        generationConfig: { temperature: 0.3 },
        signal: controller.signal,
        ...(image ? { imageData: image.base64, imageMimeType: image.mime } : {}),
      });

      const raw = answer.trim() || "Não consegui gerar uma resposta agora.";
      // Separa o texto limpo das ações executáveis embutidas
      const { text: assistantMsg, actions } = parseActions(raw);
      const displayMsg = assistantMsg || "Pronto!";
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: displayMsg, actions: actions.length ? actions : undefined },
      ]);
      // Salva apenas o texto limpo no histórico (sem o bloco técnico de ação)
      await saveChat("assistant", displayMsg);
      bumpUsage();
    } catch (err: any) {
      // Cancelamento pelo usuário: não é erro, apenas para
      if (err?.name === "AbortError" || controller.signal.aborted) {
        toast("Resposta cancelada.");
        return;
      }
      console.error("Assistente IA error:", err);
      const detail = (err?.message || "").toString();

      // Sobrecarga temporária da IA (503/overloaded): mensagem amigável, sem stack técnico.
      // Não salva no histórico — é transitório, o usuário só precisa tentar de novo.
      const isOverloaded =
        /\b503\b|sobrecarregad|overloaded|currently experiencing|unavailable/i.test(detail);

      if (isOverloaded) {
        toast.error("A IA está sobrecarregada. Tente novamente em alguns segundos.");
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "A IA está com muita demanda neste momento. 😕\n\nIsso é temporário e do lado do provedor — **tente enviar de novo em alguns segundos**.",
          },
        ]);
        return;
      }

      const shortDetail = detail.slice(0, 200);
      toast.error(shortDetail ? `Erro: ${shortDetail}` : "Erro ao falar com o assistente. Tente novamente.");
      const errMsg = `Ops, tive um problema para responder agora.${shortDetail ? `\n\n_Detalhe técnico: ${shortDetail}_` : ""}`;
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: errMsg },
      ]);
      // Salva o erro também (pro usuário não perder a tentativa)
      await saveChat("assistant", errMsg);
    } finally {
      abortRef.current = null;
      setThinking(false);
      inputRef.current?.focus();
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  // Comprime/redimensiona a imagem para caber no limite do servidor (~4,5MB na Vercel).
  // Também normaliza HEIC (foto de iPhone) e PNG pesado para JPEG.
  const compressImage = (
    file: File,
    maxDim = 1600,
    quality = 0.8
  ): Promise<{ dataUrl: string; base64: string; mime: string }> => {
    return new Promise((resolve, reject) => {
      const objectUrl = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            const scale = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * scale);
            height = Math.round(height * scale);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("canvas");
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL("image/jpeg", quality);
          const base64 = dataUrl.split(",")[1] || "";
          URL.revokeObjectURL(objectUrl);
          resolve({ dataUrl, base64, mime: "image/jpeg" });
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Não consegui ler essa imagem."));
      };
      img.src = objectUrl;
    });
  };

  // Anexar foto (ex.: pedido para a IA ler e lançar)
  const handlePickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reanexar o mesmo arquivo
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Anexe uma imagem (foto do pedido).");
      return;
    }
    try {
      const compressed = await compressImage(file);
      setAttachedImage(compressed);
    } catch {
      toast.error("Não consegui processar essa imagem. Tente outra foto.");
    }
  };

  // Ditado por voz: fala vira texto no input (Web Speech API, pt-BR)
  const toggleVoice = async () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      toast.error("Seu navegador não suporta ditado por voz.");
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    // Solicita permissão explicitamente antes de iniciar o reconhecimento.
    // Isso garante que o navegador/SO mostre o diálogo de microfone.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Fecha imediatamente — só precisávamos acionar o pedido de permissão
      stream.getTracks().forEach((t) => t.stop());
    } catch {
      toast.error("Permissão de microfone negada. Habilite nas configurações do navegador.");
      return;
    }

    const rec = new SR();
    rec.lang = "pt-BR";
    rec.continuous = true;
    rec.interimResults = true;

    const base = input.trim() ? input.trim() + " " : "";
    rec.onresult = (e: any) => {
      let assembled = "";
      for (let i = 0; i < e.results.length; i++) {
        assembled += e.results[i][0].transcript;
      }
      setInput(base + assembled);
    };
    rec.onerror = (e: any) => {
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") {
        toast.error("Permita o acesso ao microfone para ditar.");
      }
      setListening(false);
    };
    rec.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      inputRef.current?.focus();
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  // Garante que o reconhecimento pare ao desmontar a página
  useEffect(() => {
    return () => {
      try {
        recognitionRef.current?.stop();
      } catch {}
    };
  }, []);

  // "…" → gera novas frases prontas para o tema, via IA (não conta no limite diário)
  const generateMoreSuggestions = async (
    theme: SuggestionTheme,
    existing: string[]
  ): Promise<string[]> => {
    if (!navigator.onLine) {
      toast.error("Sem conexão para gerar mais sugestões.");
      return [];
    }
    const cats =
      settings?.categories && settings.categories.length > 0
        ? settings.categories.join(", ")
        : "nenhuma cadastrada";
    const prompt = `Você ajuda um representante comercial brasileiro a usar o assistente de IA do app Represente-Se.
Gere 4 NOVAS sugestões de perguntas ou comandos CURTOS (máximo 10 palavras cada) que ele poderia enviar ao assistente, sobre o tema "${theme.label}".
Empresas que ele representa: ${cats}.
NÃO repita nem reformule nenhuma destas que ele já viu: ${existing.join(" | ")}.
Responda APENAS com as 4 frases, uma por linha, sem numeração, sem aspas, sem comentários.`;
    try {
      const txt = await geminiText(prompt);
      const seen = new Set(existing.map((e) => e.toLowerCase().trim()));
      const lines = txt
        .split("\n")
        .map((l) => l.replace(/^[-•*\d.\)\s"]+/, "").replace(/["]+$/, "").trim())
        .filter((l) => l.length > 3 && l.length < 120);
      const fresh: string[] = [];
      for (const l of lines) {
        const key = l.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          fresh.push(l);
        }
        if (fresh.length >= 4) break;
      }
      if (!fresh.length) toast("Sem novas sugestões no momento.");
      return fresh;
    } catch {
      toast.error("Não consegui gerar mais sugestões agora.");
      return [];
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const empty = messages.length === 0;

  return (
    <div className="max-w-4xl mx-auto w-full flex flex-col" style={{ height: "calc(100dvh - 9rem)" }}>
      {/* ── HEADER ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 mb-5 flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="relative w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Brain className="w-6 h-6 text-white" />
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-emerald-400 border-2 border-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 dark:text-zinc-100 flex items-center gap-2">
              Assistente IA
            </h1>
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
              {clientsLoading
                ? "Carregando carteira..."
                : `${total} cliente${total === 1 ? "" : "s"} na análise`}
            </p>
          </div>
          {!isUnlimited && (
            <div className={cn(
              "ml-2 px-3 py-1 rounded-full text-[11px] font-bold border",
              limitReached
                ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-950/20 dark:border-red-800 dark:text-red-400"
                : remaining <= 3
                  ? "bg-amber-50 border-amber-200 text-amber-600 dark:bg-amber-950/20 dark:border-amber-800 dark:text-amber-400"
                  : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-400"
            )}>
              {limitReached ? "Limite atingido" : `${remaining}/${DAILY_LIMIT} hoje`}
            </div>
          )}
        </div>

        {!empty && (
          <button
            onClick={() => setMessages([])}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-zinc-800 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all"
          >
            <Trash2 className="w-3.5 h-3.5" /> Limpar
          </button>
        )}
      </div>

      {/* ── CHAT CARD ─────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col bg-white dark:bg-zinc-900 rounded-[28px] border border-slate-200 dark:border-zinc-800 ring-1 ring-slate-200/70 overflow-hidden">
        {/* mensagens */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 sm:p-7 space-y-5">
          {empty ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-3xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center mb-5">
                <Sparkles className="w-8 h-8 text-emerald-600" />
              </div>
              <h2 className="text-lg font-black tracking-tight text-slate-900 dark:text-zinc-100 mb-2">
                Converse com a IA do seu jeito
              </h2>
              <p className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 max-w-md mb-6">
                Pergunte sobre seus clientes, tire dúvidas do sistema ou peça ajuda com qualquer coisa — como num ChatGPT, mas com a sua carteira na mão.
              </p>

              {/* Briefing diário proativo */}
              {briefing && (briefing.inativos > 0 || briefing.emAlerta > 0 || briefing.urgentes.length > 0) && (
                <div className="w-full max-w-xl mb-6 rounded-2xl border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 text-left">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    <span className="text-[11px] font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Seu resumo de hoje</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700 text-center">
                      <p className="text-lg font-black text-slate-800 dark:text-zinc-100">{briefing.totalClientes}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Clientes</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700 text-center">
                      <p className="text-lg font-black text-amber-500">{briefing.emAlerta}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Em alerta</p>
                    </div>
                    <div className="bg-white dark:bg-zinc-800 rounded-xl p-2.5 border border-emerald-100 dark:border-zinc-700 text-center">
                      <p className="text-lg font-black text-red-500">{briefing.inativos}</p>
                      <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Inativos</p>
                    </div>
                  </div>
                  {briefing.urgentes.length > 0 && (
                    <p className="text-[12px] text-slate-600 dark:text-zinc-300">
                      <span className="font-bold">Mais urgentes:</span>{" "}
                      {briefing.urgentes.map((u) => `${u.name} (${u.dias}d)`).join(", ")}.
                    </p>
                  )}
                </div>
              )}

              <SuggestionMenu onPick={(t) => send(t)} disabled={clientsLoading} />
            </div>
          ) : (
            <>
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={cn("flex gap-3", msg.role === "user" ? "justify-end" : "justify-start")}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                  )}
                  <div className={cn("max-w-[82%] flex flex-col", msg.role === "user" ? "items-end" : "items-start")}>
                    {msg.image && (
                      <img
                        src={msg.image}
                        alt="Imagem enviada"
                        className="mb-1.5 max-w-[200px] rounded-2xl border border-emerald-200 dark:border-zinc-700 shadow-sm"
                      />
                    )}
                    <div
                      className={cn(
                        "w-fit px-4 py-3 rounded-2xl text-[13.5px] font-medium leading-relaxed",
                        msg.role === "user"
                          ? "bg-emerald-600 text-white rounded-br-md shadow-sm shadow-emerald-600/20"
                          : "bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-bl-md border border-slate-100 dark:border-zinc-700"
                      )}
                    >
                      <FormattedText text={msg.content} />
                    </div>
                    {/* Cartões de ação executável */}
                    {msg.role === "assistant" && msg.actions?.map((action, ai) => (
                      <div key={ai} className="w-full">
                        <ActionCard
                          action={action}
                          clients={clients}
                          appointments={appointments}
                          inativoDays={settings?.inativo_days ?? 90}
                          userId={user?.id}
                          onCommitted={() => { refetchClients(); refetchAppointments(); }}
                        />
                      </div>
                    ))}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-slate-500 dark:text-zinc-300" />
                    </div>
                  )}
                </motion.div>
              ))}

              {/* Sugestões por tema sempre visíveis (abaixo das mensagens) */}
              {!thinking && messages.length > 0 && (
                <div className="pt-4 border-t border-slate-100 dark:border-zinc-800">
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3">Sugestões</p>
                  <SuggestionMenu onPick={(t) => send(t)} disabled={clientsLoading || thinking} compact />
                </div>
              )}

              <AnimatePresence>
                {thinking && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="flex gap-3 justify-start"
                  >
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <div className="bg-slate-50 dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700 rounded-2xl rounded-bl-md px-4 py-3.5 flex items-center gap-1.5">
                      {[0, 1, 2].map((d) => (
                        <span
                          key={d}
                          className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce"
                          style={{ animationDelay: `${d * 0.15}s` }}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={endRef} />
            </>
          )}
        </div>

        {/* banner de limite atingido */}
        {limitReached && (
          <div className="border-t border-red-100 dark:border-red-900/40 px-5 py-4 bg-red-50/60 dark:bg-red-950/20 flex flex-col sm:flex-row items-center gap-3">
            <Crown className="w-5 h-5 text-red-500 flex-shrink-0" />
            <div className="flex-1 text-center sm:text-left">
              <p className="text-[13px] font-bold text-red-700 dark:text-red-400">
                Limite diário de {DAILY_LIMIT} mensagens atingido
              </p>
              <p className="text-[11px] text-red-500/80 dark:text-red-500 mt-0.5">
                Faça upgrade para o Plano Master e use a IA sem limites.
              </p>
            </div>
            <Link
              to="/planos"
              className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[12px] font-black uppercase tracking-wider transition-all flex-shrink-0"
            >
              Ver Planos
            </Link>
          </div>
        )}

        {/* input */}
        <div className="border-t border-slate-100 dark:border-zinc-800 p-3 sm:p-4 bg-white dark:bg-zinc-900">
          {/* Preview da imagem anexada */}
          {attachedImage && (
            <div className="mb-2 flex items-center gap-3 bg-slate-50 dark:bg-zinc-800 rounded-2xl p-2 pr-3 border border-slate-200 dark:border-zinc-700 w-fit">
              <img src={attachedImage.dataUrl} alt="Anexo" className="w-12 h-12 rounded-xl object-cover" />
              <div className="flex items-center gap-2">
                <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
                <span className="text-[11px] font-bold text-slate-600 dark:text-zinc-300">Foto anexada</span>
              </div>
              <button
                onClick={() => setAttachedImage(null)}
                className="ml-1 w-6 h-6 rounded-lg bg-slate-200 dark:bg-zinc-700 text-slate-500 hover:text-red-500 flex items-center justify-center transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handlePickImage}
            className="hidden"
          />
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/40 px-4 py-2 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
            {/* Botão de anexar foto */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={clientsLoading || limitReached || thinking}
              title="Anexar foto (ex.: pedido)"
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700 transition-all active:scale-95 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Paperclip className="w-4 h-4" />
            </button>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={
                clientsLoading
                  ? "Carregando sua carteira..."
                  : listening
                    ? "Ouvindo... pode falar"
                    : attachedImage
                      ? "Diga de quem é o pedido..."
                      : "Pergunte ou peça uma ação..."
              }
              disabled={clientsLoading || limitReached}
              className="flex-1 bg-transparent resize-none outline-none text-[14px] font-medium text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 py-2 max-h-32 disabled:opacity-50"
            />
            {/* Botão de voz (ditado) */}
            {voiceSupported && (
              <button
                onClick={toggleVoice}
                disabled={clientsLoading || limitReached || thinking}
                title={listening ? "Parar ditado" : "Falar (ditado por voz)"}
                className={cn(
                  "flex items-center justify-center w-10 h-10 rounded-xl transition-all active:scale-95 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed",
                  listening
                    ? "bg-red-600 text-white animate-pulse"
                    : "bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-300 hover:bg-slate-200 dark:hover:bg-zinc-700"
                )}
              >
                <Mic className="w-4 h-4" />
              </button>
            )}
            {thinking ? (
              <button
                onClick={cancel}
                title="Cancelar resposta"
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-red-600 hover:bg-red-500 text-white transition-all active:scale-95 flex-shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => send(input)}
                disabled={clientsLoading || (!input.trim() && !attachedImage) || limitReached}
                className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex-shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-[10px] text-slate-400 font-medium text-center mt-2">
            {thinking
              ? "Gerando resposta… toque no quadrado vermelho para cancelar."
              : listening
                ? "Ouvindo sua fala… toque no microfone para parar, depois envie."
                : "A IA pode editar clientes, lançar pedidos e mexer na agenda — você confirma cada ação antes."}
          </p>
        </div>
      </div>
    </div>
  );
}
