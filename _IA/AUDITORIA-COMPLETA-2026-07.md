# 🔍 AUDITORIA COMPLETA — REPRESENTE-SE!
> Data: 02/07/2026 · Auditor: Claude (Fable 5) · Escopo: Frontend, Backend, Banco, Segurança, Performance, UX/UI, Testes, DevOps

---

## 📊 RESUMO EXECUTIVO

| Área | Nota | Situação |
|---|---|---|
| Backend / Pagamentos | 🔴 4/10 | **2 bugs críticos no fluxo de cobrança** |
| Segurança | 🟠 5/10 | Funções RPC expostas ao público, enumeração de dados |
| Frontend / Arquitetura | 🟡 6/10 | Boa base, mas componentes gigantes e TS frouxo |
| Banco de Dados | 🟡 6/10 | RLS ativo em tudo ✅, mas faltam índices |
| Performance | 🟡 7/10 | Bundle ok, chunk PDF pesado, CSS externo bloqueado |
| Design System / UI | 🟡 6/10 | Visual consistente (emerald/dark), sem tokens semânticos |
| Acessibilidade | 🔴 3/10 | **Zero atributos ARIA**, 2 labels associados no app inteiro |
| Testes | 🔴 3/10 | Só 6 testes E2E, zero testes unitários |
| DevOps / CI | 🟡 6/10 | CI funciona, mas deleta o lockfile (build não reprodutível) |

**Pontos fortes já existentes:** RLS habilitado em 100% das tabelas · headers de segurança fortes no Vercel (CSP, HSTS, X-Frame-Options) · lazy loading com retry de chunk (padrão avançado) · telemetria própria de erros (audit_logs) · dark mode sistemático · rate limiting na API de IA · validação JWT no checkout · prevenção de flash de tema.

---

## 🔴 FASE 1 — CRÍTICO (corrigir esta semana)

### 1.1 Cartão de crédito NUNCA é cobrado de verdade
**Severidade: CRÍTICA · Impacto: Receita · Esforço: MÉDIO**
- Local: `supabase/functions/process-checkout/index.ts:43` + `src/pages/Checkout.tsx:285`
- O frontend envia `creditCard` (número, CCV, validade) para a função, mas a função **desestrutura a variável e nunca a usa**. A assinatura é criada no Asaas com `billingType: CREDIT_CARD` **sem token de cartão** — a cobrança nunca acontece automaticamente e o usuário vê "Pagamento processado!" sem ter pago.
- Correção: enviar `creditCard` + `creditCardHolderInfo` no corpo da criação da assinatura/pagamento do Asaas (ou usar tokenização do Asaas), e só retornar sucesso após confirmação do status.

### 1.2 Dados brutos de cartão trafegando pelo backend (PCI-DSS)
**Severidade: CRÍTICA · Impacto: Segurança/Legal · Esforço: MÉDIO**
- Número do cartão + CCV são enviados em JSON puro para a edge function. Mesmo quando o item 1.1 for corrigido, o ideal é **tokenizar no cliente** (Asaas suporta) para o cartão nunca tocar seu servidor. No mínimo: garantir que nenhum log (console/audit_logs) capture o corpo dessas requisições.

### 1.3 RPCs `SECURITY DEFINER` executáveis por qualquer visitante anônimo
**Severidade: CRÍTICA · Impacto: Segurança/Fraude · Esforço: PEQUENO (1 migração SQL)**
- Advisors do Supabase confirmam que o role `anon` pode executar via REST:
  - `increment_coupon(c_code)` → **qualquer pessoa pode estourar o `times_redeemed` do REPRESENTE95 e matar o cupom** (ou fraudar métricas).
  - `get_user_id_by_email(email)` → enumeração de usuários cadastrados.
  - `check_cpf_phone_exists(cpf, phone)` → enumeração de CPF/WhatsApp (problema LGPD).
- Correção (migração):
```sql
REVOKE EXECUTE ON FUNCTION public.increment_coupon(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_cpf_phone_exists(text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_billing_identity() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_entitlement() FROM anon, authenticated;
```
(As edge functions usam service_role, então continuam funcionando.)

