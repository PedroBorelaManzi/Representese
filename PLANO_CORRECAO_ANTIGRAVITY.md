# 🛠️ PLANO DE CORREÇÃO — representese.com
**Versão:** 1.0 — 16 de Junho de 2026  
**Base:** Auditoria completa (AUDITORIA_COMPLETA_ANTIGRAVITY.md)  
**Stack:** React 19 + Vite + Tailwind + Supabase + Vercel  

---

## 📐 VISÃO GERAL DA ORQUESTRAÇÃO

O plano está dividido em **4 Fases** ordenadas por dependência técnica e impacto no usuário. Cada fase deve ser concluída e testada antes de avançar para a próxima.

```
FASE 1 — Fundação (bugs que afetam múltiplas telas)
  └── BUG #11: Hit area dos modais + ESC
  └── BUG #18: State de Configurações

FASE 2 — Fluxos Críticos de Negócio
  └── BUG #8: Editar Cadastro de Cliente
  └── BUG #10: Cards de resumo Empresas & Pedidos

FASE 3 — Identidade e Conversão
  └── BUG #7: Âncoras da landing page
  └── BUG #2: FAQ accordion
  └── BUG #17: Plano atual errado em /planos
  └── UX #4: Scroll inicial da página de registro
  └── UX #5: Badge de desconto anual

FASE 4 — Polimento e Feedback
  └── UX #9: Toast em ATUALIZAR DOSSIÊ
  └── UX #12: Campo Telefone enganoso
  └── UX #14: VER TODOS OS PLANOS para usuário MASTER
```

---

## ━━━ FASE 1 — FUNDAÇÃO ━━━
> Corrigir primeiro porque afeta múltiplos componentes. Qualquer correção feita nas fases seguintes depende desses elementos funcionando.

---

### 🔴 TAREFA 1.1 — BUG #11: Corrigir hit area dos botões X dos modais + fechar com ESC

**Prioridade:** CRÍTICA  
**Impacto:** Todos os modais do app  
**Esforço estimado:** Médio (2–4h)

#### Contexto técnico
Os botões X (fechar) dos modais possuem área de clique DOM deslocada da posição visual. Clicar no X visualmente não dispara o evento. A tecla ESC também não fecha nenhum modal.

#### Arquivos prováveis a modificar
```
src/components/modals/          ← todos os arquivos de modal
src/components/ui/Modal.tsx     ← componente base (se existir)
src/components/ui/Button.tsx    ← botão genérico
```

#### Diagnóstico antes de codar
1. Abrir DevTools → inspecionar o botão X de qualquer modal
2. Verificar se há `transform: translateY(...)` ou `position: absolute` no elemento pai
3. Verificar se o modal usa `overflow: hidden` no container
4. Verificar z-index da camada do botão X vs overlay

#### Correções a implementar

**A) Corrigir o hit area do botão X:**
```tsx
// ❌ Problema comum — botão dentro de container com transform
<div style={{ transform: 'translateY(-50%)' }}>
  <button onClick={onClose}>X</button>
</div>

// ✅ Solução — posicionar o botão de forma independente
<button
  onClick={onClose}
  className="absolute top-4 right-4 z-50 p-2 rounded-full hover:bg-gray-100"
  aria-label="Fechar"
>
  <X size={20} />
</button>
```

**B) Implementar ESC em TODOS os modais:**
```tsx
// Criar hook reutilizável: src/hooks/useModalEsc.ts
import { useEffect } from 'react';

export function useModalEsc(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose, enabled]);
}

// Uso em cada modal:
export function MeuModal({ onClose }: { onClose: () => void }) {
  useModalEsc(onClose);
  // ...
}
```

**C) Fechar clicando no backdrop/overlay:**
```tsx
// No overlay do modal
<div
  className="fixed inset-0 bg-black/50 z-40"
  onClick={onClose}  // ← adicionar este onClick
>
  <div
    className="modal-content"
    onClick={(e) => e.stopPropagation()}  // ← impedir que feche ao clicar dentro
  >
    {/* conteúdo do modal */}
  </div>
</div>
```

