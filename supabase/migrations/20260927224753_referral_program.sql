-- Aplicada em produção via MCP apply_migration em 2026-09-27.
-- Programa de indicação: cada assinante pagante gera um código próprio
-- (reaproveita a tabela `coupons` já existente pro checkout web/Android
-- reconhecer o código sem mudar validate-coupon/process-checkout). Quem usa
-- o código ganha 10% na 1ª fatura; quem indicou ganha 10% recorrente por
-- indicado pagante ativo, até 20% (2 indicados) — enquanto esse indicado
-- continuar pagando.

alter table public.coupons
  add column referrer_user_id uuid references auth.users(id) on delete cascade;

create unique index coupons_referrer_user_id_key on public.coupons(referrer_user_id)
  where referrer_user_id is not null;

comment on column public.coupons.referrer_user_id is
  'Não nulo = cupom de indicação gerado pelo próprio usuário (programa de indicação), não um cupom promocional criado por admin.';

-- Quem indicou quem, de qual plataforma veio a indicação (pra saber onde dá
-- pra aplicar o desconto automaticamente vs. só rastrear).
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_user_id uuid not null references auth.users(id) on delete cascade,
  referred_user_id uuid not null references auth.users(id) on delete cascade,
  code text not null references public.coupons(code),
  platform text not null check (platform in ('web', 'android', 'ios')),
  created_at timestamptz not null default now(),
  unique (referred_user_id) -- cada pessoa foi indicada por no máximo 1 código
);

alter table public.referrals enable row level security;

-- Cada um vê só as indicações onde é o indicador (pra mostrar "2 pessoas
-- usaram seu código" nas Configurações) — nunca quem é o indicado nem dados
-- de outros indicadores.
create policy "referrals: indicador vê as próprias" on public.referrals
  for select to authenticated
  using (referrer_user_id = (select auth.uid()));

-- Só o backend (service_role, via edge function) grava aqui — nunca o
-- cliente direto, senão dava pra forjar indicação e inflar o próprio
-- desconto.

-- Código de indicação digitado no cadastro do app iOS, antes da compra —
-- não dá pra aplicar cupom no checkout do IAP (não existe checkout), então
-- fica pendente até o webhook do RevenueCat confirmar a 1ª compra.
create table public.pending_referral_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null,
  created_at timestamptz not null default now()
);

alter table public.pending_referral_codes enable row level security;

create policy "pending_referral_codes: dono grava a própria" on public.pending_referral_codes
  for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "pending_referral_codes: dono vê a própria" on public.pending_referral_codes
  for select to authenticated
  using (user_id = (select auth.uid()));

-- referral_discount_pct: quanto de desconto esse usuário TEM DIREITO agora
-- (recalculado pelo backend a cada mudança de status de um indicado seu).
-- referral_discount_applied_pct: quanto já está DE FATO refletido na
-- cobrança dele — no Asaas (site/Android) o backend mantém os dois iguais
-- sozinho; no iOS só muda quando a pessoa toca em "Resgatar" (a Apple não
-- deixa aplicar desconto de assinatura existente sem ação da pessoa no app).
alter table public.user_settings
  add column referral_discount_pct int not null default 0
    check (referral_discount_pct >= 0 and referral_discount_pct <= 20),
  add column referral_discount_applied_pct int not null default 0
    check (referral_discount_applied_pct >= 0 and referral_discount_applied_pct <= 20);

-- Gera (ou devolve, se já existir) o código de indicação do usuário logado.
-- SECURITY DEFINER pra poder gravar em `coupons` (sem policy de insert pra
-- authenticated) mesmo rodando com o JWT da pessoa, não do service_role.
create or replace function public.generate_my_referral_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing text;
  v_name text;
  v_base text;
  v_code text;
  v_suffix int := 0;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select code into v_existing from public.coupons where referrer_user_id = v_user_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Só quem já pagou pelo menos uma vez pode indicar — sem isso dava pra
  -- criar conta grátis só pra gerar código e farmar desconto sem nunca ter
  -- sido cliente de verdade.
  if not exists (
    select 1 from public.user_entitlements
    where user_id = v_user_id and subscription_status in ('active', 'past_due')
  ) then
    raise exception 'apenas assinantes pagantes podem gerar código de indicação';
  end if;

  select raw_user_meta_data->>'full_name' into v_name from auth.users where id = v_user_id;
  v_base := upper(regexp_replace(coalesce(split_part(v_name, ' ', 1), 'REP'), '[^A-Za-z0-9]', '', 'g'));
  if length(v_base) < 3 then v_base := 'REP'; end if;
  v_base := left(v_base, 10);

  loop
    v_code := v_base || case when v_suffix = 0 then '' else v_suffix::text end;
    exit when not exists (select 1 from public.coupons where code = v_code);
    v_suffix := v_suffix + 1;
  end loop;

  insert into public.coupons (code, discount_percent, active, referrer_user_id)
  values (v_code, 10, true, v_user_id);

  return v_code;
end;
$$;

grant execute on function public.generate_my_referral_code() to authenticated;

-- Recalcula quanto desconto um indicador tem direito (10% por indicado
-- pagante ativo, até 2 = 20%) e atualiza user_settings. Retorna o novo valor
-- pra quem chamou já saber sem precisar de outro round-trip. SECURITY
-- DEFINER porque conta indicados de OUTRAS contas (não dá pra fazer isso só
-- com a policy "vê as próprias" acima, que é pro SELECT direto do usuário).
create or replace function public.recompute_referrer_discount(p_referrer_user_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_active_count int;
  v_pct int;
begin
  select count(*) into v_active_count
  from public.referrals r
  join public.user_entitlements e on e.user_id = r.referred_user_id
  where r.referrer_user_id = p_referrer_user_id
    and e.subscription_status = 'active';

  v_pct := least(v_active_count, 2) * 10;

  update public.user_settings
  set referral_discount_pct = v_pct
  where user_id = p_referrer_user_id;

  return v_pct;
end;
$$;

-- Só o backend chama (edge functions, com o JWT do usuário ou service_role)
-- — não precisa de grant a authenticated: quem chamaria isso pro próprio
-- benefício só ganharia recalcular um número que o backend já recalcula
-- sozinho nos eventos certos.
revoke all on function public.recompute_referrer_discount(uuid) from public, anon, authenticated;
grant execute on function public.recompute_referrer_discount(uuid) to service_role;
