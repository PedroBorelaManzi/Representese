import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export type NotificationType = 'appointment_reminder' | 'client_followup' | 'client_alert' | 'weekly_summary';

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

  private static async scheduleClientFollowupReminders(userId: string) {
    try {
      const { data: clients } = await supabase
        .from('clients')
        .select('id, name, last_contact')
        .eq('user_id', userId)
        .eq('status', 'Ativo');

      if (!clients) return;

      const notifications: NotificationPayload[] = [];

      clients.forEach((client, index) => {
        if (!client.last_contact) return;

        const lastContact = new Date(client.last_contact);
        const daysSinceContact = Math.floor(
          (Date.now() - lastContact.getTime()) / (1000 * 60 * 60 * 24)
        );

        let body = '';
        let shouldNotify = false;

        if (daysSinceContact >= 30) {
          body = `Há 30+ dias sem contato com ${client.name}. Que tal fazer um follow-up?`;
          shouldNotify = true;
        } else if (daysSinceContact >= 14) {
          body = `${client.name} - ${daysSinceContact} dias sem contato. Considere fazer um follow-up.`;
          shouldNotify = true;
        }

        if (shouldNotify) {
          notifications.push({
            type: 'client_followup',
            title: '👥 Lembrete de Follow-up',
            body,
            data: {
              clientId: client.id,
              clientName: client.name,
              daysSinceContact: daysSinceContact.toString(),
            },
          });
        }
      });

      for (const notif of notifications.slice(0, 5)) {
        await this.sendNotification(notif);
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