#### Critério de aceite
- [ ] Clicar no X visual fecha o modal em TODOS os modais do app
- [ ] Pressionar ESC fecha o modal em todos os modais
- [ ] Clicar fora do modal (no backdrop) fecha o modal
- [ ] Testar especificamente: modal de EDITAR REGISTRO (calendário), modal de pedido em EMPRESAS & PEDIDOS, modal de CONFIGURAÇÕES

---

### 🔴 TAREFA 1.2 — BUG #18: Corrigir navegação "um passo atrás" em Configurações

**Prioridade:** CRÍTICA  
**Impacto:** Modal de CONFIGURAÇÕES DE PERFIL  
**Esforço estimado:** Baixo (30min–1h)

#### Contexto técnico
Ao clicar em uma seção do menu lateral do modal de Configurações (APARÊNCIA, SEGURANÇA, CELULAR/APP), o painel direito exibe o conteúdo da seção anterior. Requer dois cliques para ver o conteúdo correto. APARÊNCIA nunca exibe nada por ser a primeira.

**Causa-raiz:** O componente lê `activeSection` no mesmo render em que `setActiveSection` é chamado. Como `useState` é assíncrono, o render atual ainda usa o valor antigo.

#### Arquivo a modificar
```
src/components/settings/ConfiguracoesModal.tsx  (ou nome similar)
src/components/modals/SettingsModal.tsx
```

#### Diagnóstico
Procurar padrão como:
```tsx
// ❌ Padrão com bug
const [activeSection, setActiveSection] = useState('perfil');

const handleSectionClick = (section: string) => {
  setActiveSection(section);
  renderContent(activeSection); // ← usa valor ANTIGO (stale closure)
};
```

#### Correção
```tsx
// ✅ Opção 1 — Deixar o JSX derivar do state (forma correta em React)
// O conteúdo deve ser renderizado DIRETAMENTE do state no JSX,
// não calculado num handler.

const [activeSection, setActiveSection] = useState('perfil');

// No JSX:
<div className="settings-content">
  {activeSection === 'perfil' && <PerfilSection />}
  {activeSection === 'aparencia' && <AparenciaSection />}
  {activeSection === 'seguranca' && <SegurancaSection />}
  {activeSection === 'celular' && <CelularSection />}
</div>

// Handler simples, sem lógica:
const handleSectionClick = (section: string) => {
  setActiveSection(section); // só isso — o JSX reage automaticamente
};
```

```tsx
// ✅ Opção 2 — Se houver lógica adicional no handler, usar useEffect
useEffect(() => {
  // lógica que depende de activeSection atualizado
  renderContent(activeSection);
}, [activeSection]); // ← dispara APÓS o re-render com o novo valor
```

#### Critério de aceite
- [ ] Clicar em APARÊNCIA → exibe conteúdo de aparência imediatamente (1 clique)
- [ ] Clicar em SEGURANÇA → exibe conteúdo de segurança imediatamente
- [ ] Clicar em CELULAR/APP → exibe conteúdo de celular/app imediatamente
- [ ] Navegar entre seções múltiplas vezes sem defasagem

---

## ━━━ FASE 2 — FLUXOS CRÍTICOS DE NEGÓCIO ━━━
> Corrigir após Fase 1 porque esses bugs impedem fluxos que os usuários executam diariamente.

---

### 🔴 TAREFA 2.1 — BUG #8: Corrigir "EDITAR CADASTRO" → tela em branco

**Prioridade:** CRÍTICA  
**Impacto:** `/dashboard/clientes/{uuid}` — impossível editar clientes  
**Esforço estimado:** Médio-Alto (3–6h, depende da causa)

#### Contexto técnico
Ao clicar em "EDITAR CADASTRO" na ficha de um cliente, a tela fica em branco e o app redireciona para `/dashboard/clientes`. O formulário de edição nunca é exibido.

#### Possíveis causas (investigar nesta ordem)

**Causa A — Rota não existe:**
```tsx
// Verificar em src/router.tsx ou src/App.tsx
// Se não existir rota para edição, criar:
<Route path="/dashboard/clientes/:id/editar" element={<EditarClientePage />} />
```

