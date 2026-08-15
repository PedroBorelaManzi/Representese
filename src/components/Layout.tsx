import React, { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Calendar, 
  Map as MapIcon, 
  Settings, 
  LogOut, 
  Menu, 
  X, 
  Check, 
  ChevronLeft,
  Bell, 
  Shield, 
  Building2,
  Mail,
  Cloud,
  CloudOff,
  RefreshCw,
  Sparkles,
  FolderArchive,
  Wallet,
  Trophy,
  Headphones,
  FileSpreadsheet,
  BarChart3
} from 'lucide-react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { useSync } from '../contexts/SyncContext';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '../lib/supabase';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { WhatsAppButton } from './WhatsAppButton';
import { Logo } from './Logo';
import { SubscriptionGuard } from './SubscriptionGuard';
import { ErrorBoundary } from './ErrorBoundary';
import { useIsSupportAdmin } from '../hooks/useIsSupportAdmin';
import { toast } from 'sonner';

const SettingsModal = React.lazy(() => import('./SettingsModal'));
const OnboardingModal = React.lazy(() => import('./OnboardingModal'));
const SupportChatWidget = React.lazy(() => import('./SupportChatWidget').then(m => ({ default: m.SupportChatWidget })));

export default function Layout() {
  const [isEditingInactivity, setIsEditingInactivity] = useState(false);
  const [tempAlerta, setTempAlerta] = useState<string | number>('');
  const [tempCritico, setTempCritico] = useState<string | number>('');
  const [tempInativo, setTempInativo] = useState<string | number>('');

  const handleSaveInactivity = async () => {
    const alertDays = parseInt(tempAlerta.toString(), 10);
    const critDays = parseInt(tempCritico.toString(), 10);
    const inatDays = parseInt(tempInativo.toString(), 10);

    if (isNaN(alertDays) || alertDays <= 0 || isNaN(critDays) || critDays <= 0 || isNaN(inatDays) || inatDays <= 0) {
      toast.error("Por favor, insira um número válido de dias para todos os campos.");
      return;
    }

    if (alertDays >= critDays) {
      toast.error("O status Alerta deve ter menos dias que o status Crítico.");
      return;
    }

    if (critDays >= inatDays) {
      toast.error("O status Crítico deve ter menos dias que o status Inativo.");
      return;
    }

    try {
      await updateSettings({
        alerta_days: alertDays,
        critico_days: critDays,
        inativo_days: inatDays
      });
      toast.success("Limiares de inatividade atualizados!");
      setIsEditingInactivity(false);
    } catch (err) {
      toast.error("Erro ao salvar configurações.");
    }
  };

  const { user, signOut } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { isOnline, pendingCount, deadLetterCount, isSyncing, syncNow } = useSync();
  const { isAdmin: isSupportAdmin } = useIsSupportAdmin();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
  const [avatarError, setAvatarError] = useState(false);
  const [mobileAvatarError, setMobileAvatarError] = useState(false);

  useEffect(() => {
    setAvatarError(false);
    setMobileAvatarError(false);
  }, [settings.avatar_url]);

  // Notificações servem apenas para o app nativo (mobile). No navegador/PC não pedimos
  // permissão nem disparamos notificações — era isso que ficava "apitando" ao abrir o PC.
  // A permissão nativa é solicitada no Dashboard (LocalNotifications).

  // Background check for notifications (appointments in 1h, client inactivities)
  useEffect(() => {
    if (!user) return;

    const sendNotification = async (title: string, body: string, tag: string) => {
      const isPushEnabled = localStorage.getItem("rm_push_notifications") !== "false";
      if (!isPushEnabled) return;

      // Notificações servem apenas para o app (mobile). No computador/web não disparamos.
      if (!Capacitor.isNativePlatform()) return;

      const notifiedTags = JSON.parse(localStorage.getItem("rm_notified_tags") || "[]");
      if (notifiedTags.includes(tag)) return;

      try {
        const perm = await LocalNotifications.checkPermissions();
        if (perm.display === 'granted') {
          const hashCode = (str: string): number => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
              hash = str.charCodeAt(i) + ((hash << 5) - hash);
            }
            return Math.abs(hash);
          };

          await LocalNotifications.schedule({
            notifications: [{
              title,
              body,
              id: hashCode(tag),
              schedule: { at: new Date(Date.now() + 1000) },
              sound: 'default'
            }]
          });
        }
      } catch (e) {
        console.error("Local notification scheduling error", e);
      }

      notifiedTags.push(tag);
      localStorage.setItem("rm_notified_tags", JSON.stringify(notifiedTags));
    };

    const runChecks = async () => {
      try {
        const now = new Date();

        // 1. Check appointments in 1 hour
        const { data: appointments } = await supabase
          .from("appointments")
          .select("id, title, date, time")
          .eq("user_id", user.id);

        if (appointments && appointments.length > 0) {
          appointments.forEach((appt: any) => {
            if (!appt.date || !appt.time) return;
            const startTimeStr = appt.time.split(" - ")[0];
            const [hours, minutes] = startTimeStr.split(":").map(Number);
            const apptDate = new Date(`${appt.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
            
            const timeDiff = Math.round((apptDate.getTime() - now.getTime()) / (60 * 1000));
            if (timeDiff >= 0 && timeDiff <= 60) {
              sendNotification(
                "Representese 📈 🔔",
                `Lembrete de Compromisso: Não esqueça que você tem um agendamento para daqui ${timeDiff} minutos: ${appt.title}`,
                `appt_${appt.id}`
              );
            }
          });
        }
      } catch (err) {
        console.error("Error running background notification checks:", err);
      }
    };

    runChecks();
    const interval = setInterval(runChecks, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [user]);

  // Menu agrupado pelo fluxo de trabalho do representante:
  // planejar o dia → trabalhar a carteira → se comunicar → consultar materiais.
  const menuGroups: { title: string; items: { icon: typeof LayoutDashboard; label: string; path: string }[] }[] = [
    {
      title: 'Dia a Dia',
      items: [
        { icon: LayoutDashboard, label: 'Início', path: '/dashboard' },
        { icon: Calendar, label: 'Agenda', path: '/dashboard/agenda' },
        { icon: MapIcon, label: 'Mapa', path: '/dashboard/map' },
        { icon: FolderArchive, label: 'Arquivos', path: '/dashboard/arquivos' },
        { icon: Sparkles, label: 'Assistente IA', path: '/dashboard/assistente' },
      ],
    },
    {
      title: 'Vendas',
      items: [
        { icon: Users, label: 'Clientes', path: '/dashboard/clientes' },
        { icon: Building2, label: 'Empresas & Pedidos', path: '/dashboard/empresas' },
        { icon: Wallet, label: 'Comissões', path: '/dashboard/comissoes' },
        { icon: FileSpreadsheet, label: 'Relatórios', path: '/dashboard/relatorios' },
        { icon: Trophy, label: 'Ranking', path: '/dashboard/ranking' },
      ],
    },
    {
      title: 'Comunicação',
      items: [
        { icon: Mail, label: 'E-mails', path: '/dashboard/email' },
      ],
    },
    ...((isSupportAdmin || settings.is_admin)
      ? [{
          title: 'Admin',
          items: [
            ...(isSupportAdmin ? [{ icon: Headphones, label: 'Suporte', path: '/dashboard/suporte-admin' }] : []),
            ...(settings.is_admin ? [{ icon: BarChart3, label: 'Analytics', path: '/dashboard/admin/analytics' }] : []),
          ],
        }]
      : []),
  ];

  return (
    <SubscriptionGuard>
      <div className="flex h-screen bg-slate-100/60 dark:bg-zinc-950 transition-colors duration-300">
        {/* Skip link: invisível até receber foco via Tab (a11y) */}
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[200] focus:px-4 focus:py-2 focus:rounded-xl focus:bg-emerald-600 focus:text-white focus:text-sm focus:font-bold"
        >
          Pular para o conteúdo
        </a>
        <AnimatePresence mode='wait'>
          {sidebarOpen && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[100] lg:hidden"
              onClick={() => setSidebarOpen(false)}
            />
          )}
        </AnimatePresence>

        <aside className={cn(
          "fixed inset-y-0 left-0 z-[101] w-[280px] bg-white dark:bg-zinc-900 border-r border-slate-100 dark:border-zinc-800 transition-all duration-500 ease-in-out lg:static",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          !desktopSidebarOpen && "lg:-translate-x-full lg:w-0 lg:overflow-hidden lg:border-r-0 lg:opacity-0"
        )}>
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between"
              style={{
                paddingTop: "calc(env(safe-area-inset-top, 0px) + 24px)",
                paddingLeft: "32px",
                paddingRight: "32px",
                paddingBottom: "20px"
              }}
            >
              <Logo size="sm" textSize="text-lg" className="min-w-0" />
              <button
                onClick={() => setDesktopSidebarOpen(false)}
                className="hidden lg:flex shrink-0 p-1.5 hover:bg-slate-50 dark:hover:bg-zinc-800 border border-slate-100 dark:border-zinc-800/80 rounded-xl text-slate-400 hover:text-emerald-600 transition-all duration-300 active:scale-95"
                title="Ocultar Menu Lateral"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            <div className="px-6 mb-4 border-b border-slate-200/60 dark:border-zinc-800/60 pb-4">
              <div className="px-2 bg-transparent rounded-[24px]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-xs font-black text-white overflow-hidden shadow-sm">
                    {settings.avatar_url && !avatarError ? (
                      <img 
                        src={settings.avatar_url} 
                        alt="Perfil" 
                        className="w-full h-full object-cover" 
                        onError={() => setAvatarError(true)}
                      />
                    ) : (
                      (user?.user_metadata?.full_name || user?.email || 'R').charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-800 dark:text-zinc-100 truncate uppercase">{user?.user_metadata?.full_name || 'Representante'}</p>
                    <p className="text-[10px] font-medium text-slate-400 dark:text-zinc-400 truncate">{user?.email}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Sync Status Button */}
            <div className="px-6 mb-4">
              <button 
                onClick={syncNow}
                disabled={isSyncing}
                className={`w-full flex items-center justify-between p-3 rounded-2xl border transition-all ${
                  !isOnline ? 'bg-red-50/50 border-red-100/50 text-red-600' : 
                  pendingCount > 0 ? 'bg-amber-50 border-amber-200 text-amber-700' : 
                  'bg-emerald-50 border-emerald-100 text-emerald-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  {!isOnline ? <CloudOff className="w-4 h-4" /> : <Cloud className="w-4 h-4" />}
                  <span className="text-[10px] font-black uppercase tracking-widest">
                    {!isOnline ? 'Offline' : pendingCount > 0 ? 'Sincronizar' : 'Online'}
                  </span>
                </div>
                {pendingCount > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black">{pendingCount}</span>
                    <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  </div>
                )}
              </button>
              {deadLetterCount > 0 && (
                <p className="mt-2 px-3 py-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/30 text-[10px] font-bold text-red-600 dark:text-red-400 leading-snug">
                  {deadLetterCount} alteração{deadLetterCount > 1 ? 'ões' : ''} offline não {deadLetterCount > 1 ? 'puderam' : 'pôde'} ser enviada{deadLetterCount > 1 ? 's' : ''}. Confira seus últimos lançamentos.
                </p>
              )}
            </div>

            <nav aria-label="Menu principal" className="flex-1 px-4 overflow-y-auto custom-scrollbar">
              {menuGroups.map((group, groupIndex) => (
                <div key={group.title} className={cn(groupIndex > 0 && "pt-4 mt-4 border-t border-slate-100 dark:border-zinc-800/50")}>
                  <p className="px-4 mb-2 text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">{group.title}</p>
                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const isActive = location.pathname === item.path;
                      const isEmailItem = item.label === 'E-mails';

                      const handleItemClick = (e: React.MouseEvent) => {
                        if (isEmailItem && Capacitor.isNativePlatform()) {
                          e.preventDefault();
                          setSidebarOpen(false);
                          window.open("mailto:", "_system");
                        } else {
                          setSidebarOpen(false);
                        }
                      };

                      return (
                        <Link
                          key={item.path}
                          to={item.path}
                          onClick={handleItemClick}
                          className={cn(
                            "flex items-center gap-4 py-3 transition-all duration-300 group relative overflow-hidden",
                            isActive
                              ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-black border-l-2 border-emerald-500 rounded-r-xl pl-[14px]"
                              : "text-slate-500 dark:text-zinc-400 hover:text-slate-900 dark:hover:text-zinc-100 hover:bg-slate-100/70 dark:hover:bg-zinc-800/40 rounded-xl px-4"
                          )}
                        >
                          <item.icon className={cn(
                            "w-5 h-5 shrink-0 transition-transform duration-300 group-hover:scale-110",
                            isActive ? "text-emerald-700 dark:text-emerald-400" : "text-slate-400 group-hover:text-emerald-600"
                          )} />
                          <span className="text-[13px] uppercase tracking-tight">{item.label}</span>
                        </Link>
                      );
                    })}
                    {group.title === 'Comunicação' && (
                      <WhatsAppButton
                        label="WhatsApp"
                        variant="sidebar"
                      />
                    )}
                  </div>
                </div>
              ))}

              <div className="pt-4 mt-4 border-t border-slate-100 dark:border-zinc-800/50">
                <p className="px-4 mb-2 text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest">Sistema</p>
                
                <div className='space-y-1'>
                  <button
                    onClick={() => {
                      setIsSettingsModalOpen(true);
                      setSidebarOpen(false);
                      setDesktopSidebarOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-4 w-full px-4 py-3.5 rounded-2xl transition-all duration-300 text-slate-500 dark:text-zinc-400 hover:text-emerald-600 hover:bg-slate-50 dark:hover:bg-zinc-800/30",
                      isSettingsModalOpen && "text-emerald-600 bg-slate-50 dark:bg-zinc-800/30"
                    )}
                  >
                    <Settings className='w-5 h-5' />
                    <span className="text-[13px] font-bold uppercase tracking-tight">Configurações</span>
                  </button>
                </div>

                {/* Configurações de inatividade no rodapé da barra lateral */}
                <div className="px-4 py-4 mt-4 border-t border-slate-100 dark:border-zinc-800/50">
                  <div className="flex items-center justify-between mb-3 px-2">
                    <p className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Inatividade</p>
                    <button
                      type="button"
                      onClick={() => {
                        if (!isEditingInactivity) {
                          setTempAlerta(settings.alerta_days || 30);
                          setTempCritico(settings.critico_days || 45);
                          setTempInativo(settings.inativo_days || 90);
                        }
                        setIsEditingInactivity(!isEditingInactivity);
                      }}
                      className="p-1 hover:bg-slate-100 dark:hover:bg-zinc-800 text-slate-400 hover:text-emerald-600 rounded-lg transition-colors"
                      title="Configurar Inatividade"
                    >
                      <Settings className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {isEditingInactivity ? (
                    <div className="bg-slate-50 dark:bg-zinc-900/40 border border-slate-100 dark:border-zinc-800 rounded-2xl p-3 space-y-3">
                      <div className="grid grid-cols-3 gap-1.5">
                        <div className="space-y-1">
                          <label className="block text-[8px] font-black uppercase text-amber-655 text-center">Alerta</label>
                          <input 
                            type="number"
                            value={tempAlerta}
                            onChange={(e) => setTempAlerta(e.target.value)}
                            className="w-full px-1.5 py-1 text-center bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-850 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="30"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[8px] font-black uppercase text-orange-500 text-center">Crítico</label>
                          <input 
                            type="number"
                            value={tempCritico}
                            onChange={(e) => setTempCritico(e.target.value)}
                            className="w-full px-1.5 py-1 text-center bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-850 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="45"
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="block text-[8px] font-black uppercase text-red-500 text-center">Inativo</label>
                          <input 
                            type="number"
                            value={tempInativo}
                            onChange={(e) => setTempInativo(e.target.value)}
                            className="w-full px-1.5 py-1 text-center bg-white dark:bg-zinc-950 border border-slate-200 dark:border-zinc-855 rounded-xl text-[11px] font-bold focus:ring-2 focus:ring-emerald-500 outline-none"
                            placeholder="90"
                          />
                        </div>
                      </div>
                      
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={handleSaveInactivity}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition-colors"
                        >
                          <Check className="w-3.5 h-3.5" /> Salvar
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsEditingInactivity(false)}
                          className="px-2 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-zinc-800 dark:hover:bg-zinc-750 text-slate-500 dark:text-zinc-400 rounded-xl flex items-center justify-center transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50/50 dark:bg-zinc-950/40 border border-slate-100/50 dark:border-zinc-850/60 rounded-2xl">
                      <div className="text-center py-2 px-1 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100/50 dark:border-zinc-800/40">
                        <p className="text-[8px] font-black uppercase tracking-wider text-amber-600 mb-0.5">Alerta</p>
                        <p className="text-[11px] font-bold text-slate-700 dark:text-zinc-350">{settings.alerta_days || 30}d</p>
                      </div>
                      <div className="text-center py-2 px-1 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100/50 dark:border-zinc-800/40">
                        <p className="text-[8px] font-black uppercase tracking-wider text-orange-500 mb-0.5">Crítico</p>
                        <p className="text-[11px] font-bold text-slate-700 dark:text-zinc-350">{settings.critico_days || 45}d</p>
                      </div>
                      <div className="text-center py-2 px-1 rounded-xl bg-white dark:bg-zinc-900 border border-slate-100/50 dark:border-zinc-800/40">
                        <p className="text-[8px] font-black uppercase tracking-wider text-red-500 mb-0.5">Inativo</p>
                        <p className="text-[11px] font-bold text-slate-700 dark:text-zinc-350">{settings.inativo_days || 90}d</p>
                      </div>
                    </div>
                  )}
                </div>

                <button onClick={() => signOut()} className="flex items-center gap-4 w-full px-4 py-3.5 mt-2 rounded-2xl text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-all duration-300">
                  <LogOut className="w-5 h-5" />
                  <span className="text-[13px] font-bold uppercase tracking-tight">Sair do Sistema</span>
                </button>
              </div>
            </nav>

            <div className="mt-auto"
              style={{
                paddingTop: "16px",
                paddingLeft: "32px",
                paddingRight: "32px",
                paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)"
              }}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Versão 2.4.2</p>
                  <p className="text-[8px] font-medium text-emerald-500 uppercase tracking-widest">Inteligência Artificial</p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-zinc-800 flex items-center justify-center">
                   <Shield className="w-4 h-4 text-emerald-600 opacity-20" />
                </div>
              </div>
            </div>
          </div>
        </aside>

        <React.Suspense fallback={null}>
          <SettingsModal isOpen={isSettingsModalOpen} onClose={() => setIsSettingsModalOpen(false)} />
        </React.Suspense>

        {/* Só aparece no primeiro login: guiado por has_completed_onboarding + categorias vazias */}
        <React.Suspense fallback={null}>
          <OnboardingModal />
        </React.Suspense>

        <React.Suspense fallback={null}>
          <SupportChatWidget />
        </React.Suspense>

        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <header className="lg:hidden bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between px-6 flex-shrink-0"
            style={{
              paddingTop: "env(safe-area-inset-top, 0px)",
              height: "calc(env(safe-area-inset-top, 0px) + 80px)"
            }}
          >
            <div className="flex items-center gap-4">
              <button onClick={() => setSidebarOpen(true)} className="p-3 bg-slate-50 dark:bg-zinc-800 rounded-2xl text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-700 transition-all active:scale-90">
                <Menu className="w-6 h-6" />
              </button>
              <Link to="/dashboard" className="font-black text-base uppercase tracking-tighter text-slate-900 dark:text-zinc-100">Representese</Link>
            </div>
            <div className="flex items-center gap-3">
               
              <button 
                onClick={syncNow}
                disabled={isSyncing}
                className={`flex items-center justify-center p-2 rounded-xl transition-all relative ${
                  !isOnline ? 'bg-red-50 text-red-500' : 
                  pendingCount > 0 ? 'bg-amber-50 text-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 
                  'bg-slate-50 text-emerald-500'
                }`}
              >
                {pendingCount > 0 ? (
                  <RefreshCw className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
                ) : !isOnline ? (
                  <CloudOff className="w-5 h-5" />
                ) : (
                  <Cloud className="w-5 h-5" />
                )}
                {pendingCount > 0 && !isSyncing && (
                  <span className="absolute -top-1 -right-1 flex h-4 w-4">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500 text-[8px] font-black text-white items-center justify-center">{pendingCount}</span>
                  </span>
                )}
              </button>

               <div className="w-10 h-10 rounded-full border-2 border-white dark:border-zinc-900 bg-emerald-500 flex items-center justify-center text-[10px] font-black text-white shadow-sm overflow-hidden">
                  {settings.avatar_url && !mobileAvatarError ? (
                    <img 
                      src={settings.avatar_url} 
                      alt="Perfil" 
                      className="w-full h-full object-cover" 
                      onError={() => setMobileAvatarError(true)}
                    />
                  ) : (
                    (user?.user_metadata?.full_name || user?.email || 'R').charAt(0).toUpperCase()
                  )}
               </div>
            </div>
          </header>

          {/* Floating toggle for desktop when collapsed */}
          {!desktopSidebarOpen && (
            <button 
              onClick={() => setDesktopSidebarOpen(true)}
              className="hidden lg:flex fixed top-6 left-6 z-[99] p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl text-slate-600 dark:text-zinc-300 hover:bg-slate-100 dark:hover:bg-zinc-800 transition-all shadow-md active:scale-95 animate-in fade-in zoom-in-75 duration-300"
              title="Mostrar Menu Lateral"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <main
            id="conteudo"
            className={cn(
              "flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 xl:p-12 scroll-smooth custom-scrollbar transition-all duration-300",
              !desktopSidebarOpen && "lg:pl-24"
            )}
            style={{
              paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)"
            }}
          >
            <div className="mx-auto">
              <AnimatePresence mode="wait">
                <motion.div
                  key={location.pathname}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.15, ease: "easeInOut" }}
                >
                  <ErrorBoundary resetKey={location.pathname}>
                    <Outlet />
                  </ErrorBoundary>
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    </SubscriptionGuard>
  );
}
