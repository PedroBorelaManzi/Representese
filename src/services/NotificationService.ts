import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';
import { computeClientAlerts, OrderLike, DismissalLike, ClientRef, AlertLike } from '../lib/clientAlerts';

export type NotificationType =
  | 'appointment_reminder'
  | 'client_followup'
  | 'client_alert'
  | 'weekly_summary'
  | 'installment_due'
  | 'subscription_renewal';

interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, string>;
  scheduleTime?: Date;
}

export class NotificationService {
  private static readonly NOTIFICATION_ID_RANGES = {
    appointment_reminder: 2000,
    client_followup: 3000,
    client_alert: 4000,
    weekly_summary: 5000,
    installment_due: 6000,
    subscription_renewal: 7000,
  };

  static async initialize() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Request permissions
      const permStatus = await LocalNotifications.requestPermissions();
      if (permStatus.display !== 'granted') return;

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Schedule appointment reminders
      this.scheduleAppointmentReminders(user.id);

      // Schedule client follow-up reminders
      this.scheduleClientFollowupReminders(user.id);

      // Schedule weekly summary notification
      this.scheduleWeeklySummary(user.id);

      // Schedule commission installment due-date reminders
      this.scheduleInstallmentReminders(user.id);

      // Schedule subscription renewal reminder
      this.scheduleSubscriptionRenewalReminder(user.id);

