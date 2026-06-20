---
name: junior-to-senior
description: "Revisão adversarial de planos e código. Trata o output atual como trabalho junior, constrói um revisor senior baseado em pesquisa do codebase e melhores práticas atuais, e reescreve em versão de nível staff engineer."
---

# Junior to Senior — Revisão Adversarial

Pegar o que o agente produziu e elevar ao nível que um engenheiro senior experiente produziria.

## O que faz

1. Trata o output atual como trabalho de um desenvolvedor junior
2. Pesquisa o codebase para entender padrões existentes
3. Pesquisa melhores práticas atuais (além do training cutoff)
4. Diagnostica falhas de altitude: planos vagos nas partes difíceis ou detalhistas demais sem visão de produto
5. Reescreve com interfaces comprometidas, versões específicas e modos de falha mapeados
6. Mostra claramente o delta entre versão original e versão melhorada

## Falhas de altitude que detecta

- **Muito alto**: "adicionar autenticação" sem especificar como, onde, com qual biblioteca
- **Muito baixo**: detalhes de implementação sem considerar implicações de produto
- **Hand-waving**: "tratar erros adequadamente" sem mostrar o quê e como
- **Decisões silenciosas**: produto inventado sem perguntar ao Pedro

## Quando usar no nosso projeto

- Antes de enviar um plano grande pro Antigravity
- Quando o Antigravity retornou algo que "funciona" mas parece imaturo
- Em decisões de arquitetura que vão durar
- Code review de features críticas

## Output esperado

- Tabela: problema encontrado | impacto | correção sugerida
- Versão reescrita do plano/código
- Perguntas abertas que precisam de decisão do Pedro antes de implementar
