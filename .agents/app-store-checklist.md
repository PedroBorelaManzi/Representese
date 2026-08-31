# Publicação na App Store — Represente-Se!

Estado: **aguardando aprovação do Apple Developer Program** (2h a 2 dias).

---

## ✅ Já feito (28/ago/2026)

- `npm run build` + `npx cap sync ios` — web assets atualizados em `ios/App/App/public`
- `MARKETING_VERSION` = `1.75` (Debug + Release), alinhado ao Android
- `CURRENT_PROJECT_VERSION` = `1` (primeiro build iOS)
- `TARGETED_DEVICE_FAMILY` = `1` — **somente iPhone** (era iPhone+iPad)
- `Info.plist`: `ITSAppUsesNonExemptEncryption = false` (evita a pergunta de criptografia a cada upload; app só usa HTTPS/TLS padrão)
- Build de teste no simulador: **BUILD SUCCEEDED**
- Ícone 1024×1024 sem canal alpha ✅ · permissões (localização, Face ID, câmera, fotos) já descritas em PT ✅ · URL scheme `com.representese.app` para OAuth ✅

Arquivos alterados (precisam ser commitados): `ios/App/App.xcodeproj/project.pbxproj`, `ios/App/App/Info.plist`

---

## ⏳ Passo 0 — quando a conta for aprovada

1. Xcode → Settings → Accounts → seu Apple ID → botão ⟳ (Download Manual Profiles)
2. Confirmar que aparece o time pago (não "Personal Team")
3. Anotar o **Team ID** (10 caracteres) — me passar para eu setar `DEVELOPMENT_TEAM` no projeto

---

## Passo 1 — App Store Connect (site)

https://appstoreconnect.apple.com → My Apps → **+** → New App

- Plataforma: iOS
- Nome: `Represente-Se!` (ou o que estiver livre)
- Idioma primário: Português (Brasil)
- Bundle ID: `com.representese.app` (selecionar da lista; se não aparecer, criar em developer.apple.com → Identifiers)
- SKU: `representese-ios-001` (livre)
- Acesso total

---

## Passo 2 — Configurar assinatura (eu faço + você confirma no Xcode)

- Eu seto `DEVELOPMENT_TEAM` no `project.pbxproj`
- Abrir `ios/App/App.xcodeproj` no Xcode → target **App** → aba **Signing & Capabilities**
  - ✅ Automatically manage signing
  - Team: seu time pago
  - Verificar que "Provisioning Profile" resolve sem erro vermelho

---

## Passo 3 — Archive e upload (Xcode Organizer)

1. Topo do Xcode: seletor de destino → **Any iOS Device (arm64)**
2. Menu **Product → Archive** (demora alguns minutos)
3. Abre o **Organizer** → seleciona o archive → **Distribute App**
4. **App Store Connect → Upload** → next, next → **Upload**
5. Aguardar e-mail "processamento concluído" (~5–30 min)

---

## Passo 4 — Ficha da loja (site, enquanto processa)

### Screenshots (obrigatório — só iPhone agora)
- **iPhone 6.9"** (1320×2868) OU **6.7"** (1290×2796) — mínimo 1, máximo 10
- Tirar no Simulador: iPhone 16 Pro Max → app rodando → ⌘S salva no Desktop
- Telas boas: Agenda/Início, CRM de clientes, Mapa, Assistente IA, Comissões

### Textos
- Subtítulo (30 caracteres)
- Descrição (o que é o SaaS, para representantes comerciais)
- Palavras-chave (100 caracteres, separadas por vírgula): `representante,comercial,vendas,CRM,pedidos,comissão,clientes,agenda`
- URL de suporte: `https://www.representese.com` (ou página de contato)
- URL de marketing (opcional)
- **URL de política de privacidade**: _(você tem — colar aqui)_

### App Privacy (nutrition labels)
Declarar o que coleta e para quê:
- Localização (precisa) → funcionalidade do app, não rastreamento
- Informações de contato (e-mail, nome) → funcionalidade / conta
- Conteúdo do usuário (clientes, pedidos, fotos) → funcionalidade
- Identificadores → se PostHog/Sentry coletam; conferir
- Nada é usado para rastreamento entre apps (ATT não necessário)

### Outros campos
- Categoria: **Business** (primária)
- Classificação etária: preencher questionário → provavelmente 4+
- Preço: **Grátis** (assinatura é cobrada no site, fora da App Store)
- Direitos autorais: `2026 Pedro Borela Manzi`
- Informações de contato do revisor: nome, telefone, e-mail
- **Conta de demonstração para o revisor**: criar login de teste com dados de exemplo e informar usuário/senha (a Apple recusa se não conseguir entrar)

---

## Passo 5 — Enviar para revisão

- Selecionar a build processada na seção "Build"
- "Add for Review" → responder export compliance (já resolvido pelo Info.plist → deve pular ou responder "No")
- **Submit for Review**
- Primeira revisão: normalmente 24–48h

---

## ⚠️ Riscos de rejeição a resolver ANTES de enviar

1. **Exclusão de conta (Guideline 5.1.1v)** — app com criação de conta PRECISA ter caminho claro para o usuário **excluir a conta** de dentro do app (ou link direto). Verificar se existe em Configurações. Se não, é rejeição garantida.
2. **Login com Apple (Guideline 4.8)** — só é obrigatório se o único login social for Google. Como há e-mail/senha (`/register`), **não é exigido**. OK.
3. **Pagamento externo (Guideline 3.1.1)** — o app **não pode** ter botão/link levando o usuário a assinar fora da App Store. Se a tela de Planos dentro do app tiver "Assine no site" ou checkout web, isso é rejeição. Opções: (a) remover a menção a compra no app iOS, ou (b) implementar In-App Purchase (Apple fica com 15–30%). **Decidir isso.**
4. **Conta de teste** — sempre fornecer, senão rejeita por "não conseguimos avaliar".

---

## Envios futuros

A cada nova versão: subir `CURRENT_PROJECT_VERSION` (+1) e, se mudar features, `MARKETING_VERSION`. Depois `npm run build` → `npx cap sync ios` → Archive → Upload.