**Causa B — Erro não tratado no componente:**
```tsx
// O componente tenta acessar cliente.nome antes do fetch completar
// Adicionar loading state e null check:
if (!cliente) return <LoadingSpinner />;
```

**Causa C — Navegação passando ID incorreto:**
```tsx
// Verificar o onClick do botão EDITAR CADASTRO
// ❌ Bug comum:
navigate(`/dashboard/clientes/${cliente.id}/editar`);
// Se cliente.id for undefined → navega para /dashboard/clientes/undefined/editar
// que pode não ter match na rota e redirecionar para /dashboard/clientes

// ✅ Garantir que o ID existe:
if (!cliente?.id) return;
navigate(`/dashboard/clientes/${cliente.id}/editar`);
```

#### Arquivos a investigar
```
src/router.tsx (ou App.tsx)            ← verificar se rota existe
src/pages/clientes/[id]/index.tsx      ← botão EDITAR CADASTRO
src/pages/clientes/[id]/editar.tsx     ← componente de edição (pode não existir)
src/hooks/useCliente.ts                ← hook de busca do cliente
```

#### Implementação do formulário de edição (se rota não existir)
```tsx
// src/pages/clientes/EditarCliente.tsx
export function EditarClientePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { cliente, loading, error } = useCliente(id);

  if (loading) return <LoadingSpinner />;
  if (error || !cliente) {
    navigate('/dashboard/clientes');
    return null;
  }

  const handleSubmit = async (data: ClienteFormData) => {
    await updateCliente(id, data);
    toast.success('Cadastro atualizado com sucesso ✓');
    navigate(`/dashboard/clientes/${id}`);
  };

  return <ClienteForm initialData={cliente} onSubmit={handleSubmit} />;
}
```

#### Critério de aceite
- [ ] Clicar em "EDITAR CADASTRO" na ficha de qualquer cliente abre formulário de edição
- [ ] Formulário vem pré-preenchido com dados atuais do cliente
- [ ] Salvar alterações → toast de sucesso → retorna para ficha do cliente
- [ ] Cancelar → retorna para ficha do cliente sem salvar
- [ ] Testar com pelo menos 3 clientes diferentes

---

### 🟠 TAREFA 2.2 — BUG #10: Corrigir cards de resumo em Empresas & Pedidos

**Prioridade:** IMPORTANTE  
**Impacto:** `/dashboard/empresas` — métricas enganosas ao filtrar empresa  
**Esforço estimado:** Baixo-Médio (1–3h)

#### Contexto técnico
Ao selecionar uma empresa (ex: COZIMAX), os pedidos do painel direito filtram corretamente. Mas os cards FATURAMENTO MÊS, PEDIDOS MÊS e PEDIDOS HOJE continuam mostrando totais de todas as empresas.

#### Arquivo a modificar
```
src/pages/empresas/EmpresasPedidos.tsx  (ou nome similar)
src/components/empresas/ResumoCards.tsx
```

#### Diagnóstico
Procurar onde os cards calculam seus valores. Provavelmente ignoram o `selectedEmpresa`:
```tsx
// ❌ Calcula sobre todos os pedidos, ignora filtro
const faturamentoMes = pedidos.reduce((acc, p) => acc + p.valor, 0);
const pedidosMes = pedidos.length;
```

#### Correção
```tsx
// ✅ Filtrar antes de calcular
const pedidosFiltrados = selectedEmpresa
  ? pedidos.filter(p => p.empresaId === selectedEmpresa.id)
  : pedidos;

const faturamentoMes = pedidosFiltrados.reduce((acc, p) => acc + p.valor, 0);
const pedidosMes = pedidosFiltrados.length;
const pedidosHoje = pedidosFiltrados.filter(p => isToday(p.data)).length;
```

#### Reatividade — garantir que os cards são reativos ao state
```tsx
// Os cards devem receber os valores já calculados como props
// ou recalcular quando selectedEmpresa muda via useMemo:
const resumo = useMemo(() => {
  const filtrados = selectedEmpresa
    ? pedidos.filter(p => p.empresaId === selectedEmpresa.id)
    : pedidos;
  return {
    faturamentoMes: filtrados.reduce((acc, p) => acc + p.valor, 0),
    pedidosMes: filtrados.length,
    pedidosHoje: filtrados.filter(p => isToday(p.data)).length,
  };
}, [pedidos, selectedEmpresa]);
```

