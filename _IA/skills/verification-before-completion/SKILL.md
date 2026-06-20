---
name: verification-before-completion
description: "Use antes de declarar qualquer tarefa como concluída, corrigida ou funcionando. Nunca fazer afirmações de sucesso sem evidência. Roda verificação primeiro, afirma depois."
---

# Verification Before Completion — Evidência Antes de Afirmar

## Lei de ferro

```
NENHUMA AFIRMAÇÃO DE CONCLUSÃO SEM EVIDÊNCIA FRESCA
```

Afirmar que está funcionando sem verificar é desonestidade, não eficiência.

## O gate

Antes de afirmar qualquer status:
1. **Identificar**: qual comando prova essa afirmação?
2. **Rodar**: executar o comando completo agora
3. **Ler**: output completo, checar exit code, contar falhas
4. **Verificar**: o output confirma a afirmação?
5. **Só então**: fazer a afirmação COM a evidência

## Exemplos

| Afirmação | Requer | Não é suficiente |
|---|---|---|
| "Testes passando" | Output do comando: 0 falhas | "Deveria passar" |
| "Build funcionando" | Build: exit 0 | Linter passou |
| "Bug corrigido" | Testar o sintoma original: passa | Código mudado |
| "Requisitos atendidos" | Checklist linha por linha | Testes passando |
| "Antigravity fez" | Ver o diff real do que mudou | Ele disse que fez |

## Red flags — PARAR

- Usar "deveria", "provavelmente", "parece que"
- Expressar satisfação antes de verificar ("Perfeito!", "Pronto!", "Feito!")
- Confiar no relatório do agente sem checar o diff
- Verificação parcial
- "Só dessa vez"

## Aplicar sempre antes de

- Qualquer afirmação de sucesso ou conclusão
- Commitar, criar PR, marcar tarefa como feita
- Passar para a próxima tarefa
- Devolver resultado ao Pedro
