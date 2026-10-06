import { describe, it, expect } from 'vitest';
import { adsSource } from './adsFunnel';

describe('adsSource', () => {
  it('ID de clique do Google vira "google"', () => {
    expect(adsSource({ gclid: 'abc' })).toBe('google');
    expect(adsSource({ wbraid: 'x', utm_source: 'outro' })).toBe('google');
  });
  it('sem ID de clique usa utm_source e depois o domínio de referência', () => {
    expect(adsSource({ utm_source: 'Instagram' })).toBe('instagram');
    expect(adsSource({ ref_host: 'l.instagram.com' })).toBe('l.instagram.com');
  });
  it('sem origem não registra', () => {
    expect(adsSource(null)).toBeNull();
    expect(adsSource({ landing: '/' })).toBeNull();
  });
});
