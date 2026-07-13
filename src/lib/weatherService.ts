// Previsão do tempo via Open-Meteo — API pública, gratuita e sem chave de API
// (nada de secret pra configurar). Geocoding + forecast, com suporte a pt-BR.
// Docs: https://open-meteo.com/en/docs

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
  /** Mapa data → previsão do dia (até ~16 dias à frente) */
  daily: Record<string, DailyForecast>;
}

// Mapa dos códigos WMO (weather_code) para categoria + rótulo em português.
// Ref: https://open-meteo.com/en/docs (WMO Weather interpretation codes)
function weatherCodeToInfo(code: number): WeatherInfo {
  if (code === 0) return { category: 'sun', label: 'Céu limpo' };
  if (code === 1 || code === 2) return { category: 'partly', label: 'Parcialmente nublado' };
  if (code === 3) return { category: 'cloud', label: 'Nublado' };
  if (code === 45 || code === 48) return { category: 'fog', label: 'Névoa' };
  if (code >= 51 && code <= 57) return { category: 'rain', label: 'Garoa' };
  if (code >= 61 && code <= 67) return { category: 'rain', label: 'Chuva' };
  if (code >= 71 && code <= 77) return { category: 'snow', label: 'Neve' };
  if (code >= 80 && code <= 82) return { category: 'rain', label: 'Pancadas de chuva' };
  if (code === 85 || code === 86) return { category: 'snow', label: 'Neve' };
  if (code >= 95) return { category: 'storm', label: 'Tempestade' };
  return { category: 'cloud', label: 'Instável' };
}

/** Busca cidades pelo nome (prioriza Brasil). Retorna até 6 sugestões. */
export async function geocodeCity(query: string, signal?: AbortSignal): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=pt&format=json`;
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error('Falha ao buscar cidades.');
  const data = await res.json();
  const mapped = (data?.results || []).map((r: any) => ({
    name: r.name,
    state: r.admin1 || r.country || '',
    lat: r.latitude,
    lng: r.longitude,
    isBr: r.country_code === 'BR',
  }));
  // Cidades brasileiras primeiro, preservando a ordem relativa da API (sort estável).
  mapped.sort((a: { isBr: boolean }, b: { isBr: boolean }) => Number(b.isBr) - Number(a.isBr));
  return mapped.map(({ isBr: _isBr, ...rest }: { isBr: boolean } & GeocodeResult) => rest);
}

/** Previsão atual + diária (até 16 dias) para uma coordenada. */
export async function fetchWeather(lat: number, lng: number, signal?: AbortSignal): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: '16',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal });
  if (!res.ok) throw new Error('Falha ao carregar a previsão do tempo.');
  const data = await res.json();

  const daily: Record<string, DailyForecast> = {};
  const dates: string[] = data?.daily?.time || [];
  dates.forEach((date, i) => {
    daily[date] = {
      date,
      tempMax: Math.round(data.daily.temperature_2m_max[i]),
      tempMin: Math.round(data.daily.temperature_2m_min[i]),
      info: weatherCodeToInfo(data.daily.weather_code[i]),
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
