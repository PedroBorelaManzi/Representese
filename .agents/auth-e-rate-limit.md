# Autenticação (JWT) e teto de sessões — estado atual

> Escrito em 2026-08-29. Verificação + implementação feitas pela Claude Code.

## 1. Sistema de autenticação JWT — JÁ EXISTIA (via Supabase Auth)

Não foi preciso "criar do zero". O que o Supabase Auth já entrega:

| Item pedido | Situação | Detalhe |
|---|---|---|
| **JWT de acesso** | ✅ ativo | Assinatura **ES256 (chave assimétrica)**. Chave pública em `https://wdtftftwdqtihupbtlxk.supabase.co/auth/v1/.well-known/jwks.json`. Expira em ~1h. |
| **Refresh token** | ✅ ativo | `autoRefreshToken` ligado (agora **explícito** em `src/lib/supabase.ts`). O refresh token **rotaciona a cada uso** (server-side, padrão do Supabase) e tem detecção de reuso. |
| **HTTPS** | ✅ ativo | Forçado por Vercel + Supabase. Header `Strict-Transport-Security: max-age=31536000; includeSubDomains` já estava em `vercel.json`. Adicionado `upgrade-insecure-requests`, `base-uri 'self'`, `form-action 'self'` ao CSP. |
| **Rotatividade de chaves (JWT signing key)** | ⚠️ **suportado, não configurado** | Só existe **1** chave de assinatura, sem chave "standby". A rotação é uma operação de **painel** (ver seção 4). Do lado do código já está pronto: a verificação agora é local via JWKS e o `jose` rebusca as chaves sozinho quando o `kid` muda — rotacionar **não quebra nada no cliente**. |

### O que mudou no código (auth)

- **`api/_lib/verifyJwt.ts`** (novo) — verificação **local** do JWT (assinatura contra o JWKS), em vez de um `fetch` ao `/auth/v1/user` a cada request. Mais rápido, tira carga do GoTrue (compartilhado no plano Free) e torna a rotação de chave transparente. Fallback pra rede se o JWKS estiver fora do ar.
- **`api/ai.ts`** e **`api/order-intake.ts`** — passaram a usar `verifyBearer()`. Comportamento idêntico pro cliente.
- **`src/lib/supabase.ts`** — opções de auth explícitas + nota sobre `flowType: 'pkce'` (não migrado: exigiria testar os fluxos de confirmação de e-mail / recuperação — o login por senha e o OAuth custom não dependem disso).
- Dependência nova: **`jose`** (`npm install` antes do próximo build/deploy).

## 2. Teto global de 150 sessões simultâneas — NOVO

Objetivo: proteger o Supabase Free de saturar num pico (ex.: divulgação). Enquanto
houver `SESSION_LIMIT` (150) usuários ativos, o próximo a logar vê a tela
**"Sistema com lotação máxima"** e entra sozinho assim que abrir vaga.

- **`api/_lib/sessionGate.ts`** — ZSET no Upstash Redis (`session_gate:active`), membro = `user_id`, score = último "visto". Acquire/heartbeat atômico via script Lua (evita corrida no limite). **Fail-open**: sem Upstash, ou erro no Redis → portão aberto.
- **`api/session-gate.ts`** — endpoint. `POST {action:'acquire'|'release'}`. `GET` devolve `{active, limit}` pra observabilidade.
- **`src/lib/sessionGate.ts`** + **`src/contexts/SessionGateContext.tsx`** — no login pega a vaga; heartbeat a cada 70s (só com a aba visível); re-adquire ao focar a aba; libera no logout e no `pagehide`.
- **`src/components/SystemFull.tsx`** — a tela de lotação, com retry automático a cada 15s.
- Ligado em **`src/components/ProtectedRoute.tsx`** (cobre todo `/dashboard/*`).

### Config (env vars — todas opcionais, têm padrão)