#### Critério de aceite
- [ ] Selecionar COZIMAX → cards mostram apenas faturamento/pedidos da COZIMAX
- [ ] Deselecionar empresa (clicar novamente) → cards voltam ao total geral
- [ ] Trocar de empresa → cards atualizam imediatamente
- [ ] Verificar em diferentes meses (Maio e Junho 2026)
- [ ] PEDIDOS HOJE deve mostrar 0 para meses passados (Maio 2026)

---

## ━━━ FASE 3 — IDENTIDADE E CONVERSÃO ━━━
> Landing page e fluxo de cadastro/planos — afetam conversão de novos usuários.

---

### 🔴 TAREFA 3.1 — BUG #7: Corrigir âncoras da landing page

**Prioridade:** CRÍTICA  
**Impacto:** `/` (landing) — navegação completamente quebrada  
**Esforço estimado:** Muito Baixo (15–30min)

#### Contexto técnico
Os links TECNOLOGIA, PLANOS e DÚVIDAS no navbar todos fazem scroll para `#industrias`. As âncoras das seções estão erradas ou os hrefs do navbar estão errados.

#### Arquivo a modificar
```
src/components/landing/Navbar.tsx       ← links de navegação
src/components/landing/LandingPage.tsx  ← IDs das seções
src/pages/landing/index.tsx
```

#### Diagnóstico e correção

**Passo 1 — Verificar IDs das seções no HTML:**
```tsx
// Identificar quais IDs as seções realmente têm hoje:
<section id="industrias">   ← isso está correto?
<section id="tecnologia">   ← existe?
<section id="planos">       ← existe?
<section id="duvidas">      ← existe?
```

**Passo 2 — Corrigir hrefs no Navbar:**
```tsx
// ❌ Atual (todos apontam para #industrias)
<a href="#industrias">TECNOLOGIA</a>
<a href="#industrias">PLANOS</a>
<a href="#industrias">DÚVIDAS</a>

// ✅ Correto
<a href="#tecnologia">TECNOLOGIA</a>
<a href="#planos">PLANOS</a>
<a href="#duvidas">DÚVIDAS</a>
```

**Passo 3 — Garantir que as seções têm os IDs corretos:**
```tsx
<section id="tecnologia">  {/* deve corresponder ao href */}
<section id="planos">
<section id="duvidas">
```

#### Critério de aceite
- [ ] Clicar em TECNOLOGIA → scroll até seção de tecnologia
- [ ] Clicar em PLANOS → scroll até seção de planos
- [ ] Clicar em DÚVIDAS → scroll até seção de dúvidas
- [ ] Testar em mobile (navbar pode ser diferente)

---

### 🟠 TAREFA 3.2 — BUG #2: Corrigir FAQ accordion sem respostas

**Prioridade:** IMPORTANTE  
**Impacto:** `/` (landing) — visitante não obtém respostas  
**Esforço estimado:** Baixo (30min–1h)

#### Contexto técnico
Os itens do FAQ expandem (animação funciona) mas o texto da resposta não aparece.

#### Arquivo a modificar
```
src/components/landing/FAQ.tsx
src/data/faq.ts (ou similar)
src/constants/landing.ts
```

#### Diagnóstico
```tsx
// Verificar 1: O array de FAQ tem o campo de resposta populado?
const faqItems = [
  { pergunta: "Como funciona?", resposta: "" },  // ← resposta vazia?
  { question: "Como funciona?", answer: "" },     // ← nome do campo diferente?
];

// Verificar 2: O componente está renderizando o campo correto?
// ❌ Usando campo errado
{isOpen && <p>{item.answer}</p>}  // mas o dado está em item.resposta

// ✅ Correto
{isOpen && <p>{item.resposta}</p>}
```

