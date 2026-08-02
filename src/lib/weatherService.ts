// Previsão do tempo via Open-Meteo — sem chave de API, combina dados de
// múltiplos serviços meteorológicos oficiais (NOAA/GFS, DWD ICON, ECMWF,
// Météo-France, JMA, entre outros). Duas camadas: previsão precisa de 16
// dias (multi-modelo) + tendência de mais 14 dias (modelo sub-sazonal EC46
// do ECMWF, via Seasonal Forecast API), totalizando ~30 dias — contra os
// poucos dias da fonte anterior (Weatherapi.com, cujo plano gratuito
// limitava bastante a janela de previsão).
// Docs: https://open-meteo.com/en/docs · https://open-meteo.com/en/docs/geocoding-api
// · https://open-meteo.com/en/docs/seasonal-forecast-api

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
  /** true = veio do modelo sub-sazonal (dia 17+, tendência de menor precisão),
   *  ausente/false = previsão precisa do modelo de curto prazo (até 16 dias). */
  isExtended?: boolean;
}

export interface CurrentWeather {
  temp: number;
  info: WeatherInfo;
}

export interface WeatherData {
  current: CurrentWeather;
  /** Mapa data → previsão do dia (até ~30 dias à frente; dias 17+ vêm marcados com `isExtended`) */
  daily: Record<string, DailyForecast>;
}

// Quantos dias de previsão diária *precisa* pedir à API principal — o teto
// real de qualquer fonte confiável: nenhum serviço meteorológico (pago ou
// grátis) faz previsão diária precisa de um mês inteiro com um modelo
// determinístico; depois de ~2 semanas isso deixa de existir.
const FORECAST_DAYS = 16;

// Pra cobrir os dias 17–30 pedidos, usamos como segunda camada (melhor
// esforço) o modelo sub-sazonal EC46 do ECMWF via Seasonal Forecast API da
// Open-Meteo — o mesmo serviço oficial, sem chave, especializado em previsão
// de 16 a 46 dias. É uma tendência de menor resolução (ensemble de 51
// membros), não uma previsão precisa dia a dia — por isso cada entrada extra
// fica marcada com `isExtended: true` em vez de fingir a mesma certeza da
// previsão de curto prazo.
const EXTENDED_FORECAST_DAYS = 30;

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

// O modelo sub-sazonal não devolve weather_code (só temperatura e chuva
// acumulada) — classifica de forma conservadora a partir da chuva prevista
// em vez de inventar "céu limpo" sem ter esse dado.
function precipitationToExtendedInfo(precipitationSum: number): WeatherInfo {
  if (precipitationSum >= 1) return { category: 'rain', label: 'Tendência de chuva' };
  return { category: 'partly', label: 'Tendência' };
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

/** Previsão atual + diária (16 dias precisos + tendência até ~30 dias) para uma coordenada. */
export async function fetchWeather(lat: number, lng: number, signal?: AbortSignal): Promise<WeatherData> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'auto',
  });
  const extendedParams = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'temperature_2m_max,temperature_2m_min,precipitation_sum',
    forecast_days: String(EXTENDED_FORECAST_DAYS),
    timezone: 'auto',
  });

  // A camada estendida (17-30 dias) é melhor-esforço: se o modelo sub-sazonal
  // falhar, mudar de formato ou simplesmente demorar, a previsão precisa de
  // curto prazo não pode ser derrubada por causa disso — daí o .catch(() =>
  // null) só nessa chamada, nunca na principal.
  const [res, extendedRes] = await Promise.all([
    fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, { signal: withTimeout(signal, 8000) }),
    fetch(`https://seasonal-api.open-meteo.com/v1/seasonal?${extendedParams.toString()}`, { signal: withTimeout(signal, 8000) }).catch(() => null),
  ]);
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

  if (extendedRes?.ok) {
    try {
      const extendedData = await extendedRes.json();
      const extDates: string[] = extendedData?.daily?.time || [];
      const extTempsMax: number[] = extendedData?.daily?.temperature_2m_max || [];
      const extTempsMin: number[] = extendedData?.daily?.temperature_2m_min || [];
      const extPrecip: number[] = extendedData?.daily?.precipitation_sum || [];
      extDates.forEach((date, i) => {
        // Já temos dado preciso do modelo de curto prazo pra esse dia — não sobrescreve.
        if (daily[date]) return;
        if (typeof extTempsMax[i] !== 'number' || typeof extTempsMin[i] !== 'number') return;
        daily[date] = {
          date,
          tempMax: Math.round(extTempsMax[i]),
          tempMin: Math.round(extTempsMin[i]),
          info: precipitationToExtendedInfo(extPrecip[i] ?? 0),
          isExtended: true,
        };
      });
    } catch {
      // Melhor esforço — formato inesperado não pode derrubar a previsão de curto prazo.
    }
  }

  return {
    current: {
      temp: Math.round(data?.current?.temperature_2m ?? 0),
      info: weatherCodeToInfo(data?.current?.weather_code ?? 3),
    },
    daily,
  };
}
