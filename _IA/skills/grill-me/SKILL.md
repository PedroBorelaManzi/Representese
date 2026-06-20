---
name: grill-me
description: "Entrevista calibrada para testar planos, designs e decisões antes de implementar. Avalia primeiro o nível de conhecimento e pressão desejada, depois faz perguntas uma por vez do mais simples ao mais crítico."
---

# Grill Me — Pressão Calibrada Antes de Construir

Questionar o plano antes de codar. Descobrir os buracos antes que virem bugs.

## Como funciona

1. **Avaliar primeiro**: perguntar nível de conhecimento e quanta pressão quer
2. **Uma pergunta por vez**: do clarificatório ao modo de falha crítico
3. **Recomendar junto**: cada pergunta vem com resposta recomendada
4. **Escalar gradualmente**: começar suave, aumentar conforme confiança

## Níveis de conhecimento

- **Iniciante**: perguntas clarificatórias, sem jargão pesado
- **Trabalhando**: pressão moderada, assume familiaridade básica
- **Expert**: vai direto para casos de borda e falhas de arquitetura

## Níveis de pressão

- **Suave**: questionar pontos cegos gentilmente
- **Padrão**: pressão real mas construtiva
- **Duro**: modo advocacia do diabo, questionar tudo

## Quando usar no nosso projeto

Antes de qualquer decisão grande:
- Nova arquitetura ou refatoração
- Integração com serviço externo
- Mudança que afeta muitos arquivos
- Feature que parece simples mas pode ter implicações

## Exemplo de pergunta (nível padrão)

"Você mencionou usar localStorage para guardar o estado do pedido. Se o usuário abrir duas abas ao mesmo tempo, o que acontece com os dados?"