### 1.4 Ação `check-uniqueness` sem autenticação
**Severidade: ALTA · Impacto: LGPD/Enumeração · Esforço: PEQUENO**
- Local: `process-checkout/index.ts:46` — todas as ações exigem JWT **exceto** `check-uniqueness`, que aceita `userId: 'temp'` e responde se um CPF/telefone já está cadastrado. Sem rate limiting, permite varredura de CPFs.
- Correção: adicionar rate limiting por IP (Upstash já é dependência do projeto) e resposta genérica ("dados indisponíveis") após N tentativas.

### 1.5 Webhook Asaas não trata estorno/chargeback
**Severidade: ALTA · Impacto: Receita · Esforço: PEQUENO**
- Local: `handle-asaas-webhook/index.ts:63-68` — trata `PAYMENT_OVERDUE`, `DELETED`, `CONFIRMED`, mas **`PAYMENT_REFUNDED` e `PAYMENT_CHARGEBACK_REQUESTED` caem no default `active`** → cliente estornado continua com acesso ativo.
- Também: `normalizePlanId` com descrição inesperada devolve `profissional` por padrão — evento de outro produto poderia dar upgrade indevido de plano.
- Correção: mapear refund/chargeback → `inactive`/`past_due`; se a descrição não bater com nenhum plano, **não alterar** `plan_id`.

---

## 🟠 FASE 2 — ALTA PRIORIDADE (próximas 2–3 semanas)

### 2.1 Cupom é "queimado" antes do pagamento ser confirmado
- `process-checkout/index.ts:160` incrementa `times_redeemed` na criação do checkout, mesmo que o PIX nunca seja pago. Mover o incremento para o webhook de `PAYMENT_CONFIRMED` (guardar o cupom usado na assinatura/`externalReference`).

### 2.2 Sem idempotência no checkout e no webhook
- Duplo clique / retry de rede pode criar 2 assinaturas. Webhooks do Asaas podem chegar duplicados.
- Correção: tabela `payment_events` com `event_id` único (upsert ignora duplicado) + para checkout, um `idempotency_key` gerado no frontend.

### 2.3 Respostas do Asaas não são validadas
- `process-checkout` não verifica `newCustomer.errors` nem `subData.errors`. Se o Asaas recusar (CPF inválido etc.), o fluxo segue com `undefined` e o erro que chega ao usuário é ininteligível. Verificar `resp.ok` + campo `errors` em cada chamada e devolver mensagem clara.

### 2.4 Índices faltando no banco
- `clients` (459 linhas, consultada em toda tela) **não tem índice em `user_id`**; idem `appointments`, `audit_logs`, `ai_chats` ok, `client_location_audit`, `daily_notes` (tem unique composto, ok). Com RLS filtrando por `user_id`, isso vira sequential scan.
```sql
CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);
CREATE INDEX IF NOT EXISTS idx_appointments_user_id ON public.appointments(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs(user_id, created_at DESC);
```
- `audit_logs` (2.271 linhas e crescendo sem limpeza): criar rotina de retenção (ex.: apagar > 90 dias) via pg_cron.

### 2.5 TypeScript sem modo estrito
- `tsconfig.json` **não tem `"strict": true`** — 131 usos de `any` em 39 arquivos. O "lint" do projeto é só `tsc --noEmit`, sem ESLint.
- Plano gradual: ligar `strictNullChecks` primeiro, corrigir erros, depois `strict` completo. Adicionar ESLint + `typescript-eslint` no CI.

### 2.6 Acessibilidade quase inexistente
- **0 atributos `aria-*` no app inteiro**, 2 `htmlFor`, sem foco gerenciado em modais, `Login.tsx` sem `autoComplete`.
- Mínimo viável (1 dia de trabalho): `aria-label` em todos os botões só-ícone (Layout, modais, mapa), `htmlFor`+`id` em todos os inputs, `role="dialog"` + `aria-modal` nos modais, focus trap no SettingsModal, `autoComplete="email"/"current-password"` no Login.
- Meta: rodar `axe-core` no Playwright (1 teste automatizado de a11y por página).

