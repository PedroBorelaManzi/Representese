-- Área de atuação do representante, perguntada no 1º passo do onboarding.
-- segments: opções da lista (ids estáveis, ver src/lib/segments.ts); segment_other: texto livre
-- de quem não achou a área na lista — revisar pra decidir quais entram na lista.
alter table public.user_settings
  add column if not exists segments text[] not null default '{}',
  add column if not exists segment_other text;
