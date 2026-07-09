import { useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { useSettings } from '../contexts/SettingsContext';

function getSessionId() {
  let sid = localStorage.getItem('landing_session_id');
  if (!sid) {
    sid = crypto.randomUUID();
    localStorage.setItem('landing_session_id', sid);
  }
  return sid;
}

export function useLandingTracking(activeSection: string) {
  const { settings } = useSettings();
  const startTimeRef = useRef<number>(Date.now());
  const currentSectionRef = useRef<string>(activeSection || 'hero');

  // Triggered when the section changes
  useEffect(() => {
    const newSection = activeSection || 'hero';
    
    if (newSection !== currentSectionRef.current) {
      const timeSpentMs = Date.now() - startTimeRef.current;
      const durationSeconds = Math.floor(timeSpentMs / 1000);

      if (durationSeconds > 1 && currentSectionRef.current && !settings?.is_admin) {
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
      
      if (durationSeconds > 1 && currentSectionRef.current && !settings?.is_admin) {
        const sid = getSessionId();
        const sectionId = currentSectionRef.current;
        
        const eventData = {
          session_id: sid,
          section_id: sectionId,
          duration_seconds: durationSeconds
        };
        
        const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/landing_events`;
        navigator.sendBeacon(url, new Blob([JSON.stringify(eventData)], { type: 'application/json' }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