### 2.7 CI deleta o package-lock.json
- `.github/workflows/test.yml` roda `rm -rf node_modules package-lock.json && npm install` — cada build usa versões potencialmente diferentes (build não reprodutível, risco de supply chain). Trocar por `npm ci`. Adicionar `npm audit --audit-level=high` como gate.

### 2.8 Link externo do Leaflet redundante e provavelmente bloqueado
- `index.html:27` carrega `leaflet.css` do unpkg.com, mas (a) o CSS **já é importado do bundle** em `src/components/Map.tsx:3`, e (b) o CSP do `vercel.json` não inclui unpkg.com em `style-src` — o request é bloqueado/desperdiçado. Remover as 3 linhas do index.html (preload + stylesheet).

---

## 🟡 FASE 3 — MÉDIA PRIORIDADE (mês 2)

### 3.1 Componentes gigantes
| Arquivo | Linhas | Ação sugerida |
|---|---|---|
| `AssistenteIA.tsx` | 1.702 | Extrair: ChatMessage, ChatInput, ActionCards, hooks de streaming |
| `LandingPitch.tsx` | 1.582 | Extrair seções (Hero, Features, FAQ, Pricing) |
| `EmailClient.tsx` | 1.072 | Extrair lista/leitura/composer |
| `Map.tsx` (page) | 1.064 | Extrair painel lateral, filtros, popup |
- Regra prática: máximo ~300 linhas por componente. Facilita teste, revisão e evita re-render em bloco.

### 3.2 Design tokens semânticos (Tailwind v4 `@theme`)
- Hoje só existe 1 token custom (`--color-zinc-850`). O emerald está hardcoded em centenas de classes.
- Criar em `index.css`:
```css
@theme {
  --color-brand-50: ...;  /* escala emerald atual */
  --color-brand-500: #10b981;
  --color-brand-600: #059669;
  --color-danger-500: #ef4444;
  --color-warning-500: #f59e0b;
  --color-surface: #f5f5f7;
}
```
- Depois, migrar gradualmente `emerald-*` → `brand-*`. Permite rebrand futuro em 1 arquivo e consistência entre telas.

### 3.3 Biblioteca de componentes base
- Criar `src/components/ui/`: `Button` (primary/secondary/danger/ghost + loading), `Input` (com label, erro, hint), `Modal` (backdrop + ESC + focus trap via useModalEsc), `EmptyState`, `Skeleton`, `Badge`.
- Hoje cada página reimplementa botões/inputs — é a maior fonte de inconsistência visual detectada (raios de borda, tamanhos de fonte 12/13px arbitrários, paddings variados).

### 3.4 Fila offline sem resiliência
- `syncQueue.ts`: sem número máximo de tentativas, sem dead-letter (operação com erro permanente fica na fila para sempre), sem resolução de conflito (last-write-wins silencioso), fila em `localStorage` (limite ~5MB) em vez de IndexedDB.
- ⚠️ CLAUDE.md marca como "não mexer" — tratar como projeto separado com testes antes (criar testes unitários da fila ANTES de refatorar).

### 3.5 Contexts sem memoização
- Nenhum dos 4 contexts usa `useMemo`/`useCallback` no value — todo consumidor re-renderiza a cada render do provider. Envolver os `value={{...}}` em `useMemo`.

### 3.6 Testes unitários (hoje: zero)
- Adicionar Vitest (integração nativa com Vite): começar por `syncQueue`, `offlineCache`, validadores de CPF/telefone, `plansData`, `purchaseCycle`. Meta inicial: 40% de cobertura na `lib/`.
- E2E: adicionar `data-testid` nos elementos críticos (seletores atuais por texto quebram com mudança de copy).

### 3.7 Chunk de PDF (1,3 MB / 378 KB gzip)
- Confirmar que `pdfjs-dist` só carrega sob demanda (import dinâmico no orderProcessor). Considerar `pdfjs-dist/legacy` ou worker via CDN, e avaliar se a extração pode ir para o backend.

### 3.8 Bundle principal (704 KB / 213 KB gzip)
- Adicionar `rollup-options.manualChunks` para separar `recharts`, `framer-motion` e `@supabase/supabase-js` do chunk core; páginas que não usam gráficos não deveriam baixar recharts.