#### Correção A — Se dados estão vazios: Popular o array de FAQ
```tsx
// src/data/faq.ts
export const faqItems = [
  {
    pergunta: "O Represente-me funciona para qualquer segmento?",
    resposta: "Sim! O sistema foi desenvolvido para representantes comerciais de qualquer segmento — alimentos, indústria, varejo, atacado e mais."
  },
  {
    pergunta: "Preciso instalar algum programa?",
    resposta: "Não. O Represente-me funciona 100% no navegador e também tem app para iOS e Android, sem necessidade de instalação de software adicional."
  },
  // ... demais perguntas
];
```

#### Correção B — Se campo está com nome errado no componente: Alinhar nomes
```tsx
// Garantir que o componente usa o mesmo nome de campo que o dado
{isOpen && (
  <div className="faq-answer">
    <p>{item.resposta || item.answer || item.description}</p>
  </div>
)}
```

#### Critério de aceite
- [ ] Clicar em cada item do FAQ → exibe texto de resposta
- [ ] Fechar item → resposta some
- [ ] Abrir dois itens → verificar se comportamento é correto (um por vez ou múltiplos)
- [ ] Verificar em mobile

---

### 🔴 TAREFA 3.3 — BUG #17: Corrigir identificação de plano atual em /planos

**Prioridade:** CRÍTICA  
**Impacto:** `/planos` — badge "PLANO ATUAL" aparece no card errado  
**Esforço estimado:** Baixo (30min–1h)

#### Contexto técnico
Usuário com plano `master` no banco vê o badge "PLANO ATUAL" no card EXCLUSIVO (plano mais barato). O card MASTER mostra "TESTE 7 DIAS GRÁTIS".

**Causa provável:** A comparação usa índice do array (0 = EXCLUSIVO) em vez do slug/nome do plano.

#### Arquivo a modificar
```
src/pages/planos/Planos.tsx
src/components/planos/PlanCard.tsx
src/hooks/useSubscription.ts  (ou useUser.ts)
```

#### Diagnóstico
```tsx
// ❌ Usando índice — ERRADO
const currentPlanIndex = 0; // hardcoded ou bugado
plans[currentPlanIndex].isCurrentPlan = true;

// ❌ Comparando string errada
const isCurrentPlan = user.plan === plan.name; 
// se user.plan = "master" e plan.name = "MASTER" → false (case sensitive!)
```

#### Correção
```tsx
// ✅ Comparar slug de forma case-insensitive
const isCurrentPlan = (planSlug: string): boolean => {
  return user?.plan?.toLowerCase() === planSlug?.toLowerCase();
};

// Uso no componente de card:
<PlanCard
  plan={plan}
  isCurrentPlan={isCurrentPlan(plan.slug)}  // ex: plan.slug = "master"
/>

// No PlanCard:
{isCurrentPlan ? (
  <Badge variant="success">PLANO ATUAL</Badge>
) : user?.plan === 'master' && plan.slug !== 'master' ? (
  null  // usuário MASTER não vê botão de upgrade para planos menores
) : (
  <Button>ASSINAR AGORA</Button>
)}
```

#### Verificar o valor exato de user.plan no banco
```sql
-- Rodar no Supabase para confirmar o valor exato
SELECT plan, status FROM profiles WHERE email = 'pedroborelamanzi@gmail.com';
-- Resultado esperado: plan = 'master', status = 'active'
```

#### Correção adicional — UX #14 (resolvida junto)
```tsx
// Para usuário MASTER, mostrar mensagem especial em vez de botões de upgrade
{user?.plan === 'master' && (
  <p className="text-sm text-green-600 font-medium">
    Você já está no melhor plano! 🎉
  </p>
)}
```

#### Critério de aceite
- [ ] Login com conta MASTER → badge "PLANO ATUAL" aparece no card MASTER
- [ ] Cards EXCLUSIVO e PROFISSIONAL mostram botão "ASSINAR AGORA" (downgrade não faz sentido, considerar ocultar)
- [ ] Card MASTER mostra "Você já está no melhor plano" em vez de "TESTE 7 DIAS GRÁTIS"
- [ ] Testar com conta de plano EXCLUSIVO (deve marcar EXCLUSIVO)
- [ ] Testar sem login (nenhum card deve ter badge "PLANO ATUAL")

---

### 🟡 TAREFA 3.4 — UX #4: Corrigir scroll inicial da página de registro

