# Auditoria 2 — Telas internas (somente itens novos)

**Data:** 15/06/2026. Continuação da primeira auditoria (essa parte é nova).
**Fora do escopo agora:** Gmail/Inbox (não mexer) e Mapa (verificado — só era zoom/viewport, está correto).

## Resumo rápido (para o Pedro)
Quatro melhorias novas, todas na área logada:
1. **Ficha do cliente sem histórico de pedidos / última compra** — é o coração do produto, hoje não aparece.
2. **CNPJ não preenche telefone/e-mail** na ficha ("Disponível no CNPJ" / "Não configurado").
3. **Contraste fraco** em buscas/headings + chip "ANOTAÇÕES" aparecendo em todo dia da agenda.
4. **Faturamento R$0 / empty state** no Dashboard e Empresas — melhorar a apresentação.

Abaixo está **um prompt único** para colar no Antigravity (faz as 4 de uma vez). No fim dele há a instrução de como ele deve te responder.

---

## PROMPT CONSOLIDADO — cole isto no Antigravity

```text
Você está trabalhando no projeto Representese (React 19 + Vite + Tailwind + Capacitor + Supabase + Asaas). Esta é a SEGUNDA rodada de melhorias; a primeira (entitlements, cupons no servidor, /api/ai, contraste da landing, anti-duplicidade, limpeza de repo) já foi tratada à parte — NÃO refaça aquilo. Implemente as 4 tarefas abaixo, todas na área logada. Mantenha o design system atual (dark, emerald, uppercase tracking). Não introduza dependências novas sem necessidade. Respeite RLS (toda query filtra por user_id).

TAREFA 1 — Histórico de pedidos e "última compra" na ficha do cliente (PRIORIDADE)
Arquivo principal: src/pages/ClientDetails.tsx (tabela orders existe, com RLS por user_id).
- Adicionar uma seção "Histórico de Pedidos" (timeline) que busca os pedidos daquele cliente (filtrando por client_id E user_id), ordenados por data desc, mostrando: data, empresa/fornecedor, valor (R$) e status.
- Adicionar no topo da ficha um destaque "Última compra: <data> · R$ <valor>". Calcular recência usando os thresholds de user_settings (alerta_days, critico_days, perda_days, inativo_days) e colorir o selo: em dia (verde), alerta (amarelo), crítico/perda (vermelho), inativo (cinza).
- Se o cliente não tiver pedidos, mostrar empty state com botão "Lançar primeiro pedido" que abre o fluxo de novo pedido já com esse cliente pré-selecionado.
- Garantir que nenhuma query traga dados de outro usuário.

TAREFA 2 — Enriquecimento de contato por CNPJ
Arquivo: src/pages/ClientDetails.tsx e a lib/fluxo que faz a busca de CNPJ (provável src/lib/clientImport.ts ou similar).
- Hoje Telefone aparece como "Disponível no CNPJ" e E-mail como "Não configurado". Quando a busca de CNPJ retornar telefone e/ou e-mail, PERSISTIR esses campos no registro do cliente (não só exibir em memória).
- Exibir o valor real quando existir, com ações: telefone -> botões "Ligar" e "WhatsApp" (link wa.me com número normalizado); e-mail -> botões "Copiar" e "Escrever".
- Quando não existir, mostrar "Não informado" + botão "Buscar via CNPJ" que dispara o enriquecimento sob demanda e salva o resultado.
- A busca automática de CNPJ deve respeitar o plano (Profissional/Master) validado no servidor; não confie no plano vindo do cliente.

TAREFA 3 — Contraste (acessibilidade) + ruído visual na agenda
Arquivos: src/components/Layout.tsx, src/pages/CRM.tsx, src/pages/Agenda.tsx (e onde houver inputs de busca).
- Contraste: placeholders de inputs de busca e vários headings usam tons muito claros (slate-300/400 ou opacidade baixa), difíceis de ler. Padronizar para atingir WCAG AA: placeholders no mínimo slate-400 sobre dark; texto de conteúdo no mínimo slate-200 (dark) / slate-700 (light). Se possível, centralizar esses tokens no design system para não repetir.
- Agenda: o badge "ANOTAÇÕES" está sendo renderizado em TODOS os dias do calendário, inclusive vazios. Renderizar o indicador SOMENTE quando o dia tiver anotação; em dias sem nota, ocultar (ou trocar por um ponto discreto). Não alterar a lógica de dados, só a condição de exibição.

TAREFA 4 — Faturamento / empty state no Dashboard e Empresas
Arquivos: src/pages/Dashboard.tsx, src/components/RevenueChart.tsx, src/pages/Empresas.tsx.
- Conferir a query de faturamento: garantir que filtra pelo MÊS visível corretamente e soma orders por empresa no período certo, usando timezone America/Sao_Paulo (cuidado com bordas de início/fim de mês em UTC).
- Quando não houver pedidos no período, mostrar um empty state claro ("Nenhum pedido lançado em <mês>") com CTA "Lançar pedido", em vez de barras zeradas/fantasma no gráfico.
- Se o gráfico renderizar barras todas em R$0, ou esconder o gráfico e mostrar o empty state, ou rotular explicitamente como zerado. Não deixar barras verdes sem valor que parecem dados.

COMO RESPONDER (importante): ao terminar, escreva um relatório nESTE formato, porque sua resposta será lida por outra IA de auditoria (Claude) que vai conferir:
1) RESUMO: 1-2 frases por tarefa do que foi feito.
2) ARQUIVOS ALTERADOS: lista de caminhos + o que mudou em cada um.
3) MIGRAÇÕES/SCHEMA: se criou/alterou tabela ou coluna, cole o SQL.
4) DECISÕES/SUPOSIÇÕES: o que você assumiu (ex.: nome de coluna de data em orders, como o client_id se relaciona).
5) PENDÊNCIAS/RISCOS: o que não conseguiu fazer, o que precisa de teste manual, ou qualquer coisa que possa quebrar.
6) COMO TESTAR: passos para validar cada tarefa.
Seja específico com nomes de arquivos, funções e colunas reais do projeto. Se algo não existir como eu descrevi, diga e me proponha a alternativa em vez de inventar.
```

---

## Quando o Antigravity te responder
Me cola a resposta dele aqui. Eu leio o relatório (arquivos alterados, SQL, pendências) e te digo se ficou correto, o que revisar, e já preparo a próxima rodada se precisar.
