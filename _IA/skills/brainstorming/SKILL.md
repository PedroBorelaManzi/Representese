---
name: brainstorming
description: "Use ANTES de qualquer feature nova, componente, ou mudança de comportamento. Explora intenção, requisitos e design antes de implementar. Nunca escrever código sem passar por isso primeiro."
---

# Brainstorming — Do Ideia ao Design

Transformar ideias em designs e specs completos via diálogo colaborativo.

## HARD GATE

Não invocar nenhuma skill de implementação, não escrever código, não scaffoldar nada até apresentar um design e o Pedro aprovar. Isso vale para TODO projeto, mesmo os "simples".

## Processo

1. **Entender o contexto** — checar arquivos, docs, estado atual do projeto
2. **Fazer perguntas uma por vez** — foco em propósito, restrições e critério de sucesso
3. **Propor 2-3 abordagens** — com trade-offs e recomendação clara
4. **Apresentar design em seções** — pedir aprovação a cada seção
5. **Escrever design doc** — salvar em `docs/specs/YYYY-MM-DD-<tema>.md`
6. **Revisão** — checar contradições, ambiguidades, escopo
7. **Pedir revisão do Pedro** — só avançar após aprovação explícita
8. **Invocar writing-plans** — para criar o plano de implementação

## Princípios

- Uma pergunta por mensagem
- Preferir múltipla escolha quando possível
- YAGNI: remover tudo que não é necessário agora
- Explorar alternativas antes de decidir
- Validação incremental: apresentar, aprovar, avançar

## Quando usar

Sempre que Pedro pedir:
- Nova funcionalidade ou tela
- Mudança de comportamento existente
- Novo componente ou integração
- Qualquer coisa que envolva decisão de design
