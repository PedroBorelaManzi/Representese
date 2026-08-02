import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWeather, geocodeCity } from './weatherService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWeather', () => {
  it('mapeia current + daily e converte weather codes (OMM) em categorias', async () => {
    const apiResponse = {
      current: { temperature_2m: 24.6, weather_code: 0 },
      daily: {
        time: ['2026-07-13', '2026-07-14', '2026-07-15'],
        weather_code: [0, 3, 61],
        temperature_2m_max: [28.4, 25.1, 19.9],
        temperature_2m_min: [17.2, 16.0, 14.3],
      },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const data = await fetchWeather(-23.55, -46.63);

    // Arredonda a temperatura atual e classifica o céu limpo (código 0) como "sun"
    expect(data.current.temp).toBe(25);
    expect(data.current.info.category).toBe('sun');

    // Indexa por data e arredonda máx/mín
    expect(Object.keys(data.daily)).toHaveLength(3);
    expect(data.daily['2026-07-13'].tempMax).toBe(28);
    expect(data.daily['2026-07-13'].tempMin).toBe(17);
    expect(data.daily['2026-07-13'].info.category).toBe('sun');

    // Nublado (3) e chuva (61)
    expect(data.daily['2026-07-14'].info.category).toBe('cloud');
    expect(data.daily['2026-07-15'].info.category).toBe('rain');
  });

  it('classifica códigos de neve corretamente (não confunde com chuva)', async () => {
    const apiResponse = {
      current: { temperature_2m: -2, weather_code: 71 },
      daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const data = await fetchWeather(0, 0);
    expect(data.current.info.category).toBe('snow');
  });

  it('classifica tempestade com granizo (96/99) na categoria storm', async () => {
    const apiResponse = {
      current: { temperature_2m: 22, weather_code: 96 },
      daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const data = await fetchWeather(0, 0);
    expect(data.current.info.category).toBe('storm');
  });

  it('lança erro em resposta não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchWeather(0, 0)).rejects.toThrow();
  });

  it('pede até 16 dias de previsão precisa (o teto do modelo de curto prazo)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ current: { temperature_2m: 20, weather_code: 0 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchWeather(-23.55, -46.63);

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    expect(calledUrl).toContain('forecast_days=16');
    expect(calledUrl).toContain('api.open-meteo.com');
  });

  it('pede a tendência estendida (~30 dias) ao modelo sub-sazonal, numa segunda chamada', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ current: { temperature_2m: 20, weather_code: 0 }, daily: { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [] } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchWeather(-23.55, -46.63);

    const extendedUrl = fetchMock.mock.calls[1][0] as string;
    expect(extendedUrl).toContain('forecast_days=30');
    expect(extendedUrl).toContain('seasonal-api.open-meteo.com');
  });

  it('preenche os dias além dos 16 precisos com a tendência do modelo sub-sazonal, marcados isExtended', async () => {
    const nearResponse = {
      current: { temperature_2m: 24, weather_code: 0 },
      daily: {
        time: ['2026-07-13'],
        weather_code: [0],
        temperature_2m_max: [28],
        temperature_2m_min: [17],
      },
    };
    const extendedResponse = {
      daily: {
        time: ['2026-07-13', '2026-07-27'],
        temperature_2m_max: [29, 26],
        temperature_2m_min: [18, 15],
        precipitation_sum: [0, 4],
      },
    };
    const fetchMock = vi.fn((url: string) =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(url.includes('seasonal-api') ? extendedResponse : nearResponse),
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchWeather(-23.55, -46.63);

    // Dia já coberto pela previsão precisa: não é sobrescrito pela tendência.
    expect(data.daily['2026-07-13'].tempMax).toBe(28);
    expect(data.daily['2026-07-13'].isExtended).toBeFalsy();

    // Dia só coberto pelo modelo sub-sazonal: entra marcado como tendência.
    expect(data.daily['2026-07-27'].tempMax).toBe(26);
    expect(data.daily['2026-07-27'].isExtended).toBe(true);
    expect(data.daily['2026-07-27'].info.category).toBe('rain');
  });

  it('não derruba a previsão de curto prazo se o modelo sub-sazonal falhar', async () => {
    const nearResponse = {
      current: { temperature_2m: 24, weather_code: 0 },
      daily: { time: ['2026-07-13'], weather_code: [0], temperature_2m_max: [28], temperature_2m_min: [17] },
    };
    const fetchMock = vi.fn((url: string) => {
      if (url.includes('seasonal-api')) return Promise.reject(new Error('fora do ar'));
      return Promise.resolve({ ok: true, json: () => Promise.resolve(nearResponse) });
    });
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchWeather(-23.55, -46.63);
    expect(data.daily['2026-07-13'].tempMax).toBe(28);
    expect(Object.keys(data.daily)).toHaveLength(1);
  });
});

describe('geocodeCity', () => {
  it('não busca para termos muito curtos', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await geocodeCity('a');
    expect(res).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('normaliza resultados e prioriza cidades brasileiras', async () => {
    const apiResponse = {
      results: [
        { name: 'Lisboa', admin1: 'Lisboa', latitude: 38.7, longitude: -9.1, country: 'Portugal', country_code: 'PT' },
        { name: 'Lisboa', admin1: 'Maranhão', latitude: -2.5, longitude: -44.0, country: 'Brazil', country_code: 'BR' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const res = await geocodeCity('Lisboa');
    expect(res).toHaveLength(2);
    // A entrada brasileira (Maranhão) deve vir primeiro
    expect(res[0].state).toBe('Maranhão');
    expect(res[0].lat).toBe(-2.5);
  });

  it('retorna lista vazia quando a API não encontra nenhuma cidade', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({}) }));
    const res = await geocodeCity('xyzxyzxyz');
    expect(res).toEqual([]);
  });
});
