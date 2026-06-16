# Auditoria Representese + Prompts para o Antigravity

**Data:** 15/06/2026 · **Avaliado por dentro:** código-fonte completo (React 19 + Vite + Capacitor + Supabase + Asaas) e site em produção `representese.com`.

> Como funciona este documento: cada problema vem com **(1) o que é / impacto** e **(2) um PROMPT pronto** para você colar no Antigravity. Os prompts são técnicos de propósito — você não precisa entender, só colar e mandar rodar. Estão em blocos de código para copiar fácil. Faça **um de cada vez**, de cima para baixo (estão em ordem de prioridade).

---

## Nota geral: 7.4 / 10

| Eixo | Nota | Comentário |
|---|---|---|
| Produto / proposta de valor | 8.5 | Foco claro no representante comercial, features reais (CRM, mapa, agenda, pedidos, IA, inbox). |
| Design / UX visual | 8.0 | Moderno, consistente, dark mode, animações. Perde por contraste fraco no topo. |
| Arquitetura técnica | 8.0 | RLS ativo, chave de IA no servidor, CSP, lazy-load, cache offline, webhook com token. Base sólida. |
| Segurança de negócio (monetização) | 4.0 | **Furos graves:** usuário pode se auto-promover de plano e burlar pagamento. Cupons no front. |
| Conversão (landing) | 6.5 | CTA principal quase invisível, headings lavados, prova social genérica. |
| Higiene de repositório | 5.5 | README boilerplate, nome "react-example", scripts soltos na raiz. |

**Resumo:** o produto e a engenharia estão num nível bom. O que puxa a nota para baixo é um conjunto de **falhas de monetização/autorização** que permitem usar o sistema de graça e no plano máximo — isso tem que ser a prioridade #1. Depois, ajustes de conversão na landing e limpeza.

### O que já está muito bom (manter)
- **RLS por usuário** ativo em `clients`, `orders`, `appointments`, `profiles`, `user_settings`.
- **Chave Gemini fica no servidor** (`api/ai.ts` + edge functions), nunca exposta no front.
- **CSP e headers de segurança** configurados no `vercel.json`.
- **Lazy loading de rotas**, cache offline (`idb-keyval`), persistência do React Query, fila de sync.
- **Webhook Asaas** valida `asaas-access-token` e usa `externalReference` (O(1)) como caminho principal.

---

## 🔴 CRÍTICO 1 — Usuário consegue se auto-promover de plano e nunca pagar

**O que é:** os campos que definem o que o cliente pode usar — `plan_id` e `subscription_status` — moram na tabela `user_settings`, que tem política RLS `FOR ALL ... USING (auth.uid() = user_id)`. Isso dá ao próprio usuário **permissão de escrita** sobre esses campos. Pelo console do navegador, qualquer cliente pode rodar um `supabase.from('user_settings').update({ plan_id: 'master', subscription_status: 'active' })` e virar Master vitalício. Some-se a isso que o default de `subscription_status` é `'active'` (em `SettingsContext.tsx`) e que `/register` cria a conta direto via `signUp` sem passar pelo pagamento — ou seja, **quem só se cadastra já entra com acesso total e nunca expira.**

**Impacto:** perda de receita direta. Todo o gating de plano (`Empresas.tsx`, `OrderBump.tsx`) é client-side e contornável.

**Correção:** mover os campos de entitlement para colunas **somente-leitura para o usuário** (escrita apenas via `service_role`, ou seja, só o webhook). RLS de SELECT para o dono, sem UPDATE nesses campos. Validar entitlement no servidor.

