import React from 'react';
import { usePageTracking } from '../hooks/usePageTracking';
import { useGoogleAdsConversion } from '../hooks/useGoogleAdsConversion';
import { useAdsFunnelTracking } from '../hooks/useAdsFunnelTracking';

export default function PageTracker() {
  usePageTracking();
  useGoogleAdsConversion();
  useAdsFunnelTracking();
  return null;
}
