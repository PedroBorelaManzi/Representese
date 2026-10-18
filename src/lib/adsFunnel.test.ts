import { describe, it, expect } from 'vitest';
import { adsSource } from './attribution';

describe('adsSource', () => {
  it('ID de clique do Google vira "google"', () => {
    expect(adsSource({ gclid: 'abc' })).toBe('google');
    expect(adsSource({ wbraid: 'x', utm_source: 'outro' })).toBe('google');
  });
  it('Instagram/Facebook viram "meta"', () => {
    expect(adsSource({ utm_source: 'Instagram' })).toBe('meta');
    expect(adsSource({ fbclid: 'x' })).toBe('meta');
    expect(adsSource({ ref_host: 'l.instagram.com' })).toBe('meta');
  });
  it('outras origens ficam com o próprio nome', () => {
    expect(adsSource({ utm_source: 'newsletter' })).toBe('newsletter');
    expect(adsSource({ ref_host: 'blog.exemplo.com' })).toBe('blog.exemplo.com');
  });
  it('sem origem não registra', () => {
    expect(adsSource(null)).toBeNull();
    expect(adsSource({ landing: '/' })).toBeNull();
  });
});
