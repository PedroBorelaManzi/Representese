-- Configuração por cliente de um produto do catálogo: o código que ESSE
-- cliente usa pro produto (pode ser diferente do código da representada) e/ou
-- uma comissão % que só vale quando ESSE cliente compra ESSE produto —
-- sobrepõe settings.product_commissions[category::product_key] linha a
-- linha, sem mudar o comportamento pra quem nunca configura nada aqui.
--
-- product_key é a mesma chave normalizada de sempre (chaveDoProduto /
-- normalizar, orderItems.ts) — não referencia product_catalog.id de
-- propósito, porque order_items também só guarda product_key (nunca o id do
-- catálogo), então esta tabela precisa casar com AMBOS os lados (catálogo e
-- pedidos lançados) pela mesma chave textual.
create table if not exists public.client_product_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  category text not null,
  product_key text not null,
  -- Código que ESTE cliente usa pra pedir este produto (achado num pedido ou
  -- digitado manualmente aqui) — usado pra reconhecer automaticamente o
  -- produto certo num pedido novo desse cliente (ver orderItems.ts).
  client_code text,
  -- Comissão % que vale só quando ESTE cliente compra este produto —
  -- ausente = cai no % do produto (product_commissions) como hoje.
  commission_pct numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Uma linha por (cliente, representada, produto) — nunca duas
  -- configurações concorrentes pro mesmo trio.
  constraint client_product_settings_unique unique (user_id, client_id, category, product_key)
);

-- Resolução de código na hora do pedido: "este cliente, esta representada,
-- este código no documento -> qual produto?" (salvarItensDoPedido).
create index if not exists idx_cps_code_lookup
  on public.client_product_settings (user_id, client_id, category, client_code)
  where client_code is not null;

-- Blend de comissão por produto no mês (Comissoes.tsx) e listagem de
-- overrides de um produto (CatalogoProdutos.tsx) — mesma direção de busca.
create index if not exists idx_cps_user_category_product
  on public.client_product_settings (user_id, category, product_key);

alter table public.client_product_settings enable row level security;

drop policy if exists "Users manage own client product settings" on public.client_product_settings;
create policy "Users manage own client product settings" on public.client_product_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.client_product_settings;
create trigger set_updated_at
  before update on public.client_product_settings
  for each row execute function public.handle_updated_at();
