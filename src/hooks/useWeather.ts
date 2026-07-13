import { useQuery } from '@tanstack/react-query';
import { fetchWeather } from '../lib/weatherService';

/**
 * Previsão do tempo para uma coordenada, cacheada por 30 min (o tempo não muda
 * de minuto em minuto e a API é gratuita, mas educação é não martelar).
 * Fica desabilitado enquanto não houver cidade escolhida.
 */
export function useWeatherForecast(lat?: number, lng?: number) {
  return useQuery({
    queryKey: ['weather', lat, lng],
    queryFn: ({ signal }) => fetchWeather(lat!, lng!, signal),
    enabled: typeof lat === 'number' && typeof lng === 'number',
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });
}
