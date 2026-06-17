# HANDOFF — Continuidade do projeto Representese

> Para retomar num chat novo (ex.: em Sonnet): conecte este chat à pasta `Represente-Me!` e diga "leia o HANDOFF_continuidade.md". Tudo abaixo é o estado real verificado até 16/06/2026.

## 1. O que é o projeto
**Representese** (representese.com) — plataforma SaaS (assinatura mensal) para **representantes comerciais**: CRM, mapa territorial, agenda (com Google Calendar + feriados), pedidos, inbox com IA, dashboard financeiro.
**Stack:** React 19 + Vite + Tailwind + Capacitor (iOS/Android) + Supabase (Postgres/Auth/Edge Functions Deno) + Asaas (pagamentos) + Vercel (deploy) + Gemini/OpenAI (IA via backend).

## 2. Método de trabalho (combinado com o Pedro)
- **Claude** (este assistente) faz **auditoria e validação** e escreve **prompts técnicos prontos** para o Antigravity.
- **Antigravity** (IA de coding do Pedro) implementa, commita e faz push.
- **Pedro** é a ponte: cola os prompts no Antigravity e traz as respostas de volta.
- **Verificação** sempre por 3 vias: `git`/commit publicado (pasta montada = repo) + **Vercel** (deploy READY) + **Supabase** (banco) + **ao vivo no Chrome** (com hard refresh).
- Lição aprendida: o **working tree da pasta às vezes fica defasado** vs o commit — sempre conferir com `git show HEAD:` (o HEAD = o que está no GitHub).

## 3. Acessos / IDs
- **GitHub:** https://github.com/PedroBorelaManzi/Representese (público, branch `main`).
- **Vercel:** project `represente-se` (id `prj_54MMbEkNP4QxhWSbm0PbGkkOalwU`), team `team_Fa1yHXhjWgxI9Tkk96hAbuEf`.
- **Supabase:** projeto `Representese`, ref `wdtftftwdqtihupbtlxk`.
- Conta do Pedro no app: `pedroborelamanzi@gmail.com` → setada como `active` / plano `master`, sem expiração.

## 4. O que foi feito e VERIFICADO em produção (Auditorias 1 e 2 + ajustes)
Último commit relevante: **`73130ed`** (deploy READY no Vercel).
- **Segurança/monetização (banco):** criadas tabelas `user_entitlements`, `coupons`, `billing_identities`. RLS correto — `user_entitlements` só leitura do dono (cliente NÃO consegue se auto-promover); `coupons`/`billing_identities` sem policy de cliente. Trigger de novo usuário + função `increment_coupon` existem. Migração `20260616000000_audit_refactor.sql` registrada.
- **Enforcement de trial:** `SettingsContext` lê entitlements e converte `trialing`/`active` vencido em `past_due`; `SubscriptionGuard` bloqueia, com grace period offline. Default seguro `inactive`.
- **Cupons server-side:** `validate-coupon` + `process-checkout` revalidam no banco (cupom 100% = 30 dias de cortesia). Sem mais cupons hardcoded no front.
- **Anti-duplicidade:** `billing_identities` por índice (sem `listUsers`), sem bloquear por nome.
- **fetch-cnpj:** gating server-side por `user_entitlements`. **Decisão do Pedro:** Busca CNPJ agora é para **TODOS os planos** (incluindo Exclusivo) — `plansData.ts` mostra o recurso nos 3 planos.
- **api/ai.ts:** rate-limit Upstash fail-open.
- **Landing:** CTA "TESTE GRÁTIS" agora verde sólido + headline/contraste corrigidos (confirmado ao vivo).
- **Agenda:** mojibake de encoding corrigido; chip "ANOTAÇÕES" mantido como está (Pedro ok).
- **Dashboard "Faturamento por Empresa":** mostra SEMPRE todas as empresas cadastradas, com valores reais por mês (join normalizado com trim().toUpperCase()). CONFIRMADO correto: abril/COZIMAX = R$ 7.914,15 batendo com Empresas & Pedidos. (Obs.: um susto de "valores zerados" foi alarme falso meu — eu havia lido a escala errada; está tudo certo.)
- **OrderBump:** mojibake "LANÇAMENTO" corrigido; varredura de encoding limpa no `src/`.
- **README:** reescrito (saiu o boilerplate do AI Studio).

## 5. PENDÊNCIAS
- 🟡 **CI do GitHub Actions falhando (❌)** nos commits recentes — provável script de lint (TS) ou Playwright/e2e; possivelmente BOM no hook do husky. **Não afeta o site.** Há lembrete agendado (17/06 20h) + evento no Google Agenda do Pedro.
- (Opcional, baixa prioridade) limpeza de scripts `.cjs` soltos na raiz; alerta "1" em Security & quality do GitHub (provável Dependabot).

## 6. Arquivos de referência nesta pasta
- `AUDITORIA_E_PROMPTS_Representese.md` — Auditoria 1 completa (segurança/monetização/landing) com prompts.
- `AUDITORIA_2_Representese.md` — Auditoria 2 (telas internas).
- `STATUS_FINAL_verificacao.md` — status de verificação (com nota pós-deploy).
- `HANDOFF_continuidade.md` — este arquivo.

## 7. Contexto extra
Mudança de modelo (Opus → Sonnet) motivada por economia de créditos; o seletor travado em Opus é um bug conhecido em espaços migrados de "Projects" (GitHub issue anthropics/claude-code #66407). Por isso a recomendação de abrir espaço novo em Sonnet conectado a esta mesma pasta.
