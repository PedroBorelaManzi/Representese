import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWeather, geocodeCity } from './weatherService';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('fetchWeather', () => {
  it('mapeia current + daily e converte códigos WMO em categorias', async () => {
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

    // Arredonda a temperatura atual e classifica o céu limpo como "sun"
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

  it('lança erro em resposta não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchWeather(0, 0)).rejects.toThrow();
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
        { name: 'Lisboa', admin1: 'Lisboa', latitude: 38.7, longitude: -9.1, country_code: 'PT' },
        { name: 'Lisboa', admin1: 'Maranhão', latitude: -2.5, longitude: -44.0, country_code: 'BR' },
      ],
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const res = await geocodeCity('Lisboa');
    expect(res).toHaveLength(2);
    // A entrada brasileira (Maranhão) deve vir primeiro
    expect(res[0].state).toBe('Maranhão');
    expect(res[0].lat).toBe(-2.5);
  });
});