**Prioridade:** UX  
**Impacto:** `/register` — página carrega já scrollada  
**Esforço estimado:** Muito Baixo (5–10min)

#### Correção
```tsx
// src/pages/register/Register.tsx (ou index.tsx)
import { useEffect } from 'react';

export function RegisterPage() {
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, []);
  
  // ...
}
```

#### Critério de aceite
- [ ] Acessar `/register` → página inicia no topo (header visível)
- [ ] Funciona tanto vindo do navbar da landing quanto acessando diretamente

---

### 🟡 TAREFA 3.5 — UX #5: Corrigir badge de desconto no toggle Anual

**Prioridade:** UX  
**Impacto:** `/register` e `/planos` — badge e preço "De R$X" não atualizam  
**Esforço estimado:** Baixo (30min–1h)

#### Contexto técnico
Ao alternar para "Anual", o preço principal muda mas o badge "25% DE DESCONTO LANÇAMENTO" e a tag "De R$134" permanecem estáticos.

#### Arquivo a modificar
```
src/components/planos/PlanCard.tsx
src/pages/planos/Planos.tsx
src/pages/register/Register.tsx
```

#### Correção
```tsx
// Garantir que badge e preço "De" são reativos ao toggle
interface PlanCardProps {
  plan: Plan;
  isAnual: boolean;  // ← receber o estado do toggle como prop
}

export function PlanCard({ plan, isAnual }: PlanCardProps) {
  const precoMensal = plan.precoMensal;      // ex: 197
  const precoAnual = plan.precoAnual;         // ex: 147.75 (25% off)
  const precoAtual = isAnual ? precoAnual : precoMensal;
  
  const descontoPercentual = isAnual
    ? Math.round((1 - precoAnual / precoMensal) * 100)
    : 0;

  return (
    <div>
      {isAnual && descontoPercentual > 0 && (
        <Badge>{descontoPercentual}% DE DESCONTO</Badge>
      )}
      
      {isAnual && (
        <span className="line-through text-gray-400">
          De R${precoMensal}
        </span>
      )}
      
      <span className="text-3xl font-bold">
        R${precoAtual.toFixed(0)}
      </span>
    </div>
  );
}
```

#### Critério de aceite
- [ ] Toggle Mensal → sem badge de desconto, sem "De R$X" riscado
- [ ] Toggle Anual → badge "X% DE DESCONTO" aparece, "De R$X" riscado aparece
- [ ] Alternar múltiplas vezes → UI atualiza corretamente em cada alternância
- [ ] Verificar nos 3 cards (EXCLUSIVO, PROFISSIONAL, MASTER)

---

## ━━━ FASE 4 — POLIMENTO E FEEDBACK ━━━
> Melhorias de UX que aumentam confiança do usuário no sistema.

---

### 🟡 TAREFA 4.1 — UX #9: Adicionar toast de sucesso em "ATUALIZAR DOSSIÊ"

**Prioridade:** UX  
**Impacto:** `/dashboard/clientes/{uuid}` — sem feedback ao salvar  
**Esforço estimado:** Muito Baixo (15–30min)

#### Arquivo a modificar
```
src/pages/clientes/ClienteDetail.tsx
src/components/clientes/DossieSection.tsx
```

#### Correção
```tsx
// Encontrar a função que salva o dossiê e adicionar toast:
const handleAtualizarDossie = async () => {
  try {
    setLoading(true);
    await updateDossie(clienteId, dossieContent);
    toast.success('Dossiê atualizado com sucesso ✓');  // ← adicionar
  } catch (error) {
    toast.error('Erro ao atualizar dossiê. Tente novamente.');
  } finally {
    setLoading(false);
  }
};
```

#### Critério de aceite
- [ ] Clicar em "ATUALIZAR DOSSIÊ" → toast verde "Dossiê atualizado com sucesso ✓" aparece
- [ ] Toast desaparece automaticamente após ~3 segundos
- [ ] Em caso de erro → toast vermelho de erro

---

### 🟡 TAREFA 4.2 — UX #12: Corrigir campo Telefone "Disponível no CNPJ"

