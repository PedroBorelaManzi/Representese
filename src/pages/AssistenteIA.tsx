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
import { compressImage } from "../lib/imageCompression";
import { posthog } from "../lib/posthog";
import { cn } from "../lib/utils";
import { toast } from "sonner";
import { isIOSApp } from "../lib/iapPolicy";
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
import { SuggestionMenu, type SuggestionTheme } from "../components/assistente/suggestions";
import { FormattedText, ActionCard } from "../components/assistente/ActionCard";
import { MAX_CLIENTS_IN_CONTEXT, buildClientContext, type RecentOrder } from "../components/assistente/context";

/* ─── tipos ─────────────────────────────────────────────────── */
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: AIAction[];
  image?: string; // dataURL (apenas exibição na sessão atual)
}

type AIClient = AIActionClient;


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
- **SEJA EXTREMAMENTE BREVE E VÁ DIRETO AO PONTO.** Entregue apenas o que o usuário precisa saber no momento, sem introduções ou textos longos.
- Ao final das suas respostas, adicione uma frase curta oferecendo uma explicação mais detalhada caso o usuário queira (ex: "Quer que eu explique com mais detalhes?"). Só forneça explicações longas se o usuário pedir explicitamente.
- Responda QUALQUER pergunta do usuário, seja ela relacionada aos clientes, ao sistema, a vendas, ou a qualquer assunto geral. Pode ajudar a escrever mensagens, dar ideias de abordagem comercial, fazer cálculos, explicar conceitos, etc.
- Sempre em português do Brasil, com tom profissional, claro e prático. Use **negrito** e listas quando ajudar a clareza.
- Quando a pergunta for sobre os CLIENTES do usuário, baseie-se nos dados da carteira fornecidos abaixo. Não invente fatos sobre clientes que não estejam nos dados; se faltar a informação, diga que não há registro.
- Quando a pergunta for sobre COMO USAR o sistema, use o conhecimento sobre o Represente-Se abaixo.
- Para assuntos gerais (fora do app), responda normalmente com seu próprio conhecimento, como um bom assistente.
- Valores de faturamento estão em reais (R$). Em rankings e contagens sobre clientes, seja preciso com os números. "dias sem comprar" alto indica cliente em risco de inatividade (a régua olha a data do último pedido, não a do último contato).

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

  // Primeira renderização do histórico entra direto no fim (sem animação),
  // como se o chat já tivesse sido aberto lá embaixo; só mensagens novas
  // depois disso rolam suavemente.
  const hasScrolledOnceRef = useRef(false);
  useEffect(() => {
    if (messages.length === 0) return;
    endRef.current?.scrollIntoView({ behavior: hasScrolledOnceRef.current ? "smooth" : "auto", block: "end" });
    hasScrolledOnceRef.current = true;
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
      toast.error(
        isIOSApp()
          ? `Você atingiu o limite diário de ${DAILY_LIMIT} mensagens. Volte amanhã.`
          : `Você atingiu o limite diário de ${DAILY_LIMIT} mensagens. Faça upgrade para o Master para uso ilimitado.`
      );
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
      posthog.capture('ai_message_sent', { had_image: !!image, had_actions: actions.length > 0 });
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
                {isIOSApp()
                  ? 'O plano Master libera uso ilimitado. Volte amanhã ou fale com o suporte.'
                  : 'Faça upgrade para o Plano Master e use a IA sem limites.'}
              </p>
            </div>
            {!isIOSApp() && (
              <Link
                to="/planos"
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-[12px] font-black uppercase tracking-wider transition-all flex-shrink-0"
              >
                Ver Planos
              </Link>
            )}
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
