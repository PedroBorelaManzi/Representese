-- Tabela de histórico de chats com a IA por usuário
CREATE TABLE IF NOT EXISTS ai_chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Índice para queries frequentes (histórico por usuário em ordem cronológica)
CREATE INDEX IF NOT EXISTS idx_ai_chats_user_created
  ON ai_chats(user_id, created_at DESC);

-- RLS: cada usuário vê e insere APENAS seus próprios chats
ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own chats" ON ai_chats;
CREATE POLICY "Users can view their own chats"
  ON ai_chats FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own chats" ON ai_chats;
CREATE POLICY "Users can insert their own chats"
  ON ai_chats FOR INSERT
  WITH CHECK (auth.uid() = user_id);
