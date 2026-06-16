# Represente-Me!

Represente-Me! é uma plataforma SaaS para Representantes Comerciais, projetada para gerenciar carteiras de clientes, orquestrar visitas territoriais com mapas interativos, buscar CNPJs automaticamente, processar pedidos com IA e fornecer um dashboard financeiro completo.

## Funcionalidades Principais

- **Gestão de Clientes e CRM**: Base unificada com mapa territorial, histórico e roteirização.
- **Busca de CNPJ Automática**: Enriquecimento de dados de CNPJ para empresas.
- **Leitura Inteligente de Pedidos**: Processamento em nuvem usando IA (Gemini) para extrair SKUs e valores.
- **Dashboard Financeiro**: Gráficos dinâmicos de faturamento por empresa.
- **Agenda Inteligente**: Sincronização bidirecional com Google Calendar.

## Stack Tecnológico

- **Frontend**: React (Vite), Tailwind CSS, Framer Motion, Lucide React, React Query.
- **Backend**: Supabase (PostgreSQL, Auth, Edge Functions).
- **Mapas**: Leaflet, React-Leaflet.
- **Inteligência Artificial**: Google Gemini API.
- **Pagamentos**: Asaas.

## Como Executar Localmente

**Pré-requisitos:** Node.js (v18+)

1. Clone o repositório e instale as dependências:
   `ash
   npm install
   `
2. Configure as variáveis de ambiente baseadas no .env.example.
3. Inicie o servidor de desenvolvimento:
   `ash
   npm run dev
   `

## Deploy

As Edge Functions devem ser deployadas no Supabase via:
`ash
npx supabase functions deploy
`