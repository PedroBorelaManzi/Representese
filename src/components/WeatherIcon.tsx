import { Sun, CloudSun, Cloud, CloudFog, CloudRain, CloudSnow, CloudLightning } from 'lucide-react';
import { WeatherCategory } from '../lib/weatherService';
import { cn } from '../lib/utils';

const MAP: Record<WeatherCategory, { Icon: typeof Sun; color: string }> = {
  sun: { Icon: Sun, color: 'text-amber-500' },
  partly: { Icon: CloudSun, color: 'text-amber-400' },
  cloud: { Icon: Cloud, color: 'text-slate-400' },
  fog: { Icon: CloudFog, color: 'text-slate-400' },
  rain: { Icon: CloudRain, color: 'text-sky-500' },
  snow: { Icon: CloudSnow, color: 'text-sky-300' },
  storm: { Icon: CloudLightning, color: 'text-violet-500' },
};

export function WeatherIcon({ category, className }: { category: WeatherCategory; className?: string }) {
  const { Icon, color } = MAP[category] || MAP.cloud;
  return <Icon className={cn(color, className)} />;
}
