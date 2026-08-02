// Previsão do tempo via Open-Meteo — sem chave de API, combina dados de
// múltiplos serviços meteorológicos oficiais (NOAA/GFS, DWD ICON, ECMWF,
// Météo-France, JMA, entre outros) e oferece até 16 dias de previsão diária
// gratuitamente, contra os poucos dias da fonte anterior (Weatherapi.com,
// cujo plano gratuito limitava a janela de previsão).
// Docs: https://open-meteo.com/en/docs · https://open-meteo.com/en/docs/geocoding-api

export interface GeocodeResult {
  name: string;
  state: string;
  lat: number;
  lng: number;
}

export type WeatherCategory = 'sun' | 'partly' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

export interface WeatherInfo {
  category: WeatherCategory;
  label: string;
}

export interface DailyForecast {
  /** "2026-07-13" */
  date: string;
  tempMax: number;
  tempMin: number;
  info: WeatherInfo;
}

export interface CurrentWeather {
  temp: number;
  info: WeatherInfo;
}

export interface WeatherData {
  current: CurrentWeather;
  /** Mapa data → previsão do dia (até 16 dias à frente) */
  daily: Record<string, DailyForecast>;
}

// Quantos dias de previsão diária pedir à API — o máximo do plano gratuito.
// Previsão confiável de verdade não passa muito disso: nenhuma fonte
// meteorológica (paga ou grátis) faz previsão diária precisa de um mês
// inteiro — depois de ~2 semanas o resultado vira estimativa estatística,
// não previsão real, então 16 dias já é o teto que faz sentido usar.
const FORECAST_DAYS = 16;

// Weather code (tabela padrão da OMM/WMO) usada pelo Open-Meteo.
// Ref: https://open-meteo.com/en/docs#weathervariables
function weatherCodeToInfo(code: number): WeatherInfo {
  if (code === 0) return { category: 'sun', label: 'Céu limpo' };
  if (code === 1 || code === 2) return { category: 'partly', label: 'Parcialmente nublado' };
  if (code === 3) return { category: 'cloud', label: 'Nublado' };
  if (code === 45 || code === 48) return { category: 'fog', label: 'Névoa' };
  if (code === 51 || code === 53 || code === 55) return { category: 'rain', label: 'Garoa' };
  if (code === 56 || code === 57) return { category: 'rain', label: 'Garoa congelante' };
  if (code === 61 || code === 63) return { category: 'rain', label: 'Chuva' };
  if (code === 65) return { category: 'rain', label: 'Chuva forte' };
  if (code === 66 || code === 67) return { category: 'rain', label: 'Chuva congelante' };
  if (code === 80 || code === 81 || code === 82) return { category: 'rain', label: 'Pancadas de chuva' };
  if (code === 71 || code === 73 || code === 75 || code === 77 || code === 85 || code === 86) {
    return { category: 'snow', label: 'Neve' };
  }
  if (code === 95) return { category: 'storm', label: 'Tempestade' };
  if (code === 96 || code === 99) return { category: 'storm', label: 'Tempestade com granizo' };
  return { category: 'cloud', label: 'Instável' };
}

/** Combina o AbortSignal do chamador (cancelamento por debounce) com um
 *  timeout próprio — sem isso, uma rede travada deixa a busca girando pra
 *  sempre em vez de falhar e permitir tentar de novo. `AbortSignal.any` não
 *  existe em WebViews Android mais antigos (o app roda em Capacitor) — nesse
 *  caso cai para o signal do chamador puro em vez de quebrar a busca. */
function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal | undefined {
  if (typeof AbortSignal.timeout !== 'function') return signal;
  const timeoutSignal = AbortSignal.timeout(ms);
  if (!signal) return timeoutSignal;
  if (typeof AbortSignal.any !== 'function') return signal;
  return AbortSignal.any([signal, timeoutSignal]);
}

/** Busca cidades pelo nome (prioriza Brasil). Retorna até 6 sugestões. */
export async function geocodeCity(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=pt&format=json`;
  const res = await fetch(url, { signal: withTimeout(signal, 8000) });
  if (!res.ok) throw new Error('Falha ao buscar cidades.');
  const data = await res.json();
  const mapped = (Array.isArray(data?.results) ? data.results : []).map((r: any) => ({
    name: r.name,
    state: r.admin1 || r.country || '',
    lat: r.latitude,
    lng: r.longitude,
    isBr: r.country_code === 'BR',
  }));
  // Cidades brasileiras primeiro, preservando a ordem relativa da API (sort estável).
  mapped.sort((a: { isBr: boolean }, b: { isBr: boolean }) => Number(b.isBr) - Number(a.isBr));
  return mapped.slice(0, 6).map(({ isBr: _isBr, ...rest }: { isBr: boolean } & GeocodeResult) => rest);
}

/** Previsão atual + diária (até 16 dias) para uma coordenada. */
export async function fetchWeather(lat: number, lng: number, signal?: AbortSignal): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal: withTimeout(signal, 8000) });
  if (!res.ok) throw new Error('Falha ao carregar a previsão do tempo.');
  const data = await res.json();

  const daily: Record<string, DailyForecast> = {};
  const dates: string[] = data?.daily?.time || [];
  const weatherCodes: number[] = data?.daily?.weather_code || [];
  const tempsMax: number[] = data?.daily?.temperature_2m_max || [];
  const tempsMin: number[] = data?.daily?.temperature_2m_min || [];
  dates.forEach((date, i) => {
    daily[date] = {
      date,
      tempMax: Math.round(tempsMax[i]),
      tempMin: Math.round(tempsMin[i]),
      info: weatherCodeToInfo(weatherCodes[i]),
    };
  });

  return {
    current: {
      temp: Math.round(data?.current?.temperature_2m ?? 0),
      info: weatherCodeToInfo(data?.current?.weather_code ?? 3),
    },
    daily,
  };
}
