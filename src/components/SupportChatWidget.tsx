import React, { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";

type SupportMessage = {
  id: string;
  conversation_id: string;
  sender_role: "user" | "admin";
  content: string;
  created_at: string;
};

/** Bolha flutuante de suporte: cada usuário só vê a própria conversa (RLS garante isso no banco). */
export function SupportChatWidget() {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversation = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: existing } = await supabase
        .from("support_conversations")
        .select("id, unread_by_user")
        .eq("user_id", user.id)
        .maybeSingle();

      if (existing) {
        setConversationId(existing.id);
        setHasUnread(!!existing.unread_by_user);
        const { data: msgs } = await supabase
          .from("support_messages")
          .select("id, conversation_id, sender_role, content, created_at")
          .eq("conversation_id", existing.id)
          .order("created_at", { ascending: true });
        setMessages(msgs || []);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadConversation();
  }, [loadConversation]);

  // Realtime: novas mensagens e mudanças de status da conversa (independente de estar aberto)
  useEffect(() => {
    if (!conversationId) return;

    const channel = supabase
      .channel(`support-${conversationId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `conversation_id=eq.${conversationId}` },
        (payload) => {
          const msg = payload.new as SupportMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          if (msg.sender_role === "admin" && !isOpen) setHasUnread(true);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, isOpen]);

  useEffect(() => {
    if (isOpen) endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, isOpen]);

  const handleOpen = async () => {
    setIsOpen(true);
    setHasUnread(false);
    if (conversationId) {
      await supabase.from("support_conversations").update({ unread_by_user: false }).eq("id", conversationId);
    }
  };

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !user || sending) return;
    setSending(true);
    setInput("");

    try {
      let convId = conversationId;
      if (!convId) {
        const { data: created, error } = await supabase
          .from("support_conversations")
          .insert({ user_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        convId = created.id;
        setConversationId(convId);
      }

      const { data: inserted, error: msgError } = await supabase
        .from("support_messages")
        .insert({ conversation_id: convId, sender_id: user.id, sender_role: "user", content })
        .select("id, conversation_id, sender_role, content, created_at")
        .single();
      if (msgError) throw msgError;

      setMessages((prev) => [...prev, inserted]);
      await supabase
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString(), unread_by_admin: true })
        .eq("id", convId);
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  if (!user) return null;

  return (
    <>
      <button
        onClick={() => (isOpen ? setIsOpen(false) : handleOpen())}
        className="fixed bottom-6 right-6 z-[9000] w-14 h-14 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/30 flex items-center justify-center transition-all active:scale-95"
        title="Suporte"
      >
        {isOpen ? <X className="w-6 h-6" /> : <MessageCircle className="w-6 h-6" />}
        {hasUnread && !isOpen && (
          <span className="absolute top-0 right-0 w-3.5 h-3.5 rounded-full bg-red-500 border-2 border-white" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-[9000] w-[360px] max-w-[calc(100vw-2rem)] h-[480px] max-h-[calc(100vh-8rem)] bg-white dark:bg-zinc-900 rounded-[24px] shadow-2xl border border-slate-200 dark:border-zinc-800 flex flex-col overflow-hidden"
          >
            <div className="px-5 py-4 bg-emerald-600 text-white flex items-center gap-3 shrink-0">
              <MessageCircle className="w-5 h-5" />
              <div>
                <p className="text-sm font-black uppercase tracking-tight">Suporte</p>
                <p className="text-[10px] font-bold text-emerald-100">Geralmente respondemos rápido</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
              {loading ? (
                <div className="h-full flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
                </div>
              ) : messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <p className="text-sm font-bold text-slate-600 dark:text-zinc-300">Como podemos ajudar?</p>
                  <p className="text-xs text-slate-400 mt-1">Mande sua dúvida e a gente responde por aqui.</p>
                </div>
              ) : (
                messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.sender_role === "user" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[80%] px-3.5 py-2.5 rounded-2xl text-[13px] font-medium leading-relaxed",
                        msg.sender_role === "user"
                          ? "bg-emerald-600 text-white rounded-br-md"
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-bl-md"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            <div className="p-3 border-t border-slate-100 dark:border-zinc-800 flex items-end gap-2 shrink-0">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                rows={1}
                placeholder="Digite sua mensagem..."
                className="flex-1 bg-slate-50 dark:bg-zinc-800 rounded-2xl px-4 py-2.5 text-[13px] font-medium outline-none resize-none max-h-24 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="w-10 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all disabled:opacity-40 shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
