# 🔍 AUDITORIA COMPLETA — representese.com
**Data:** 16 de Junho de 2026  
**Auditor:** Claude (Cowork)  
**Escopo:** Todas as páginas, botões, submenus, modais e widgets do app

---

## 🚨 BUGS CRÍTICOS (quebram funcionalidade)

---

### BUG #2 — FAQ accordion não exibe respostas (Landing Page)
**Página:** `/` (landing page)  
**Descrição:** Os itens do FAQ expandem visualmente (seta rotaciona, espaço abre) mas nenhum texto de resposta aparece. O conteúdo está vazio ou não está sendo renderizado.  
**Impacto:** Visitante não consegue obter respostas às dúvidas frequentes.  
**Correção sugerida:** Verificar se o conteúdo das respostas está populado no CMS/array de dados e se o componente accordion renderiza o children corretamente.

---

### BUG #7 — Links de navegação da landing apontam para âncora errada
**Página:** `/` (landing page)  
**Descrição:** Os links TECNOLOGIA, PLANOS e DÚVIDAS no navbar da landing page todos fazem scroll para `#industrias` em vez de suas seções corretas (`#tecnologia`, `#planos`, `#duvidas`).  
**Impacto:** Navegação da landing completamente quebrada — todos os links de menu levam ao mesmo lugar.  
**Correção sugerida:** Corrigir os `href` dos links no componente de navegação da landing. Verificar se as seções têm os IDs corretos.

---

### BUG #8 — "EDITAR CADASTRO" causa tela em branco e redirect
**Página:** `/dashboard/clientes/{uuid}`  
**Descrição:** Ao clicar em "EDITAR CADASTRO" na ficha de um cliente, a tela fica em branco e o app redireciona para `/dashboard/clientes` (lista de clientes). O formulário de edição nunca aparece.  
**Impacto:** Impossível editar dados de clientes existentes.  
**Correção sugerida:** Verificar a rota de edição. Provavelmente a rota `/dashboard/clientes/{uuid}/editar` não existe ou o componente de edição tem erro não tratado. Adicionar error boundary e verificar se o estado do cliente é carregado antes de montar o formulário.

---

### BUG #10 — Cards de resumo não filtram ao isolar empresa em Empresas & Pedidos
**Página:** `/dashboard/empresas`  
**Descrição:** Ao clicar em uma empresa específica (ex: COZIMAX), o painel de pedidos filtra corretamente mostrando apenas os pedidos daquela empresa. Porém, os 3 cards de resumo no topo (**FATURAMENTO MÊS**, **PEDIDOS MÊS**, **PEDIDOS HOJE**) continuam exibindo os valores totais consolidados de todas as empresas, sem refletir o filtro.  
**Reprodução:**
1. Ir para Empresas & Pedidos
2. Selecionar um mês com vendas (ex: Maio 2026)
3. Clicar em "COZIMAX" (R$ 84.590,66 — apenas uma das empresas)
4. Observar que FATURAMENTO MÊS ainda mostra R$ 104.307,60 (total de todas)
**Impacto:** Métricas do topo são enganosas quando uma empresa está isolada.  
**Correção sugerida:** Os cards de resumo devem reagir ao `selectedEmpresa` state. Quando uma empresa está selecionada, calcular faturamento/pedidos apenas daquela empresa.

---

### BUG #11 — Botões X dos modais têm target de clique visual deslocado do DOM
**Páginas:** Todos os modais do app (EMPRESAS & PEDIDOS, EDITAR REGISTRO no calendário, etc.)  
**Descrição:** O botão X (fechar) dos modais não responde a cliques por coordenadas visuais — o elemento DOM está deslocado de sua posição visual. ESC também não fecha os modais. É necessário usar click programático via referência DOM para fechar.  
**Impacto:** Usuário não consegue fechar modais clicando no X visual. Precisa usar o botão de confirmação/cancelar dentro do modal ou navegar para outra página.  
**Correção sugerida:** Verificar z-index, position e transform CSS nos botões X. Provavelmente um elemento pai com `transform` ou `overflow: hidden` está deslocando o hit area. Garantir que `onKeyDown` para ESC está implementado em todos os modais.

