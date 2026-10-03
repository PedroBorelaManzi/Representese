import React from 'react';
import { usePageTracking } from '../hooks/usePageTracking';
import { useGoogleAdsConversion } from '../hooks/useGoogleAdsConversion';

export default function PageTracker() {
  usePageTracking();
  useGoogleAdsConversion();
  return null;
}
