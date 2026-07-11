-- support_messages e support_conversations nunca foram adicionadas à
-- publicação supabase_realtime. O SupportChatWidget assina postgres_changes
-- em support_messages esperando receber respostas do admin em tempo real,
-- mas como a tabela não está na publicação o evento nunca é emitido — as
-- respostas do admin não chegam ao usuário (só ficam visíveis se o widget
-- for desmontado e remontado, refazendo o fetch inicial).
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.support_conversations;
