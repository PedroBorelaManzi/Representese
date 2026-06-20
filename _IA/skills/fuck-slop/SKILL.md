---
name: fuck-slop
description: "Passa de de-slop em qualquer texto. Elimina vícios de escrita de IA — paralelismo negativo, vocabulário pomposo, regra de três, em-dash excessivo, ritmo uniforme — e reescreve até ficar limpo. Usar sempre que um texto precisar soar humano."
---

# Fuck Slop — Eliminar Vícios de Escrita de IA

Texto gerado por IA tem padrões reconhecíveis. Esse skill os encontra e elimina.

## Vícios que escaneia e remove

- **Paralelismo negativo**: "não é X, mas Y" — construção muito comum em IA
- **Vocabulário pomposo**: "abrangente", "robusto", "holístico", "sinergizar", "alavancar"
- **Regra de três automática**: listar sempre 3 itens sem necessidade real
- **Em-dash excessivo** — usado onde uma vírgula bastaria
- **Ritmo uniforme**: frases todas do mesmo tamanho, mesma cadência
- **Both-sidesing com hedge**: "por um lado... por outro lado... depende do contexto"
- **Aberturas genéricas**: "Com certeza!", "Ótima pergunta!", "Absolutamente!"

## Como funciona

Loop de scan → reescrita → rescan até o output estar limpo. Reescreve no nível do significado, não só troca palavras.

## Registros disponíveis

Especificar o registro alvo para reescrever no tom certo:
- artigo técnico
- post informal / reddit
- email profissional
- documentação
- marketing
- prompt para agente

## Regra do nosso projeto

Todo prompt gerado para o Antigravity passa por esse filtro mentalmente. Sem abertura pomposa, sem estrutura engessada, sem ritmo de IA. Direto, humano, natural.

## Exemplo

**Com slop:**
"Com certeza! Fico feliz em ajudar. É importante destacar que existem diversas abordagens holísticas para resolver esse problema de forma abrangente e robusta."

**Sem slop:**
"Tem três formas de resolver isso. A mais simples é X. Se precisar de mais controle, vai de Y."
