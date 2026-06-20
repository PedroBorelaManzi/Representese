---
name: verificar-skills-primeiro
description: >
  Padrão de execução do projeto Represente-Se!. Sempre que Pedro der um comando
  ou pedir qualquer tarefa — criar arquivo, corrigir bug, criar componente,
  fazer pesquisa, gerar documento — antes de começar, verificar se existe
  alguma skill disponível que ajuda a executar aquela tarefa com mais qualidade.
  Use este padrão em TODOS os comandos recebidos, sem exceção.
---

# Verificar Skills Antes de Executar

Antes de executar qualquer tarefa pedida pelo Pedro, siga esta ordem:

## 1. Verifique as skills disponíveis

Pergunte-se: **existe alguma skill instalada que se aplica a esta tarefa?**

Exemplos de correspondência:
- Criar/editar arquivo Word → skill `docx`
- Criar/editar planilha Excel → skill `xlsx`
- Criar apresentação → skill `pptx`
- Criar ou ler PDF → skill `pdf`
- Agendar uma tarefa → skill `schedule`
- Criar uma nova skill → skill `skill-creator`
- Tarefa de design, UX, pesquisa → skills do plugin `design`

## 2. Se encontrar uma skill aplicável

Invoque a skill antes de qualquer outro passo. A skill vai carregar as instruções certas para aquela tarefa e garantir que o resultado seja de qualidade.

## 3. Se não encontrar skill aplicável

Execute normalmente seguindo os padrões do projeto (ver `_IA/padroes.md`).

## Por que isso importa

Skills existem para garantir consistência e qualidade. Ignorar uma skill disponível é desperdiçar uma ferramenta que já foi configurada especificamente para o projeto. O Pedro não deveria precisar lembrar de pedir — isso é responsabilidade de quem executa.