```text
CONTEXTO: Projeto Representese. Stack: React 19 + Vite + Supabase (Postgres + Auth + Edge Functions Deno) + Asaas. Os direitos de acesso do usuário (plan_id e subscription_status) hoje ficam na tabela public.user_settings, que tem RLS "FOR ALL" permitindo o próprio usuário escrever na sua linha. Isso permite auto-promoção de plano e burla de assinatura.

TAREFA: Tornar plan_id e subscription_status à prova de adulteração pelo cliente, sem quebrar a leitura no front.

PASSO 1 — Migração SQL (criar novo arquivo em supabase/migrations/ com timestamp atual):
- Criar tabela public.user_entitlements:
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id text NOT NULL DEFAULT 'none',
  subscription_status text NOT NULL DEFAULT 'inactive',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now().
- Habilitar RLS. Criar SOMENTE política de SELECT: "owner can read entitlements" USING (auth.uid() = user_id). NÃO criar política de INSERT/UPDATE/DELETE (assim só service_role escreve).
- Backfill: INSERT INTO user_entitlements (user_id, plan_id, subscription_status) SELECT user_id, COALESCE(plan_id,'none'), COALESCE(subscription_status,'inactive') FROM user_settings ON CONFLICT DO NOTHING.
- Trigger: ao inserir em auth.users, criar linha em user_entitlements com plan_id='none', subscription_status='trialing', trial_ends_at = now() + interval '7 days'. (Usar função SECURITY DEFINER + trigger on auth.users, padrão Supabase handle_new_user.)
- Remover (ou deixar de usar) as colunas plan_id e subscription_status de user_settings — manter apenas configs não-sensíveis (tema, dias de alerta, categorias, onboarding, etc.). Se preferir não dropar agora, apenas pare de ler/escrever esses campos no app.

PASSO 2 — Edge functions (escrita via service_role):
- Em supabase/functions/handle-asaas-webhook/index.ts: trocar todos os updates de user_settings que mexem em subscription_status/plan_id/cancel_at_period_end para gravar em user_entitlements (upsert por user_id). Manter o resto da lógica de eventos (PAYMENT_CONFIRMED/RECEIVED -> active, PAYMENT_OVERDUE -> past_due, PAYMENT_DELETED -> inactive, SUBSCRIPTION_CANCELED -> cancel_at_period_end=true).

PASSO 3 — Front-end:
- Em src/contexts/SettingsContext.tsx: ler subscription_status, plan_id, cancel_at_period_end de user_entitlements (query separada por user_id) em vez de user_settings. Mudar o default de subscription_status de 'active' para 'trialing' e tratar 'trialing' com checagem de trial_ends_at.
- Em src/components/SubscriptionGuard.tsx: bloquear quando status for 'inactive' OU 'past_due' OU (status 'trialing' E trial_ends_at < agora). NÃO confiar em 'active' como default.

PASSO 4 — Gating real de plano:
- Os limites por plano (ex.: nº de empresas em Empresas.tsx, OrderBump.tsx) hoje são só visuais. Adicionar verificação no servidor: nas edge functions/policies que criam empresas/recursos, validar o plano lendo user_entitlements (não confiar no valor vindo do cliente).

NÃO FAÇA: não exponha service_role no front; não crie política de UPDATE para o usuário em user_entitlements. Gere a migração, atualize as funções e o front, e me diga quais arquivos mudaram.
```

---

## 🔴 CRÍTICO 2 — Cupons hardcoded no front e divergência com o servidor

**O que é:** em `src/pages/Checkout.tsx` e `src/pages/OrderBump.tsx` os cupons estão escritos no código do navegador: `GRATIS100` = 100%, `REPRESENTE95` = 95%, `TESTE` = 50%. Qualquer um lê isso no bundle. Pior: o servidor (`supabase/functions/process-checkout/index.ts`) **só reconhece `REPRESENTE95` e `TESTE`** e **ignora `GRATIS100`** — então o cliente vê "R$ 0,00", mas o servidor calcula o preço cheio e pode gerar cobrança divergente do que foi mostrado.

**Impacto:** descontos descobríveis/abusáveis, e inconsistência preço-mostrado-vs-preço-cobrado (risco jurídico/contábil).

**Correção:** cupons numa tabela no banco, validados **só no servidor**; o front apenas pergunta ao servidor o valor do desconto. Front e servidor passam a ler a mesma fonte.

