import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';
import { isTrackingDisabled } from '../lib/trackingOptOut';

export function usePageTracking() {
  const location = useLocation();
  const { user } = useAuth();
  const { settings, loading: settingsLoading } = useSettings();
  const startTimeRef = useRef<number>(Date.now());
  const currentPathRef = useRef<string>(location.pathname);
  // Token capturado fora do handler de unload: lá não dá pra await getSession().
  const accessTokenRef = useRef<string | null>(null);
  // Enquanto as settings ainda não carregaram, is_admin fica no valor padrão (false) —
  // por isso não dá pra confiar nesse campo até settingsLoading terminar, senão a
  // primeira navegação de um admin (antes do fetch resolver) entra como visitante comum.
  const canTrack = () => !settingsLoading && !settings.is_admin && !isTrackingDisabled();

  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (active) accessTokenRef.current = data.session?.access_token ?? null;
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      accessTokenRef.current = session?.access_token ?? null;
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const trackEventMutation = useMutation({
    mutationFn: async (eventData: { event_type: string; route: string; duration_seconds?: number; metadata?: any }) => {
      if (!user) return;
      const { error } = await supabase.from('user_events').insert([{
        user_id: user.id,
        ...eventData
      }]);
      if (error) throw error;
    }
  });

  useEffect(() => {
    // When location changes, calculate time spent on previous route
    const newPath = location.pathname;
    const oldPath = currentPathRef.current;
    
    if (newPath !== oldPath) {
      const timeSpentMs = Date.now() - startTimeRef.current;
      const durationSeconds = Math.floor(timeSpentMs / 1000);

      // Only track if spent more than 1 second to avoid rapid click noise
      if (durationSeconds > 1 && user && canTrack()) {
        trackEventMutation.mutate({
          event_type: 'page_view',
          route: oldPath,
          duration_seconds: durationSeconds
        });
      }

      // Reset timer for the new route
      startTimeRef.current = Date.now();
      currentPathRef.current = newPath;
    }
  }, [location, user, trackEventMutation]);

  // Handle page close/refresh
  useEffect(() => {
    const handleBeforeUnload = () => {
      const timeSpentMs = Date.now() - startTimeRef.current;
      const durationSeconds = Math.floor(timeSpentMs / 1000);
      
      const token = accessTokenRef.current;
      if (durationSeconds > 1 && user && canTrack() && token) {
        // fetch + keepalive (não sendBeacon): o beacon não deixa setar headers,
        // então apikey/Authorization nunca iam junto e o RLS derrubava o insert.
        // keepalive mantém a requisição viva mesmo com a aba fechando.
        fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_events`, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            user_id: user.id,
            event_type: 'page_view',
            route: currentPathRef.current,
            duration_seconds: durationSeconds,
          }),
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  return {
    trackAction: (actionName: string, metadata?: any) => {
      if (user && canTrack()) {
        trackEventMutation.mutate({
          event_type: 'action',
          route: location.pathname,
          metadata: { action: actionName, ...metadata }
        });
      }
    }
  };
}
