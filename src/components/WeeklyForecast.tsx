import { WeatherData } from '../lib/weatherService';
import { WeatherIcon } from './WeatherIcon';
import { cn } from '../lib/utils';

const formatDateLocal = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

/** Faixa horizontal com a previsão de 7 dias — por padrão os próximos 7 a
 *  partir de hoje, ou a semana exata passada em `days` (ex.: a mesma semana
 *  exibida na agenda). */
export function WeeklyForecast({ data, city, days: customDays }: { data: WeatherData; city?: string; days?: Date[] }) {
  const todayIso = formatDateLocal(new Date());
  const days = customDays ?? Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return d;
  });

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[24px] border border-slate-200/80 dark:border-zinc-800/80 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3 px-1">
        <span className="text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-[0.18em]">
          Previsão da semana
        </span>
        {city && <span className="text-[10px] font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider truncate max-w-[160px]">{city}</span>}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((d) => {
          const iso = formatDateLocal(d);
          const fc = data.daily[iso];
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              className={cn(
                'flex flex-col items-center gap-1.5 rounded-2xl py-2.5 px-1 min-w-0',
                isToday ? 'bg-sky-50 dark:bg-sky-950/30' : 'bg-slate-50/60 dark:bg-zinc-800/30'
              )}
            >
              <span className={cn('text-[9px] font-black uppercase tracking-wide', isToday ? 'text-sky-600 dark:text-sky-400' : 'text-slate-400 dark:text-zinc-500')}>
                {isToday ? 'Hoje' : d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '')}
              </span>
              {fc ? (
                <>
                  <WeatherIcon category={fc.info.category} className="w-5 h-5" />
                  <div className="flex flex-col items-center leading-none">
                    <span className="text-[11px] font-black text-slate-900 dark:text-zinc-100 tabular-nums">{fc.tempMax}°</span>
                    <span className="text-[9px] font-bold text-slate-400 dark:text-zinc-500 tabular-nums">{fc.tempMin}°</span>
                  </div>
                </>
              ) : (
                <span className="text-[10px] font-bold text-slate-300 dark:text-zinc-600 py-2">—</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
