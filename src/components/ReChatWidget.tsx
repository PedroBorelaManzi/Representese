import { useEffect, useRef, useState } from "react";
import { MessageCircle, Minus, Send, Loader2, X, MessageSquareText } from "lucide-react";
import { Capacitor } from "@capacitor/core";
import { useLocation } from "react-router-dom";
import { cn } from "../lib/utils";

type Msg = { role: "user" | "model"; text: string };

const STORAGE_KEY = "rs_re_chat_v1";
const TEASER_KEY = "rs_re_teaser_off";
const WHATSAPP = "https://wa.me/5515997472785?text=" + encodeURIComponent("Olá, vim pelo site e gostaria de falar com uma pessoa.");
const PAGES = ["/", "/landing", "/planos", "/register", "/checkout", "/login"];
const SUGGESTIONS = ["Quais são os planos?", "Como funciona a garantia?", "Posso cancelar quando quiser?", "Funciona no celular?"];
const WELCOME: Msg = {
  role: "model",
  text: "Oi! Eu sou a Re, assistente virtual do Represente-Se!. Posso tirar suas dúvidas sobre os planos, a garantia e como começar. Em que posso ajudar?",
};

const lerSessao = <T,>(key: string, fallback: T): T => {
  try {
    const v = sessionStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
};

/** Chat da Re: atendente de IA para quem está conhecendo o produto ou comprando. Pode ser minimizado. */
export default function ReChatWidget() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>(() => lerSessao<Msg[]>(STORAGE_KEY, []));
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visivel = !Capacitor.isNativePlatform() && PAGES.includes(pathname);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(msgs.slice(-30)));
    } catch {
      /* sem storage: a conversa só não sobrevive à troca de página */
    }
  }, [msgs]);

  // Convite discreto, uma vez por sessão: só aparece se a pessoa ainda não abriu o chat.
  useEffect(() => {
    if (!visivel || open || msgs.length) return;
    let off = false;
    try {
      off = sessionStorage.getItem(TEASER_KEY) === "1";
    } catch { /* segue */ }
    if (off) return;
    const t = setTimeout(() => setTeaser(true), 8000);
    return () => clearTimeout(t);
  }, [visivel, open, msgs.length]);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: "end" });
  }, [msgs, open, sending]);

  if (!visivel) return null;

  const dispensarConvite = () => {
    setTeaser(false);
    try {
      sessionStorage.setItem(TEASER_KEY, "1");
    } catch { /* idem */ }
  };

  const abrir = () => {
    dispensarConvite();
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 150);
  };

  const enviar = async (texto: string) => {
    const t = texto.trim().slice(0, 600);
    if (!t || sending) return;
    const historico: Msg[] = [...msgs, { role: "user", text: t }];
    setMsgs(historico);
    setInput("");
    setSending(true);
    try {
      const res = await fetch("/api/re", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: historico }),
      });
      if (res.status === 429) throw new Error("muitas");
      if (!res.ok) throw new Error("erro");
      const { reply } = await res.json();
      setMsgs((m) => [...m, { role: "model", text: String(reply || "") }]);
    } catch (e: any) {
      setMsgs((m) => [
        ...m,
        {
          role: "model",
          text:
            e?.message === "muitas"
              ? "Você enviou muitas mensagens seguidas. Espere um pouquinho e tente de novo, ou fale com uma pessoa pelo WhatsApp."
              : "Não consegui responder agora. Tente de novo em instantes ou fale com uma pessoa pelo WhatsApp.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  const conversa = msgs.length ? msgs : [WELCOME];

  return (
    <div className="fixed z-[60] right-4 bottom-4 sm:right-6 sm:bottom-6 flex flex-col items-end gap-3" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      {open && (
        <div
          role="dialog"
          aria-label="Chat com a Re"
          className="w-[calc(100vw-2rem)] sm:w-[380px] h-[min(560px,calc(100dvh-7rem))] bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-zinc-700 flex flex-col overflow-hidden"
        >
          <div className="flex items-center gap-3 px-4 py-3 bg-emerald-600 text-white">
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center font-black text-sm">Re</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black leading-tight">Re · Represente-Se!</p>
              <p className="text-[11px] text-emerald-50/90 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-200" /> Assistente virtual · tira dúvidas na hora</p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Minimizar o chat" title="Minimizar" className="p-2 rounded-xl hover:bg-white/15 transition-colors">
              <Minus className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-slate-50 dark:bg-zinc-950">
            {conversa.map((m, i) => (
              <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words",
                    m.role === "user"
                      ? "bg-emerald-600 text-white rounded-br-md"
                      : "bg-white dark:bg-zinc-800 text-slate-800 dark:text-zinc-100 border border-slate-100 dark:border-zinc-700 rounded-bl-md"
                  )}
                >
                  {m.text}
                </div>
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md bg-white dark:bg-zinc-800 border border-slate-100 dark:border-zinc-700">
                  <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                </div>
              </div>
            )}
            {!msgs.length && (
              <div className="flex flex-wrap gap-2 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => enviar(s)} className="px-3 py-1.5 rounded-full text-xs font-bold border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-400 bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div ref={endRef} />
          </div>

          <form
            onSubmit={(e) => { e.preventDefault(); enviar(input); }}
            className="p-3 border-t border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={600}
                placeholder="Digite sua dúvida..."
                aria-label="Mensagem para a Re"
                className="flex-1 min-w-0 px-4 py-2.5 rounded-2xl bg-slate-100 dark:bg-zinc-800 text-sm text-slate-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <button type="submit" disabled={sending || !input.trim()} aria-label="Enviar" className="p-2.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 text-center">
              A Re é uma IA e pode errar. Não envie cartão nem senhas.{" "}
              <a href={WHATSAPP} target="_blank" rel="noopener noreferrer" className="font-bold text-emerald-600 hover:underline">Falar com uma pessoa</a>
            </p>
          </form>
        </div>
      )}

      {!open && teaser && (
        <div className="relative max-w-[240px] bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-700 shadow-xl rounded-2xl rounded-br-md px-4 py-3 pr-8 text-sm text-slate-700 dark:text-zinc-200 animate-in fade-in slide-in-from-bottom-2">
          <button onClick={dispensarConvite} aria-label="Dispensar" className="absolute top-1.5 right-1.5 p-1 text-slate-400 hover:text-slate-600">
            <X className="w-3.5 h-3.5" />
          </button>
          <button onClick={abrir} className="text-left">
            <span className="font-bold">Oi, sou a Re!</span> Posso tirar suas dúvidas sobre os planos?
          </button>
        </div>
      )}

      {!open && (
        <button
          onClick={abrir}
          aria-label="Abrir o chat com a Re"
          className="relative w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/30 flex items-center justify-center transition-transform active:scale-95"
        >
          {msgs.length ? <MessageSquareText className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
          {!msgs.length && <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-amber-400 border-2 border-white" />}
        </button>
      )}
    </div>
  );
}
