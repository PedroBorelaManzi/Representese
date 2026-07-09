import React, { useState } from 'react';
import { Globe, Smartphone, Bell, AlertCircle } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

export const SettingsNotifications = React.memo(function SettingsNotifications() {
  const [emailNotifications, setEmailNotifications] = useState(() => {
    return localStorage.getItem("rm_email_notifications") !== "false";
  });
  const [pushNotifications, setPushNotifications] = useState(() => {
    return localStorage.getItem("rm_push_notifications") !== "false";
  });
  const [agendaReminders, setAgendaReminders] = useState(() => {
    return localStorage.getItem("rm_agenda_reminders") !== "false";
  });
  const [orderUpdates, setOrderUpdates] = useState(() => {
    return localStorage.getItem("rm_notif_orders") !== "false";
  });
  const [clientFollowups, setClientFollowups] = useState(() => {
    return localStorage.getItem("rm_notif_followups") !== "false";
  });
  const [weeklySummary, setWeeklySummary] = useState(() => {
    return localStorage.getItem("rm_notif_summary") !== "false";
  });

  const handleTogglePush = async (checked: boolean) => {
    if (checked) {
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await LocalNotifications.requestPermissions();
          if (perm.display === 'granted') {
            toast.success("Notificações autorizadas no seu dispositivo!");
            localStorage.setItem("rm_push_notifications", "true");
            setPushNotifications(true);
          } else {
            toast.error("Permissão de notificação negada.");
            localStorage.setItem("rm_push_notifications", "false");
            setPushNotifications(false);
          }
        } catch (e) {
          console.error("Local notifications permission error", e);
        }
      } else if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          toast.success("Notificações Push autorizadas no seu navegador!");
          localStorage.setItem("rm_push_notifications", "true");
          setPushNotifications(true);
        } else {
          toast.error("Permissão de notificação negada pelo navegador.");
          localStorage.setItem("rm_push_notifications", "false");
          setPushNotifications(false);
        }
      } else {
        toast.error("Notificações Push não são suportadas neste navegador.");
      }
    } else {
      localStorage.setItem("rm_push_notifications", "false");
      setPushNotifications(false);
      toast.info("Notificações Push desativadas.");
    }
  };

  const handleToggleEmail = (checked: boolean) => {
    localStorage.setItem("rm_email_notifications", checked ? "true" : "false");
    setEmailNotifications(checked);
    toast.success(checked ? "Notificações por e-mail ativadas!" : "Notificações por e-mail desativadas.");
  };

  const handleToggleOrderUpdates = (checked: boolean) => {
    localStorage.setItem("rm_notif_orders", checked ? "true" : "false");
    setOrderUpdates(checked);
    toast.success(checked ? "Notificações de pedidos ativadas!" : "Notificações de pedidos desativadas.");
  };

  const handleToggleFollowups = (checked: boolean) => {
    localStorage.setItem("rm_notif_followups", checked ? "true" : "false");
    setClientFollowups(checked);
    toast.success(checked ? "Lembretes de follow-up ativados!" : "Lembretes de follow-up desativados.");
  };

  const handleToggleSummary = (checked: boolean) => {
    localStorage.setItem("rm_notif_summary", checked ? "true" : "false");
    setWeeklySummary(checked);
    toast.success(checked ? "Resumo semanal ativado!" : "Resumo semanal desativado.");
  };

  const handleToggleAgenda = async (checked: boolean) => {
    if (checked) {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          toast.success("Lembretes de agenda ativados!");
          localStorage.setItem("rm_agenda_reminders", "true");
          setAgendaReminders(true);
        } else {
          toast.error("Permissão de notificação negada pelo navegador.");
          localStorage.setItem("rm_agenda_reminders", "false");
          setAgendaReminders(false);
        }
      } else {
        toast.error("Notificações Push não são suportadas neste navegador.");
      }
    } else {
      localStorage.setItem("rm_agenda_reminders", "false");
      setAgendaReminders(false);
      toast.info("Lembretes de agenda desativados.");
    }
  };

  const handleTriggerTestNotification = async () => {
    toast.info("Enviando notificação de teste em 3 segundos. Saia do app ou bloqueie a tela para testar!");
    setTimeout(async () => {
      const title = "Representese 📈 🔔";
      const body = "Parabéns! Suas notificações push estão ativas e funcionando perfeitamente.";
      
      if (Capacitor.isNativePlatform()) {
        try {
          const perm = await LocalNotifications.checkPermissions();
          if (perm.display !== 'granted') {
            await LocalNotifications.requestPermissions();
          }
          await LocalNotifications.schedule({
            notifications: [{
              title,
              body,
              id: 9999,
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default'
            }]
          });
        } catch (e) {
          console.error("Local notification error", e);
        }
      } else {
        if ('Notification' in window && Notification.permission === 'granted') {
          new Notification(title, { body, icon: '/favicon.ico' });
        } else {
          toast.success("Teste: " + body);
        }
      }
    }, 3000);
  };

  return (
    <div className="space-y-8">
      <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Notificações</h2>
      <div className="space-y-4">
        {[
          {
            title: 'Notificações por E-mail',
            desc: 'Receba alertas de inatividade e relatórios por e-mail',
            icon: Globe,
            enabled: emailNotifications,
            toggle: () => handleToggleEmail(!emailNotifications)
          },
          {
            title: 'Notificações Push',
            desc: 'Alertas em tempo real no seu navegador',
            icon: Smartphone,
            enabled: pushNotifications,
            toggle: () => handleTogglePush(!pushNotifications)
          },
          {
            title: 'Lembretes de Agenda',
            desc: 'Avisos sobre seus compromissos e reuniões',
            icon: Bell,
            enabled: agendaReminders,
            toggle: () => handleToggleAgenda(!agendaReminders)
          }
        ].map((item, i) => (
          <div key={i} className="flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800">
            <div className="flex items-center gap-6">
              <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm text-amber-500">
                <item.icon className="w-6 h-6" />
              </div>
              <div className="text-left">
                <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">{item.title}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">{item.desc}</p>
              </div>
            </div>
            <button 
              onClick={item.toggle}
              className={cn(
                "w-12 h-7 rounded-full p-1 transition-all duration-300 relative flex items-center cursor-pointer",
                item.enabled ? "bg-emerald-500 justify-end" : "bg-slate-300 dark:bg-zinc-700 justify-start"
              )}
            >
              <motion.div 
                layout
                className="w-5 h-5 rounded-full bg-white shadow-sm" 
              />
            </button>
          </div>
        ))}
      </div>

      {pushNotifications && (
        <div className="space-y-4 mt-8">
          <h3 className="text-sm font-black text-slate-600 dark:text-slate-400 uppercase tracking-widest">Tipos de Notificação</h3>
          <div className="space-y-3">
            {[
              {
                title: '📦 Atualização de Pedidos',
                desc: 'Notificações quando status de pedidos mudam',
                enabled: orderUpdates,
                toggle: () => handleToggleOrderUpdates(!orderUpdates)
              },
              {
                title: '👥 Lembretes de Follow-up',
                desc: 'Lembrete quando clientes precisam de contato',
                enabled: clientFollowups,
                toggle: () => handleToggleFollowups(!clientFollowups)
              },
              {
                title: '📊 Resumo Semanal',
                desc: 'Sumário das atividades da semana toda segunda',
                enabled: weeklySummary,
                toggle: () => handleToggleSummary(!weeklySummary)
              }
            ].map((item, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700">
                <div className="text-left flex-1">
                  <p className="text-[11px] font-black uppercase tracking-widest text-slate-900 dark:text-zinc-100">{item.title}</p>
                  <p className="text-[9px] font-bold text-slate-500 dark:text-zinc-400 uppercase tracking-tight">{item.desc}</p>
                </div>
                <button
                  onClick={item.toggle}
                  className={cn(
                    "w-10 h-6 rounded-full p-0.5 transition-all duration-300 relative flex items-center cursor-pointer shrink-0 ml-2",
                    item.enabled ? "bg-emerald-500 justify-end" : "bg-slate-300 dark:bg-zinc-600 justify-start"
                  )}
                >
                  <motion.div
                    layout
                    className="w-4 h-4 rounded-full bg-white shadow-sm"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {pushNotifications && (
        <div className="p-4 md:p-6 rounded-2xl md:rounded-[32px] bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 flex flex-col md:flex-row items-center justify-between gap-4 mt-6">
          <div className="text-left flex-1">
            <p className="text-xs font-black uppercase tracking-widest text-emerald-800 dark:text-emerald-400">Verificar Dispositivo</p>
            <p className="text-[10px] font-bold text-emerald-600/80 dark:text-emerald-500/80 uppercase tracking-tight">Dispare uma notificação de teste para verificar se o recebimento está ativo no seu celular</p>
          </div>
          <button 
            type="button"
            onClick={handleTriggerTestNotification}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest active:scale-95 transition-all w-full md:w-auto"
          >
            Testar Notificação
          </button>
        </div>
      )}
    </div>
  );
});
