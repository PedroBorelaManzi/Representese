import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { useSettings } from '../contexts/SettingsContext';

export function usePageTracking() {
  const location = useLocation();
  const { user } = useAuth();
  const { settings } = useSettings();
  const startTimeRef = useRef<number>(Date.now());
  const currentPathRef = useRef<string>(location.pathname);

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
      if (durationSeconds > 1 && user && !settings.is_admin) {
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
      
      if (durationSeconds > 1 && user && !settings.is_admin) {
        // We use fetch with keepalive or synchronous xhr for unload events ideally, 
        // but for simplicity we'll try the mutation. It might not complete if the page closes, 
        // but it's acceptable for internal analytics.
        // Or we can use navigator.sendBeacon
        const eventData = {
          user_id: user.id,
          event_type: 'page_view',
          route: currentPathRef.current,
          duration_seconds: durationSeconds
        };
        // Fallback for unload
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/user_events`;
        const headers = {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${(supabase as any).auth?.session?.()?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`
        };
        navigator.sendBeacon(url, new Blob([JSON.stringify(eventData)], { type: 'application/json' }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [user]);

  return {
    trackAction: (actionName: string, metadata?: any) => {
      if (user && !settings.is_admin) {
        trackEventMutation.mutate({
          event_type: 'action',
          route: location.pathname,
          metadata: { action: actionName, ...metadata }
        });
      }
    }
  };
}
