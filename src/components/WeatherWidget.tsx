import { MapPin, Loader2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useWeatherForecast } from '../hooks/useWeather';
import { WeatherIcon } from './WeatherIcon';
import { WeatherCitySelector } from './WeatherCitySelector';

const formatDateLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Quadradinho de previsão do dia atual na página inicial. */
export function WeatherWidget() {
  const { settings } = useSettings();
  const hasCity = typeof settings.weather_lat === 'number' && typeof settings.weather_lng === 'number';
  const { data, isLoading, isError } = useWeatherForecast(settings.weather_lat, settings.weather_lng);

  // Sem cidade escolhida: convida a escolher (com o mesmo seletor da Agenda).
  if (!hasCity) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] border border-slate-200/80 dark:border-zinc-800/80 p-4 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-sky-500" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight">Previsão do tempo</p>
            <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500">Escolha uma cidade para acompanhar</p>
          </div>
        </div>
        <WeatherCitySelector />
      </div>
    );
  }

  const today = data?.daily[formatDateLocal(new Date())];

  return (
    <div className="bg-gradient-to-br from-sky-500 to-sky-600 dark:from-sky-700 dark:to-sky-800 rounded-[24px] p-5 shadow-lg shadow-sky-500/20 relative overflow-hidden">
      <div className="absolute -right-6 -top-6 w-32 h-32 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-white/90 py-4">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span className="text-sm font-bold">Carregando previsão...</span>
          </div>
        ) : isError || !data ? (
          <div className="py-3">
            <p className="text-sm font-black text-white uppercase tracking-tight">Previsão indisponível</p>
            <p className="text-[11px] font-medium text-sky-100 mt-0.5">Tente novamente mais tarde.</p>
          </div>
        ) : (
          <>
            <div>
              <div className="flex items-center gap-1.5 text-sky-100 mb-1">
                <MapPin className="w-3.5 h-3.5" />
                <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[180px]">
                  {settings.weather_city}
                  {settings.weather_state ? ` · ${settings.weather_state}` : ''}
                </span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-white tabular-nums leading-none">{data.current.temp}°</span>
                <span className="text-sm font-bold text-sky-50">{data.current.info.label}</span>
              </div>
              {today && (
                <p className="text-[11px] font-bold text-sky-100 mt-1.5 tabular-nums">
                  Máx {today.tempMax}° · Mín {today.tempMin}°
                </p>
              )}
            </div>
            <div className="shrink-0 bg-white/15 rounded-3xl p-4">
              <WeatherIcon category={data.current.info.category} className="w-12 h-12 !text-white" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
