# CLAUDE.md — Represente-Se!
> Contexto permanente do projeto. Leia isso antes de qualquer ação.

## 📂 LEITURA OBRIGATÓRIA ANTES DE CADA SESSÃO

Antes de executar qualquer tarefa, sempre ler:
- `.agents/padroes.md` — padrões e linha de pensamento do projeto
- `.agents/skills/` — skills disponíveis para uso

Esses arquivos são a fonte única de verdade, lidos tanto pelo Claude quanto pelo Antigravity.

---

## 🧠 O QUE É ESTE PROJETO

**Represente-Se!** é um SaaS para representantes comerciais brasileiros. Centraliza clientes, pedidos, agenda, faturamento e comunicação. Acesse em: https://www.representese.com

Dono do projeto: **Pedro Borela Manzi** (pedroborelamanzi@gmail.com)

---

## 🏗️ STACK TÉCNICA

| Camada | Tecnologia |
|---|---|
| Frontend | React 19 + Vite 6 + TypeScript |
| Estilo | Tailwind CSS v4 |
| Animações | Framer Motion 12 |
| Roteamento | React Router DOM 7 |
| Backend/DB | Supabase (PostgreSQL) |
| Auth | Supabase Auth |
| Deploy | Vercel |
| Mobile | Capacitor 8 (iOS + Android) |
| IA | Google Gemini (@google/generative-ai) |
| Ícones | Lucide React |
| Toasts | Sonner |
| Charts | Recharts |
| Mapas | Leaflet + React Leaflet |
| Cache offline | idb-keyval (IndexedDB) |
| Queries | TanStack Query v5 |

---

## 📁 ESTRUTURA DE PASTAS

```
src/
├── pages/          ← páginas principais do app
│   ├── LandingPitch.tsx    ← landing page pública
│   ├── Login.tsx
│   ├── Register.tsx
│   ├── Planos.tsx          ← página de planos/assinatura
│   ├── Dashboard.tsx       ← layout do dashboard autenticado
│   ├── Agenda.tsx          ← agenda semanal (Google Calendar)
│   ├── Map.tsx             ← mapa de clientes (Leaflet)
│   ├── CRM.tsx             ← lista de clientes
│   ├── ClientDetails.tsx   ← ficha individual do cliente
│   ├── ClientEdit.tsx      ← formulário de edição do cliente (NOVO)
│   ├── Empresas.tsx        ← empresas & pedidos
│   ├── EmailClient.tsx     ← cliente de e-mail integrado
│   ├── Inbox.tsx           ← WhatsApp inbox
│   └── ...
├── components/
│   ├── SettingsModal.tsx   ← modal de configurações de perfil
│   ├── UpgradeModal.tsx
│   ├── OnboardingModal.tsx
│   ├── plans/
│   │   └── PlanCards.tsx   ← cards de planos (Exclusivo/Profissional/Master)
│   └── ...
├── hooks/
│   └── useModalEsc.ts      ← hook reutilizável para fechar modal com ESC
├── lib/
│   ├── supabase.ts         ← cliente Supabase
│   ├── offlineCache.ts     ← motor híbrido offline V2
│   ├── syncQueue.ts        ← fila de sincronização offline
│   ├── plansData.ts        ← dados dos planos
│   ├── orderProcessor.ts   ← processamento de pedidos via IA
│   └── geminiGeocoding.ts  ← geocoding via Gemini
└── contexts/
    ├── AuthContext.tsx
    └── SettingsContext.tsx
```

---

## 🗄️ BANCO DE DADOS (SUPABASE)

**Projeto:** `wdtftftwdqtihupbtlxk` (região: sa-east-1)

### Tabelas principais:
- `auth.users` — usuários (Supabase Auth)
- `user_settings` — configurações do usuário
  - `subscription_plan` → valor: `"Acesso Exclusivo"` / `"Acesso Profissional"` / `"Acesso Master"` (**COM prefixo "Acesso"**)
  - `categories` → array de strings com nomes das empresas representadas
  - `plan_id` → `"exclusivo"` / `"profissional"` / `"master"` (slug)