---

### BUG #17 — Página /planos mostra "PLANO ATUAL" no card errado
**Página:** `/planos`  
**Descrição:** Para usuário com plano MASTER, o badge "PLANO ATUAL" aparece no card **EXCLUSIVO** (R$ 97/mês), que é o plano mais básico. O card MASTER mostra "TESTE 7 DIAS GRÁTIS" como se o usuário não tivesse o plano.  
**Impacto:** Grave problema de UX — usuário pagante vê que está no plano errado. Pode gerar suporte desnecessário ou confusão sobre qual plano tem.  
**Causa provável:** A lógica de comparação de planos provavelmente usa índice do array (0) em vez do nome/slug do plano para marcar "plano atual". Ex: `plans[0]` em vez de `plans.find(p => p.slug === user.plan)`.  
**Correção sugerida:** Comparar o `plan` do usuário (que é `master` no banco) com o `slug` ou `id` de cada card de plano. Ex:
```js
const isCurrentPlan = (planSlug) => user.plan === planSlug;
```

---

### BUG #18 — Configurações: navegação entre seções renderiza conteúdo "um passo atrás"
**Página:** Modal CONFIGURAÇÕES DE PERFIL  
**Descrição:** Ao clicar nas seções do menu lateral do modal de configurações (APARÊNCIA, SEGURANÇA, CELULAR/APP), o painel direito exibe o conteúdo da seção **anterior** ao clique, não da seção atual. É necessário clicar duas vezes na mesma seção para ver seu conteúdo.  
**Impacto específico:**
- APARÊNCIA: nunca exibe conteúdo (é a primeira seção clicada, sem seção anterior)
- SEGURANÇA: exibe MEU PERFIL na primeira vez
- CELULAR/APP: exibe SEGURANÇA na primeira vez, CELULAR/APP na segunda
**Causa provável:** State de `activeSection` está sendo atualizado com delay ou usando valor stale do closure. Provável uso de `useState` com callback desatualizado.  
**Correção sugerida:**
```js
// Problema: usando valor stale
setActiveSection(section); // correto
// O render usa activeSection antes do re-render
// Solução: garantir que o componente re-renderiza antes de consultar activeSection
// Ou usar useEffect para sincronizar o conteúdo com a seção ativa
```

---

## ⚠️ PROBLEMAS DE UX / MELHORIAS

---

### UX #4 — Página de registro carrega scrollada para os planos
**Página:** `/register`  
**Descrição:** Ao carregar `/register`, a página já está scrollada para a seção de cards de planos, ocultando o header e formulário de cadastro que ficam acima.  
**Correção:** Adicionar `window.scrollTo(0, 0)` no `useEffect` de montagem do componente da página de registro.

---

### UX #5 — Toggle Anual na página de planos não atualiza badge de desconto
**Página:** `/register` e `/planos`  
**Descrição:** Ao alternar para "Anual", o preço muda mas a tag "De R$134" e o badge "25% DE DESCONTO LANÇAMENTO" não atualizam para refletir o novo desconto anual.  
**Correção:** Tornar o badge e o "De" price reativos ao estado do toggle (mensal/anual).

---

### UX #9 — "ATUALIZAR DOSSIÊ" sem feedback visual de sucesso
**Página:** `/dashboard/clientes/{uuid}`  
**Descrição:** Ao clicar em "ATUALIZAR DOSSIÊ" (salvar observações estratégicas do cliente), não aparece nenhum toast/snackbar de confirmação. O usuário não sabe se a operação foi bem-sucedida.  
**Correção:** Exibir toast de sucesso "Dossiê atualizado com sucesso ✓" após salvar, similar ao toast de "Cache offline removido com sucesso!" que já existe na tela de CELULAR/APP.

---