```text
CONTEXTO: Representese (Supabase + Asaas). Cupons hoje estão hardcoded no front (src/pages/Checkout.tsx e src/pages/OrderBump.tsx: GRATIS100=100%, REPRESENTE95=95%, TESTE=50%) e o servidor supabase/functions/process-checkout/index.ts só trata REPRESENTE95 e TESTE, ignorando GRATIS100. Isso gera divergência entre preço exibido e preço cobrado.

TAREFA: Centralizar cupons no banco, validados no servidor; remover qualquer valor de cupom do código do front.

PASSO 1 — Migração SQL (novo arquivo em supabase/migrations/):
- Tabela public.coupons: code text PRIMARY KEY (uppercase), discount_percent int NOT NULL CHECK (0-100), active boolean DEFAULT true, max_redemptions int, times_redeemed int DEFAULT 0, expires_at timestamptz, applies_to_plans text[] NULL.
- RLS: habilitar, SEM política para usuários comuns (só service_role lê/escreve). 
- Seed: inserir REPRESENTE95 (95), TESTE (50), GRATIS100 (100) para preservar o comportamento atual.

PASSO 2 — Edge function de validação:
- Criar supabase/functions/validate-coupon/index.ts: recebe { code, planId, billingCycle }, normaliza para uppercase, busca em coupons via service_role, checa active/expires_at/max_redemptions/applies_to_plans, e retorna { valid: boolean, discountPercent: number, message }. CORS igual às outras funções.

PASSO 3 — process-checkout/index.ts:
- Remover o if/else hardcoded de cupom. Em vez disso, revalidar o cupom recebido contra a tabela coupons (service_role) e calcular couponDiscount = baseValue * discountPercent/100. Tratar 100% corretamente: se o preço final <= 0, NÃO chamar a API de cobrança do Asaas; em vez disso marcar entitlement como active (ou trialing conforme regra) e retornar { success: true, free: true }. Incrementar times_redeemed.

PASSO 4 — Front (Checkout.tsx e OrderBump.tsx):
- Remover os literais de cupom. handleApplyCoupon passa a chamar supabase.functions.invoke('validate-coupon', ...) e usar o discountPercent retornado para exibir o desconto. Nunca decidir o desconto no cliente.
- Quando o retorno do checkout vier { free: true }, redirecionar direto para /dashboard (ou /login) sem ir para invoiceUrl.

ENTREGUE: migração + nova função + edits nas 2 páginas e no process-checkout, e a lista de arquivos alterados.
```

---

## 🔴 CRÍTICO 3 — Rota de IA quebrada (`api/ai.ts` chama `rateLimit` não importado)

**O que é:** `api/ai.ts` importa `Ratelimit`/`Redis` do `@upstash/ratelimit` mas **não os usa**; em vez disso chama `rateLimit({ windowMs, max })` (estilo `express-rate-limit`), que **não está importado** nesse arquivo. Isso é um `ReferenceError` no carregamento do módulo — a rota `/api/ai` (usada pelo `geminiProxy.ts`) provavelmente está caindo com 500. Ou seja, as features de IA (geocoding, lançamento de pedido via IA, categorização de e-mail) podem estar fora do ar.

**Impacto:** funcionalidade premium (IA/Gemini, o destaque do plano Master) potencialmente inoperante em produção.

```text
CONTEXTO: Representese. Arquivo api/ai.ts (Express server usado como /api/ai no Vercel). Ele importa Ratelimit e Redis de @upstash/ratelimit, mas NÃO os usa, e chama rateLimit({ windowMs: 60000, max: 10 }) que não está importado -> ReferenceError no boot, derrubando a rota /api/ai (consumida por src/lib/geminiProxy.ts).

TAREFA: Corrigir o rate limiting de api/ai.ts de forma robusta e por usuário.

OPÇÃO A (preferida, já que @upstash/ratelimit + @upstash/redis estão nas deps): implementar rate limit com Upstash.
- Instanciar: const redis = Redis.fromEnv(); const ratelimit = new Ratelimit({ redis, limiter: Ratelimit.slidingWindow(10, '60 s') });
- No middleware de auth (depois de validar o token Supabase), extrair o user id do retorno de /auth/v1/user e chamar await ratelimit.limit(`ai:${userId}`). Se !success, responder 429 { error: 'Rate limit exceeded' }.
- Exigir env UPSTASH_REDIS_REST_URL e UPSTASH_REDIS_REST_TOKEN; se ausentes, logar warning e seguir sem bloquear (fail-open) para não derrubar a rota.
- Remover a chamada a rateLimit(...) atual.

OPÇÃO B (fallback simples): trocar para express-rate-limit -> adicionar import rateLimit from 'express-rate-limit' nas deps e no arquivo, e usar keyGenerator pelo user id.

Implemente a OPÇÃO A. Garanta que o módulo não tenha mais nenhuma referência indefinida e que a rota /api/ai responda 200 num request autenticado válido. Liste as mudanças e quais env vars precisam existir no Vercel.
```

---

## 🟠 ALTO 4 — Topo da landing com contraste baixíssimo (CTA quase invisível)

