import React, { createContext, useContext, useState, useEffect, useMemo, useCallback, ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { offlineCache, CacheKeys } from "../lib/offlineCache";
import { syncQueue } from "../lib/syncQueue";
import { Capacitor } from "@capacitor/core";

export type SubscriptionStatus = 'active' | 'past_due' | 'inactive' | 'trialing' | 'canceled';

interface Settings {
  alerta_days: number;
  critico_days: number;
  perda_days: number;
  inativo_days: number;
  theme: 'light' | 'dark';
  has_completed_onboarding: boolean;
  categories: string[];
  /** Percentual de comissão por empresa representada. Ex.: { "Empresa A": 5, "Empresa B": 7.5 } */
  commissions: Record<string, number>;
  /** Prazo padrão de entrega por empresa, em dias — usado pra pré-preencher
   *  a data de entrega de um pedido novo quando ninguém informa. Empresa sem
   *  entrada aqui fica com a data de entrega em branco (preenchimento manual). */
  delivery_lead_days: Record<string, number>;
  /** Como a comissão dessa empresa é calculada: "fixed" (% único sobre tudo,
   *  o padrão) ou "per_product" (cada produto tem seu próprio %, configurado
   *  em product_commissions). Empresa ausente aqui = "fixed". */
  commission_mode: Record<string, 'fixed' | 'per_product'>;
  /** % de comissão por produto, só usado quando a empresa está em
   *  "per_product". Chave = "Empresa::chave_do_produto" (mesmo groupKey de
   *  productAnalytics.ts). Produto sem entrada aqui usa o % da empresa
   *  (commissions) como padrão. */
  product_commissions: Record<string, number>;
  revenue_ceiling: number;
  subscription_status: SubscriptionStatus;
  plan_id: string;
  avatar_url?: string;
  trial_ends_at?: string;
  current_period_end?: string;
  billing_cycle?: string;
  is_admin?: boolean;
  phone?: string;
  /** Cidade escolhida para a previsão do tempo na Agenda (coordenadas já resolvidas). */
  weather_city?: string;
  weather_state?: string;
  weather_lat?: number;
  weather_lng?: number;
}

const defaultSettings: Settings = {
  alerta_days: 30,
  critico_days: 45,
  perda_days: 60,
  inativo_days: 90,
  theme: 'light',
  has_completed_onboarding: false,
  categories: [],
  commissions: {},
  delivery_lead_days: {},
  commission_mode: {},
  product_commissions: {},
  revenue_ceiling: 1000000,
  subscription_status: 'inactive', // Default para leads novos sem plano
  plan_id: 'exclusivo',
  avatar_url: undefined,
  is_admin: false,
  phone: undefined,
  weather_city: undefined,
  weather_state: undefined,
  weather_lat: undefined,
  weather_lng: undefined,
};

interface SettingsContextType {
  settings: Settings;
  loading: boolean;
  updateSettings: (newSettings: Partial<Settings>) => Promise<void>;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const useSettings = () => {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
};

export const SettingsProvider = ({ children }: { children: ReactNode }) => {
  const [settings, setSettings] = useState<Settings>(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null;
    return {
      ...defaultSettings,
      theme: savedTheme || defaultSettings.theme,
    };
  });
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const location = useLocation();

  // Aplica o tema no <html> (classe .dark) sempre que mudar. Sem isso o toggle
  // salvava a preferência mas não alterava nada na tela.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', settings.theme === 'dark');
  }, [settings.theme]);

  // Acompanha o tema na barra de status do Android — sem isso ela ficava
  // sempre no estilo padrão do sistema, então em alguns aparelhos os ícones
  // (hora, bateria, sinal) ficavam escuros sobre um cabeçalho escuro no modo
  // dark, quase ilegíveis.
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    import('@capacitor/status-bar').then(({ StatusBar, Style }) => {
      StatusBar.setStyle({ style: settings.theme === 'dark' ? Style.Dark : Style.Light }).catch(() => {});
    });
  }, [settings.theme]);

  useEffect(() => {
    async function loadSettings() {
      if (!user) {
        const savedTheme = localStorage.getItem('theme') || 'light';
        setSettings({
          ...defaultSettings,
          theme: (savedTheme === 'dark' ? 'dark' : 'light'),
        });
        setLoading(false);
        return;
      }
      
      setLoading(true);
      
      const cached = offlineCache.get(CacheKeys.USER_SETTINGS) as any;
      if (cached) {
        setSettings({
          alerta_days: cached.alerta_days ?? defaultSettings.alerta_days,
          critico_days: cached.critico_days ?? defaultSettings.critico_days,
          perda_days: cached.perda_days ?? defaultSettings.perda_days,
          inativo_days: cached.inativo_days ?? defaultSettings.inativo_days,
          theme: (localStorage.getItem('theme') as 'light' | 'dark') || cached.theme || defaultSettings.theme,
          has_completed_onboarding: cached.has_completed_onboarding ?? defaultSettings.has_completed_onboarding,
          categories: cached.categories || [],
          commissions: cached.commissions || {},
          delivery_lead_days: cached.delivery_lead_days || {},
          commission_mode: cached.commission_mode || {},
          product_commissions: cached.product_commissions || {},
          revenue_ceiling: parseFloat(cached.revenue_ceiling?.toString() || "1000000") ?? defaultSettings.revenue_ceiling,
          subscription_status: (cached.subscription_status as SubscriptionStatus) || 'active',
          plan_id: cached.plan_id || 'exclusivo',
          avatar_url: cached.avatar_url,
          trial_ends_at: cached.trial_ends_at,
          current_period_end: cached.current_period_end,
          billing_cycle: cached.billing_cycle,
          is_admin: cached.is_admin ?? defaultSettings.is_admin,
          phone: cached.phone,
          weather_city: cached.weather_city,
          weather_state: cached.weather_state,
          weather_lat: cached.weather_lat,
          weather_lng: cached.weather_lng,
        });
      }

      // 1. Fetch Entitlements (Secure)
      const { data: entData, error: entError } = await supabase.from('user_entitlements')
         .select('plan_id, subscription_status, trial_ends_at, current_period_end, billing_cycle')
         .eq('user_id', user.id)
         .maybeSingle();
      
      // 2. Fetch User Settings
      const { data, error } = await supabase
        .from("user_settings")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!error && data) {
        let hasCompleted = data.has_completed_onboarding ?? defaultSettings.has_completed_onboarding;
        let categories = data.categories || [];

        if (!hasCompleted) {
          const { count } = await supabase.from("clients").select("*", { count: 'exact', head: true }).eq("user_id", user.id);
          if (count && count > 0) {
            hasCompleted = true;
            await supabase.from("user_settings").upsert({ user_id: user.id, has_completed_onboarding: true, updated_at: new Date().toISOString() });
          }
        }

        const finalAvatar = localStorage.getItem('avatar_' + user.id) || user?.user_metadata?.avatar_url || data.avatar_url;
        if (finalAvatar && finalAvatar.startsWith('data:') && !localStorage.getItem('avatar_' + user.id)) {
          localStorage.setItem('avatar_' + user.id, finalAvatar);
        }

        let effectiveStatus: SubscriptionStatus = 'inactive';
        let planId = 'exclusivo';

        if (entError) {
          // Fallback to cache if network fails (Grace period)
          effectiveStatus = (cached?.subscription_status as SubscriptionStatus) || 'active';
          planId = cached?.plan_id || 'exclusivo';
        } else if (entData) {
          effectiveStatus = entData.subscription_status as SubscriptionStatus;
          planId = entData.plan_id || 'exclusivo';
          
          const now = new Date();
          if (effectiveStatus === 'trialing' && entData.trial_ends_at) {
             if (new Date(entData.trial_ends_at) < now) {
                effectiveStatus = 'past_due';
             }
          } else if (effectiveStatus === 'active' && entData.current_period_end) {
             if (new Date(entData.current_period_end) < now) {
                effectiveStatus = 'past_due';
             }
          }
        }

        const freshSettings = {
          alerta_days: data.alerta_days ?? defaultSettings.alerta_days,
          critico_days: data.critico_days ?? defaultSettings.critico_days,
          perda_days: data.perda_days ?? defaultSettings.perda_days,
          inativo_days: data.inativo_days ?? defaultSettings.inativo_days,
          theme: (localStorage.getItem('theme') as 'light' | 'dark') || (data.theme as 'light' | 'dark') || defaultSettings.theme,
          has_completed_onboarding: hasCompleted,
          categories: categories,
          commissions: data.commissions || {},
          delivery_lead_days: data.delivery_lead_days || {},
          commission_mode: data.commission_mode || {},
          product_commissions: data.product_commissions || {},
          revenue_ceiling: parseFloat(data.revenue_ceiling?.toString() || "1000000") ?? defaultSettings.revenue_ceiling,
          subscription_status: effectiveStatus,
          plan_id: planId,
          avatar_url: finalAvatar,
          trial_ends_at: entData?.trial_ends_at,
          current_period_end: entData?.current_period_end,
          billing_cycle: entData?.billing_cycle,
          is_admin: data.is_admin ?? defaultSettings.is_admin,
          phone: data.phone,
          weather_city: data.weather_city ?? undefined,
          weather_state: data.weather_state ?? undefined,
          weather_lat: data.weather_lat ?? undefined,
          weather_lng: data.weather_lng ?? undefined,
        };

        setSettings(freshSettings);
        offlineCache.set(CacheKeys.USER_SETTINGS, freshSettings);
      } else {
        if (!cached) setSettings(defaultSettings);
      }
      setLoading(false);
    }

    loadSettings();
  }, [user]);

  const updateSettings = useCallback(async (newSettings: Partial<Settings>) => {
    if (!user) return;
    
    let avatarUrl = newSettings.avatar_url;
    if (avatarUrl && avatarUrl.startsWith('data:')) {
      try {
        localStorage.setItem("avatar_" + user.id, avatarUrl);
        await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      } catch (e) { }
    }

    const updated = { 
      ...settings, 
      ...newSettings,
      ...(avatarUrl ? { avatar_url: avatarUrl } : {})
    };
    setSettings(updated);
    offlineCache.set(CacheKeys.USER_SETTINGS, updated);
    
    if (newSettings.theme) {
      localStorage.setItem('theme', newSettings.theme);
    }

    // Grava SÓ o que mudou, não o objeto inteiro. Mandando tudo, um estado local
    // desatualizado (fetch que falhou, cache vazio) sobrescrevia o banco — foi
    // assim que a lista de representadas do usuário acabou zerada uma vez.
    //
    // Do NOT write plan_id, subscription_status, trial_ends_at to DB from client.
    // is_admin também nunca é escrito pelo cliente — quem manda é a tabela
    // support_admins (e um trigger no banco reverte qualquer tentativa); tirar
    // do payload evita ruído e reforça a proteção do lado do app.
    const { avatar_url, plan_id, subscription_status, trial_ends_at, current_period_end, is_admin, ...changed } =
      { ...newSettings, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) };

    if (Object.keys(changed).length === 0) return;

    const payload = {
      user_id: user.id,
      ...changed,
      updated_at: new Date().toISOString(),
    };

    // Sem internet, o upsert direto sempre falhava aqui — a UI já tinha
    // "salvo" (estado local + offlineCache atualizados acima), então o erro
    // que aparecia em seguida era confuso, e a mudança nunca chegava a subir:
    // o próximo full sync online sobrescrevia com o valor antigo do servidor.
    // Isso afeta empresas representadas, comissões, limites de inatividade,
    // cidade do clima, teto de faturamento e avatar — tudo passa por aqui.
    if (!offlineCache.isOnline()) {
      syncQueue.enqueue("user_settings", "UPSERT", payload, undefined, "user_id");
      return;
    }

    await supabase.from("user_settings").upsert(payload);
  }, [user, settings]);

  const contextValue = useMemo(() => ({ settings, loading, updateSettings }), [settings, loading, updateSettings]);

  return (
    <SettingsContext.Provider value={contextValue}>
      {children}
    </SettingsContext.Provider>
  );
};

