import { describe, it, expect } from 'vitest';
import { isValidPinFormat, PIN_MIN_LENGTH, PIN_MAX_LENGTH } from './pinFormat';

describe('pinFormat', () => {
  it('aceita PINs numéricos dentro do intervalo permitido', () => {
    expect(isValidPinFormat('1'.repeat(PIN_MIN_LENGTH))).toBe(true);
    expect(isValidPinFormat('123456')).toBe(true);
    expect(isValidPinFormat('1'.repeat(PIN_MAX_LENGTH))).toBe(true);
  });

  it('rejeita PINs mais curtos ou mais longos que o intervalo', () => {
    expect(isValidPinFormat('1'.repeat(PIN_MIN_LENGTH - 1))).toBe(false);
    expect(isValidPinFormat('1'.repeat(PIN_MAX_LENGTH + 1))).toBe(false);
  });

  it('rejeita não-dígitos e string vazia', () => {
    expect(isValidPinFormat('12a456')).toBe(false);
    expect(isValidPinFormat('')).toBe(false);
  });
});