**O que é:** no carregamento da home, o headline "Domine suas vendas com inteligência" e, principalmente, o botão **"TESTE GRÁTIS POR 7 DIAS"** aparecem em verde-claro/cinza lavado sobre fundo claro — quase ilegíveis. O mesmo padrão se repete nos headings de seção ("CONTROLE TOTAL DA SUA COMUNICAÇÃO"). Provavelmente são animações de reveal cujo estado inicial é baixíssimo contraste, ou cores com opacidade alta demais.

**Impacto:** o CTA primário é o elemento que mais converte e está praticamente sumindo. Acessibilidade (WCAG AA) reprovada no contraste.

```text
CONTEXTO: Representese, landing em src/pages/LandingPitch.tsx (React + Tailwind + framer-motion). No primeiro paint, o headline do hero e o botão principal "TESTE GRÁTIS POR 7 DIAS" ficam com contraste muito baixo (verde claro/cinza sobre fundo claro), quase invisíveis. Headings de seção têm o mesmo problema.

TAREFA: Garantir contraste AA e CTA primário sempre legível.

1) Botão CTA primário ("TESTE GRÁTIS POR 7 DIAS"): fundo sólido emerald-600 (#059669) com texto branco, sombra suave; hover emerald-700. Nunca depender de opacidade/gradiente claro para o estado base. Garantir contraste >= 4.5:1.
2) Headline do hero e headings de seção: cor base slate-900 (dark: white). Se houver animação de entrada (framer-motion), o estado final (animate) deve ser opacity:1 e cor cheia; e adicionar fallback para usuários com prefers-reduced-motion (mostrar já no estado final). Se o efeito atual usa text com baixa opacity como "estilo", trocar por peso/escala, não por contraste.
3) Auditar qualquer texto com classes tipo text-slate-300/400 usado como conteúdo (não-placeholder) sobre fundo claro e subir para no mínimo slate-600.
4) Não alterar o layout/estrutura, só cor/contraste/estado inicial de animação.

Edite src/pages/LandingPitch.tsx e quaisquer componentes de seção envolvidos. Liste os blocos alterados.
```

---

## 🟠 ALTO 5 — Anti-duplicidade bloqueia nomes iguais e varre todos os usuários

**O que é:** em `process-checkout/index.ts`, a verificação de conta duplicada faz `supabase.auth.admin.listUsers()` e **itera todos os usuários** comparando e-mail, CPF, telefone **e nome completo**. Dois problemas: (a) bloquear por **nome completo** impede que duas pessoas reais com o mesmo nome ("João Silva") se cadastrem; (b) `listUsers()` é paginado (padrão ~50) — então a checagem **silenciosamente ignora** quem está fora da primeira página, e ao mesmo tempo não escala (carrega todos a cada blur de campo).

**Impacto:** rejeição de clientes legítimos + checagem furada + custo/latência crescentes.

```text
CONTEXTO: Representese. supabase/functions/process-checkout/index.ts faz a verificação de duplicidade de conta com supabase.auth.admin.listUsers() iterando TODOS os usuários e comparando email, cpf, telefone e nome completo. Problemas: (1) bloquear por nome completo barra homônimos legítimos; (2) listUsers() é paginado, então a checagem ignora usuários além da 1ª página e não escala.

TAREFA: Reescrever a verificação de duplicidade para ser correta, rápida e sem falso-positivo de nome.

1) REMOVER completamente a comparação por nome completo (não bloquear por nome).
2) Trocar a varredura por listUsers() por consultas indexadas:
   - Para e-mail: usar a checagem nativa do Auth (signUp já falha em e-mail repetido) e/ou uma query direta. Não iterar todos os usuários.
   - Para CPF/telefone: NÃO guardar isso só em user_metadata. Criar/garantir uma tabela public.billing_identities (user_id, cpf_cnpj_normalized text UNIQUE, phone_normalized text UNIQUE) populada pelo fluxo de checkout, e checar duplicidade com SELECT por índice único (service_role). Normalizar removendo não-dígitos antes de comparar.
3) Aplicar a mesma correção no handle-asaas-webhook/index.ts, que usa listUsers().find(u => u.email === ...) — trocar por busca direta por e-mail (ou por externalReference, já priorizado) para não depender da 1ª página.
4) Mensagens de erro permanecem amigáveis e específicas por campo (email/cpf/telefone), só que sem o caso "nome".

Gere a migração da tabela billing_identities (com RLS sem acesso de usuário comum), atualize as duas edge functions e liste os arquivos.
```

---

## 🟡 MÉDIO 6 — Higiene do repositório (imagem profissional do projeto)

