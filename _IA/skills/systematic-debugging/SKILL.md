---
name: systematic-debugging
description: "Use quando encontrar qualquer bug, falha de teste ou comportamento inesperado, ANTES de propor qualquer fix. Nunca tentar corrigir sem entender a causa raiz primeiro."
---

# Systematic Debugging — Debugging com Causa Raiz

## Lei de ferro

```
NENHUM FIX SEM INVESTIGAÇÃO DE CAUSA RAIZ PRIMEIRO
```

Fixes aleatórios desperdiçam tempo e criam novos bugs.

## As 4 Fases — completar em ordem

### Fase 1: Investigação de causa raiz

Antes de qualquer fix:
1. **Ler mensagens de erro completamente** — stack traces, linha, arquivo, código de erro
2. **Reproduzir consistentemente** — se não consegue reproduzir, coletar mais dados
3. **Checar mudanças recentes** — git diff, commits recentes, novas dependências
4. **Rastrear o fluxo de dados** — onde o valor errado se origina? Trace para trás até a fonte

### Fase 2: Análise de padrão

- Encontrar exemplos funcionando no mesmo codebase
- Comparar o que funciona com o que está quebrado
- Listar cada diferença, por menor que seja

### Fase 3: Hipótese e teste

- Formular UMA hipótese: "Acho que X é a causa raiz porque Y"
- Fazer a MENOR mudança possível para testar
- Uma variável por vez
- Se não funcionou: nova hipótese, não empilhar mais fixes

### Fase 4: Implementação

- Criar teste que falha primeiro
- Implementar o fix na causa raiz (não no sintoma)
- Verificar que o teste passa
- Verificar que nenhum outro teste quebrou

## Se 3+ fixes falharam

Parar. Questionar a arquitetura. Discutir com o Pedro antes de tentar mais qualquer coisa.

## Red flags — PARAR e voltar à Fase 1

- "Quick fix por agora, investigar depois"
- "Só tentar mudar X e ver o que acontece"
- "Provavelmente é X, deixa eu corrigir"
- "Não entendo totalmente mas isso pode funcionar"
- Propor soluções antes de rastrear o fluxo de dados
- "Mais uma tentativa de fix" (quando já tentou 2+)
