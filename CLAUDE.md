# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> Contexto permanente do projeto. Leia isso antes de qualquer ação.

## 📂 LEITURA OBRIGATÓRIA ANTES DE CADA SESSÃO

Antes de executar qualquer tarefa, sempre ler:
- `.agents/padroes.md` — padrões e linha de pensamento do projeto
- `.agents/skills/` — skills disponíveis para uso

---

## 🧠 O QUE É ESTE PROJETO

**Represente-Se!** é um SaaS para representantes comerciais brasileiros. Centraliza clientes, pedidos, agenda, faturamento e comunicação. Acesse em: https://www.representese.com

Dono do projeto: **Pedro Borela Manzi** (pedroborelamanzi@gmail.com)

---

## ⚡ COMANDOS DE DESENVOLVIMENTO

```bash
npm run dev          # dev server em http://localhost:3000
npm run build        # build de produção (Vite)
npm run lint         # type-check TypeScript (tsc --noEmit)
npm run test:e2e     # testes Playwright (headless)
npm run test:e2e:ui  # testes Playwright (modo UI)
```

**Variáveis de ambiente** — copiar `.env.example` para `.env.local`:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — frontend (públicas)
- `GEMINI_API_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — backend API (`api/ai.ts`, secretas)
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting (opcional local)

---

## 🏛️ ARQUITETURA

### Frontend (SPA)
Todas as páginas usam `React.lazy()` no `App.tsx`. O `Dashboard.tsx` é o layout autenticado que envolve todas as rotas `/dashboard/*` com sidebar e navbar.

### Backend API
`api/ai.ts` é um Express app deployado como Vercel Serverless Function. Recebe requisições do frontend, faz rate limiting via Upstash Redis, e chama o Gemini. CORS configurado para aceitar `representese.com`, subdomínios, `*.vercel.app` (previews) e origens Capacitor.

### Offline First
`lib/offlineCache.ts` (cache local em `localStorage`, com TTL — trocado de `sessionStorage` porque o processo do app Android é morto com frequência e zerava o cache "de 24h" a cada vez) + `lib/syncQueue.ts` (fila de sincronização, também em `localStorage`, com dead-letter após `MAX_SYNC_ATTEMPTS` falhas). Chamada ao Supabase que precisa funcionar offline deve verificar `offlineCache.isOnline()` (ou o `isOnline` do `useSync()`) primeiro — nem toda tela precisa disso: várias fazem cache-first com fallback gracioso em vez de checar antes. **Não mexer nesses arquivos sem necessidade crítica.**

### Dark Mode
Controlado pela classe `.dark` no `<html>`. Implementado via `@custom-variant` no Tailwind, efeito no `SettingsContext` e script inline no `index.html` para evitar flash.

---

## 🗄️ BANCO DE DADOS (SUPABASE)

**Projeto:** `wdtftftwdqtihupbtlxk` (região: sa-east-1)

### Tabelas principais:
- `user_settings` — configurações do usuário
  - `subscription_plan` → `"Acesso Exclusivo"` / `"Acesso Profissional"` / `"Acesso Master"` (**COM prefixo "Acesso"**)
  - `categories` → array de strings com nomes das empresas representadas
  - `plan_id` → `"exclusivo"` / `"profissional"` / `"master"` (slug)
- `clients` — clientes: `id, user_id, name, cnpj, address, lat, lng, phone, email, notes, faturamento (jsonb), status`
- `orders` — pedidos: `id, user_id, client_id, category, value, file_name, file_path, created_at`
- `ai_chats` — histórico do assistente IA: `id, user_id, role (user|assistant), content, created_at`
- `municipal_holidays` — feriados municipais

Migrations ficam em `supabase/migrations/`. RLS habilitado em todas as tabelas.

### ⚠️ ATENÇÃO CRÍTICA:
- A tabela de configurações é `user_settings`, **NÃO** `profiles`
- `subscription_plan` tem o prefixo "Acesso" — comparar sempre com `.includes()`:
  ```ts
  currentSubscriptionPlan?.toLowerCase().includes(plan.id.toLowerCase())
  ```
- Storage (`client_vault`): paths são `userId/clientId/fileName` — não alterar estrutura

---

## 🛣️ ROTAS (App.tsx)

```
/                          → LandingPitch (pública)
/login                     → Login
/register                  → Register
/planos                    → Planos
/dashboard                 → Dashboard (layout autenticado)
  /dashboard/inicio        → Agenda + Charts
  /dashboard/clientes      → CRM (lista)
  /dashboard/clientes/:id  → ClientDetails
  /dashboard/clientes/:id/editar → ClientEdit
  /dashboard/mapa          → Map (Leaflet)
  /dashboard/empresas      → Empresas & Pedidos
  /dashboard/agenda        → Agenda completa
  /dashboard/emails        → EmailClient
  /dashboard/whatsapp      → Inbox
  /dashboard/order-bump    → OrderBump
```

---

## 💳 PLANOS

| ID | Nome | Preço mensal | Limite empresas |
|---|---|---|---|
| `exclusivo` | Acesso Exclusivo | R$ 97 | 1 |
| `profissional` | Acesso Profissional | R$ 147 | 5 |
| `master` | Acesso Master | R$ 197 | Ilimitado |

---

## 🔧 PADRÕES DE CÓDIGO

- Componentes: **PascalCase**, arquivos `.tsx`
- Hooks: prefixo `use`, arquivos `.ts`
- Estilo: Tailwind utility classes — nunca CSS modules, nunca inline style
- Ícones: sempre de `lucide-react`
- Toasts: `sonner` (`toast.success()`, `toast.error()`)
- Textos de UI: usar "IA" (não "Gemini"), "resumo" (não "dossiê")

---

## 📱 VERSÃO DO APP ANDROID

**Sempre que uma mudança afetar o app** (qualquer coisa em `src/` ou `android/`),
subir os dois campos em `android/app/build.gradle` no mesmo trabalho, sem
perguntar:

```gradle
versionCode 7      // inteiro, TEM que crescer — a Play Console recusa
versionName "1.4"  // texto que o usuário vê
```

A Play Console rejeita um `.aab` cujo `versionCode` não seja maior que o do
envio anterior. Descobrir isso só na hora de subir custa um build inteiro
refeito.

Avisar no fim se o envio precisa de passos extras:
- dependência nova → `npm install` antes do `npm run build`
- plugin nativo novo → `npx cap sync android`

---

## 🚫 O QUE NÃO MEXER

- `lib/offlineCache.ts` e `lib/syncQueue.ts` — motor crítico offline
- Estrutura de paths do Storage (`client_vault`)
- Nome da tabela `user_settings`

---

## 🤖 IAs QUE TRABALHAM NESTE PROJETO

- **Antigravity** — executor de código, commita no GitHub
- **Claude Code** — planejamento, auditoria, correções diretas, validação pós-deploy

Repositório GitHub: conectado ao Vercel para deploy automático em cada push.