**O que é:** `README.md` ainda é o boilerplate do Google AI Studio ("Run and deploy your AI Studio app"), `package.json` tem `"name": "react-example"`, e há scripts de uso único soltos na raiz (`fix_ui_2.cjs`, `fix_landing_perf.cjs`, `fix_landing_perf2.cjs`, `convert.cjs`, `update_code.cjs`) e um `db_schema.sql` vazio.

**Impacto:** baixo no runtime, mas passa impressão de projeto inacabado e dificulta onboarding/manutenção.

```text
CONTEXTO: Representese. Higiene de repositório. Itens: README.md é boilerplate do AI Studio; package.json name é "react-example"; scripts soltos na raiz (fix_ui_2.cjs, fix_landing_perf.cjs, fix_landing_perf2.cjs, convert.cjs, update_code.cjs); db_schema.sql está vazio.

TAREFA (somente limpeza, sem tocar em lógica de runtime):
1) Reescrever README.md com: nome Representese, descrição (plataforma para representantes comerciais: CRM, mapa territorial, agenda, pedidos, inbox com IA), stack (React 19, Vite, Tailwind, Capacitor iOS/Android, Supabase, Asaas), como rodar (npm install, variáveis .env necessárias listadas a partir de .env.example), scripts (dev/build/test:e2e) e estrutura de pastas (src/pages, src/components, supabase/functions, api).
2) Trocar package.json "name" para "representese".
3) Mover os scripts .cjs de uso único da raiz para uma pasta scripts/legacy/ (ou removê-los se confirmadamente sem uso) e remover db_schema.sql se vazio.
4) Não alterar dependências nem código de src/.

Aplique e liste o que mudou.
```

---

## 🟡 MÉDIO 7 — Melhorias de conversão na landing (depois do contraste)

**O que é:** prova social genérica ("mais de 2.000", "+150%", depoimento "Ricardo Moreira" sem rosto/empresa) e FAQ presente mas o vídeo explicativo ("VER VÍDEO EXPLICATIVO") precisa de destino real. São alavancas de conversão padrão.

**Impacto:** médio — afeta taxa de cadastro do tráfego frio.

```text
CONTEXTO: Representese, landing src/pages/LandingPitch.tsx. Melhorar credibilidade/conversão sem prometer números não comprovados.

TAREFA:
1) Substituir métricas não verificáveis ("mais de 2.000", "+150%") por afirmações honestas e específicas OU adicionar um disclaimer/nota de rodapé. Se forem reais, manter; se forem aspiracionais, suavizar a copy.
2) Depoimento: estruturar como componente reutilizável que aceita { nome, cargo, empresa, foto, texto } e suportar 2-3 depoimentos em carrossel. Deixar placeholders claros para o Pedro preencher com clientes reais.
3) Botão "VER VÍDEO EXPLICATIVO": abrir um modal com player (YouTube/Vimeo) controlado por estado; se ainda não houver vídeo, esconder o botão via flag em vez de levar a lugar nenhum.
4) Adicionar uma faixa de "como funciona em 3 passos" (cadastro -> importa clientes -> organiza/vende) acima do CTA final, reaproveitando ícones lucide-react já usados.
Manter o design system atual (Tailwind, emerald, uppercase tracking). Liste as mudanças.
```

---

## 🟢 BAIXO 8 — Performance de bundle

**O que é:** `vite.config.ts` está com `chunkSizeWarningLimit: 2000` (esconde avisos de chunks grandes). As rotas já são lazy (bom), mas libs pesadas (`leaflet`, `recharts`, `pdfjs-dist`, `exceljs`, `framer-motion`) tendem a inflar chunks.

```text
CONTEXTO: Representese, vite.config.ts (Vite 6 + React). chunkSizeWarningLimit está em 2000, mascarando chunks grandes. Libs pesadas: leaflet/react-leaflet, recharts, pdfjs-dist, exceljs, framer-motion.

TAREFA: Otimizar o bundle sem quebrar nada.
1) Baixar chunkSizeWarningLimit para 800 para voltar a enxergar os avisos.
2) Configurar build.rollupOptions.output.manualChunks separando vendors grandes (ex.: 'vendor-maps' p/ leaflet+react-leaflet, 'vendor-charts' p/ recharts, 'vendor-pdf' p/ pdfjs-dist, 'vendor-xlsx' p/ exceljs, 'vendor-motion' p/ framer-motion).
3) Garantir que pdfjs-dist, exceljs e o mapa só sejam importados de forma dinâmica (import() sob demanda) nas páginas que os usam, não no bundle inicial.
4) Rodar npm run build e reportar os tamanhos de chunk antes/depois.
Não altere funcionalidades. Liste o diff do vite.config.ts e quaisquer imports trocados para dinâmicos.
```

