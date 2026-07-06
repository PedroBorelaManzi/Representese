import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { posthog } from "../lib/posthog";

/** Dispara um pageview do PostHog a cada mudança de rota (capture_pageview desligado no init). */
export function useTrackPageview() {
  const location = useLocation();
  useEffect(() => {
    posthog.capture("$pageview");
  }, [location.pathname]);
}
