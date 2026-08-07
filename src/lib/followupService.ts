import { supabase } from './supabase';

export interface ClientFollowupStatus {
  clientId: string;
  clientName: string;
  lastContact: string | null;
  daysSinceContact: number;
  nextFollowupDate: string | null;
  priority: 'urgent' | 'high' | 'medium' | 'low' | 'done';
  lastOrderDate: string | null;
  daysSinceLastOrder: number;
}

export interface FollowupLog {
  id: string;
  clientId: string;
  userId: string;
  contactDate: string;
  method: 'call' | 'email' | 'whatsapp' | 'visit' | 'other';
  notes: string;
  outcome: 'positive' | 'pending' | 'negative' | 'no_response';
  nextFollowup: string | null;
  createdAt: string;
}

const PRIORITY_CONFIG = {
  urgent: { days: 45, color: '#EF4444' },    // Red - 45+ days
  high: { days: 30, color: '#F59E0B' },      // Amber - 30-44 days
  medium: { days: 14, color: '#EAB308' },    // Yellow - 14-29 days
  low: { days: 0, color: '#6B7280' },        // Gray - Less than 14 days
  done: { days: -1, color: '#10B981' }       // Green - Recently contacted
};

/** Limiares do follow-up. Vêm das configurações do usuário (os mesmos da régua
 *  de inatividade); os números abaixo são só o padrão de quem nunca ajustou. */
export interface FollowupThresholds {
  alerta: number;
  critico: number;
  inativo: number;
}

const LIMIARES_PADRAO: FollowupThresholds = { alerta: 30, critico: 45, inativo: 90 };

export function calculateFollowupPriority(
  daysSinceContact: number,
  limiares: FollowupThresholds = LIMIARES_PADRAO
): 'urgent' | 'high' | 'medium' | 'low' | 'done' {
  if (daysSinceContact < 0) return 'done';
  if (daysSinceContact >= limiares.inativo) return 'urgent';
  if (daysSinceContact >= limiares.critico) return 'high';
  if (daysSinceContact >= limiares.alerta) return 'medium';
  return 'low';
}

export async function getClientFollowupStatus(
  userId: string,
  clientId: string,
  limiares: FollowupThresholds = LIMIARES_PADRAO
): Promise<ClientFollowupStatus | null> {
  const { data: client } = await supabase
    .from('clients')
    .select('id, name, last_contact, status')
    .eq('user_id', userId)
    .eq('id', clientId)
    .single();

  if (!client) return null;

  const { data: orders } = await supabase
    .from('orders')
    .select('created_at')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(1);

  const lastContact = client.last_contact ? new Date(client.last_contact) : null;
  const now = new Date();
  const daysSinceContact = lastContact
    ? Math.floor((now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const lastOrderDate = orders?.[0]?.created_at ? new Date(orders[0].created_at) : null;
  const daysSinceLastOrder = lastOrderDate
    ? Math.floor((now.getTime() - lastOrderDate.getTime()) / (1000 * 60 * 60 * 24))
    : 999;

  const priority = calculateFollowupPriority(daysSinceContact, limiares);

  // Calculate next followup date based on priority
  let nextFollowupDate: string | null = null;
  if (lastContact) {
    const nextDate = new Date(lastContact);
    if (priority === 'urgent') nextDate.setDate(nextDate.getDate() + 60);
    else if (priority === 'high') nextDate.setDate(nextDate.getDate() + 45);
    else if (priority === 'medium') nextDate.setDate(nextDate.getDate() + 30);
    else if (priority === 'low') nextDate.setDate(nextDate.getDate() + 14);

    if (nextDate > now) {
      nextFollowupDate = nextDate.toISOString().split('T')[0];
    }
  }

  return {
    clientId: client.id,
    clientName: client.name,
    lastContact: client.last_contact,
    daysSinceContact,
    nextFollowupDate,
    priority,
    lastOrderDate: orders?.[0]?.created_at || null,
    daysSinceLastOrder,
  };
}

export async function logClientFollowup(
  userId: string,
  clientId: string,
  method: FollowupLog['method'],
  notes: string,
  outcome: FollowupLog['outcome'],
  nextFollowup: string | null = null
): Promise<FollowupLog | null> {
  const { data, error } = await supabase
    .from('client_followup_logs')
    .insert({
      user_id: userId,
      client_id: clientId,
      contact_date: new Date().toISOString().split('T')[0],
      method,
      notes,
      outcome,
      next_followup: nextFollowup,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    console.error('Error logging followup:', error);
    return null;
  }

  // Update client's last_contact
  await supabase
    .from('clients')
    .update({ last_contact: new Date().toISOString().split('T')[0] })
    .eq('id', clientId)
    .eq('user_id', userId);

  return data as FollowupLog;
}

export async function getFollowupLogs(
  userId: string,
  clientId: string,
  limit: number = 10
): Promise<FollowupLog[]> {
  const { data } = await supabase
    .from('client_followup_logs')
    .select('*')
    .eq('user_id', userId)
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []) as FollowupLog[];
}

export async function getClientsNeedingFollowup(
  userId: string,
  priorityFilter?: 'urgent' | 'high' | 'medium' | 'low'
): Promise<ClientFollowupStatus[]> {
  const { data: clients } = await supabase
    .from('clients')
    .select('id, name, last_contact, status')
    .eq('user_id', userId)
    .eq('status', 'Ativo');

  if (!clients) return [];

  const followupStatuses = await Promise.all(
    clients.map(async (client) => {
      const status = await getClientFollowupStatus(userId, client.id);
      return status;
    })
  );

  const filtered = followupStatuses
    .filter(Boolean)
    .filter(s => !priorityFilter || s.priority === priorityFilter)
    .sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3, done: 4 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

  return filtered;
}

export async function scheduleFollowupReminder(
  userId: string,
  clientId: string,
  followupDate: string,
  reminderType: 'email' | 'notification' | 'both' = 'notification'
): Promise<boolean> {
  try {
    const { data: client } = await supabase
      .from('clients')
      .select('name, email')
      .eq('id', clientId)
      .eq('user_id', userId)
      .single();

    if (!client) return false;

    // Store reminder in a scheduled_reminders table (if it exists)
    // For now, we'll just return success - this can be extended
    // to send via email or trigger notifications

    return true;
  } catch (error) {
    console.error('Error scheduling followup reminder:', error);
    return false;
  }
}

export function getPriorityColor(priority: ClientFollowupStatus['priority']): string {
  return PRIORITY_CONFIG[priority]?.color || '#9CA3AF';
}

export function getPriorityLabel(priority: ClientFollowupStatus['priority']): string {
  const labels = {
    urgent: '🔴 Urgente',
    high: '🟠 Alta',
    medium: '🟡 Média',
    low: '⚪ Baixa',
    done: '✅ Atualizado'
  };
  return labels[priority];
}

export function getMethodLabel(method: FollowupLog['method']): string {
  const labels = {
    call: '📞 Chamada',
    email: '📧 E-mail',
    whatsapp: '💬 WhatsApp',
    visit: '👤 Visita',
    other: '📌 Outro'
  };
  return labels[method];
}

export function getOutcomeLabel(outcome: FollowupLog['outcome']): string {
  const labels = {
    positive: '✅ Positivo',
    pending: '⏳ Pendente',
    negative: '❌ Negativo',
    no_response: '🔇 Sem resposta'
  };
  return labels[outcome];
}
