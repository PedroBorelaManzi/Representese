-- Chat de suporte in-app: usuários normais conversam só com sua própria
-- conversa; contas em support_admins enxergam e respondem todas.

CREATE TABLE IF NOT EXISTS public.support_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS public.support_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  unread_by_user boolean NOT NULL DEFAULT false,
  unread_by_admin boolean NOT NULL DEFAULT true,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.support_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.support_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id),
  sender_role text NOT NULL CHECK (sender_role IN ('user', 'admin')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_user ON public.support_conversations (user_id);
CREATE INDEX IF NOT EXISTS idx_support_conversations_last_message ON public.support_conversations (last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation ON public.support_messages (conversation_id, created_at);

-- Função SECURITY DEFINER: evita que a política de RLS de support_admins
-- precise ler a própria tabela (o que causaria recursão infinita de RLS).
CREATE OR REPLACE FUNCTION public.is_support_admin(uid uuid)
RETURNS boolean AS $$
  SELECT EXISTS (SELECT 1 FROM public.support_admins WHERE user_id = uid);
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

ALTER TABLE public.support_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

-- support_admins: só o próprio admin (ou outro admin) pode ler a lista;
-- nenhuma escrita pelo client (gerenciado via SQL/migration).
DROP POLICY IF EXISTS "support_admins_select_self_or_admin" ON public.support_admins;
CREATE POLICY "support_admins_select_self_or_admin" ON public.support_admins
  FOR SELECT USING (auth.uid() = user_id OR public.is_support_admin(auth.uid()));

-- support_conversations: dono vê/edita a própria; admin vê/edita todas.
DROP POLICY IF EXISTS "support_conversations_owner" ON public.support_conversations;
CREATE POLICY "support_conversations_owner" ON public.support_conversations
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "support_conversations_admin" ON public.support_conversations;
CREATE POLICY "support_conversations_admin" ON public.support_conversations
  FOR ALL USING (public.is_support_admin(auth.uid())) WITH CHECK (public.is_support_admin(auth.uid()));

-- support_messages: dono lê/escreve mensagens só da própria conversa, sempre
-- como sender_role='user' e sender_id=auth.uid() (não dá pra forjar uma
-- resposta "de admin" na própria conversa). Admin lê/escreve em todas.
DROP POLICY IF EXISTS "support_messages_owner" ON public.support_messages;
CREATE POLICY "support_messages_owner" ON public.support_messages
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.support_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  ) WITH CHECK (
    sender_id = auth.uid() AND sender_role = 'user'
    AND EXISTS (SELECT 1 FROM public.support_conversations c WHERE c.id = conversation_id AND c.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "support_messages_admin" ON public.support_messages;
CREATE POLICY "support_messages_admin" ON public.support_messages
  FOR ALL USING (public.is_support_admin(auth.uid()))
  WITH CHECK (public.is_support_admin(auth.uid()) AND sender_id = auth.uid() AND sender_role = 'admin');
