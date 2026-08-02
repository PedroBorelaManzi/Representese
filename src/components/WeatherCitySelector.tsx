import { useState, useEffect, useRef } from 'react';
import { MapPin, Search, X, Loader2, CloudSun, AlertTriangle, RefreshCw, Pencil } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSettings } from '../contexts/SettingsContext';
import { geocodeCity, GeocodeResult } from '../lib/weatherService';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

interface WeatherCitySelectorProps {
  className?: string;
  /** Botão só com ícone (sem o nome da cidade) — pra caber em cards apertados. */
  compact?: boolean;
  /** Estilo claro pro botão compacto sobre fundos coloridos/escuros (ex.: o card de clima). */
  light?: boolean;
}

/** Botão + popover para escolher a cidade da previsão do tempo. */
export function WeatherCitySelector({ className, compact = false, light = false }: WeatherCitySelectorProps) {
  const { settings, updateSettings } = useSettings();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);

  // Busca com debounce; cancela requisições em voo ao digitar de novo.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchError(false);
      return;
    }
    const controller = new AbortController();
    setSearching(true);
    setSearchError(false);
    const t = setTimeout(async () => {
      try {
        const found = await geocodeCity(q, controller.signal);
        setResults(found);
      } catch (err) {
        // Abort por causa do próprio debounce não é erro de verdade — só a
        // busca seguinte que importa. Qualquer outra falha (rede, CSP, API
        // fora do ar) precisa aparecer pro usuário, senão fica indistinguível
        // de "a cidade não existe".
        if ((err as Error)?.name !== 'AbortError') {
          console.error('Erro ao buscar cidade:', err);
          setSearchError(true);
          setResults([]);
        }
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      controller.abort();
      clearTimeout(t);
    };
  }, [query, open, retryTick]);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const pick = async (r: GeocodeResult) => {
    try {
      await updateSettings({
        weather_city: r.name,
        weather_state: r.state,
        weather_lat: r.lat,
        weather_lng: r.lng,
      });
      toast.success(`Previsão de ${r.name} ativada!`);
      setOpen(false);
      setQuery('');
      setResults([]);
    } catch {
      toast.error('Não foi possível salvar a cidade.');
    }
  };

  const label = settings.weather_city || 'Cidade da previsão';

  return (
    <div className={cn('relative', className)} ref={boxRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Trocar cidade da previsão"
        title="Trocar cidade da previsão"
        className={cn(
          compact
            ? cn(
                'flex items-center justify-center w-7 h-7 rounded-full transition-all shrink-0',
                light ? 'bg-white/40 hover:bg-white/50 text-white shadow-lg shadow-white/30' : 'bg-sky-50 dark:bg-sky-950/30 text-sky-600 hover:bg-sky-100 dark:hover:bg-sky-900/40'
              )
            : cn(
                'flex items-center gap-2 px-4 py-3 rounded-2xl transition-all font-black uppercase text-[10px] tracking-widest shadow-sm border',
                settings.weather_city
                  ? 'bg-sky-50 dark:bg-sky-950/30 text-sky-600 dark:text-sky-400 border-sky-100 dark:border-sky-900/40'
                  : 'bg-white dark:bg-zinc-800 text-slate-400 hover:text-sky-600 border-slate-100 dark:border-zinc-800'
              )
        )}
      >
        {compact ? (
          <Pencil className="w-3.5 h-3.5" />
        ) : (
          <>
            <CloudSun className="w-4 h-4 text-sky-500" />
            <span className="truncate max-w-[140px]">{label}</span>
          </>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            className={cn(
              'absolute mt-2 w-72 max-w-[calc(100vw-2rem)] bg-white dark:bg-zinc-900 rounded-3xl border border-slate-200 dark:border-zinc-800 shadow-2xl z-[9000] overflow-hidden',
              compact ? 'right-0' : 'left-0 sm:left-auto sm:right-0'
            )}
          >
            <div className="p-3 border-b border-slate-100 dark:border-zinc-800 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 shrink-0" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar cidade..."
                className="flex-1 bg-transparent outline-none text-sm font-bold text-slate-800 dark:text-zinc-100 placeholder:text-slate-400"
              />
              {searching ? (
                <Loader2 className="w-4 h-4 text-slate-300 animate-spin shrink-0" />
              ) : query ? (
                <button onClick={() => setQuery('')} className="text-slate-300 hover:text-slate-500 shrink-0">
                  <X className="w-4 h-4" />
                </button>
              ) : null}
            </div>

            <div className="max-h-64 overflow-y-auto custom-scrollbar">
              {searchError && !searching && (
                <div className="flex flex-col items-center gap-2 text-center py-6 px-4">
                  <AlertTriangle className="w-5 h-5 text-amber-500" />
                  <p className="text-xs text-slate-500 dark:text-zinc-400 font-medium">
                    Não foi possível buscar agora. Verifique sua conexão e tente de novo.
                  </p>
                  <button
                    onClick={() => setRetryTick((t) => t + 1)}
                    className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-sky-600 hover:text-sky-700 transition-colors mt-1"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Tentar de novo
                  </button>
                </div>
              )}
              {!searchError && results.length === 0 && query.trim().length >= 2 && !searching && (
                <p className="text-xs text-slate-400 font-medium text-center py-6 px-4">Nenhuma cidade encontrada.</p>
              )}
              {!searchError && results.length === 0 && query.trim().length < 2 && (
                <p className="text-xs text-slate-400 font-medium text-center py-6 px-4">Digite o nome de uma cidade.</p>
              )}
              {results.map((r, i) => {
                const isCurrent = settings.weather_city === r.name && settings.weather_state === r.state;
                return (
                  <button
                    key={`${r.name}-${r.lat}-${i}`}
                    onClick={() => pick(r)}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 text-left transition-colors border-b border-slate-50 dark:border-zinc-800/60',
                      isCurrent ? 'bg-sky-50 dark:bg-sky-950/20' : 'hover:bg-slate-50 dark:hover:bg-zinc-800/60'
                    )}
                  >
                    <MapPin className="w-4 h-4 text-sky-500 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-800 dark:text-zinc-100 truncate">{r.name}</p>
                      {r.state && <p className="text-[10px] font-medium text-slate-400 truncate">{r.state}</p>}
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
