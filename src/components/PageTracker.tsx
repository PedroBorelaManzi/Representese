import React from 'react';
import { usePageTracking } from '../hooks/usePageTracking';
import { useGoogleAdsConversion } from '../hooks/useGoogleAdsConversion';
import { useAdsFunnelTracking } from '../hooks/useAdsFunnelTracking';
import { useMetaPixel } from '../hooks/useMetaPixel';

export default function PageTracker() {
  usePageTracking();
  useGoogleAdsConversion();
  useAdsFunnelTracking();
  useMetaPixel();
  return null;
}