---

## Ordem recomendada de execução
1. **Crítico 1** (entitlements à prova de adulteração) — para de sangrar receita.
2. **Crítico 2** (cupons no servidor) — fecha a divergência preço/cobrança.
3. **Crítico 3** (corrigir `/api/ai`) — religa a IA, que é o argumento do plano Master.
4. **Alto 4** (contraste/CTA) — ganho imediato de conversão, baixo esforço.
5. **Alto 5** (anti-duplicidade) — para de barrar clientes legítimos.
6. **Médio 6, 7** e **Baixo 8** — polimento.

## Sobre a conta de teste (cupom GRATIS100)
Não criei a conta porque **não posso criar contas nem digitar senhas** (política de segurança, vale mesmo a seu pedido). Para eu auditar o app **por dentro** (Dashboard, CRM, Mapa, Agenda, Pedidos), faça uma das opções e me avise:
- **Você cadastra e loga** no seu Chrome (eu te guio pelo fluxo `/register` → escolher plano → criar conta; o `GRATIS100` entra na etapa de checkout). Depois eu navego logado e faço a auditoria das telas internas.
- Ou você me passa prints das telas internas e eu complemento a análise.

> Observação técnica: do jeito que está hoje, o `/register` já entra direto no dashboard sem cobrança (por causa do Crítico 1), então o cupom `GRATIS100` só é necessário se você quiser testar o fluxo de **checkout** em si.

---

# Parte 2 — Auditoria das telas internas (app logado)

Naveguei por dentro da sua conta real (Dashboard, Mapa, Meus Clientes, ficha do cliente, Empresas & Pedidos, Agenda, E-mails). Abaixo, o que encontrei — cada item com seu prompt. **Privacidade:** não incluí nomes/CNPJs de clientes; só observações de funcionamento.

### Impressão geral das telas internas
O app logado é **denso, bonito e claramente útil** — agenda semanal sincronizada com Google Calendar e feriados, mapa territorial, CRM com 485 clientes, módulo de empresas/pedidos. A engenharia entrega. Os problemas abaixo são pontuais, mas dois deles atingem features que são **argumento de venda** (inbox e "última compra").

---

## 🔴 INT-1 (CRÍTICO) — Inbox unificada quebrada em produção

**O que é:** na tela **E-MAILS**, o topo diz "Contectado" (com erro de digitação — é "Conectado") mas o conteúdo mostra **"Falha ao buscar e-mails: Failed to fetch"** com botão "Tentar novamente". A caixa de entrada não carrega. Isso é grave porque a inbox centralizada é o destaque #1 da landing ("O único CRM que centraliza sua caixa de entrada").

**Impacto:** feature principal do pitch inoperante para o usuário logado. "Failed to fetch" indica erro de rede/CORS/endpoint ou token expirado no fluxo de sync.

```text
CONTEXTO: Representese. Tela /dashboard/email (src/pages/EmailClient.tsx + src/lib/emailSync.ts + src/lib/googleSync.ts e as edge functions de e-mail: exchange-auth-token, microsoft-token, e o callback EmailCallback). Em produção, o cabeçalho mostra "Contectado" mas a lista falha com "Falha ao buscar e-mails: Failed to fetch". 

TAREFA: Diagnosticar e corrigir o carregamento da caixa de entrada.
1) Corrigir o typo "Contectado" -> "Conectado" onde aparece.
2) Investigar a origem do "Failed to fetch": (a) verificar se o endpoint de fetch de e-mails está correto e dentro do connect-src do CSP em vercel.json (hoje o CSP permite graph.microsoft.com e login.microsoftonline.com, mas confirmar se o provedor usado — Gmail/Google — está liberado; googleapis.com NÃO está no connect-src atual, o que bloquearia chamadas ao Gmail API pelo navegador); (b) verificar expiração/refresh do token OAuth no fluxo googleSync/exchange-auth-token; (c) tratar erro com mensagem específica (token expirado vs rede vs escopo faltando) em vez do genérico "Failed to fetch".
3) Se as chamadas ao provedor de e-mail são feitas do browser, adicionar os domínios necessários ao connect-src do CSP (ex.: https://gmail.googleapis.com https://www.googleapis.com https://oauth2.googleapis.com) OU mover a busca de e-mails para uma edge function (proxy server-side) e chamar só o Supabase a partir do front.
4) Implementar refresh automático de token e um estado de "reautenticar" com botão que refaz o OAuth quando o refresh falhar.

Reproduza, identifique a causa raiz (logar a URL/erro real no console), corrija e descreva o que estava causando o Failed to fetch.
```

