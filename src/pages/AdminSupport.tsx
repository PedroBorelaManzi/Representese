import React, { useState, useEffect, useRef, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { HeadphonesIcon, Send, Loader2, User, Circle, ChevronLeft } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { useIsSupportAdmin } from "../hooks/useIsSupportAdmin";
import { PageHeader } from "../components/ui";
import { cn } from "../lib/utils";

type ConversationRow = {
  id: string;
  user_id: string;
  status: string;
  unread_by_admin: boolean;
  last_message_at: string;
  email?: string;
};

type SupportMessage = {
  id: string;
  conversation_id: string;
  sender_role: "user" | "admin";
  content: string;
  created_at: string;
};

export default function AdminSupport() {
  const { user } = useAuth();
  const { isAdmin, isLoading: checkingAdmin } = useIsSupportAdmin();

  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadConversations = useCallback(async () => {
    setLoadingList(true);
    const { data: convs } = await supabase
      .from("support_conversations")
      .select("id, user_id, status, unread_by_admin, last_message_at")
      .order("last_message_at", { ascending: false });

    const list = convs || [];
    if (list.length > 0) {
      const userIds = Array.from(new Set(list.map((c) => c.user_id)));
      const { data: settingsRows } = await supabase
        .from("user_settings")
        .select("user_id, email")
        .in("user_id", userIds);
      const emailByUser = new Map((settingsRows || []).map((s) => [s.user_id, s.email]));
      setConversations(list.map((c) => ({ ...c, email: emailByUser.get(c.user_id) || c.user_id })));
    } else {
      setConversations([]);
    }
    setLoadingList(false);
  }, []);

  useEffect(() => {
    if (isAdmin) loadConversations();
  }, [isAdmin, loadConversations]);

  const openConversation = async (id: string) => {
    setSelectedId(id);
    const { data: msgs } = await supabase
      .from("support_messages")
      .select("id, conversation_id, sender_role, content, created_at")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    setMessages(msgs || []);
    await supabase.from("support_conversations").update({ unread_by_admin: false }).eq("id", id);
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, unread_by_admin: false } : c)));
  };

  useEffect(() => {
    if (!isAdmin) return;

    const channel = supabase
      .channel("admin-support-inbox")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "support_conversations" },
        () => loadConversations()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages" },
        (payload) => {
          const msg = payload.new as SupportMessage;
          if (msg.conversation_id === selectedId) {
            setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isAdmin, selectedId, loadConversations]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  const handleSend = async () => {
    const content = input.trim();
    if (!content || !selectedId || !user || sending) return;
    setSending(true);
    setInput("");
    try {
      const { data: inserted, error } = await supabase
        .from("support_messages")
        .insert({ conversation_id: selectedId, sender_id: user.id, sender_role: "admin", content })
        .select("id, conversation_id, sender_role, content, created_at")
        .single();
      if (error) throw error;
      setMessages((prev) => [...prev, inserted]);
      await supabase
        .from("support_conversations")
        .update({ last_message_at: new Date().toISOString(), unread_by_user: true })
        .eq("id", selectedId);
    } catch {
      setInput(content);
    } finally {
      setSending(false);
    }
  };

  if (!checkingAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <div className="h-full flex flex-col gap-0 pb-0">
      <PageHeader icon={HeadphonesIcon} title="Suporte" subtitle="Conversas dos usuários" accent="violet" />

      {/* altura explícita: o `flex-1`/`h-full` não resolve dentro do <main> no
          WebKit (cadeia de wrappers sem altura) e os painéis colapsavam. */}
      <div className="flex-1 flex flex-col md:flex-row gap-4 mt-4 min-h-[calc(100svh-12rem)]">
        {/* No celular é uma coisa de cada vez: lista OU conversa. No tablet/desktop,
            lado a lado. */}
        <div className={cn(
          "w-full md:w-72 md:shrink-0 bg-white dark:bg-zinc-950 rounded-[24px] border border-slate-200/80 dark:border-zinc-800/80 shadow-sm overflow-y-auto custom-scrollbar",
          selectedId && "hidden md:block"
        )}>
          {loadingList ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-5 h-5 text-slate-300 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="text-xs text-slate-400 font-medium text-center py-10 px-4">Nenhuma conversa ainda.</p>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => openConversation(c.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3.5 border-b border-slate-50 dark:border-zinc-900 text-left transition-colors",
                  selectedId === c.id ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-slate-50 dark:hover:bg-zinc-900"
                )}
              >
                <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-zinc-800 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4 text-slate-400" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-bold text-slate-800 dark:text-zinc-100 truncate">{c.email}</p>
                  <p className="text-[10px] text-slate-400 font-medium">
                    {new Date(c.last_message_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                {c.unread_by_admin && <Circle className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500 shrink-0" />}
              </button>
            ))
          )}
        </div>

        <div className={cn(
          "flex-1 bg-white dark:bg-zinc-950 rounded-[24px] border border-slate-200/80 dark:border-zinc-800/80 shadow-sm flex-col min-h-0",
          selectedId ? "flex" : "hidden md:flex"
        )}>
          {!selectedId ? (
            <div className="flex-1 flex items-center justify-center text-sm text-slate-400 font-medium">
              Selecione uma conversa para responder.
            </div>
          ) : (
            <>
              <button
                onClick={() => setSelectedId(null)}
                className="md:hidden flex items-center gap-2 px-5 py-3 border-b border-slate-100 dark:border-zinc-800 text-[11px] font-black text-slate-500 uppercase tracking-widest"
              >
                <ChevronLeft className="w-4 h-4" /> Conversas
              </button>
              <div className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-3">
                {messages.map((msg) => (
                  <div key={msg.id} className={cn("flex", msg.sender_role === "admin" ? "justify-end" : "justify-start")}>
                    <div
                      className={cn(
                        "max-w-[70%] px-4 py-2.5 rounded-2xl text-[13px] font-medium leading-relaxed",
                        msg.sender_role === "admin"
                          ? "bg-emerald-600 text-white rounded-br-md"
                          : "bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-200 rounded-bl-md"
                      )}
                    >
                      {msg.content}
                    </div>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
              <div className="p-4 border-t border-slate-100 dark:border-zinc-800 flex items-end gap-2">
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
                  placeholder="Responder..."
                  className="flex-1 bg-slate-50 dark:bg-zinc-800 rounded-2xl px-4 py-3 text-[13px] font-medium outline-none resize-none max-h-32 text-slate-800 dark:text-zinc-100 placeholder:text-slate-400"
                />
                <button
                  onClick={handleSend}
                  disabled={!input.trim() || sending}
                  className="w-11 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center transition-all disabled:opacity-40 shrink-0"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
