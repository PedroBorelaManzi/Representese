import { describe, it, expect } from 'vitest';
import { hashPin, verifyPin, isValidPinFormat } from './pinHash';

describe('pinHash', () => {
  it('verifica o PIN certo como válido', () => {
    const stored = hashPin('123456');
    expect(verifyPin('123456', stored)).toBe(true);
  });

  it('rejeita PIN errado', () => {
    const stored = hashPin('123456');
    expect(verifyPin('654321', stored)).toBe(false);
  });

  it('dois hashes do mesmo PIN são diferentes (salt aleatório)', () => {
    const a = hashPin('123456');
    const b = hashPin('123456');
    expect(a).not.toBe(b);
    expect(verifyPin('123456', a)).toBe(true);
    expect(verifyPin('123456', b)).toBe(true);
  });

  it('devolve false (não lança) pra hash ausente, vazio ou corrompido', () => {
    expect(verifyPin('123456', null)).toBe(false);
    expect(verifyPin('123456', undefined)).toBe(false);
    expect(verifyPin('123456', '')).toBe(false);
    expect(verifyPin('123456', 'lixo-nao-e-um-hash')).toBe(false);
    expect(verifyPin('123456', 'scrypt$16384$8$1$naoehex$naoehex')).toBe(false);
  });

  it('isValidPinFormat exige exatamente 6 dígitos numéricos', () => {
    expect(isValidPinFormat('123456')).toBe(true);
    expect(isValidPinFormat('12345')).toBe(false);
    expect(isValidPinFormat('1234567')).toBe(false);
    expect(isValidPinFormat('12a456')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });
});