---

## 🟠 INT-2 (ALTO) — Mapa plota poucos clientes (geocodificação incompleta)

**O que é:** o CRM tem **485 clientes**, o mapa exibe o selo **"405 PONTOS"**, mas renderiza só ~7 marcadores. A maioria dos clientes não aparece geograficamente. Como o geocoding usa o `/api/ai` (action `geocode` em `api/ai.ts`) — que está quebrado (Crítico 3) — clientes novos não conseguem coordenadas; e não há clustering para volume.

**Impacto:** o "Mapa Territorial / Radar" (feature paga) fica vazio na prática.

```text
CONTEXTO: Representese. src/pages/Map.tsx + src/components/Map.tsx (react-leaflet) + src/lib/geminiGeocoding.ts + edge function geocode + api/ai.ts (action 'geocode'). CRM tem 485 clientes, o mapa mostra "405 pontos" mas renderiza pouquíssimos marcadores.

TAREFA:
1) PRÉ-REQUISITO: garantir que o Crítico 3 (/api/ai) esteja corrigido, pois o geocoding depende dele.
2) Diagnosticar a diferença 485 clientes vs marcadores renderizados: logar quantos clientes têm lat/lng não-nulos no banco. Se muitos estão sem coordenadas, criar uma rotina de geocodificação em lote (batch) que percorre clientes sem lat/lng e chama o geocode com rate-limit/backoff, salvando o resultado. Rodar de forma idempotente e resumível.
3) Implementar clustering de marcadores (ex.: leaflet.markercluster ou supercluster) para suportar centenas/milhares de pontos sem travar.
4) Adicionar estado visual: contador "X de Y clientes geolocalizados" e um botão "Geocodificar pendentes".
5) Cache: nunca regeocodificar um cliente que já tem coordenadas válidas.

Implemente, e relate quantos clientes estavam sem coordenadas e o resultado após o batch.
```

---

## 🟠 INT-3 (ALTO) — Ficha do cliente não mostra histórico de pedidos / última compra

**O que é:** na ficha do cliente há contato, "Nuvem de Documentos" e "Observações Estratégicas", mas **nenhum histórico de pedidos nem a data/valor da última compra**. Isso contradiz diretamente a promessa do produto ("ver última compra de todos os clientes por categoria").

**Impacto:** o representante não vê, no cliente, quando/quanto ele comprou por último — que é o coração do CRM de recompra.

```text
CONTEXTO: Representese. src/pages/ClientDetails.tsx. A ficha do cliente não exibe histórico de pedidos nem "última compra", apesar de existir tabela orders (RLS por user_id) e o módulo Empresas & Pedidos.

TAREFA:
1) Adicionar na ficha do cliente uma seção "Histórico de Pedidos" (timeline) que busca orders do cliente (filtrando por client_id + user_id), ordenada por data desc, mostrando data, empresa, valor e status.
2) Adicionar um destaque no topo da ficha: "Última compra: <data> · R$ <valor>" e um indicador de recência usando os thresholds de settings (alerta_days/critico_days/perda_days/inativo_days) para colorir (verde/amarelo/vermelho).
3) Se o cliente não tiver pedidos, mostrar empty state com CTA "Lançar primeiro pedido".
4) Garantir que a query respeita RLS e não puxa dados de outros usuários.
Mantenha o design system atual (dark, emerald). Liste os arquivos alterados.
```

---

## 🟡 INT-4 (MÉDIO) — Enriquecimento por CNPJ não preenche telefone/e-mail

**O que é:** na ficha, Telefone aparece como "Disponível no CNPJ" e E-mail como "Não configurado" — ou seja, a "Busca CNPJ Automática" (feature dos planos Profissional/Master) não popula contato.