```
SESSION_LIMIT=150        # usuários ativos simultâneos
SESSION_TTL_MS=180000    # tempo sem heartbeat até liberar a vaga
```

Precisa de `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (as mesmas do rate limit da IA). **Se não estiverem no Vercel, o teto fica desligado.**

### Limitações conhecidas

- **App nativo (Capacitor)**: `fetch('/api/session-gate')` não alcança a Vercel a partir do WebView local → cai no fail-open. Usuários do app **não contam** contra o limite. Aceitável: o pico de risco é web (representese.com).
- O gate é **pós-login** (precisa do `user_id`). Um visitante não logado nunca é barrado — mas também não consome recurso pesado.
- `150` é um limite **suave** (pode passar de 150 por 1–2 em corridas raras). Não é fronteira de segurança.

## 3. Multi-dispositivo (decisão: manter como está)

- **A mesma conta funciona em vários PCs/celulares ao mesmo tempo.** É o padrão do Supabase Auth: cada dispositivo tem sua própria sessão + refresh token, sem limite. Nada no código impede.
- **Mudança feita num PC NÃO aparece automaticamente nos outros.** O app é offline-first: React Query com `staleTime: Infinity` (nunca refaz busca sozinho) + cache persistido em IndexedDB + fila de sync manual. O outro PC só vê o dado novo depois de sincronizar/recarregar. Realtime só está ligado no chat de suporte.
- Se um dia quiser mudar: limitar a 1 dispositivo = padrão `session_epoch` (igual aos links de pedido); sync ao vivo = assinaturas Supabase Realtime em `clients`/`orders` (consome cota + risco de conflito com a fila offline).

## 3b. Requisitos de senha (client-side) — alinhados ao Supabase

Config no Supabase: *Password Requirements* = **"Lower, upper, digits and symbols"**.

`src/lib/passwordPolicy.ts` (novo) é a **fonte única** dessas regras no front:
`PASSWORD_MIN_LENGTH` + minúscula + maiúscula + número + símbolo (qualquer
não-alfanumérico, igual o Supabase). Usado em:

- `src/pages/Checkout.tsx` — criação de conta (checklist já existia; agora o
  conjunto de "símbolo" bate com o do servidor)
- `src/pages/Recovery.tsx` — redefinição de senha (**faltava checar minúscula** → corrigido)
- `src/components/settings/SettingsSecurity.tsx` — troca de senha logado (**idem**)

> ⚠️ Se mudar *Password Requirements* ou *Minimum password length* no painel do
> Supabase, ajuste `passwordPolicy.ts` no mesmo commit — senão o formulário
> aceita senha que o `signUp`/`updateUser` recusa (ou o contrário).

## 4. O que só o Pedro pode fazer (painel / infra)

1. **Configurar rotação da chave JWT** — Supabase Dashboard → *Project Settings → JWT Keys*:
   - "Add standby key" (mesmo algoritmo, ES256)
   - depois de uns dias, "Rotate keys" (a standby vira ativa; a antiga vira "previous", ainda valida tokens em trânsito)
   - "Revoke" a antiga depois de ~24h (todo token já expirou)
   - O código não precisa de deploy nenhum pra isso — o `jose` acompanha.
2. **Auth → "Leaked password protection": ativar** (advisor de segurança aberto).
3. **Env vars no Vercel**: garantir `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN` em Production (senão o teto de 150 e o rate limit da IA ficam desligados). `SESSION_LIMIT` só se quiser um número diferente de 150.
4. `npm install` (por causa do `jose`) — o CI/Vercel faz sozinho no build; local, rodar antes do próximo `npm run build`.

## 5. Deploy

- Mudança afeta `src/` → **versão Android subida**: `versionCode 79`, `versionName "1.76"` (`android/app/build.gradle`).
- `jose` é dependência nova → `npm install` antes do `npm run build`.
- Sem plugin nativo novo → não precisa `npx cap sync`.