### UX #12 — Campo Telefone exibe "Disponível no CNPJ" (enganoso)
**Página:** `/dashboard/clientes/{uuid}`  
**Descrição:** No card de INFORMAÇÕES DE CONTATO, o campo Telefone exibe "Disponível no CNPJ" em vez do número de telefone real. Isso sugere que o telefone poderia ser buscado da Receita Federal mas não está sendo exibido — ou é texto placeholder confuso.  
**Correção:** Se o número de telefone está disponível no banco, exibir o número real. Se não está, usar "Não informado" em vez de "Disponível no CNPJ" que induz o usuário a pensar que é um link/ação.

---

### UX #14 — "VER TODOS OS PLANOS" em MINHA ASSINATURA não destaca plano correto
**Página:** Modal CONFIGURAÇÕES → MINHA ASSINATURA  
**Descrição:** O botão "VER TODOS OS PLANOS" navega para `/planos`, mas além do BUG #17 (plano errado marcado), para usuário MASTER não há nenhuma indicação clara de "você já tem o melhor plano". O botão leva a uma página que mostra "TESTE 7 DIAS GRÁTIS" no card MASTER do próprio usuário.  
**Correção:** Para usuário MASTER, o botão poderia mostrar "GERENCIAR ASSINATURA" diretamente, ou a página `/planos` deve detectar o plano atual e exibir "SEU PLANO ATUAL" no card correto. (Resolvido junto com BUG #17.)

---

## 📋 FUNCIONALIDADES VERIFICADAS E FUNCIONANDO ✅

- **INÍCIO**: Calendário semanal carrega, eventos do Google Calendar sincronizados
- **INÍCIO**: Setas < > do calendário navegam corretamente (via DOM, target visual desalinhado)
- **INÍCIO**: Botão + NOVO abre modal de agendamento
- **INÍCIO**: Clique em evento do calendário abre modal "EDITAR REGISTRO" com todos os campos
- **INÍCIO**: Widget FATURAMENTO POR EMPRESA renderiza chart com dados das empresas
- **INÍCIO**: Setas do chart FATURAMENTO e calendário estão sincronizadas (navegam o mesmo período)
- **INÍCIO**: Widget ANOTAÇÕES persiste texto (sincronizado na nuvem)
- **INÍCIO**: Widget TAREFAS — botão + adiciona tarefas, campo funciona
- **MAPA DE CLIENTES**: Mapa OpenStreetMap/Leaflet carrega com todos os 405 pins
- **MAPA DE CLIENTES**: Zoom In (+) e Zoom Out (-) funcionam
- **MAPA DE CLIENTES**: Fullscreen (⤢) expande o mapa; botão compress retorna ao normal
- **MAPA DE CLIENTES**: Clique em pin abre popup com nome, CNPJ, endereço, últimas compras
- **MAPA DE CLIENTES**: Popup do pin tem botão PERFIL → navega para ficha do cliente ✅
- **MAPA DE CLIENTES**: Botão 405 PONTOS é informativo (badge de contagem)
- **MAPA DE CLIENTES**: Botão ATIVOS filtra clientes ativos no mapa
- **MAPA DE CLIENTES**: Barra de busca "BUSCAR CLIENTE OU ENDEREÇO" presente
- **MAPA DE CLIENTES**: Botão "ADICIONAR CLIENTES" presente
- **MEUS CLIENTES**: Lista de clientes carrega, busca/filtro funciona
- **MEUS CLIENTES**: Ficha do cliente renderiza com informações de contato, dossiê, documentos
- **EMPRESAS & PEDIDOS**: Navegação de meses < > funciona (via DOM ref)
- **EMPRESAS & PEDIDOS**: Ao mudar mês, dados de faturamento e pedidos atualizam corretamente
- **EMPRESAS & PEDIDOS**: Isolar empresa filtra pedidos no painel direito ✅
- **EMPRESAS & PEDIDOS**: Botão ENVIAR PEDIDOS presente e clicável
- **MINHA AGENDA**: Carrega eventos do Google Calendar integrado
- **MINHA AGENDA**: Filtro de compromissos por texto funciona em tempo real
- **MINHA AGENDA**: Botão "NOVO AGENDAMENTO" abre modal completo
- **CONFIGURAÇÕES**: MEU PERFIL — exibe foto, nome editável, e-mail (readonly), botão SALVAR
- **CONFIGURAÇÕES**: MINHA ASSINATURA — exibe plano, status, benefícios, botões de ação
- **CONFIGURAÇÕES**: SEGURANÇA — exibe ALTERAR SENHA, AUTENTICAÇÃO BIOMÉTRICA, 2FA (requer 2 cliques)
- **CONFIGURAÇÕES**: CELULAR/APP — LIMPAR CACHE funciona com toast de confirmação ✅
- **CONFIGURAÇÕES**: SAIR DA CONTA presente no menu
- **/planos**: Página carrega com 3 planos (EXCLUSIVO R$97, PROFISSIONAL R$147, MASTER R$197)
- **/planos**: Toggle Mensal/Anual presente
- **/planos**: SUPORTE FINANCEIRO → abre WhatsApp API corretamente

---

## 🛠️ RESUMO PRIORIZADO PARA CORREÇÃO

### PRIORIDADE 1 — Crítico (quebra funcionalidade core)
1. **BUG #8** — EDITAR CADASTRO → tela em branco
2. **BUG #7** — Nav links da landing page todos apontam para âncora errada
3. **BUG #17** — Página /planos mostra plano atual errado para usuário MASTER
4. **BUG #11** — Botões X dos modais: target visual deslocado do DOM + ESC não funciona

### PRIORIDADE 2 — Importante (afeta experiência significativa)
5. **BUG #10** — Cards de resumo não filtram ao isolar empresa
6. **BUG #18** — Configurações: "um passo atrás" na navegação entre seções
7. **BUG #2** — FAQ accordion sem respostas na landing

### PRIORIDADE 3 — UX (melhoria de qualidade)
8. **UX #9** — ATUALIZAR DOSSIÊ sem feedback de sucesso
9. **UX #12** — Campo Telefone com texto enganoso
10. **UX #4** — Registro carrega scrollado para planos
11. **UX #5** — Toggle anual não atualiza badge de desconto
12. **UX #14** — VER TODOS OS PLANOS não destaca plano correto (ligado ao BUG #17)

---

## 🏗️ MELHORIAS SUGERIDAS (além dos bugs)

1. **Toast de sucesso global**: Implementar sistema de toasts consistente em toda a aplicação. Atualmente existe para LIMPAR CACHE mas não para ATUALIZAR DOSSIÊ e outras ações de salvar.

2. **ESC para fechar modais**: Implementar `useEffect` global com listener de `keydown` para `Escape` em todos os modais do app. Referência:
```js
useEffect(() => {
  const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
  document.addEventListener('keydown', handleEsc);
  return () => document.removeEventListener('keydown', handleEsc);
}, [onClose]);
```

3. **Clique no backdrop fecha modal**: Adicionar `onClick` no overlay/backdrop de todos os modais para fechar ao clicar fora.

4. **Botões X dos modais — corrigir hit area**: Os botões X têm hit area deslocada do visual. Verificar se há `transform: translate` ou `position: absolute` mal configurado nos botões. Considerar aumentar o padding do botão para melhorar a área clicável.

5. **Aparência (tema dark/light)**: A seção APARÊNCIA nas configurações está implementada no menu mas nunca exibe conteúdo (parte do BUG #18 do estado). Quando corrigido, garantir que há toggle light/dark mode funcional.

6. **Página /planos para usuário autenticado MASTER**: Ao clicar "VER TODOS OS PLANOS" sendo MASTER, o ideal é mostrar mensagem "Você já está no plano máximo" e esconder botões de upgrade/trial.

7. **Performance do mapa**: Cliques na área vazia do mapa às vezes causam freeze temporário do renderer do Chrome. Verificar se há event listeners muito pesados sendo executados sincronamente no click handler do Leaflet.

8. **Sincronização Calendário ↔ Chart FATURAMENTO**: O chart de Faturamento por Empresa e o calendário semanal estão sincronizados no mesmo período. Verificar se isso é intencional — pode ser confuso ter o calendário semanal mudando de mês ao navegar o chart financeiro.
