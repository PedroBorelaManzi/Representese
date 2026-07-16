import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { fetchWeather, geocodeCity } from './weatherService';

beforeEach(() => {
  vi.stubEnv('VITE_WEATHERAPI_KEY', 'test-key');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('fetchWeather', () => {
  it('mapeia current + daily e converte condition codes em categorias', async () => {
    const apiResponse = {
      current: { temp_c: 24.6, condition: { code: 1000 } },
      forecast: {
        forecastday: [
          { date: '2026-07-13', day: { maxtemp_c: 28.4, mintemp_c: 17.2, condition: { code: 1000 } } },
          { date: '2026-07-14', day: { maxtemp_c: 25.1, mintemp_c: 16.0, condition: { code: 1006 } } },
          { date: '2026-07-15', day: { maxtemp_c: 19.9, mintemp_c: 14.3, condition: { code: 1189 } } },
        ],
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

    // Nublado (1006) e chuva (1189)
    expect(data.daily['2026-07-14'].info.category).toBe('cloud');
    expect(data.daily['2026-07-15'].info.category).toBe('rain');
  });

  it('classifica códigos de neve corretamente (não confunde com chuva)', async () => {
    const apiResponse = {
      current: { temp_c: -2, condition: { code: 1213 } },
      forecast: { forecastday: [] },
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const data = await fetchWeather(0, 0);
    expect(data.current.info.category).toBe('snow');
  });

  it('lança erro em resposta não-ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    await expect(fetchWeather(0, 0)).rejects.toThrow();
  });

  it('lança erro quando a chave da API não está configurada', async () => {
    vi.unstubAllEnvs();
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
    const apiResponse = [
      { name: 'Lisboa', region: 'Lisboa', lat: 38.7, lon: -9.1, country: 'Portugal' },
      { name: 'Lisboa', region: 'Maranhão', lat: -2.5, lon: -44.0, country: 'Brazil' },
    ];
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(apiResponse) }));

    const res = await geocodeCity('Lisboa');
    expect(res).toHaveLength(2);
    // A entrada brasileira (Maranhão) deve vir primeiro
    expect(res[0].state).toBe('Maranhão');
    expect(res[0].lat).toBe(-2.5);
  });
});