### 3.9 Proteção de senha vazada desligada (Supabase Auth)
- Ativar "Leaked password protection" no painel Auth (checa HaveIBeenPwned). Custo zero.

### 3.10 CSP com `unsafe-eval` e `unsafe-inline`
- `vercel.json` permite `unsafe-eval` em script-src (necessário para pdf.js? verificar). Se possível, remover e usar nonce para inline. Reduz muito a superfície XSS.

---

## 🟢 FASE 4 — POLIMENTO CONTÍNUO

1. **UX de formulários**: indicador de força de senha no Checkout (já valida requisitos — mostrar barra), máscara ao vivo de CPF/CNPJ e telefone em todos os forms, mensagens de erro embaixo do campo (não só toast).
2. **Estados vazios**: telas de CRM/Pedidos/Agenda sem dados devem mostrar CTA de primeiro uso ("Cadastre seu primeiro cliente →") em vez de área em branco.
3. **`package.json` com identidade**: nome `react-example` versão `0.0.0` → `representese` + versionamento semântico; mover `husky`, `@types/*` para devDependencies; `express`/`pg`/`cors` só são usados na pasta `api/` (avaliar workspace separado).
4. **npm audit**: 5 vulnerabilidades (2 low, 3 moderate) — rodar `npm audit fix` e agendar Dependabot.
5. **Monitoramento**: a telemetria própria (audit_logs) não alerta ninguém. Criar um cron (pg_cron ou GitHub Action) que envia e-mail/WhatsApp se `error_occurred` > N na última hora. Alternativa: Sentry free tier.
6. **Skip link + landmarks**: adicionar `<main>`, `<nav>` semânticos no Layout e link "pular para conteúdo".
7. **SEO da landing**: adicionar OpenGraph/Twitter tags no `index.html` (hoje só tem description) — impacta compartilhamento em WhatsApp, principal canal do público-alvo.
8. **Retenção LGPD**: implementar exportação de dados do usuário e exclusão de conta (direito ao esquecimento) — hoje não existe fluxo.
9. **API `/api/ai`**: o CORS aceita **qualquer** `*.vercel.app` — restringir aos previews do próprio projeto (checar `VERCEL_URL`) já que exige auth, é defesa em profundidade.
10. **Playwright**: cobrir fluxos de: aplicar cupom, upgrade de plano, CRUD de cliente completo, agenda. Hoje: 6 testes (3 desktop, 3 mobile).

---

## 🗺️ ROADMAP RESUMIDO

| Fase | Prazo | Itens | Impacto esperado |
|---|---|---|---|
| **1 — Crítico** | Semana 1 | Cartão de crédito real (1.1/1.2), REVOKE das RPCs (1.3), rate limit check-uniqueness (1.4), webhook refund (1.5) | Receita funcionando + fraude bloqueada |
| **2 — Alta** | Semanas 2–3 | Cupom pós-pagamento, idempotência, validação Asaas, índices, TS strict gradual, a11y mínima, npm ci, leaflet duplicado | Robustez + performance + inclusão |
| **3 — Média** | Mês 2 | Quebrar componentes gigantes, design tokens, ui/ library, Vitest, manualChunks, senha vazada, CSP | Manutenibilidade + escala |
| **4 — Contínuo** | Sempre | UX polish, monitoramento com alerta, LGPD, SEO, cobertura E2E | Nível profissional |

---

## ⚡ QUICK WINS (menos de 1 hora cada, impacto imediato)

1. Migração SQL com os `REVOKE` das RPCs (item 1.3) — **fecha a maior brecha em 5 minutos**
2. Tratar `PAYMENT_REFUNDED`/`CHARGEBACK` no webhook (item 1.5)
3. `CREATE INDEX` em `clients.user_id` e `appointments.user_id` (item 2.4)
4. Remover link unpkg do leaflet no `index.html` (item 2.8)
5. Trocar `npm install` por `npm ci` no CI (item 2.7)
6. Ativar Leaked Password Protection no painel Supabase (item 3.9)
7. `autoComplete` no Login + `aria-label` nos botões de ícone do Layout
8. Renomear `package.json` para `representese` v1.0.0
