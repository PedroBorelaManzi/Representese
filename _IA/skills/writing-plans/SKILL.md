---
name: writing-plans
description: "Use quando tiver um design aprovado e precisar criar o plano de implementação detalhado antes de tocar no código. Gera tarefas bite-sized com arquivos exatos, código completo e passos de verificação."
---

# Writing Plans — Plano de Implementação

Criar planos detalhados assumindo que o executor (Antigravity) não conhece o projeto. Documentar tudo: quais arquivos tocar, qual código escrever, como testar, como commitar.

## Cabeçalho obrigatório de todo plano

```markdown
# [Nome da Feature] — Plano de Implementação

**Goal:** [Uma frase descrevendo o que será construído]
**Arquitetura:** [2-3 frases sobre a abordagem]
**Stack:** [Tecnologias envolvidas]

## Restrições globais
[Regras que valem para todas as tarefas]
```

## Estrutura de cada tarefa

```markdown
### Tarefa N: [Nome]

**Arquivos:**
- Criar: `caminho/exato/arquivo.tsx`
- Modificar: `caminho/exato/existente.tsx`

- [ ] Passo 1: [ação concreta com código completo]
- [ ] Passo 2: [rodar verificação com comando exato]
- [ ] Passo 3: commit
```

## Regras

- Caminhos de arquivo sempre exatos
- Código completo em cada passo — nunca "implemente X" sem mostrar o código
- Comandos exatos com output esperado
- DRY, YAGNI, commits frequentes
- Cada tarefa deve ser testável independentemente (2-5 minutos)

## Proibido

- "TBD", "TODO", "implementar depois"
- "Adicionar tratamento de erro adequado" sem mostrar o código
- "Similar à Tarefa N" — repetir o código completo
- Passos que descrevem sem mostrar como

## Salvar em

`docs/plans/YYYY-MM-DD-<feature>.md`
