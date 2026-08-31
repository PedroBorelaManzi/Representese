-- Feedback de exclusão de conta (LGPD — direito ao esquecimento).
-- Deliberadamente SEM foreign key para auth.users: a linha precisa
-- sobreviver à exclusão do usuário. Guarda por que a pessoa saiu e o
-- que ela gostaria que melhorasse, pra análise de churn.
--
-- APLICADA VIA MCP apply_migration em 2026-08-31 (fluxo "Caminho A" —
-- ver .agents/, memória representese-migrations-drift). Este arquivo é
-- só registro; NÃO rodar `supabase db push`.
create table if not exists public.account_deletion_feedback (
  id                     uuid primary key default gen_random_uuid(),
  deleted_user_id        uuid not null,
  email                  text,
  full_name              text,
  reason_category        text,        -- slug do motivo principal
  reason_text            text,        -- texto livre "por que está excluindo"
  improvement_text       text,        -- "o que podemos melhorar"
  subscription_plan      text,        -- plano no momento da exclusão
  subscription_status    text,
  had_active_subscription boolean not null default false,
  asaas_subscription_id  text,
  deleted_by             text not null default 'self',  -- 'self' | 'admin'
  created_at             timestamptz not null default now()
);

create index if not exists idx_account_deletion_feedback_created_at
  on public.account_deletion_feedback (created_at desc);

alter table public.account_deletion_feedback enable row level security;

drop policy if exists "admin le feedback de exclusao" on public.account_deletion_feedback;
create policy "admin le feedback de exclusao"
  on public.account_deletion_feedback
  for select
  to authenticated
  using (
    exists (
      select 1 from public.user_settings us
      where us.user_id = auth.uid() and us.is_admin = true
    )
  );

comment on table public.account_deletion_feedback is
  'Motivo e sugestoes deixados por quem exclui a conta. Sem FK p/ auth.users de proposito (sobrevive a exclusao). Preenchido pela Edge Function delete-account.';