**Prioridade:** UX  
**Impacto:** `/dashboard/clientes/{uuid}` — texto enganoso  
**Esforço estimado:** Muito Baixo (15–30min)

#### Arquivo a modificar
```
src/components/clientes/InfoContatoCard.tsx
src/pages/clientes/ClienteDetail.tsx
```

#### Correção
```tsx
// ❌ Atual
<InfoItem label="Telefone" value="Disponível no CNPJ" />

// ✅ Opção A — Se telefone está no banco, exibir
<InfoItem
  label="Telefone"
  value={cliente.telefone || 'Não informado'}
/>

// ✅ Opção B — Se realmente vem da consulta CNPJ, ser mais claro
<InfoItem
  label="Telefone"
  value={cliente.telefone || 'Buscar via CNPJ'}
  // E transformar em botão que faz a consulta, se implementado
/>
```

#### Critério de aceite
- [ ] Se cliente tem telefone no banco → exibe o número
- [ ] Se cliente não tem telefone → exibe "Não informado" (não "Disponível no CNPJ")

---

## 📋 CHECKLIST FINAL DE QA

Após todas as fases, executar o checklist completo de regressão:

### Landing page
- [ ] Navbar: todos os 4 links levam às seções corretas
- [ ] FAQ: todos os itens expandem E mostram resposta
- [ ] CTA principal leva para /register
- [ ] Página carrega no topo

### Registro e Planos
- [ ] `/register` carrega no topo, formulário visível
- [ ] Toggle Mensal/Anual atualiza preços E badges
- [ ] Usuário autenticado MASTER vê plano correto em /planos

### Dashboard — Clientes
- [ ] EDITAR CADASTRO abre formulário de edição corretamente
- [ ] ATUALIZAR DOSSIÊ exibe toast de sucesso
- [ ] Campo Telefone exibe valor correto

### Dashboard — Empresas & Pedidos
- [ ] Selecionar empresa filtra tanto pedidos quanto cards de resumo
- [ ] Navegação de meses funciona
- [ ] Deselecionar empresa restaura totais

### Modais (todos)
- [ ] Botão X fecha o modal
- [ ] ESC fecha o modal
- [ ] Clique no backdrop fecha o modal

### Configurações
- [ ] APARÊNCIA → exibe conteúdo no primeiro clique
- [ ] SEGURANÇA → exibe conteúdo no primeiro clique
- [ ] CELULAR/APP → exibe conteúdo no primeiro clique
- [ ] LIMPAR CACHE → toast de sucesso (já funcionava, verificar regressão)

---

## 📊 RESUMO DE ESFORÇO

| Fase | Tarefas | Esforço Total Estimado |
|------|---------|------------------------|
| Fase 1 — Fundação | 2 tarefas | 3–5h |
| Fase 2 — Fluxos de Negócio | 2 tarefas | 4–9h |
| Fase 3 — Identidade e Conversão | 5 tarefas | 2–4h |
| Fase 4 — Polimento | 2 tarefas | 1–2h |
| **Total** | **11 tarefas** | **10–20h** |

---

## 🚀 PROMPT PRONTO PARA O ANTIGRAVITY

Copiar e colar no Antigravity para iniciar as correções:

---

