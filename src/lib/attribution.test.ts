import { describe, it, expect } from 'vitest';
import { parseAttribution } from './attribution';

describe('parseAttribution', () => {
  it('lê gclid e utm_* da URL', () => {
    const a = parseAttribution('?utm_source=google&utm_medium=cpc&gclid=ABC123', '/register', '', 'www.representese.com');
    expect(a).toMatchObject({ utm_source: 'google', utm_medium: 'cpc', gclid: 'ABC123', landing: '/register' });
    expect(a?.ref_host).toBeUndefined();
  });

  it('sem campanha, guarda só o domínio externo de referência', () => {
    const a = parseAttribution('', '/', 'https://l.instagram.com/?u=x', 'www.representese.com');
    expect(a?.ref_host).toBe('l.instagram.com');
  });

  it('ignora referrer do próprio site e visita direta', () => {
    expect(parseAttribution('', '/', 'https://www.representese.com/planos', 'www.representese.com')).toBeNull();
    expect(parseAttribution('', '/', '', 'www.representese.com')).toBeNull();
  });

  it('corta valores gigantes', () => {
    const a = parseAttribution('?gclid=' + 'x'.repeat(500), '/', '', 'x.com');
    expect(a?.gclid?.length).toBe(200);
  });
});
