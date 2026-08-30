import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';
import { isTrackingDisabled } from '../lib/trackingOptOut';
import { hasAnalyticsConsent } from '../lib/cookieConsent';

function getSessionId() {
  let sid = localStorage.getItem('landing_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('landing_session_id', sid);
  }
  return sid;
}

export function useLandingTracking(activeSection: string) {
  const { settings, loading: settingsLoading } = useSettings();
  const startTimeRef = useRef<number>(Date.now());
  const currentSectionRef = useRef<string>(activeSection || 'hero');
  // Mesma lógica do usePageTracking: is_admin só é confiável depois que settings carrega.
  const canTrack = () =>
    !settingsLoading && !settings?.is_admin && !isTrackingDisabled() && hasAnalyticsConsent();

  // Triggered when the section changes
  useEffect(() => {
    const newSection = activeSection || 'hero';
    
    if (newSection !== currentSectionRef.current) {
      const timeSpentMs = Date.now() - startTimeRef.current;
      const durationSeconds = Math.floor(timeSpentMs / 1000);

      if (durationSeconds > 1 && currentSectionRef.current && canTrack()) {
        const sid = getSessionId();
        const sectionId = currentSectionRef.current;

        // Log quietly in the background
        supabase.from('landing_events').insert([{
          session_id: sid,
          section_id: sectionId,
          duration_seconds: durationSeconds
        }]).then(({ error }) => {
           if (error) console.error('Failed to log landing event', error);
        });
      }

      startTimeRef.current = Date.now();
      currentSectionRef.current = newSection;
    }
  }, [activeSection]);

  // Triggered when page closes
  useEffect(() => {
    const handleBeforeUnload = () => {
      const timeSpentMs = Date.now() - startTimeRef.current;
      const durationSeconds = Math.floor(timeSpentMs / 1000);
      
      if (durationSeconds > 1 && currentSectionRef.current && canTrack()) {
        const sid = getSessionId();
        const sectionId = currentSectionRef.current;

        const eventData = {
          session_id: sid,
          section_id: sectionId,
          duration_seconds: durationSeconds
        };

        // sendBeacon não permite headers customizados, e o PostgREST exige "apikey" —
        // por isso esse evento nunca era gravado antes. fetch com keepalive resolve.
        // (Diferente de user_events, landing_events aceita insert público sem JWT.)
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/landing_events`;
        fetch(url, {
          method: 'POST',
          keepalive: true,
          headers: {
            'Content-Type': 'application/json',
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify(eventData)
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