```
Preciso que você corrija uma série de bugs e melhorias no projeto representese.com 
(React 19 + Vite + Tailwind + Supabase). Siga o plano abaixo em ordem — cada fase 
depende da anterior. Após cada tarefa, confirme o que foi feito antes de avançar.

━━━ FASE 1 — FUNDAÇÃO ━━━

TAREFA 1.1 — BUG #11 (GLOBAL): Os botões X (fechar) de todos os modais do app 
têm hit area deslocada da posição visual — clicar no X visualmente não funciona. 
Além disso, ESC não fecha nenhum modal.
Ações:
1. Criar hook reutilizável `useModalEsc(onClose)` em src/hooks/useModalEsc.ts
2. Aplicar o hook em todos os componentes de modal do app
3. Corrigir o posicionamento CSS do botão X (verificar transform/z-index no pai)
4. Adicionar onClick no backdrop para fechar ao clicar fora, com stopPropagation no conteúdo

TAREFA 1.2 — BUG #18: Configurações de Perfil (modal) renderiza o conteúdo da 
seção anterior ao clique. Clicar em APARÊNCIA mostra nada (sem seção anterior); 
clicar em SEGURANÇA mostra MEU PERFIL. Requer dois cliques para ver o conteúdo correto.
Ação: Garantir que o JSX derive diretamente do state activeSection, sem intermediário 
que capture valor stale. A renderização condicional deve estar no JSX, não em handler.

━━━ FASE 2 — FLUXOS CRÍTICOS ━━━

TAREFA 2.1 — BUG #8: Botão "EDITAR CADASTRO" na ficha do cliente 
(/dashboard/clientes/{uuid}) causa tela em branco e redireciona para /dashboard/clientes.
Ações:
1. Verificar se existe rota /dashboard/clientes/:id/editar no router
2. Se não existe, criar a rota e o componente de formulário de edição
3. Garantir que o cliente é carregado antes de montar o formulário (loading state)
4. Após salvar: toast de sucesso + navegar de volta para /dashboard/clientes/{uuid}

TAREFA 2.2 — BUG #10: Na tela Empresas & Pedidos (/dashboard/empresas), ao 
selecionar uma empresa específica, os pedidos filtram corretamente MAS os 3 cards 
de resumo (FATURAMENTO MÊS, PEDIDOS MÊS, PEDIDOS HOJE) continuam mostrando totais 
de todas as empresas.
Ação: Os valores dos cards devem ser calculados via useMemo dependendo de 
[pedidos, selectedEmpresa]. Quando selectedEmpresa não é null, filtrar pedidos 
por empresa antes de somar.

━━━ FASE 3 — LANDING E PLANOS ━━━

TAREFA 3.1 — BUG #7: Os links TECNOLOGIA, PLANOS e DÚVIDAS no navbar da landing 
page todos fazem scroll para #industrias em vez de suas seções.
Ação: Corrigir os href dos links no componente do navbar para apontar para os IDs 
corretos das seções (#tecnologia, #planos, #duvidas). Garantir que as seções têm esses IDs.

TAREFA 3.2 — BUG #2: Os itens do FAQ na landing page expandem visualmente mas 
não exibem texto de resposta.
Ação: Verificar se o array de dados tem as respostas populadas e se o componente 
referencia o campo correto. Se o campo estiver vazio, popular com conteúdo real.

TAREFA 3.3 — BUG #17: Em /planos, usuário com plano "master" no banco vê o badge 
"PLANO ATUAL" no card EXCLUSIVO (mais barato). O card MASTER mostra "TESTE 7 DIAS GRÁTIS".
Ação: A comparação deve ser user.plan.toLowerCase() === plan.slug.toLowerCase(). 
Verificar o valor exato da coluna `plan` na tabela profiles. Para usuário MASTER, 
exibir "Você já está no melhor plano!" em vez de botão de trial.

TAREFA 3.4 — UX #4: A página /register carrega já scrollada para baixo, ocultando 
o header. 
Ação: Adicionar window.scrollTo({ top: 0, behavior: 'instant' }) em useEffect no 
componente da página.

TAREFA 3.5 — UX #5: O toggle Mensal/Anual em /planos muda o preço mas o badge 
"X% DE DESCONTO" e o "De R$X" riscado não aparecem/atualizam.
Ação: Tornar o badge e o preço "De" reativos ao estado do toggle (isAnual prop).

━━━ FASE 4 — POLIMENTO ━━━

TAREFA 4.1 — UX #9: Botão "ATUALIZAR DOSSIÊ" em /dashboard/clientes/{uuid} 
não exibe nenhum feedback após salvar.
Ação: Adicionar toast.success('Dossiê atualizado com sucesso ✓') no handler de sucesso.

TAREFA 4.2 — UX #12: Campo Telefone nas informações de contato do cliente exibe 
"Disponível no CNPJ" em vez do número real ou "Não informado".
Ação: Exibir cliente.telefone se existir, caso contrário exibir "Não informado".

Após todas as fases, rodar o checklist de regressão completo descrito no arquivo 
PLANO_CORRECAO_ANTIGRAVITY.md.
```
