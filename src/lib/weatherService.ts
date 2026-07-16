// Previsão do tempo via Weatherapi.com — API pública, gratuita com chave.
// Docs: https://www.weatherapi.com/docs/
// Chave armazenada em VITE_WEATHERAPI_KEY (env var pública no frontend)

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

// Mapa de condition_code Weatherapi.com para categoria + rótulo em português.
// Ref: https://www.weatherapi.com/docs/weather_conditions.json (condition codes)
function weatherCodeToInfo(code: number): WeatherInfo {
  if (code === 1000) return { category: 'sun', label: 'Céu limpo' };
  if (code === 1003) return { category: 'partly', label: 'Parcialmente nublado' };
  if (code === 1006) return { category: 'cloud', label: 'Nublado' };
  if (code === 1009) return { category: 'cloud', label: 'Encoberto' };
  if (code === 1030 || code === 1135 || code === 1147) return { category: 'fog', label: 'Névoa' };
  // Garoa / chuva fraca
  if (code === 1063 || code === 1072 || code === 1150 || code === 1153 || code === 1168 || code === 1171) {
    return { category: 'rain', label: 'Garoa' };
  }
  // Chuva (líquida, sem neve/granizo)
  if (
    code === 1069 || code === 1180 || code === 1183 || code === 1186 || code === 1189 ||
    code === 1192 || code === 1195 || code === 1198 || code === 1201 ||
    code === 1240 || code === 1243 || code === 1246
  ) {
    return { category: 'rain', label: 'Chuva' };
  }
  if (code === 1249 || code === 1252) return { category: 'rain', label: 'Pancadas de chuva' };
  // Neve / granizo / nevasca
  if (
    code === 1066 || code === 1114 || code === 1117 ||
    code === 1204 || code === 1207 || code === 1210 || code === 1213 || code === 1216 ||
    code === 1219 || code === 1222 || code === 1225 || code === 1237 ||
    code === 1255 || code === 1258 || code === 1261 || code === 1264
  ) {
    return { category: 'snow', label: 'Neve' };
  }
  if (code === 1087 || code === 1273 || code === 1276 || code === 1279 || code === 1282) {
    return { category: 'storm', label: 'Tempestade' };
  }
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
  const apiKey = import.meta.env.VITE_WEATHERAPI_KEY;
  if (!apiKey) throw new Error('Chave Weatherapi.com não configurada (VITE_WEATHERAPI_KEY).');
  const url = `https://api.weatherapi.com/v1/search.json?key=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { signal: withTimeout(signal, 8000) });
  if (!res.ok) throw new Error('Falha ao buscar cidades.');
  const data = await res.json();
  const mapped = (Array.isArray(data) ? data : []).map((r: any) => ({
    name: r.name,
    state: r.region || r.country || '',
    lat: r.lat,
    lng: r.lon,
    isBr: r.country === 'Brazil',
  }));
  // Cidades brasileiras primeiro, preservando a ordem relativa da API (sort estável).
  mapped.sort((a: { isBr: boolean }, b: { isBr: boolean }) => Number(b.isBr) - Number(a.isBr));
  return mapped.slice(0, 6).map(({ isBr: _isBr, ...rest }: { isBr: boolean } & GeocodeResult) => rest);
}

/** Previsão atual + diária (até 10 dias com Weatherapi free tier) para uma coordenada. */
export async function fetchWeather(lat: number, lng: number, signal?: AbortSignal): Promise<WeatherData> {
  const apiKey = import.meta.env.VITE_WEATHERAPI_KEY;
  if (!apiKey) throw new Error('Chave Weatherapi.com não configurada (VITE_WEATHERAPI_KEY).');
  const params = new URLSearchParams({
    key: apiKey,
    q: `${lat},${lng}`,
    days: '10',
    aqi: 'no',
    alerts: 'no',
  });
  const res = await fetch(`https://api.weatherapi.com/v1/forecast.json?${params.toString()}`, { signal: withTimeout(signal, 8000) });
  if (!res.ok) throw new Error('Falha ao carregar a previsão do tempo.');
  const data = await res.json();

  const daily: Record<string, DailyForecast> = {};
  const forecastDays: any[] = data?.forecast?.forecastday || [];
  forecastDays.forEach((day) => {
    const date = day.date;
    daily[date] = {
      date,
      tempMax: Math.round(day.day.maxtemp_c),
      tempMin: Math.round(day.day.mintemp_c),
      info: weatherCodeToInfo(day.day.condition.code),
    };
  });

  return {
    current: {
      temp: Math.round(data?.current?.temp_c ?? 0),
      info: weatherCodeToInfo(data?.current?.condition?.code ?? 1009),
    },
    daily,
  };
}
