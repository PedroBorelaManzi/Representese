---
name: context-canary
description: "Sistema de alerta precoce para sessões longas. Detecta quando o agente começa a perder o fio das instruções por contexto degradado. Instala sinal por turno que morre visivelmente quando a atenção deriva."
---

# Context Canary — Alerta de Degradação de Contexto

Sessões longas apodrecem em silêncio. O agente começa a ignorar instruções, esquecer padrões, repetir erros já corrigidos. Isso detecta quando isso começa a acontecer.

## Como funciona

Instala um sinal estável no início de cada turno: nome do usuário, contador de turno, e auto-checagem honesta do contexto. Se o agente perder o fio — por compactação, truncamento ou drift de atenção — o sinal morre visivelmente antes de o output ficar ruim.

## Protocolo de recuperação quando o sinal dispara

1. **Checkpoint** — salvar estado atual em arquivo
2. **Re-ancorar** — reler instruções do projeto (CLAUDE.md, padroes.md)
3. **Sessão fresca** — iniciar nova sessão com contexto limpo em vez de continuar degradando

## Quando usar

- Sessões que duram mais de 1-2 horas
- Quando o agente começa a "esquecer" padrões que já foram definidos
- Quando respostas começam a parecer genéricas demais
- Antes de tarefas críticas em sessão longa

## Sinais de que o contexto está degradando

- Agente ignora padrões do projeto que foram definidos
- Respostas voltam a ter "cara de IA" mesmo com a regra anti-slop
- Agente propõe soluções que contradizem decisões já tomadas
- Erros já corrigidos voltam a aparecer
