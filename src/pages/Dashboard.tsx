import React, { useState, useEffect, useMemo } from "react";
import { Plus, ChevronLeft, ChevronRight, Clock, Home, Loader2, Globe, RefreshCw, Calendar } from "lucide-react";
import { supabase, logAudit } from "../lib/supabase";
import { useAuth } from "../contexts/AuthContext";
import { cn } from "../lib/utils";
import { syncGoogleEvents, pushEventToGoogle, deleteEventFromGoogle } from "../lib/googleSync";
import { fetchHolidays, getClientLocations, Holiday } from "../lib/holidayService";
import AppointmentForm from "../components/AppointmentForm";
import RevenueChart from "../components/RevenueChart";
import DailyNotes from "../components/DailyNotes";
import { offlineCache, CacheKeys } from "../lib/offlineCache";
import { toast } from "sonner";
import { LocalNotifications } from '@capacitor/local-notifications';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Client, Order, Appointment } from "../types";

// Extended to 22:00 (16 hours total from 07:00)
const HOURS = Array.from({ length: 16 }, (_, i) => i + 7); 

const formatDateLocal = (date: Date) => {
  if (!date || isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function Dashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [currentDate, setCurrentDate] = useState(new Date());
  
  const [selectedNoteDate, setSelectedNoteDate] = useState(new Date());
  const [events, setEvents] = useState<Appointment[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState<Partial<Appointment> | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [dragOverInfo, setDragOverInfo] = useState<{ dayIndex: number; hour: number } | null>(null);
  const [googleConnected, setGoogleConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [userCategories, setUserCategories] = useState<string[]>([]);
  const [allTimeCategories, setAllTimeCategories] = useState<string[]>([]);
  const [monthlyOrders, setMonthlyOrders] = useState<Order[]>([]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // React Query for parallel Supabase requests with 5 minutes staleTime
  const { data: dashboardData, isLoading: isQueryLoading, refetch } = useQuery({
    queryKey: ['dashboardData', user?.id, year, month],
    queryFn: async () => {
      if (!user) return null;
      
      const startOfMonth = new Date(year, month, 1).toISOString();
      const endOfMonth = new Date(year, month + 1, 0, 23, 59, 59).toISOString();

      const [
        tokenRes,
        settingsRes,
        ordersRes,
        clientsRes,
        appRes,
        monthlyOrdersRes
      ] = await Promise.all([
        supabase.from("user_google_tokens").select("id").eq("user_id", user.id).maybeSingle(),
        supabase.from("user_settings").select("categories").eq("user_id", user.id).maybeSingle(),
        supabase.from("orders").select("category").eq("user_id", user.id),
        supabase.from("clients").select("id, name, city, state, faturamento, cnpj").eq("user_id", user.id).order("name"),
        supabase.from("appointments").select("*").eq("user_id", user.id),
        supabase.from("orders").select("*").eq("user_id", user.id).gte("created_at", startOfMonth).lte("created_at", endOfMonth)
      ]);

      const isGoogleConnected = !!tokenRes.data;
      const userSettings = settingsRes.data;
      const allOrdersCats = ordersRes.data || [];
      const clientsList = clientsRes.data || [];
      const appList = appRes.data || [];
      const monthlyOrdersList = monthlyOrdersRes.data || [];

      // Process categories
      const cats = userSettings?.categories;
      const catsArray = Array.isArray(cats) ? cats : [];
      const catsMap = new Map<string, string>();
      catsArray.forEach(c => {
        if (c && c.trim()) {
          const trimmed = c.trim();
          catsMap.set(trimmed.toUpperCase(), trimmed);
        }
      });
      allOrdersCats.forEach(o => {
        if (o.category && o.category.trim()) {
          const trimmed = o.category.trim();
          const key = trimmed.toUpperCase();
          if (!catsMap.has(key)) catsMap.set(key, trimmed);
        }
      });
      const resolvedCats = Array.from(catsMap.values());

      // Update sessionStorage Cache
      const TTL_5_MIN = 5 * 60 * 1000;
      offlineCache.set(CacheKeys.CLIENTS, clientsList, TTL_5_MIN);
      offlineCache.set(CacheKeys.APPOINTMENTS, appList, TTL_5_MIN);
      offlineCache.set(CacheKeys.MONTHLY_ORDERS, monthlyOrdersList, TTL_5_MIN);
      offlineCache.set(CacheKeys.ALL_TIME_CATEGORIES, resolvedCats, TTL_5_MIN);
      if (userSettings) offlineCache.set(CacheKeys.USER_SETTINGS, userSettings, TTL_5_MIN);

      scheduleLocalNotifications(appList);

      return {
        googleConnected: isGoogleConnected,
        userCategories: catsArray,
        allTimeCategories: resolvedCats,
        clients: clientsList,
        events: appList,
        monthlyOrders: monthlyOrdersList
      };
    },
    enabled: !!user && offlineCache.isOnline(),
    staleTime: 0,
  });

  // Sync state with React Query Data
  useEffect(() => {
    if (dashboardData) {
      setGoogleConnected(dashboardData.googleConnected);
      setUserCategories(dashboardData.userCategories);
      setAllTimeCategories(dashboardData.allTimeCategories);
      setClients(dashboardData.clients);
      setEvents(dashboardData.events);
      setMonthlyOrders(dashboardData.monthlyOrders);
      setLoading(false);
    } else if (!isQueryLoading) {
      setLoading(false);
    }
  }, [dashboardData, isQueryLoading]);

  const revenueChartData = useMemo(() => {
    const grouped = (monthlyOrders || []).reduce((acc, order) => {
      const cat = order.category || 'Outros';
      acc[cat] = (acc[cat] || 0) + (Number(order.value) || 0);
      return acc;
    }, {} as Record<string, number>);

    const baseCategories = allTimeCategories && allTimeCategories.length > 0 
      ? allTimeCategories 
      : ['Sua Empresa'];

    const sortedCategories = [...baseCategories].sort((a, b) => a.localeCompare(b));

    return sortedCategories.map(cat => ({
      name: cat,
      value: grouped[cat] || 0
    }));
  }, [monthlyOrders, allTimeCategories]);

  const handlePrevMonth = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() - 1);
    setCurrentDate(next);
  };

  const handleNextMonth = () => {
    const next = new Date(currentDate);
    next.setMonth(next.getMonth() + 1);
    setCurrentDate(next);
  };

  const weekDays = useMemo(() => { 
    try { 
      const start = new Date(currentDate); 
      const day = start.getDay(); 
      start.setDate(start.getDate() - day); 
      start.setHours(0,0,0,0); 
      return Array.from({ length: 7 }).map((_, i) => { 
        const d = new Date(start); 
        d.setDate(d.getDate() + i); 
        return d; 
      }); 
    } catch(e) { 
      console.error("weekDays error:", e); 
      return []; 
    } 
  }, [currentDate]);

  const isSameDay = (d1: Date, d2: string) => { 
    if (!d1 || !d2) return false; 
    return formatDateLocal(d1) === d2; 
  };

  const triggerLightHaptic = async () => {
    try {
      await Haptics.impact({ style: ImpactStyle.Light });
    } catch (e) {
      // Ignore on web
    }
  };

  const scheduleLocalNotifications = async (appointments: Appointment[]) => {
    try {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        const request = await LocalNotifications.requestPermissions();
        if (request.display !== 'granted') return;
      }
      
      const pending = await LocalNotifications.getPending();
      if (pending.notifications.length > 0) {
        await LocalNotifications.cancel({ notifications: pending.notifications });
      }
      
      const now = new Date();
      const notificationsToSchedule = [];
      
      for (const appt of appointments) {
        if (!appt.date || !appt.time) continue;
        const startTimeStr = appt.time.split(' - ')[0];
        const [hours, minutes] = startTimeStr.split(':').map(Number);
        
        const apptDate = new Date(`${appt.date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
        
        if (apptDate > now) {
          const triggerTime = new Date(apptDate.getTime() - 60 * 60 * 1000); // 60 mins (1 hour) lead time
          
          if (triggerTime > now) {
            notificationsToSchedule.push({
              title: "Representese 📈 🔔",
              body: `Visita marcada: ${appt.title} às ${startTimeStr}.`,
              id: Math.abs(hashCode(appt.id || String(Math.random()))),
              schedule: { at: triggerTime },
              sound: 'default'
            });
          }
        }
      }
      
      if (notificationsToSchedule.length > 0) {
        await LocalNotifications.schedule({
          notifications: notificationsToSchedule.slice(0, 50)
        });
      }
    } catch (e) {
      console.error("Local Notification error:", e);
    }
  };

  const hashCode = (str: string): number => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return hash;
  };

  // Instant local cache loading on mount
  useEffect(() => {
    const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS);
    const cachedEvents = offlineCache.get<Appointment[]>(CacheKeys.APPOINTMENTS);
    const cachedMonthlyOrders = offlineCache.get<Order[]>(CacheKeys.MONTHLY_ORDERS);
    const cachedAllTimeCategories = offlineCache.get<string[]>(CacheKeys.ALL_TIME_CATEGORIES);

    if (cachedClients) setClients(cachedClients);
    if (cachedEvents) setEvents(cachedEvents);
    if (cachedMonthlyOrders) setMonthlyOrders(cachedMonthlyOrders);
    if (cachedAllTimeCategories) setAllTimeCategories(cachedAllTimeCategories);

    if (!offlineCache.isOnline()) {
      setLoading(false);
    }

    const loadCachedHolidays = async () => {
      try {
        const locations = (cachedClients || []).filter(c => c && c.city).map(c => ({ city: c.city || "", state: c.state || "" }));
        const fetchedHolidays = await fetchHolidays(currentDate.getFullYear(), locations);
        setHolidays(fetchedHolidays);
      } catch (e) {
        console.warn("Error loading cached holidays on mount:", e);
      }
    };
    loadCachedHolidays();
  }, []);

  // Offline cache updates or fetch fallback
  useEffect(() => {
    if (!offlineCache.isOnline()) {
      const cachedSettings = offlineCache.get<any>(CacheKeys.USER_SETTINGS);
      const cachedAllTimeCats = offlineCache.get<string[]>(CacheKeys.ALL_TIME_CATEGORIES);
      if (cachedSettings?.categories) setUserCategories(cachedSettings.categories);
      if (cachedAllTimeCats) setAllTimeCategories(cachedAllTimeCats);
      
      const cachedClients = offlineCache.get<Client[]>(CacheKeys.CLIENTS) || [];
      const cachedEvents = offlineCache.get<Appointment[]>(CacheKeys.APPOINTMENTS) || [];
      const cachedMonthlyOrders = offlineCache.get<Order[]>(CacheKeys.MONTHLY_ORDERS) || [];
      
      setClients(cachedClients);
      setEvents(cachedEvents);
      setMonthlyOrders(cachedMonthlyOrders);
      setLoading(false);
    }
  }, [user, currentDate.getMonth(), currentDate.getFullYear()]);

  // Load holidays based on clients and currentDate
  useEffect(() => {
    const loadHolidays = async () => {
      try {
        const locations = clients.filter(c => c && c.city).map(c => ({ city: c.city || "", state: c.state || "" }));
        const fetchedHolidays = await fetchHolidays(currentDate.getFullYear(), locations);
        setHolidays(fetchedHolidays);
      } catch (e) {
        console.warn("Error loading holidays:", e);
      }
    };
    if (clients.length > 0) {
      loadHolidays();
    }
  }, [clients, currentDate.getFullYear()]);

  // Background Auto-Sync
  useEffect(() => {
    if (!user || !googleConnected) return;
    
    const silentSync = async () => {
      try {
        const res = await syncGoogleEvents(user.id);
        if (res.success) {
          refetch();
        }
      } catch (e) {
        console.warn("Background sync failed", e);
      }
    };

    silentSync();

    // Real-time monitor: sync instantly when user focuses the tab or window
    const handleFocus = () => silentSync();
    
    window.addEventListener('focus', handleFocus);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') silentSync();
    });

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('visibilitychange', handleFocus);
    };
  }, [user, googleConnected]);

  const handleSync = async () => {
    if (!user) return;
    setIsSyncing(true);
    const toastId = toast.loading("Sincronizando bidirecionalmente...");
    const res = await syncGoogleEvents(user.id);
    if (res.success) {
      toast.success(res.message, { id: toastId });
      await refetch();
    } else {
      toast.error(res.message, { id: toastId });
    }
    setIsSyncing(false);
  };

  const handleGoogleConnect = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      alert("Erro: Client ID do Google não configurado.");
      return;
    }
    const redirectUri = `${window.location.origin}/auth/callback/google`;
    const scope = "https://www.googleapis.com/auth/calendar.events";
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&access_type=offline&prompt=consent`;
    window.location.href = authUrl;
  };

  const onDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("eventId", id);
    const img = new Image();
    img.src = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
    e.dataTransfer.setDragImage(img, 0, 0);
  };

  const onDragOver = (e: React.DragEvent, dayIndex: number, hour: number) => {
    e.preventDefault();
    setDragOverInfo({ dayIndex, hour });
  };

  const onDrop = async (e: React.DragEvent, targetDate: Date, targetHour: number) => {
    e.preventDefault();
    setDragOverInfo(null);
    const id = e.dataTransfer.getData("eventId");
    if (!id || !user) return;

    try {
      const appt = events.find(ev => ev.id === id);
      if (!appt) return;

      const timeParts = appt.time.split(" - ");
      const startStr = timeParts[0] || "09:00";
      const endStr = timeParts[1] || "10:00";

      const startH = parseInt(startStr.split(":")[0]) || 9;
      const startM = parseInt(startStr.split(":")[1]) || 0;
      
      let endH = parseInt(endStr.split(":")[0]);
      let endM = parseInt(endStr.split(":")[1]);
      
      if (isNaN(endH)) endH = startH + 1;
      if (isNaN(endM)) endM = startM;

      let durationMin = (endH * 60 + endM) - (startH * 60 + startM);
      if (durationMin <= 0) durationMin = 60; // minimum 1 hour if something goes wrong
      
      const finalStartH = targetHour;
      const finalStartM = startM; // preserve original minutes
      
      const newEndMin = (finalStartH * 60 + finalStartM) + durationMin;
      const finalEndH = Math.floor(newEndMin / 60);
      const finalEndM = newEndMin % 60;
      
      let newTime = `${String(finalStartH).padStart(2, "0")}:${String(finalStartM).padStart(2, "0")} - ${String(finalEndH).padStart(2, "0")}:${String(finalEndM).padStart(2, "0")}`;
      
      if (appt.time.includes("(Dia Inteiro)")) {
          newTime += " (Dia Inteiro)";
      }
      const isoDate = formatDateLocal(targetDate);

      setEvents(events.map(ev => ev.id === id ? { ...ev, date: isoDate, time: newTime } : ev));
      
      const { error } = await supabase.from("appointments").update({ date: isoDate, time: newTime }).eq("id", id).eq("user_id", user.id);
      if (error) throw error;

      const client = clients.find(c => c.id === appt.client_id);
      const resG = await pushEventToGoogle(user.id, { ...appt, date: isoDate, time: newTime, client_name: client?.name });
      if (resG && !resG.success) {
        toast.error(`Google não atualizou: ${resG.message}`);
      } else {
        toast.success("Reagendado com sucesso!");
      }
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['agendaData'] });
    } catch (err) {
      console.error("Error updating appointment:", err);
      refetch();
    }
  };

  const handleSave = async (payload: Omit<Appointment, 'id' | 'user_id' | 'created_at'>) => {
    if (!user) return;
    setIsSaving(true);
    const savePayload = { ...payload, user_id: user.id };
    
    let savedEvent = null;
    if (editingEvent?.id) {
      const { error } = await supabase.from("appointments").update(savePayload).eq("id", editingEvent.id).eq("user_id", user.id);
      if (!error) {
        savedEvent = { ...editingEvent, ...savePayload } as Appointment;
        setEvents(events.map(ev => ev.id === editingEvent.id ? savedEvent : ev) as Appointment[]);
      }
    } else {
      const { data, error } = await supabase.from("appointments").insert([savePayload]).select().single();
      if (!error && data) {
        savedEvent = data;
        setEvents([...events, data]);
      }
    }

    if (savedEvent) {
      const client = clients.find(c => c.id === savedEvent.client_id);
      await pushEventToGoogle(user.id, { ...savedEvent, client_name: client?.name });
    }

    queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['agendaData'] });
    setIsSaving(false);
    setEditingEvent(null);
  };

  const handleDelete = async () => {
    if (!editingEvent?.id || !user || !window.confirm("Deseja realmente excluir este compromisso?")) return;
    setIsSaving(true);
    try {
      const { error } = await supabase.from("appointments").delete().eq("id", editingEvent.id).eq("user_id", user.id);
      
      if (error) {
        console.error("Supabase delete error:", error);
        toast.error("Erro ao excluir do banco de dados.");
        return;
      }
      
      if (editingEvent.google_event_id) {
        await deleteEventFromGoogle(user.id, editingEvent.google_event_id);
      }
      
      setEvents(events.filter(ev => ev.id !== editingEvent.id)); 
      setEditingEvent(null); 
      queryClient.invalidateQueries({ queryKey: ['dashboardData'] });
      queryClient.invalidateQueries({ queryKey: ['agendaData'] });
      toast.success("Compromisso excluído com sucesso!");
    } catch (e) {
      console.error("Exception in handleDelete:", e);
      toast.error("Ocorreu um erro inesperado ao excluir.");
    } finally {
      setIsSaving(false);
    }
  };

  const openNewEventModal = (date: Date, hour?: number) => {
    const timeStr = hour ? `${String(hour).padStart(2, '0')}:00 - ${String(hour + 1).padStart(2, '0')}:00` : "09:00 - 10:00";
    setEditingEvent({ title: "", time: timeStr, date: formatDateLocal(date), client_id: "" });
  };

  const getEventPosition = (time: string) => {
    try {
      const start = time.split(" - ")[0];
      const hour = parseInt(start.split(":")[0]);
      const minute = parseInt(start.split(":")[1] || "0");
      if (hour < 7 || hour > 22) return null;
      return (hour - 7) * 60 + minute;
    } catch { return null; }
  };

  const getEventHeight = (time: string) => {
    try {
      const parts = time.split(" - ");
      const start = parts[0].split(":");
      const end = parts[1].split(":");
      const startMin = parseInt(start[0]) * 60 + parseInt(start[1] || "0");
      const endMin = parseInt(end[0]) * 60 + parseInt(end[1] || "0");
      const duration = endMin - startMin;
      return Math.max(duration, 24); 
    } catch { return 48; }
  };

  const selectedDayEvents = useMemo(() => {
    return events.filter(e => isSameDay(selectedNoteDate, e.date)).sort((a,b) => {
        return a.time.localeCompare(b.time);
    });
  }, [events, selectedNoteDate]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center justify-between w-full">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-zinc-100 flex items-center gap-2 uppercase tracking-tight">
              <Home className="w-6 h-6 text-emerald-600" />
              Início
            </h1>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1 font-medium">Sua agenda semanal sincronizada e faturamento.</p>
          </div>
          
          {!offlineCache.isOnline() && (
            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest rounded-full border border-amber-100 dark:border-amber-900/30 shadow-sm animate-pulse flex items-center gap-1.5 self-center">
              <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
              Modo Offline Cache
            </span>
          )}
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-3 bg-white dark:bg-zinc-900 shadow-2xl border border-slate-200/80 dark:border-zinc-800/80 rounded-3xl overflow-hidden flex flex-col h-full min-h-[500px]">
          <div className="p-4 border-b border-slate-200 dark:border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between bg-slate-50 dark:bg-zinc-950/40 z-40 gap-4">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-black text-slate-800 dark:text-zinc-100 uppercase tracking-widest leading-none">
                {weekDays[0]?.toLocaleDateString('pt-BR', { month: 'long' })} {weekDays[0]?.getFullYear()}
              </h2>
              <div className="flex items-center gap-2">
                {googleConnected && (
                  <button 
                    onClick={handleSync}
                    disabled={isSyncing}
                    className="p-2 rounded-xl text-emerald-600 hover:bg-emerald-50 transition-all disabled:opacity-50 dark:text-emerald-400 dark:hover:bg-emerald-500/10"
                    title="Sincronizar Agora"
                  >
                    <RefreshCw className={cn("w-5 h-5", isSyncing && "animate-spin")} />
                  </button>
                )}
                <button 
                  onClick={handleGoogleConnect}
                  className={cn(
                    "p-2 rounded-xl transition-all",
                    googleConnected ? "text-emerald-50" : "text-slate-400 hover:text-emerald-600"
                  )}
                  title={googleConnected ? "Google Conectado" : "Conectar Google Agenda"}
                >
                  <Globe className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 dark:bg-zinc-800 p-1.5 rounded-xl">
                <button onClick={() => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() - 7); return d; })} className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-slate-600 dark:text-zinc-400 transition-all"><ChevronLeft className="w-4 h-4" /></button>
                <button onClick={() => setCurrentDate(prev => { const d = new Date(prev); d.setDate(d.getDate() + 7); return d; })} className="p-1.5 hover:bg-white dark:hover:bg-zinc-700 rounded-lg text-slate-600 dark:text-zinc-400 transition-all"><ChevronRight className="w-4 h-4" /></button>
              </div>
              <button 
                onClick={() => {
                  triggerLightHaptic();
                  openNewEventModal(selectedNoteDate);
                }} 
                className="flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2.5 rounded-2xl text-xs font-black transition-all shadow-lg shadow-emerald-100 dark:shadow-none uppercase tracking-wider"
              >
                <Plus className="w-4 h-4" /> Novo
              </button>
            </div>
          </div>

          <div className="flex-1 flex flex-col overflow-hidden relative">
            <div className="hidden lg:flex flex-1 min-h-[960px] overflow-auto custom-scrollbar">
              <div className="flex flex-col flex-1 min-w-[1000px] lg:min-w-0">
                <div className="flex bg-slate-50/95 dark:bg-zinc-950/95 border-b border-slate-200 dark:border-zinc-800 sticky top-0 z-30 backdrop-blur-md">
                  <div className="w-14 flex-shrink-0 sticky left-0 bg-slate-50 dark:bg-zinc-900 z-40 border-r border-slate-200 dark:border-zinc-800" />
                  <div className="flex-1 grid grid-cols-7 divide-x divide-slate-300 dark:divide-zinc-800">
                    {weekDays.map((date, i) => {
                      const isToday = isSameDay(date, formatDateLocal(new Date()));
                      return (
                        <div 
                          key={i} 
                          className={cn(
                            "py-2 text-center cursor-pointer hover:bg-slate-200/50 dark:hover:bg-zinc-700/30 transition-colors", 
                            isToday ? "bg-emerald-50/50 dark:bg-emerald-500/10" : "",
                            isSameDay(date, formatDateLocal(selectedNoteDate)) ? "ring-2 ring-emerald-500 ring-inset" : ""
                          )}
                          onClick={() => setSelectedNoteDate(date)}
                        >
                          <div className={cn("text-[6px] font-black uppercase tracking-widest", isToday ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-zinc-500")}>{date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}</div>
                          <div className={cn("text-[10px] font-black", isToday ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-zinc-100")}>{date.getDate()}</div>

                          { (holidays || []).filter(h => h && h.date === formatDateLocal(date)).map((h, idx) => (
                            <div key={idx} className="mt-1 px-1 py-0.5 bg-amber-50 dark:bg-amber-900/20 text-[6px] font-black text-amber-700 dark:text-amber-400 rounded-md border border-amber-100 dark:border-amber-800/50 flex items-center gap-1 shadow-sm" title={h.name}>
                              <span className="w-0.5 h-0.5 rounded-full bg-amber-500 flex-shrink-0" />
                              <span className="truncate flex-1 min-w-0">{h.name}</span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-1">
                  <div className="w-14 flex flex-col bg-slate-50/50 dark:bg-zinc-950/40 border-r border-slate-200 dark:border-zinc-800 text-slate-400 flex-shrink-0 sticky left-0 z-30 shadow-sm">
                    {HOURS.map(hour => (
                      <div key={hour} className="h-[60px] text-[9px] font-black text-slate-400/80 dark:text-zinc-500 pr-2 pt-0.5 flex items-start justify-end tracking-tight border-b border-slate-200/40 dark:border-zinc-800/30">{String(hour).padStart(2, '0')}:00</div>
                    ))}
                  </div>
                  <div className="flex-1 grid grid-cols-7 divide-x divide-slate-300 dark:divide-zinc-800 relative bg-white dark:bg-zinc-900">
                    {weekDays.map((date, dayIdx) => {
                      const dayEvents = (events || []).filter(e => e && isSameDay(date, e.date));
                      const isToday = isSameDay(date, formatDateLocal(new Date()));
                      const isWeekend = dayIdx === 0 || dayIdx === 6;
                      return (
                        <div 
                          key={dayIdx} 
                          className={cn(
                            "relative h-full transition-colors", 
                            isWeekend ? "bg-slate-50/50 dark:bg-zinc-950/20" : "bg-white dark:bg-zinc-900",
                            isToday ? "bg-emerald-50/20 dark:bg-emerald-950/20" : ""
                          )}
                        >
                          {HOURS.map(hour => (
                            <div key={hour} className={cn("h-[60px] border-b border-slate-300/80 dark:border-zinc-800 cursor-pointer transition-colors", dragOverInfo?.dayIndex === dayIdx && dragOverInfo?.hour === hour ? "bg-emerald-500/10" : "hover:bg-slate-50/30")} onDragOver={(e) => onDragOver(e, dayIdx, hour)} onDrop={(e) => onDrop(e, date, hour)} onClick={() => openNewEventModal(date, hour)} />
                          ))}
                          <div className="absolute inset-0 pointer-events-none p-0.5">
                            {dayEvents.map(event => {
                              const top = getEventPosition(event.time);
                              const height = getEventHeight(event.time);
                              if (top === null) return null;
                              const clientName = clients.find(c => c.id === event.client_id)?.name;
                              return (
                                <div 
                                  key={event.id} 
                                  draggable 
                                  onDragStart={(e) => onDragStart(e, event.id)} 
                                  onClick={(e) => { e.stopPropagation(); setEditingEvent(event); }} 
                                  className="absolute left-0.5 right-0.5 pointer-events-auto bg-emerald-50/90 dark:bg-emerald-950/60 border border-emerald-100 dark:border-emerald-900/40 border-l-4 border-l-emerald-500 shadow-sm rounded-lg p-1.5 transition-all cursor-grab active:cursor-grabbing z-10 overflow-hidden" 
                                  style={{ top: `${top}px`, height: `${height}px` }}
                                >
                                  <div className="text-[8px] font-black text-emerald-950 dark:text-emerald-50 mb-0.5 truncate leading-tight uppercase tracking-tight">{event.title}</div>
                                  {clientName && <div className="text-[6px] font-black text-emerald-600/90 dark:text-emerald-400/90 uppercase truncate">@{clientName}</div>}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:hidden flex-1 flex flex-col bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="flex items-center gap-3 p-4 border-b border-slate-100 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-x-auto no-scrollbar scroll-smooth">
                    {weekDays.map((date, i) => {
                        const isSelected = isSameDay(date, formatDateLocal(selectedNoteDate));
                        const isToday = isSameDay(date, formatDateLocal(new Date()));
                        return (
                            <button 
                                key={i}
                                onClick={() => { setSelectedNoteDate(date); }}
                                className={cn(
                                    "flex-shrink-0 flex flex-col items-center justify-center w-[54px] h-[78px] rounded-[22px] transition-all relative",
                                    isSelected 
                                      ? "bg-emerald-600 text-white shadow-[0_12px_24px_-8px_rgba(16,185,129,0.5)] scale-105 z-10" 
                                      : "bg-slate-50 dark:bg-zinc-800/50 text-slate-400 hover:bg-slate-100 dark:hover:bg-zinc-700"
                                )}
                            >
                                <span className={cn("text-[9px] font-black uppercase tracking-tighter mb-1", isSelected ? "text-emerald-50" : "text-slate-400")}>
                                    {date.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                                </span>
                                <span className={cn("text-base font-black", isSelected ? "text-white" : isToday ? "text-emerald-600" : "text-slate-700 dark:text-zinc-200")}>
                                    {date.getDate()}
                                </span>
                                {isToday && !isSelected && <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-600" />}
                            </button>
                        );
                    })}
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-slate-50 dark:bg-zinc-950">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Orquestração do Dia</h3>
                        </div>
                        <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest bg-white dark:bg-zinc-900 px-3 py-1 rounded-full border border-slate-100 dark:border-zinc-800">
                           {selectedNoteDate.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long' })}
                        </span>
                    </div>

                    {selectedDayEvents.length > 0 ? (
                        <div className="space-y-4">
                            {selectedDayEvents.map(event => {
                                const clientName = clients.find(c => c.id === event.client_id)?.name;
                                return (
                                    <button 
                                        key={event.id}
                                        onClick={() => setEditingEvent(event)}
                                        className="w-full text-left p-5 bg-white dark:bg-zinc-900 rounded-[28px] border border-slate-100 dark:border-zinc-800 shadow-sm flex items-center gap-5 active:scale-[0.98] transition-all group"
                                    >
                                        <div className="flex flex-col items-center justify-center w-14 h-14 bg-emerald-50 dark:bg-emerald-500/10 rounded-[18px] border border-emerald-100 dark:border-emerald-500/20 flex-shrink-0 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                                            <Clock className="w-4 h-4 mb-1" />
                                            <span className="text-[10px] font-black">{event.time.split(' - ')[0]}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate leading-tight mb-1">{event.title}</h4>
                                            <div className="flex items-center gap-2">
                                                <span className="text-[10px] font-bold text-slate-400 uppercase">{event.time}</span>
                                                {clientName && (
                                                   <>
                                                     <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-zinc-700" />
                                                     <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tight">@{clientName}</span>
                                                   </>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 px-6 text-center bg-white dark:bg-zinc-900 rounded-[40px] border border-slate-100 dark:border-zinc-800 shadow-sm">
                            <div className="w-20 h-20 bg-slate-50 dark:bg-zinc-800/50 rounded-full flex items-center justify-center mb-6">
                                <Calendar className="w-10 h-10 text-slate-200 dark:text-zinc-700" />
                            </div>
                            <h4 className="text-base font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tighter">Nada agendado</h4>
                            <p className="text-xs text-slate-400 dark:text-zinc-500 mt-2 max-w-[200px] font-medium uppercase tracking-tight">Você não possui compromissos orquestrados para este dia.</p>
                            <button 
                                onClick={() => openNewEventModal(selectedNoteDate)}
                                className="mt-8 px-8 py-4 bg-emerald-600 text-white rounded-[20px] text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 dark:shadow-none active:scale-95 transition-all"
                            >
                                <Plus className="w-4 h-4 inline mr-2" /> Novo Registro
                            </button>
                        </div>
                    )}
                </div>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 flex flex-col gap-6">
           <div className="h-[400px]">
              <RevenueChart data={revenueChartData} loading={loading} currentDate={currentDate} onPrevMonth={handlePrevMonth} onNextMonth={handleNextMonth} />
           </div>
           <div className="h-[400px]">
               <DailyNotes selectedDate={selectedNoteDate} />
            </div>
        </div>

      </div>

      {editingEvent && (
        <AppointmentForm 
          appointment={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSaved={refetch}
          clients={clients}
          onSave={handleSave}
          onDelete={handleDelete}
          isSaving={isSaving}
        />
      )}
    </div>
  );
}
