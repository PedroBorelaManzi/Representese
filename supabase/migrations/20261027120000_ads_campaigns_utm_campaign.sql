alter table public.ads_campaigns add column if not exists utm_campaign text;
comment on column public.ads_campaigns.utm_campaign is 'Valor de utm_campaign usado nos links desta campanha; liga os números da plataforma ao funil.';
-- Os números de ciclo1/ciclo2/Black Friday e o status das campanhas do Google foram atualizados em 27/10/2026 direto na tabela (dados, não schema).
