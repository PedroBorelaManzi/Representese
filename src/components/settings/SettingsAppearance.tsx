import React, { useState } from 'react';
import { Moon, Sun, Bell, BellOff, Trash2, Loader2, HardDrive } from 'lucide-react';
import { useSettings } from '../../contexts/SettingsContext';
import { motion } from 'framer-motion';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';
import { offlineCache } from '../../lib/offlineCache';
import { useConfirm } from '../ui';

function Toggle({ on }: { on: boolean }) {
  return (
    <div className={cn(
      "w-14 h-7 rounded-full p-1 transition-colors duration-300 relative shrink-0",
      on ? "bg-emerald-500" : "bg-slate-300 dark:bg-zinc-700"
    )}>
      <motion.div
        animate={{ x: on ? 28 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
        className="w-5 h-5 rounded-full bg-white shadow-lg"
      />
    </div>
  );
}

export const SettingsAppearance = React.memo(function SettingsAppearance() {
  const { settings, updateSettings } = useSettings();
  const confirm = useConfirm();
  const [pushEnabled, setPushEnabled] = useState(() => localStorage.getItem('rm_push_notifications') !== 'false');
  const [clearing, setClearing] = useState(false);

  const toggleTheme = async () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    try {
      await updateSettings({ theme: newTheme });
      toast.success(`Modo ${newTheme === 'dark' ? 'escuro' : 'claro'} ativado!`);
    } catch (err) {
      toast.error("Erro ao salvar tema");
    }
  };

  const togglePush = async () => {
    const next = !pushEnabled;
    setPushEnabled(next);
    localStorage.setItem('rm_push_notifications', next ? 'true' : 'false');
    if (next && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      try { await Notification.requestPermission(); } catch {}
    }
    toast.success(next ? "Notificações ativadas!" : "Notificações desativadas.");
  };

  const handleClearCache = async () => {
    if (!(await confirm({ title: 'Limpar dados offline', message: 'Limpar os dados salvos offline neste dispositivo? Seus dados na nuvem não são afetados — eles serão baixados novamente.', confirmLabel: 'Limpar', tone: 'default' }))) return;
    setClearing(true);
    try {
      offlineCache.clear();
      toast.success("Dados offline limpos. Recarregando...");
      setTimeout(() => window.location.reload(), 900);
    } catch {
      toast.error("Erro ao limpar os dados.");
      setClearing(false);
    }
  };

  const rowClass = "w-full flex items-center justify-between p-4 md:p-6 rounded-2xl md:rounded-[28px] bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-zinc-800 transition-all";

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl md:text-3xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Personalização</h2>
        <p className="text-[11px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Ajuste o sistema do seu jeito</p>
      </div>

      {/* Aparência */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Aparência</p>
        <button onClick={toggleTheme} className={cn(rowClass, "hover:scale-[1.01] group")}>
          <div className="flex items-center gap-5">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm">
              {settings.theme === 'dark' ? <Moon className="w-6 h-6 text-indigo-500" /> : <Sun className="w-6 h-6 text-amber-500" />}
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Modo de exibição</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">Alternar entre claro e escuro</p>
            </div>
          </div>
          <Toggle on={settings.theme === 'dark'} />
        </button>
      </div>

      {/* Notificações */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Notificações</p>
        <button onClick={togglePush} className={cn(rowClass, "hover:scale-[1.01]")}>
          <div className="flex items-center gap-5">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm">
              {pushEnabled ? <Bell className="w-6 h-6 text-emerald-500" /> : <BellOff className="w-6 h-6 text-slate-400" />}
            </div>
            <div className="text-left">
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Alertas e lembretes</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5">Visitas, inatividade de clientes e feriados</p>
            </div>
          </div>
          <Toggle on={pushEnabled} />
        </button>
      </div>

      {/* Dados offline */}
      <div className="space-y-3">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2">Dados & armazenamento</p>
        <div className={rowClass}>
          <div className="flex items-center gap-5 min-w-0">
            <div className="p-3.5 rounded-2xl bg-white dark:bg-zinc-900 shadow-sm shrink-0">
              <HardDrive className="w-6 h-6 text-slate-500" />
            </div>
            <div className="text-left min-w-0">
              <p className="text-xs font-black uppercase tracking-widest text-slate-900 dark:text-white">Limpar dados offline</p>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mt-0.5 leading-relaxed">Resolve telas travadas ou dados desatualizados. Não afeta a nuvem.</p>
            </div>
          </div>
          <button
            onClick={handleClearCache}
            disabled={clearing}
            className="shrink-0 ml-3 flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-50"
          >
            {clearing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            Limpar
          </button>
        </div>
      </div>
    </div>
  );
});
