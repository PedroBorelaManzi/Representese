---
name: loop-factory
description: "Loop de tarefas orientado a spec. Tarefas vivem como specs markdown que movem por inbox → active → archive com gate de revisão obrigatório antes de marcar como feito."
---

# Loop Factory — Loop de Tarefas com Gate de Revisão

Trabalho repetível e revisável em vez de prompts únicos. Estado visível sem dashboard.

## Como funciona

```
inbox/        ← tarefas esperando
active/       ← tarefa sendo executada agora
archive/      ← tarefas aprovadas e concluídas
```

Cada tarefa é um arquivo `.md` com spec do que precisa ser feito. O estado é simplesmente qual pasta o arquivo está.

## Regra central

Automatizar implementação e verificação. Nunca automatizar decisões de produto.

## Gate de revisão

Antes de mover de `active/` para `archive/`, a tarefa passa por revisão. Sem aprovação, não conta como feita.

## Quando usar no nosso projeto

- Backlogs de features com múltiplas tarefas relacionadas
- Quando há várias melhorias pequenas pra fazer em sequência
- Sprint de correções após auditoria
- Qualquer conjunto de tarefas que precise de rastreamento visível

## Estrutura de uma spec de tarefa

```markdown
# [Nome da tarefa]

**Goal:** o que precisa ser feito
**Arquivos:** quais arquivos serão tocados
**Critério de conclusão:** como saber que está feito

## Passos
- [ ] passo 1
- [ ] passo 2
- [ ] verificação
```
