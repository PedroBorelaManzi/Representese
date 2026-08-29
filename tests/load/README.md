# Testes de carga (k6)

Simula centenas de usuários simultâneos contra um ambiente de **staging** para
achar o ponto de quebra do site, das leituras no Supabase e das edge functions.

## ⚠️ Antes de rodar — leia

- **Nunca rode contra produção sem preparo.** Alvo é sempre um deploy de
  preview/staging da Vercel + um projeto Supabase separado (não o
  `wdtftftwdqtihupbtlxk`).
- **Vercel:** teste de carga contra a plataforma exige consentimento prévio
  deles (ToS). Um preview isolado com carga controlada é o caminho de menor
  atrito; se for martelar forte, abra ticket antes.
- **Supabase:** carga alta esbarra no limite de conexões do pooler. Use o
  projeto de staging e acompanhe o painel (Database → Roles / Reports) durante
  o teste.
- **Custo:** `site.js` e `supabase-read.js` são baratos. `edge-functions.js`
  invoca funções (contam na cota de invocações). Nenhum script chama Gemini,
  Asaas, geocode pago ou webhooks.
- Rode de uma máquina com boa banda. Centenas de VUs de um Wi-Fi doméstico
  medem a sua internet, não o servidor. Considere rodar de um VPS ou usar o
  **Grafana Cloud k6** (mesmo script, `k6 cloud run`).

## Instalação

```bash
brew install k6
```

## Configuração

```bash
cp tests/load/.env.example tests/load/.env
# preencha SITE_URL, SUPABASE_URL, SUPABASE_ANON_KEY, TEST_EMAIL, TEST_PASSWORD
```

O `TEST_EMAIL` precisa ser um usuário real no Supabase de staging, de
preferência com dados semeados (clientes, pedidos, agenda) para as queries
retornarem volume realista.

## Rodar

```bash
set -a; source tests/load/.env; set +a

# 1. valida que tudo funciona (pouca carga)
PROFILE=smoke k6 run tests/load/site.js
PROFILE=smoke k6 run tests/load/supabase-read.js
PROFILE=smoke k6 run tests/load/edge-functions.js

# 2. teste de estresse (pico ~300 VUs, ~8 min cada)
PROFILE=stress k6 run tests/load/site.js
PROFILE=stress k6 run tests/load/supabase-read.js
PROFILE=stress k6 run tests/load/edge-functions.js
```

### Perfis (`PROFILE=`)

| Perfil   | Pico VUs | Sobe | Segura | Desce | Uso                         |
|----------|----------|------|--------|-------|-----------------------------|
| `smoke`  | 5        | 30s  | 1m     | 10s   | valida o script             |
| `load`   | 50       | 1m   | 5m     | 30s   | carga realista              |
| `stress` | 300      | 2m   | 5m     | 1m    | acha o ponto de quebra      |
| `spike`  | 400      | 20s  | 2m     | 20s   | pico de lançamento          |

Sobrescreva o pico com `PEAK_VUS=500`.

## Ler o resultado

No fim de cada run o k6 imprime um resumo. Olhe:

- `http_req_failed` — deve ficar **< 1%**. Subiu junto com os VUs = ponto de quebra.
- `http_req_duration` `p(95)` / `p(99)` — thresholds: p95 < 1.5s, p99 < 3s.
- `http_reqs` — throughput (req/s) que o ambiente aguentou.
- Linha `✗` = threshold estourado; o exit code do k6 fica != 0.

Para um relatório visual, exporte e abra no [k6 web dashboard](https://grafana.com/docs/k6/latest/results-output/web-dashboard/):

```bash
K6_WEB_DASHBOARD=true K6_WEB_DASHBOARD_EXPORT=tests/load/report.html \
  PROFILE=stress k6 run tests/load/supabase-read.js
```

## O que cada script faz

| Script                | Alvo                                  | Efeito colateral |
|-----------------------|---------------------------------------|------------------|
| `site.js`             | HTML + assets de `/`, `/planos`, `/login`, `/register` via Vercel/CDN | nenhum |
| `supabase-read.js`    | `GET` em user_settings, clients, orders, appointments, entitlements via PostgREST, com usuário logado | nenhum (só leitura) |
| `edge-functions.js`   | `validate-coupon` (código inválido) + `get-holidays` (10% das iterações) | nenhum |
