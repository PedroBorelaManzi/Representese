import { MapPin, Loader2 } from 'lucide-react';
import { useSettings } from '../contexts/SettingsContext';
import { useWeatherForecast } from '../hooks/useWeather';
import { WeatherIcon } from './WeatherIcon';
import { WeatherCitySelector } from './WeatherCitySelector';
import { cn } from '../lib/utils';

const formatDateLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

interface WeatherWidgetProps {
  /** Semana a destacar na faixa de previsão — por padrão, os 7 dias a partir
   *  de hoje. Passe a mesma semana exibida na agenda pra manter as duas
   *  visões sincronizadas (ex.: Início). */
  days?: Date[];
}

/** Card de previsão do tempo: hoje em destaque + faixa dos 7 dias da semana
 *  exibida (por padrão, a semana corrente a partir de hoje). */
export function WeatherWidget({ days: customDays }: WeatherWidgetProps) {
  const { settings } = useSettings();
  const hasCity = typeof settings.weather_lat === 'number' && typeof settings.weather_lng === 'number';
  const { data, isLoading, isError } = useWeatherForecast(settings.weather_lat, settings.weather_lng);

  // Sem cidade escolhida: convida a escolher (com o mesmo seletor da Agenda).
  if (!hasCity) {
    return (
      <div className="bg-white dark:bg-zinc-900 rounded-[24px] border border-slate-200/80 dark:border-zinc-800/80 p-4 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950/30 flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5 text-sky-500" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900 dark:text-zinc-100 uppercase tracking-tight truncate">Previsão do tempo</p>
            <p className="text-[11px] font-medium text-slate-400 dark:text-zinc-500 truncate">Escolha uma cidade para acompanhar</p>
          </div>
        </div>
        <WeatherCitySelector className="shrink-0" />
      </div>
    );
  }

  const todayIso = formatDateLocal(new Date());
  const today = data?.daily[todayIso];
  const days = customDays ?? Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });
  const rangeLabel = days.length > 0
    ? `${days[0].toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} – ${days[days.length - 1].toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`
    : '';

  return (
    <div className="bg-gradient-to-br from-sky-500 to-sky-600 dark:from-sky-700 dark:to-sky-800 rounded-3xl shadow-lg shadow-sky-500/20 relative overflow-hidden">
      <div className="absolute -right-6 -top-6 w-28 h-28 rounded-full bg-white/10" />
      <div className="absolute -left-8 bottom-0 w-24 h-24 rounded-full bg-white/5" />

      <div className="relative p-2.5">
        {isLoading ? (
          <div className="flex items-center gap-2 text-white/90 py-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-xs font-bold">Carregando previsão...</span>
          </div>
        ) : isError || !data ? (
          <div className="py-2">
            <p className="text-xs font-black text-white uppercase tracking-tight">Previsão indisponível</p>
            <p className="text-[10px] font-medium text-sky-100 mt-0.5">Tente novamente mais tarde.</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-sky-100 mb-1 min-w-0">
                <MapPin className="w-3 h-3 shrink-0" />
                <span className="text-[9px] font-black uppercase tracking-widest truncate flex-1 min-w-0">
                  {settings.weather_city}
                  {settings.weather_state ? ` · ${settings.weather_state}` : ''}
                </span>
                <WeatherCitySelector compact light />
              </div>
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-3xl font-black text-white tabular-nums leading-none">{data.current.temp}°</span>
                <span className="text-xs font-bold text-sky-50 truncate">{data.current.info.label}</span>
              </div>
              {today && (
                <p className="text-[10px] font-bold text-sky-100 mt-1 tabular-nums">
                  Máx {today.tempMax}° · Mín {today.tempMin}°
                </p>
              )}
            </div>
            <div className="shrink-0 bg-white/15 rounded-2xl p-2.5">
              <WeatherIcon category={data.current.info.category} className="w-9 h-9 !text-white" />
            </div>
          </div>
        )}
      </div>

      {/* Faixa da semana — mesmos dias exibidos na agenda abaixo, quando informados */}
      {!isLoading && !isError && data && (
        <div className="relative px-2.5 pb-2.5">
          <div className="flex items-center justify-between mb-1.5 px-0.5">
            <span className="text-[8px] font-black text-sky-100 uppercase tracking-[0.18em]">Previsão da semana</span>
            {rangeLabel && <span className="text-[8px] font-bold text-sky-100/80 tabular-nums">{rangeLabel}</span>}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((d) => {
              const iso = formatDateLocal(d);
              const fc = data.daily[iso];
              const isToday = iso === todayIso;
              return (
                <div
                  key={iso}
                  className={cn(
                    'flex flex-col items-center gap-0.5 rounded-lg py-1.5 px-0.5',
                    isToday ? 'bg-white/25' : 'bg-white/10'
                  )}
                >
                  <span className="text-[7px] font-black uppercase tracking-wide text-sky-50">
                    {isToday ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
                  </span>
                  {fc ? (
                    <>
                      <WeatherIcon category={fc.info.category} className="w-3.5 h-3.5 !text-white" />
                      <div className="flex flex-col items-center leading-none">
                        <span className="text-[9px] font-black text-white tabular-nums">{fc.tempMax}°</span>
                        <span className="text-[7px] font-bold text-sky-100 tabular-nums">{fc.tempMin}°</span>
                      </div>
                    </>
                  ) : (
                    <span className="text-[8px] font-bold text-sky-100/60 py-1.5">—</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
