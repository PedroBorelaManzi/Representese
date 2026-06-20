---
name: requesting-code-review
description: "Use após completar tarefas importantes, implementar features ou antes de qualquer merge. Revisão cedo e frequente evita que problemas se acumulem."
---

# Requesting Code Review — Revisão de Código

Revisar o trabalho antes de seguir em frente. Pegar problemas antes que se tornem maiores.

## Quando usar

**Obrigatório:**
- Após cada tarefa em desenvolvimento orientado a subagentes
- Após completar uma feature
- Antes de merge para main

**Opcional mas valioso:**
- Quando travado (perspectiva fresca)
- Antes de refatorar (baseline)
- Após corrigir bug complexo

## Como funciona no nosso projeto

No fluxo Claude + Antigravity:

1. Antigravity termina uma tarefa e retorna o resultado
2. Pedro traz o retorno ao Claude
3. **Claude faz a revisão**: lê o que foi feito, compara com o que foi pedido, aponta problemas
4. Se houver problema crítico: gera prompt corretivo pro Antigravity
5. Se estiver ok: confirma e segue

## O que revisar

- O que foi pedido foi realmente implementado?
- Os padrões do projeto foram respeitados? (Tailwind, lucide-react, sonner, etc.)
- Há efeitos colaterais em outros arquivos?
- O código está limpo e sem gambiarras?
- Há casos de erro não tratados?

## Classificação de problemas

- **Crítico**: bloqueia, deve ser corrigido antes de avançar
- **Importante**: deve ser corrigido em breve
- **Minor**: anotado para depois, não bloqueia

## Nunca

- Pular revisão porque "é simples"
- Ignorar problemas críticos
- Avançar com problemas importantes sem corrigir
