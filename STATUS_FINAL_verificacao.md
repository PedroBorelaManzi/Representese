> ## 🔄 ATUALIZAÇÃO PÓS-PUSH (commit a785e47 publicado)
> O Antigravity deu o push e o **deploy do Vercel está READY** (commit `a785e477`, branch main). Então o frontend novo **JÁ ESTÁ NO AR** — o que estava "faltando" abaixo por falta de deploy agora deve aparecer (agenda, gráfico, enforcement, ficha). Confirmado também: **`increment_coupon` ENTROU no arquivo de migração** (estava no commit; minha leitura anterior pegou um working tree defasado).
>
> **Mas 2 itens continuam pendentes mesmo após o deploy:**
> 1. **Landing CTA/hero** — `LandingPitch.tsx` NÃO foi tocado em nenhum commit. Confirmei ao vivo pós-deploy: o "TESTE GRÁTIS" segue lavado. **Essa correção nunca foi feita.**
> 2. **`fetch-cnpj` sem gating de plano** — a regressão persiste no commit publicado (qualquer logado usa CNPJ).
>
> Pendente de reconfirmação visual logado (a sessão caiu): agenda/gráfico/ficha — código está no deploy, falta olhar com a conta logada.

---

# Verificação Final — o que foi para produção (15/06/2026)

Conferi **código + banco + site ao vivo**. Resumo direto: o **backend/Supabase está aplicado e verificado em produção**, mas o **frontend novo (UI/UX) NÃO está no ar** — o site em produção ainda roda a versão antiga da interface.

---

## ✅ BACKEND / BANCO — aplicado e verificado em produção

Confirmado direto no seu Supabase (`wdtftftwdqtihupbtlxk`):

- Tabelas `user_entitlements`, `coupons`, `billing_identities` **existem**.
- **RLS correto:** `user_entitlements` só tem policy de **leitura** do dono (sem escrita); `coupons` e `billing_identities` com RLS e **zero policies** → cliente não acessa. **A auto-promoção de plano está bloqueada no nível do banco.**
- Trigger `on_auth_user_created_entitlement` e função `increment_coupon` existem; migração `20260616000000` **registrada no histórico**.
- `plan_id` **normalizado** para slugs (`exclusivo/profissional/master`) — dados e código (`normalizePlanId` usado no webhook e no checkout).
- Edge functions no ar: `validate-coupon`, `fetch-cnpj`, `sync-asaas-backfill`; webhook grava **só** em `user_entitlements`; `process-checkout` revalida cupom pelo banco e usa `billing_identities` (sem `listUsers`).
- `api/ai.ts` com rate-limit fail-open.
- **Sua conta** (`pedroborelamanzi@gmail.com`): `active`, plano `master`, sem expiração. As outras 12 contas em `trialing` (expiram 23/06).

---

## ❌ FRONTEND — as mudanças de UI NÃO estão em produção

Testei o site ao vivo. As correções de interface **não aparecem** — o build novo não foi publicado (ou foi, mas não surtiu efeito). Evidências:

| Item | Esperado | No ar agora |
|---|---|---|
| Landing — CTA "TESTE GRÁTIS" | Verde sólido, alto contraste | **Continua verde-claro quase invisível** |
| Landing — headline | Texto escuro legível | **Continua cinza lavado** |
| Agenda — chip "ANOTAÇÕES" | Só nos dias com nota | **Ainda aparece em TODOS os dias** |
| Dashboard — gráfico faturamento | Empty state "Aguardando vendas" | **Ainda mostra barras fantasma no R$0** |
| Ficha do cliente — "última compra" | Badge + CTA "lançar pedido" | **Não aparece** (ficha igual à original) |
| Busca (CRM/Agenda) — placeholder | Contraste AA | **Ainda baixo contraste, quase ilegível** |
| Login / Planos / Registro | — | **OK** (já eram bons) |

### ⚠️ Consequência crítica disso
O **enforcement do trial** (bloquear quem venceu) mora no frontend (`SettingsContext` + `SubscriptionGuard`). Como o frontend novo **não está no ar**, a produção ainda roda a versão antiga, que lê `user_settings` e assume `active` por padrão — ou seja, **na prática o bloqueio de trial vencido ainda NÃO está ativo em produção.** O banco impede a auto-promoção (RLS), mas o *corte de acesso* só passa a valer quando o frontend for publicado. **Enquanto o frontend não subir, o furo de monetização continua aberto na ponta do usuário.**

---

## 🟠 Pendências de código (independente do deploy)

1. **Regressão — `fetch-cnpj` perdeu o gating de plano.** A versão atual só valida login (JWT), mas **não checa mais Profissional/Master** — qualquer usuário logado (até `exclusivo` ou trial vencido) consegue usar a busca de CNPJ. Isso se perdeu quando ele reescreveu as functions para UTF-8. A condição C6 deixou de valer.
2. **`increment_coupon` não está no arquivo de migração.** Existe no banco, mas o `.sql` não tem a definição → repo não é fonte de verdade; num ambiente recriado do zero a função some.

---

## Ordem do que fazer agora
1. **Publicar o frontend em produção** (Vercel) — é o que destrava TODOS os ganhos de UI **e** o enforcement do trial. Hoje só o backend subiu.
2. Corrigir a **regressão do `fetch-cnpj`** (devolver o gating Profissional/Master).
3. Sincronizar **`increment_coupon`** no arquivo de migração.
4. Depois de publicar, **reconfirmar ao vivo**: landing CTA, agenda, gráfico, ficha do cliente, e testar que um trial vencido é realmente bloqueado.

---

## Bloco pronto pra mandar ao Antigravity

```text
Verificação final: o BACKEND/Supabase está aplicado e verificado em produção (tabelas, RLS, entitlements, cupons server-side, normalizePlanId, migração registrada). Porém o FRONTEND novo NÃO está em produção — o site ao vivo ainda mostra a interface antiga. Evidências testando representese.com:
- Landing: o CTA "TESTE GRÁTIS POR 7 DIAS" continua verde-claro/baixo contraste (a correção de contraste não está no ar).
- Agenda: o chip "ANOTAÇÕES" ainda aparece em todos os dias (a condição "só com nota" não está no ar).
- Dashboard: gráfico de faturamento ainda com barras fantasma no R$0 (empty state não está no ar).
- Ficha do cliente: sem badge "última compra"/CTA, e placeholders de busca ainda com baixo contraste.

AÇÕES:
1) Faça o deploy real do frontend para produção (Vercel) e confirme com a hash/URL do deployment e a data. Importante: o enforcement do trial (SettingsContext + SubscriptionGuard) está no frontend — enquanto não publicar, trial vencido NÃO bloqueia em produção. Confirme que após o deploy um usuário 'trialing' com trial_ends_at no passado realmente cai na tela de bloqueio.
2) REGRESSÃO em supabase/functions/fetch-cnpj/index.ts: a versão atual só valida o JWT e NÃO checa mais o plano. Restaure o gating server-side: SELECT plan_id FROM user_entitlements WHERE user_id = auth.uid(); se não for 'profissional' nem 'master', retorne 403. Redeploy a função.
3) Adicione a definição de increment_coupon ao arquivo supabase/migrations/20260616000000_audit_refactor.sql (a função existe no banco mas não está no arquivo), para o repo ser fonte de verdade.

Depois confirme: deploy do frontend feito (hash+data), fetch-cnpj com gating restaurado e redeployado, e increment_coupon presente no arquivo.
```
