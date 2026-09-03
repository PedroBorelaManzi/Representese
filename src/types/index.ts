export interface Alert {
  company: string;
  type: 'Todos' | 'Alerta' | 'Crítico' | 'Inativo';
  days: number;
  /** Data (ISO) da compra que este alerta está considerando — usada para "ignorar" o aviso. */
  lastOrderAt?: string;
}

export interface Client {
  id: string;
  name: string;
  cnpj: string;
  city?: string;
  state?: string;
  address?: string;
  status?: string;
  last_contact?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string;
  lat?: number | null;
  lng?: number | null;
  phone?: string;
  email?: string;
  notes?: string;
  faturamento?: Record<string, number> | null;
  alerts?: Alert[];
  /** Nome da rede (matriz + filiais que compram por um lugar só) — cadastros com o mesmo nome de rede compartilham a atividade de compra nos alertas de inatividade. */
  network_name?: string | null;
  /** Nome fantasia / apelido comercial (BrasilAPI). `name` é a razão social. */
  nome_fantasia?: string | null;
}

export interface Order {
  id: string;
  user_id: string;
  client_id: string;
  category: string;
  value: number;
  file_name?: string;
  file_path?: string;
  description?: string;
  source?: string;
  intake_link_label?: string;
  created_at: string;
  /** Área "Entregas" — todos opcionais, preenchidos depois do lançamento do pedido. */
  delivery_date?: string | null;
  /** Texto livre sobre como/quando a entrega foi combinada — complementa delivery_date. */
  delivery_schedule?: string | null;
  nf_number?: string | null;
  /** Controle de baixa da comissão dessa NF — null = ainda não definido. */
  nf_commission_status?: "atrasado" | "pendente" | "confirmado" | null;
  /** Data de faturamento — também é a data-base usada pra calcular o vencimento das parcelas. */
  invoice_date?: string | null;
  /** Condição de pagamento em dias a partir da data-base, ex.: "30/60/90". Vazio/null = à vista (1 parcela só). */
  payment_terms?: string | null;
  /** Observações livres do pedido — aparecem direto no card, sem abrir o pedido. */
  notes?: string | null;
  client?: {
    id: string;
    name: string;
    cnpj: string;
    city?: string;
    state?: string;
  };
}

/** Parcela de pagamento de um pedido — gerada automaticamente por um trigger
 *  no banco a partir de `Order.payment_terms` (ver migração
 *  add_order_delivery_and_installments), editável individualmente depois. */
export interface OrderInstallment {
  id: string;
  order_id: string;
  user_id: string;
  installment_number: number;
  due_date: string;
  value: number;
  created_at?: string;
  updated_at?: string;
}

export interface Appointment {
  id: string;
  title: string;
  time: string;
  date: string;
  client_id?: string;
  google_event_id?: string;
  user_id: string;
  created_at?: string;
}

/** Item do catálogo de produtos de uma representada — cadastrado de uma vez
 *  (upload de planilha/PDF) ou item a item, independente de já ter sido
 *  vendido em algum pedido (diferente de order_items). */
export interface CatalogItem {
  id: string;
  user_id: string;
  category: string;
  name: string;
  code?: string | null;
  unit_type: "unidade" | "caixa";
  price?: number | null;
  discount_pct?: number | null;
  commission_pct?: number | null;
  created_at?: string;
  updated_at?: string;
}

export interface UserSettings {
  id: string;
  user_id: string;
  is_admin?: boolean;
}

export interface UserEvent {
  id: string;
  user_id: string;
  event_type: string;
  route?: string;
  duration_seconds?: number;
  metadata?: Record<string, any>;
  created_at: string;
}
