-- Tabela de histórico de chats com a IA por usuário
CREATE TABLE IF NOT EXISTS ai_chats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  INDEX idx_user_created (user_id, created_at DESC)
);

-- RLS: cada usuário vê APENAS seus próprios chats
ALTER TABLE ai_chats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own chats"
  ON ai_chats FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own chats"
  ON ai_chats FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Índice para queries frequentes
CREATE INDEX IF NOT EXISTS idx_ai_chats_user_created
  ON ai_chats(user_id, created_at DESC);
