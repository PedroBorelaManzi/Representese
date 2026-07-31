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
  created_at: string;
  client?: {
    id: string;
    name: string;
    cnpj: string;
    city?: string;
    state?: string;
  };
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
