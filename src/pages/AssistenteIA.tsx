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
  Clock,
  MapPin,
  Crown,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useSettings } from "../contexts/SettingsContext";
import { geminiWithSystem } from "../lib/geminiProxy";
import { cn } from "../lib/utils";
import { toast } from "sonner";

/* ─── tipos ─────────────────────────────────────────────────── */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface AIClient {
  id: string;
  name: string;
  cnpj: string | null;
  city: string | null;
  state: string | null;
  status: string | null;
  last_contact: string | null;
  notes: string | null;
  faturamento: Record<string, number> | null;
}

const MAX_CLIENTS_IN_CONTEXT = 1500;

const suggestions = [
  { icon: Clock,      text: "Quais clientes estão há mais tempo sem contato?" },
  { icon: TrendingUp, text: "Quem são meus 5 maiores clientes por faturamento?" },
  { icon: MapPin,     text: "Como funciona o mapa de clientes no sistema?" },
  { icon: Users,      text: "Escreva uma mensagem de reativação para um cliente inativo." },
];

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

function buildClientContext(clients: AIClient[]): { context: string; total: number; truncated: boolean } {
  const total = clients.length;
  // Prioriza por faturamento ao truncar, para manter os clientes mais relevantes
  const ordered = [...clients].sort((a, b) => totalFaturamento(b.faturamento) - totalFaturamento(a.faturamento));
  const slice = ordered.slice(0, MAX_CLIENTS_IN_CONTEXT);

  const lines = slice.map((c, i) => {
    const fat = totalFaturamento(c.faturamento);
    const inactive = daysSince(c.last_contact);
    const local = [c.city, c.state].filter(Boolean).join("/") || "?";
    const notes = c.notes ? ` | notas: ${c.notes.replace(/\s+/g, " ").slice(0, 140)}` : "";
    return `${i + 1}. ${c.name} | local: ${local} | status: ${c.status || "ativo"} | faturamento total: R$${fat.toLocaleString("pt-BR")} | dias sem contato: ${inactive ?? "sem registro"}${notes}`;
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

  const { data: clients = [], isLoading: clientsLoading } = useQuery({
    queryKey: ["ai-assistant-clients", user?.id],
    queryFn: async (): Promise<AIClient[]> => {
      const { data, error } = await supabase
        .from("clients")
        .select("id, name, cnpj, city, state, status, last_contact, notes, faturamento")
        .eq("user_id", user!.id)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data || []) as AIClient[];
    },
    enabled: !!user,
    staleTime: 60_000,
  });

  const { systemInstruction, total, truncated } = useMemo(() => {
    const { context, total, truncated } = buildClientContext(clients);
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

DADOS DA CARTEIRA DESTE USUÁRIO (total de ${total} cliente(s)${truncated ? `, exibindo os ${MAX_CLIENTS_IN_CONTEXT} de maior faturamento` : ""}):
${context || "Nenhum cliente cadastrado ainda."}`;
    return { systemInstruction: instruction, total, truncated };
  }, [clients]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, thinking]);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || thinking) return;

    if (!navigator.onLine) {
      toast.error("O assistente precisa de conexão com a internet.");
      return;
    }

    if (limitReached) {
      toast.error(`Você atingiu o limite diário de ${DAILY_LIMIT} mensagens. Faça upgrade para o Master para uso ilimitado.`);
      return;
    }

    const userMsg: ChatMessage = { role: "user", content: question };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setThinking(true);

    try {
      const history = nextMessages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Representante" : "Assistente"}: ${m.content}`)
        .join("\n");
      const prompt = `${history}\nAssistente:`;

      const answer = await geminiWithSystem(prompt, systemInstruction, {
        generationConfig: { temperature: 0.3 },
      });

      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: answer.trim() || "Não consegui gerar uma resposta agora." },
      ]);
      bumpUsage();
    } catch (err: any) {
      console.error("Assistente IA error:", err);
      const detail = (err?.message || "").toString().slice(0, 200);
      toast.error(detail ? `Erro: ${detail}` : "Erro ao falar com o assistente. Tente novamente.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Ops, tive um problema para responder agora.${detail ? `\n\n_Detalhe técnico: ${detail}_` : ""}` },
      ]);
    } finally {
      setThinking(false);
      inputRef.current?.focus();
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
              <p className="text-[13px] font-medium text-slate-500 dark:text-zinc-400 max-w-md mb-8">
                Pergunte sobre seus clientes, tire dúvidas do sistema ou peça ajuda com qualquer coisa — como num ChatGPT, mas com a sua carteira na mão.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-xl">
                {suggestions.map((s) => (
                  <button
                    key={s.text}
                    onClick={() => send(s.text)}
                    disabled={clientsLoading}
                    className="group flex items-center gap-3 text-left p-4 rounded-2xl border border-slate-200 dark:border-zinc-800 hover:border-emerald-300 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/10 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <span className="w-9 h-9 rounded-xl bg-slate-50 dark:bg-zinc-800 group-hover:bg-emerald-100 flex items-center justify-center flex-shrink-0 transition-colors">
                      <s.icon className="w-4 h-4 text-emerald-600" />
                    </span>
                    <span className="text-[12.5px] font-semibold text-slate-700 dark:text-zinc-200 leading-snug">{s.text}</span>
                  </button>
                ))}
              </div>
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
                  <div
                    className={cn(
                      "max-w-[82%] px-4 py-3 rounded-2xl text-[13.5px] font-medium leading-relaxed",
                      msg.role === "user"
                        ? "bg-emerald-600 text-white rounded-br-md shadow-sm shadow-emerald-600/20"
                        : "bg-slate-50 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-bl-md border border-slate-100 dark:border-zinc-700"
                    )}
                  >
                    <FormattedText text={msg.content} />
                  </div>
                  {msg.role === "user" && (
                    <div className="w-8 h-8 rounded-xl bg-slate-200 dark:bg-zinc-700 flex items-center justify-center flex-shrink-0">
                      <User className="w-4 h-4 text-slate-500 dark:text-zinc-300" />
                    </div>
                  )}
                </motion.div>
              ))}

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
          <div className="flex items-end gap-2 rounded-2xl border border-slate-200 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-950/40 px-4 py-2 focus-within:border-emerald-300 focus-within:ring-4 focus-within:ring-emerald-500/10 transition-all">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder={clientsLoading ? "Carregando sua carteira..." : "Pergunte sobre seus clientes..."}
              disabled={clientsLoading || limitReached}
              className="flex-1 bg-transparent resize-none outline-none text-[14px] font-medium text-slate-800 dark:text-zinc-100 placeholder:text-slate-400 py-2 max-h-32 disabled:opacity-50"
            />
            <button
              onClick={() => send(input)}
              disabled={thinking || clientsLoading || !input.trim() || limitReached}
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 flex-shrink-0"
            >
              {thinking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-[10px] text-slate-400 font-medium text-center mt-2">
            A IA usa apenas os dados da sua carteira. Confira informações importantes antes de agir.
          </p>
        </div>
      </div>
    </div>
  );
}