- `clients` — clientes do representante
  - `id`, `user_id`, `name`, `cnpj`, `address`, `lat`, `lng`, `phone`, `email`, `notes`, `faturamento` (jsonb), `status`
- `orders` — pedidos
  - `id`, `user_id`, `client_id`, `category`, `value`, `file_name`, `file_path`, `created_at`

### ⚠️ ATENÇÃO CRÍTICA:
- A tabela de configurações é `user_settings`, **NÃO** `profiles`
- `subscription_plan` tem o prefixo "Acesso" — comparar sempre com `.includes()`:
  ```ts
  currentSubscriptionPlan?.toLowerCase().includes(plan.id.toLowerCase())
  ```

---

## 🛣️ ROTAS (App.tsx)

```
/                          → LandingPitch
/login                     → Login
/register                  → Register
/planos                    → Planos
/dashboard                 → Dashboard (autenticado)
  /dashboard/inicio        → Agenda + Charts
  /dashboard/clientes      → CRM (lista)
  /dashboard/clientes/:id  → ClientDetails
  /dashboard/clientes/:id/editar → ClientEdit ← ROTA NOVA
  /dashboard/mapa          → Map
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

Toggle Mensal/Anual disponível. Descontos: mensal = "X% OFF (LANÇAMENTO)", anual = "X% OFF NO ANUAL".

---

## 🔧 PADRÕES DE CÓDIGO

- Componentes: **PascalCase**, arquivos `.tsx`
- Hooks: prefixo `use`, arquivos `.ts`
- Lazy loading em todas as páginas via `React.lazy()` no App.tsx
- Toasts via `sonner` (`toast.success()`, `toast.error()`)
- Estilo: Tailwind utility classes, sem CSS modules
- Ícones: sempre de `lucide-react`
- Offline: usar `offlineCache.isOnline()` antes de chamadas Supabase

---

## ✅ BUGS CORRIGIDOS (histórico)

| Bug | Arquivo | Correção |
|---|---|---|
| FAQ accordion sem texto | LandingPitch.tsx | `style={{ overflow: "hidden" }}` na motion.div + `shrink-0` no ChevronDown |
| Nav links landing âncoras erradas | LandingPitch.tsx | `href="#tecnologia"`, `#planos`, `#duvidas"` |
| EDITAR CADASTRO → tela branca | App.tsx + ClientEdit.tsx | Rota `clientes/:id/editar` adicionada, ClientEdit.tsx criado |
| Cards resumo não filtram por empresa | Empresas.tsx | `filteredOrders` declarado ANTES de `totalGeral` (TDZ fix) |
| Botões X modais desalinhados + ESC | SettingsModal.tsx | `stopPropagation`, `useModalEsc`, backdrop `onClick` |
| PLANO ATUAL badge errado | PlanCards.tsx | Comparação com `.includes()` |
| Configurações "um passo atrás" | SettingsModal.tsx | `AnimatePresence` com `key={activeTab}` único |
| Register carrega scrollado | Register.tsx | `useEffect` com `scrollTo smooth` em cada `step` |
| Telefone "Disponível no CNPJ" | ClientDetails.tsx | `client.phone \|\| "Não informado"` |
| Toast dossiê ausente | ClientDetails.tsx | `toast.success("Observações salvas!")` |

---

## 🚫 O QUE NÃO MEXER

- Lógica de `offlineCache` e `syncQueue` — motor crítico, mexer quebra o app offline
- Rotas do Supabase Storage (`client_vault`) — estrutura de paths é `userId/clientId/fileName`
- O nome da tabela `user_settings` — não renomear para `profiles`

---

## 🤖 IAs QUE TRABALHAM NESTE PROJETO

- **Antigravity** — agente de código, faz implementações, commita no GitHub
- **Claude Cowork** — auditoria, planejamento, correções diretas, validação pós-deploy

Repositório GitHub: conectado ao Vercel para deploy automático em cada push.