      // Handle notification taps when app is active
      await LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
        this.handleNotificationTap(action);
      });
    } catch (error) {
      console.error('Error initializing NotificationService:', error);
    }
  }

  private static async scheduleAppointmentReminders(userId: string) {
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = tomorrow.toISOString().split('T')[0];

      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, title, time, client_id')
        .eq('user_id', userId)
        .eq('date', tomorrowStr);

      if (appointments && appointments.length > 0) {
        const notifications = appointments.map((app, index) => {
          const scheduleDate = new Date();
          scheduleDate.setDate(scheduleDate.getDate() + 1);
          scheduleDate.setHours(8, 0, 0, 0);

          const notificationId = this.NOTIFICATION_ID_RANGES.appointment_reminder + index;

          return {
            id: notificationId,
            type: 'appointment_reminder' as NotificationType,
            title: '📅 Lembrete de Visita',
            body: `Você tem uma visita amanhã: ${app.title} às ${app.time}`,
            scheduleTime: scheduleDate,
            data: {
              appointmentId: app.id,
              clientId: app.client_id,
            },
          };
        });

        for (const notif of notifications) {
          await this.sendNotification(notif);
        }
      }
    } catch (error) {
      console.error('Error scheduling appointment reminders:', error);
    }
  }

  // Usa o MESMO motor de alerta do CRM (computeClientAlerts — Empresas,
  // Relatórios, Assistente IA) em vez de `client.last_contact` direto: esse
  // campo só muda em ação manual de follow-up e fica desencontrado de quem
  // realmente comprou, então a notificação apontava cliente errado ou não
  // respeitava os limites de dias configurados por cada usuário (Alerta/
  // Crítico/Inativo, ajustáveis na barra lateral). Sem essa troca a notificação
  // e a tela do app podiam discordar sobre quem está "esfriando".
  private static async scheduleClientFollowupReminders(userId: string) {
    try {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('alerta_days, critico_days, inativo_days, categories')
        .eq('user_id', userId)
        .maybeSingle();

      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, network_name')
        .eq('user_id', userId)
        .eq('status', 'Ativo');

      if (!clients || clients.length === 0) return;

      const { data: orders } = await supabase
        .from('orders')
        .select('client_id, file_name, created_at, category, file_path')
        .eq('user_id', userId);

      const { data: dismissalsRaw } = await supabase
        .from('alert_dismissals')
        .select('client_name_key, company, last_order_at')
        .eq('user_id', userId);

      const dismissals: DismissalLike[] = (dismissalsRaw || []).map(d => ({
        clientNameKey: d.client_name_key,
        company: d.company,
        lastOrderAt: d.last_order_at,
      }));

      const thresholds = {
        alerta: settings?.alerta_days ?? 30,
        critico: settings?.critico_days ?? 45,
        inativo: settings?.inativo_days ?? 90,
      };

      const alertsByClient = computeClientAlerts(
        clients as ClientRef[],
        (orders || []) as OrderLike[],
        thresholds,
        settings?.categories || [],
        Date.now(),
        dismissals
      );

      // Achata cliente+alerta, prioriza Inativo > Crítico > Alerta e, dentro
      // do mesmo nível, quem está parado há mais tempo — é o que mais merece
      // um toque, não faz sentido avisar de 5 "Alerta" se há "Inativo" sobrando.
      const severity: Record<AlertLike['type'], number> = { Inativo: 3, Crítico: 2, Alerta: 1 };
      const flattened: { clientId: string; clientName: string; alert: AlertLike }[] = [];
      for (const client of clients) {
        const alerts = alertsByClient.get(client.id)?.alerts || [];
        for (const alert of alerts) {
          flattened.push({ clientId: client.id, clientName: client.name || 'cliente', alert });
        }
      }
      flattened.sort((a, b) => severity[b.alert.type] - severity[a.alert.type] || b.alert.days - a.alert.days);

      const icon = { Inativo: '🔴', Crítico: '🟠', Alerta: '🟡' } as const;

      for (const { clientId, clientName, alert } of flattened.slice(0, 5)) {
        await this.sendNotification({
          type: 'client_followup',
          title: `${icon[alert.type]} ${alert.type}: ${clientName}`,
          body: `${alert.days} dias sem comprar de ${alert.company}. Que tal um follow-up?`,
          data: {
            clientId,
            clientName,
            company: alert.company,
            days: alert.days.toString(),
          },
        });
      }
    } catch (error) {
      console.error('Error scheduling client followup reminders:', error);
    }
  }

  private static async scheduleWeeklySummary(userId: string) {
    try {
      // Schedule for Monday 9 AM
      const now = new Date();
      const nextMonday = new Date();
      nextMonday.setDate(nextMonday.getDate() + (1 + 7 - nextMonday.getDay()) % 7);
      if (nextMonday.getDay() === 0) nextMonday.setDate(nextMonday.getDate() + 1);
      nextMonday.setHours(9, 0, 0, 0);

      const { data: clients } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'Ativo');

      const { data: orders } = await supabase
        .from('orders')
        .select('id, value')
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const totalRevenue = orders?.reduce((sum, order) => sum + (order.value || 0), 0) || 0;

      await this.sendNotification({
        type: 'weekly_summary',
        title: '📊 Resumo da Semana',
        body: `${clients?.length || 0} clientes | R$ ${totalRevenue.toFixed(2)} em pedidos | Ótima semana!`,
        scheduleTime: nextMonday,
      });
    } catch (error) {
      console.error('Error scheduling weekly summary:', error);
    }
  }

  // Parcelas de comissão (order_installments) vencendo nos próximos 14 dias —
  // avisa no dia do vencimento, às 9h, pra lembrar de cobrar/conferir o
  // recebimento daquela parcela. Limitado a 20 pra não estourar o limite de
  // notificações pendentes do sistema operacional.
  private static async scheduleInstallmentReminders(userId: string) {
    try {
      const today = new Date();
      const todayStr = today.toISOString().split('T')[0];
      const limitDate = new Date(today);
      limitDate.setDate(limitDate.getDate() + 14);
      const limitStr = limitDate.toISOString().split('T')[0];

      const { data: installments } = await supabase
        .from('order_installments')
        .select('id, due_date, value, order_id, orders!inner(client:clients(name))')
        .eq('user_id', userId)
        .gte('due_date', todayStr)
        .lte('due_date', limitStr)
        .order('due_date', { ascending: true })
        .limit(20);

      if (!installments || installments.length === 0) return;

      installments.forEach((inst: any, index) => {
        const [y, m, d] = inst.due_date.split('-').map(Number);
        const scheduleDate = new Date(y, m - 1, d, 9, 0, 0);
        // Vencimento já passou das 9h de hoje: avisa assim que possível.
        const at = scheduleDate > new Date() ? scheduleDate : new Date(Date.now() + 5000);

        const clientName = inst.orders?.client?.name || 'cliente sem nome';
        const value = Number(inst.value || 0).toFixed(2);

        this.sendNotification({
          type: 'installment_due',
          title: '💰 Parcela vencendo hoje',
          body: `Parcela de R$ ${value} do pedido de ${clientName} vence hoje.`,
          scheduleTime: at,
          data: { orderId: inst.order_id },
        });
        void index; // usado só pra manter o índice legível na leitura acima
      });
    } catch (error) {
      console.error('Error scheduling installment reminders:', error);
    }
  }

  // Renovação/vencimento da assinatura (user_entitlements) — avisa uns dias
  // antes pra não pegar o usuário de surpresa com o acesso suspenso.
  private static async scheduleSubscriptionRenewalReminder(userId: string) {
    try {
      const { data: entitlement } = await supabase
        .from('user_entitlements')
        .select('current_period_end, subscription_status, cancel_at_period_end')
        .eq('user_id', userId)
        .maybeSingle();

      if (!entitlement?.current_period_end) return;
      if (!['active', 'trialing'].includes(entitlement.subscription_status)) return;

      const periodEnd = new Date(entitlement.current_period_end);
      const daysUntil = Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntil > 7 || daysUntil < 0) return;

      const reminderDate = new Date(periodEnd);
      reminderDate.setDate(reminderDate.getDate() - 3);
      reminderDate.setHours(9, 0, 0, 0);
      const at = reminderDate > new Date() ? reminderDate : new Date(Date.now() + 5000);

      const dataFormatada = periodEnd.toLocaleDateString('pt-BR');
      const isCanceling = !!entitlement.cancel_at_period_end;

      await this.sendNotification({
        type: 'subscription_renewal',
        title: isCanceling ? '⚠️ Assinatura expira em breve' : '🔄 Assinatura renova em breve',
        body: isCanceling
          ? `Seu acesso ao Represente-Se encerra em ${dataFormatada}.`
          : `Sua assinatura renova em ${dataFormatada}.`,
        scheduleTime: at,
      });
    } catch (error) {
      console.error('Error scheduling subscription renewal reminder:', error);
    }
  }

  static async sendNotification(payload: NotificationPayload) {
    if (!Capacitor.isNativePlatform()) {
      toast[payload.type === 'client_alert' ? 'error' : 'info'](payload.title, { description: payload.body });
      return;
    }

    try {
      const notifId =
        this.NOTIFICATION_ID_RANGES[payload.type] + Math.floor(Math.random() * 100);

      const schedule = payload.scheduleTime
        ? { at: payload.scheduleTime }
        : { at: new Date(Date.now() + 1000) };

      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: payload.title,
            body: payload.body,
            schedule,
            smallIcon: 'ic_stat_onesignal_default',
            largeIcon: 'ic_launcher_notification',
            extra: payload.data,
            actionTypeId: '',
          },
        ],
      });
    } catch (error) {
      console.error('Error sending notification:', error);
    }
  }

  private static handleNotificationTap(action: any) {
    const data = action.notification.extra || {};

    switch (data.type) {
      case 'appointment_reminder':
        window.location.href = '/dashboard/agenda';
        break;
      case 'client_followup':
        window.location.href = `/dashboard/clientes/${data.clientId}`;
        break;
      case 'weekly_summary':
        window.location.href = '/dashboard';
        break;
      default:
        break;
    }
  }

  static async clearNotifications() {
    if (!Capacitor.isNativePlatform()) return;

    try {
      // Get all delivered notifications and remove them
      const delivered = await LocalNotifications.getDeliveredNotifications();
      if (delivered.notifications && delivered.notifications.length > 0) {
        await LocalNotifications.removeDeliveredNotifications(delivered);
      }
    } catch (error) {
      console.error('Error clearing notifications:', error);
    }
  }

  static async requestPermissions() {
    if (!Capacitor.isNativePlatform()) return true;

    try {
      const result = await LocalNotifications.requestPermissions();
      return result.display === 'granted';
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }
}
