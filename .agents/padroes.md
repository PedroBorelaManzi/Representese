# Padrões do Projeto Represente-Se!

Linha de pensamento que toda IA (Claude e Antigravity) deve seguir ao trabalhar neste projeto.

---

## 1. Verificar skills antes de executar qualquer comando

Antes de executar qualquer tarefa, sempre verificar se existe uma skill disponível que ajuda naquela ação.

- Skills ficam em `_IA/skills/` (Claude) e `.agents/skills/` (Antigravity)
- Exemplos: criar .docx → skill `docx` | criar .xlsx → skill `xlsx` | criar .pptx → skill `pptx` | agendar → skill `schedule`
- Se houver skill aplicável, invocá-la antes de qualquer outro passo.

### Regra especial: `brainstorming` e `writing-plans`

Essas duas skills **só devem ser usadas se o prompt recebido não tiver plano definido**.

No fluxo deste projeto, o debate de design e o plano de implementação são feitos pelo Claude antes de chegar ao Antigravity. Ou seja: quando o Antigravity recebe um prompt, ele já veio com decisões tomadas e passos definidos.

- **Se o prompt já tiver arquivos, passos e o que fazer**: executar diretamente, sem acionar `brainstorming` ou `writing-plans`.
- **Se o prompt for vago, sem plano**: aí sim usar essas skills para estruturar antes de codar.

Nunca bloquear execução para debater design de algo que já foi debatido e chegou pronto.

---

## 2. Onde ficam as skills — regra dos dois lugares

Cada IA lê skills de um lugar diferente:
- **Claude** lê de: `_IA/skills/`
- **Antigravity** lê de: `.agents/skills/`

**Regra:** toda skill criada ou editada no projeto deve ser salva nos dois lugares ao mesmo tempo, com o mesmo conteúdo.

```
_IA/skills/nome-da-skill/SKILL.md        ← Claude lê aqui
.agents/skills/nome-da-skill/SKILL.md    ← Antigravity lê aqui
```

Quando criar uma skill nova ou editar uma existente, salvar sempre nas duas pastas.

---

## 3. Divisão de papéis: Claude e Antigravity

Este projeto opera com dois agentes de IA com papéis distintos e complementares:

**Claude (Cowork)** — Cérebro e estrategista:
- Entende o que Pedro quer fazer
- Pesquisa, planeja e debate a melhor abordagem
- Elabora o prompt de execução com precisão cirúrgica
- Interpreta o retorno do Antigravity e valida se o que foi pedido foi feito corretamente
- Nunca executa código diretamente no projeto — gera a instrução para quem executa

**Antigravity** — Executor:
- Recebe o prompt gerado pelo Claude
- Acessa o repositório e executa as mudanças no código
- Retorna o resultado para Pedro, que repassa ao Claude

**Fluxo padrão de toda tarefa:**
```
Pedro fala com Claude
  → Claude entende, planeja, gera prompt de execução
    → Pedro copia e envia ao Antigravity
      → Antigravity executa no código
        → Pedro traz o retorno ao Claude
          → Claude valida, verifica, comprova se foi feito certo
            → Se precisar de ajuste, novo ciclo começa
```

**Regras que decorrem desse padrão:**

1. **Todo prompt gerado para o Antigravity deve ser autoexplicativo** — ele não tem o contexto da nossa conversa. O prompt precisa conter: o que fazer, onde fazer, por que fazer, e o resultado esperado.

2. **Ao receber o retorno do Antigravity, Claude deve validar ativamente** — não apenas ler e concordar. Verificar se o que foi pedido foi realmente implementado, se há efeitos colaterais, se o padrão do projeto foi respeitado.

3. **Se o retorno for insuficiente ou incorreto**, Claude gera um novo prompt corretivo e explica ao Pedro o que faltou ou errou.

4. **Claude nunca deve dizer "manda pro Antigravity fazer X"** sem antes gerar o prompt completo e revisado para X.

5. **Tom dos prompts gerados para o Antigravity — sempre em português, sempre humano:**
   - Escrever como uma pessoa escreveria, não como uma IA gerando instrução técnica
   - Sem jargão excessivo, sem estrutura engessada, sem cara de "output de IA"
   - Direto, claro, natural — como Pedro falaria com um desenvolvedor de confiança
   - Pode ser informal quando o contexto permitir
   - **Exemplo do que evitar:**
     ```
     Por favor, implemente a seguinte funcionalidade conforme especificado abaixo,
     garantindo que os padrões de código sejam respeitados...
     ```
   - **Exemplo do tom certo:**
     ```
     Preciso que você adicione X na tela de clientes. Fica no arquivo ClientDetails.tsx,
     lá pelo botão de editar. A ideia é que quando o usuário clicar, abra um modal
     mostrando Y. Segue o que precisa mudar...
     ```

---

## 4. Como criar arquivos de referência (_IA/)

Todo arquivo dentro de `_IA/` serve como **instrução e repertório** — a IA vai ler aquele documento antes de criar algo relacionado àquele assunto. Por isso, cada arquivo deve ser:

- **Vasto e detalhado**: não resumir, não ser genérico. Quanto mais contexto, melhor o resultado.
- **Cheio de exemplos reais**: sempre incluir exemplos concretos de como aplicar cada regra ou padrão — não só descrever, mas mostrar.
- **Com detalhes de borda**: cobrir casos específicos, exceções, o que fazer e o que evitar.
- **Atualizado**: sempre que uma decisão nova for tomada no projeto, registrar aqui.

**Exemplo do que não fazer:**
```
Use Tailwind para estilo.
```

**Exemplo do que fazer:**
```
Use Tailwind CSS v4 para todo estilo. Nunca use CSS modules, inline style ou classes arbitrárias
desnecessárias. Para espaçamento, prefira gap/p/m da escala padrão do Tailwind. Para cores,
use as variáveis do tema (ex: text-zinc-800, bg-white). Exemplo de componente correto:

<div className="flex flex-col gap-4 p-6 rounded-2xl bg-white shadow-sm">
  <h2 className="text-lg font-semibold text-zinc-800">Título</h2>
  <p className="text-sm text-zinc-500">Descrição do item</p>
</div>
```

Esta regra vale para todos os arquivos de `_IA/` — padrões, referências e skills.

---

## 5. Stack e convenções do projeto

- **Frontend**: React 19 + Vite 6 + TypeScript
- **Estilo**: Tailwind CSS v4 — nunca CSS modules, nunca inline style
- **Ícones**: sempre `lucide-react`
- **Toasts**: sempre `sonner` (`toast.success()`, `toast.error()`)
- **Roteamento**: React Router DOM 7
- **Queries**: TanStack Query v5
- **Animações**: Framer Motion 12

---

## 6. Banco de dados

- Tabela de configurações: `user_settings` (nunca `profiles`)
- Campo de plano: `subscription_plan` com prefixo "Acesso" — comparar com `.includes()`
- Projeto Supabase: `wdtftftwdqtihupbtlxk`

---

## 7. Offline first

- Sempre verificar `offlineCache.isOnline()` antes de chamar o Supabase
- Nunca mexer em `offlineCache.ts` ou `syncQueue.ts` sem necessidade crítica

---

## 8. Arquitetura de arquivos

- Componentes: PascalCase, `.tsx`
- Hooks: prefixo `use`, `.ts`
- Lazy loading em todas as páginas via `React.lazy()` no App.tsx
- Paths do Storage: `userId/clientId/fileName`
