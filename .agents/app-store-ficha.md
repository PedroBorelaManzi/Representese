# Ficha da App Store — Represente-Se! (rascunho)

App Store Connect → app "Represente-Se!" (ID 6807149345, bundle `com.representese.app`).
Idioma primário: Português (Brasil). Preencher em **App Information** e na **versão 1.75**.

> ⚠️ A versão no App Store Connect está como **"1.0"** e o build subiu como **1.75**.
> Antes de anexar o build: em App Store Connect → Version, mude a string da versão
> para **1.75** (ou re-suba o app com MARKETING_VERSION = 1.0). Recomendado: usar 1.75.

---

## Nome
Represente-Se!

## Subtítulo (máx. 30)
`CRM, pedidos e comissões`

## Texto promocional (máx. 170, editável a qualquer momento)
`O sistema completo do representante comercial: carteira de clientes, pedidos com foto, comissões automáticas e faturamento por marca — num app só, até sem internet.`

## Descrição
```
O Represente-Se! organiza a rotina do representante comercial autônomo num só lugar:
clientes, pedidos, agenda, comissões e faturamento — inclusive offline, direto do
celular, durante a visita.

PARA QUEM É
Representantes e vendedores externos que atendem várias empresas (representadas) e
hoje se perdem entre planilhas, cadernos e grupos de WhatsApp.

O QUE VOCÊ FAZ NO APP
• Carteira de clientes com CNPJ, endereço, contato, histórico e status
• Pedidos com foto — a IA lê o pedido de papel e digitaliza pra você
• Comissões calculadas automaticamente por produto, marca e parcela
• Faturamento por representada: veja quanto cada marca rende no mês
• Agenda de compromissos e roteiro de visitas
• Mapa dos seus clientes por território
• Alerta de cliente parado — quem não compra há tempo demais
• Relatórios em PDF para prestação de contas
• Busca automática de dados por CNPJ
• Assistente de IA para tirar dúvidas e escrever mensagens ao cliente

FUNCIONA OFFLINE
Cadastrou o pedido sem sinal no depósito do cliente? O app sincroniza sozinho
quando a internet volta.

ASSINATURA
O Represente-Se! é um serviço por assinatura contratada em representese.com.
Baixe o app e entre com a conta que você já usa no site. Planos a partir de
R$ 97/mês, sem fidelidade.

SUPORTE
representese.com — atendimento por e-mail e WhatsApp.
```

## Palavras-chave (máx. 100, separadas por vírgula, sem espaço)
`representante,comercial,vendas,CRM,pedidos,comissão,clientes,agenda,vendedor,representada,rota`

## Novidades desta versão
```
Primeira versão do Represente-Se! para iPhone. Toda a plataforma na palma da mão,
com login por Face ID e funcionamento offline.
```

## URLs
- Suporte: `https://www.representese.com`
- Marketing (opcional): `https://www.representese.com`
- Política de privacidade: `https://www.representese.com/privacy`

## Categoria
- Primária: **Business**
- Secundária: **Productivity**

## Classificação etária
4+ (sem conteúdo censurável). Responder "Nenhum/Nunca" em todo o questionário.

## Preço
**Grátis**. Sem compras no app (a assinatura é cobrada no site).

## Copyright
`2026 Pedro Borela Manzi`

---

## Notas para o revisor (App Review Information → Notes)
```
App B2B para representantes comerciais no Brasil. O acesso exige uma assinatura
contratada no nosso site (representese.com). O app NÃO vende assinaturas e não
contém compras — quem já é assinante entra com e-mail e senha e usa o app
(modelo semelhante a apps do tipo "leitor").

Conta de demonstração (plano Master ativo, com dados de exemplo):
  E-mail: <PREENCHER>
  Senha:  <PREENCHER>

Exclusão de conta: dentro do app, em Configurações › Meu Perfil ›
"Quero excluir minha conta".

--- EN ---
B2B app for sales representatives in Brazil. Access requires a subscription
purchased on our website (representese.com). The app contains no purchases and
does not sell subscriptions; existing subscribers sign in with email/password.
A demo account with an active plan and sample data is provided above.
In-app account deletion: Settings › My Profile › "Delete my account".
```

## App Review Information — contato
- Nome / sobrenome: Pedro Borela Manzi
- Telefone + e-mail: (preencher)

---

## App Privacy (nutrition labels) — o que declarar

**Coletados e vinculados à identidade do usuário:**
| Categoria | Dado | Finalidade |
|---|---|---|
| Contact Info | Nome, e-mail | Funcionalidade do app, Gerência de conta |
| User Content | Fotos (pedidos), dados de clientes, outros conteúdos | Funcionalidade do app |
| Location | Localização precisa | Funcionalidade do app (centralizar o mapa / cobertura). **NÃO** é rastreamento |
| Identifiers | ID de usuário | Funcionalidade do app |
| Financial Info | Dados de faturamento/comissão que o usuário cadastra | Funcionalidade do app |

**Coletados para Analytics (com consentimento — banner LGPD no app):**
| Usage Data | Interação com o produto | Análise (PostHog) |
| Diagnostics | Dados de falha e desempenho | Funcionalidade do app (Sentry) |

**Rastreamento entre apps/sites:** NÃO. ATT não é necessário.

---

## Screenshots (obrigatório — mínimo 1, só iPhone)
Tamanho: **iPhone 6.9"** (1320×2868) ou **6.7"** (1290×2796).
Tirar no Simulador iPhone 16 Pro Max (⌘S salva no Desktop). Telas sugeridas:
1. Início / Agenda do dia
2. Carteira de clientes (CRM)
3. Pedido com foto / digitalização por IA
4. Mapa de clientes
5. Comissões / faturamento por marca

---

## Conta de demonstração — como criar
1. Cadastrar no site representese.com com um e-mail dedicado (ex.: `applereview@representese.com`)
2. Ativar plano Master + status `active` no `user_settings` / `user_entitlements` (via Supabase)
3. Semear ~5 clientes, ~3 pedidos e 1-2 compromissos de exemplo
4. Colar e-mail e senha nas "Notas para o revisor"