```text
CONTEXTO: Representese. A ficha do cliente (src/pages/ClientDetails.tsx) mostra Telefone "Disponível no CNPJ" e E-mail "Não configurado". A feature "Busca CNPJ Automática" deveria enriquecer esses dados.

TAREFA:
1) Localizar onde a busca de CNPJ é feita (provável lib de import/enriquecimento). Garantir que, ao buscar dados públicos do CNPJ, telefone e e-mail retornados sejam persistidos no registro do cliente.
2) Onde o dado existir, exibir o valor real (com botões de ação: ligar/WhatsApp para telefone, copiar/escrever para e-mail). Onde não existir, manter o fallback "Não informado" + botão "Buscar via CNPJ" que dispara o enriquecimento sob demanda.
3) Tratar limites de plano: a busca automática só para Profissional/Master, validado no servidor (ver Crítico 1).
Liste as mudanças e a fonte de dados de CNPJ usada.
```

---

## 🟡 INT-5 (MÉDIO) — Contraste baixo também no app logado + ruído na agenda

**O que é:** o mesmo problema de contraste da landing aparece logado: **placeholders de busca** (Meus Clientes, Agenda, E-mails) e vários headings em cinza muito claro, difíceis de ler. Na Agenda, o chip **"ANOTAÇÕES" aparece em todos os dias**, mesmo sem nota — poluição visual.

```text
CONTEXTO: Representese, app logado (src/components/Layout.tsx e páginas internas: CRM.tsx, Agenda.tsx, EmailClient.tsx). Dois ajustes de UI:
1) CONTRASTE: placeholders de inputs de busca e diversos headings usam tons muito claros (slate-300/400 / opacidades baixas) sobre fundo escuro/claro, prejudicando leitura. Padronizar: placeholders no mínimo slate-400 sobre dark; textos de conteúdo no mínimo slate-200 (dark) / slate-700 (light); garantir contraste AA. Criar/usar tokens consistentes no design system.
2) AGENDA: o badge "ANOTAÇÕES" é renderizado em todos os dias do calendário (Agenda.tsx), inclusive vazios. Mostrar o indicador de anotação SOMENTE quando o dia tiver nota; em dias sem nota, ocultar (ou usar um ponto discreto no hover). 
Não alterar lógica de dados, só apresentação. Liste os arquivos e classes alteradas.
```

---

## 🟢 INT-6 (BAIXO) — Dashboard de faturamento vazio

**O que é:** Dashboard e Empresas & Pedidos mostram Faturamento R$ 0,00 e 0 pedidos no período. Não é necessariamente bug — parece que **não há pedidos lançados** no mês. Mas reforça a importância de facilitar o lançamento de pedidos (e de exibir últimas compras, INT-3). Vale conferir se o período/agrupamento do gráfico está correto e adicionar um empty state mais útil.

```text
CONTEXTO: Representese. Dashboard (src/pages/Dashboard.tsx + src/components/RevenueChart.tsx) e Empresas.tsx mostram faturamento R$0,00 / 0 pedidos. Verificar se é ausência de dados ou bug de período.
TAREFA:
1) Confirmar a query de faturamento: conferir se filtra pelo mês visível corretamente e se soma orders por empresa no período certo (timezone America/Sao_Paulo).
2) Se for ausência de dados, melhorar o empty state do gráfico e dos cards: mensagem "Nenhum pedido lançado em <mês>" + CTA "Lançar pedido" que leva ao fluxo de novo pedido.
3) Garantir que o gráfico não renderize barras "fantasma" (todas em R$0) — ou mostrar barras zeradas com rótulo, ou esconder e mostrar o empty state.
Liste o que foi ajustado.
```

---

## Nota revisada considerando as telas internas

A inbox quebrada (INT-1) e o mapa quase vazio (INT-2) puxam a experiência logada para baixo, mas são **correções pontuais**, não problemas estruturais. Mantenho a nota geral em torno de **7,4/10**, com a ressalva de que **corrigir INT-1, INT-2 e os 3 Críticos da Parte 1 sobe facilmente para ~8,5+**, porque a fundação (arquitetura, design, breadth de features) já é forte.

### Prioridade consolidada (Parte 1 + Parte 2)
1. Crítico 1 — entitlements à prova de adulteração (receita)
2. Crítico 3 + INT-1 + INT-2 — religar IA, inbox e mapa (features pagas fora do ar)
3. Crítico 2 — cupons no servidor
4. INT-3 — última compra / histórico na ficha (coração do produto)
5. Alto 4 / INT-5 — contraste e CTA
6. Alto 5 — anti-duplicidade
7. INT-4, Médio 6/7, INT-6, Baixo 8 — polimento
