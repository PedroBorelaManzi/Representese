-- Catálogo de produtos por representada: diferente de order_items (que só
-- existe depois que um pedido com aquele produto foi lançado), o catálogo é
-- a lista de referência que o usuário sobe de uma vez (planilha/PDF da
-- fábrica) — nome, código, preço (unitário ou caixa), desconto e comissão de
-- cada item, editável depois direto na tabela.
create table if not exists public.product_catalog (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  name text not null,
  code text,
  unit_type text not null default 'unidade' check (unit_type in ('unidade', 'caixa')),
  price numeric(12,2),
  discount_pct numeric(5,2),
  commission_pct numeric(5,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_product_catalog_user_category on public.product_catalog(user_id, category);

alter table public.product_catalog enable row level security;

drop policy if exists "Users manage own catalog" on public.product_catalog;
create policy "Users manage own catalog" on public.product_catalog
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on public.product_catalog;
create trigger set_updated_at
  before update on public.product_catalog
  for each row execute function public.handle_updated_at();
