import { describe, it, expect } from 'vitest';
import {
  isValidCPF, isValidCNPJ, isValidPhone,
  formatCpfCnpj, formatPhone, formatCardNumber, formatExpiry, formatCep,
  passwordStrength,
} from './validators';

describe('isValidCPF', () => {
  it('aceita CPF válido com máscara', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
  });
  it('aceita CPF válido sem máscara', () => {
    expect(isValidCPF('52998224725')).toBe(true);
  });
  it('rejeita dígito verificador errado', () => {
    expect(isValidCPF('529.982.247-26')).toBe(false);
  });
  it('rejeita sequência repetida', () => {
    expect(isValidCPF('111.111.111-11')).toBe(false);
  });
  it('rejeita tamanho errado e vazio', () => {
    expect(isValidCPF('1234567890')).toBe(false);
    expect(isValidCPF('')).toBe(false);
  });
});

describe('isValidCNPJ', () => {
  it('aceita CNPJ válido', () => {
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
  });
  it('rejeita dígito verificador errado', () => {
    expect(isValidCNPJ('11.222.333/0001-82')).toBe(false);
  });
  it('rejeita sequência repetida e vazio', () => {
    expect(isValidCNPJ('11.111.111/1111-11')).toBe(false);
    expect(isValidCNPJ('')).toBe(false);
  });
});

describe('isValidPhone', () => {
  it('aceita celular com 11 dígitos começando em 9', () => {
    expect(isValidPhone('(11) 98765-4321')).toBe(true);
  });
  it('aceita fixo com 10 dígitos', () => {
    expect(isValidPhone('(11) 3456-7890')).toBe(true);
  });
  it('rejeita celular de 11 dígitos sem o 9', () => {
    expect(isValidPhone('(11) 88765-4321')).toBe(false);
  });
  it('rejeita DDD inválido', () => {
    expect(isValidPhone('(01) 98765-4321')).toBe(false);
  });
  it('rejeita tamanho errado e vazio', () => {
    expect(isValidPhone('123')).toBe(false);
    expect(isValidPhone('')).toBe(false);
  });
});

describe('máscaras', () => {
  it('formata CPF progressivamente', () => {
    expect(formatCpfCnpj('52998224725')).toBe('529.982.247-25');
  });
  it('formata CNPJ quando passa de 11 dígitos', () => {
    expect(formatCpfCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
  it('formata celular', () => {
    expect(formatPhone('11987654321')).toBe('(11) 98765-4321');
  });
  it('formata fixo', () => {
    expect(formatPhone('1134567890')).toBe('(11) 3456-7890');
  });
  it('formata número de cartão em blocos de 4', () => {
    expect(formatCardNumber('4111111111111111')).toBe('4111 1111 1111 1111');
  });
  it('formata validade MM/AA', () => {
    expect(formatExpiry('1228')).toBe('12/28');
    expect(formatExpiry('12')).toBe('12');
  });
  it('formata CEP', () => {
    expect(formatCep('01310100')).toBe('01310-100');
    expect(formatCep('01310')).toBe('01310');
  });
});

describe('passwordStrength', () => {
  it('senha vazia é muito fraca', () => {
    expect(passwordStrength('').score).toBe(0);
  });
  it('só minúsculas curtas pontua 0', () => {
    expect(passwordStrength('abc').score).toBe(0);
  });
  it('8+ chars com maiúscula/minúscula/número pontua 3', () => {
    const s = passwordStrength('Senha123');
    expect(s.score).toBe(3);
    expect(s.label).toBe('Forte');
  });
  it('com símbolo chega a 4 (Excelente)', () => {
    const s = passwordStrength('Senha123!');
    expect(s.score).toBe(4);
    expect(s.label).toBe('Excelente');
  });
});
