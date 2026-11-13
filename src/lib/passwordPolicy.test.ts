import { describe, it, expect } from 'vitest';
import {
  checkPassword,
  isPasswordValid,
  passwordRequirementList,
  PASSWORD_MIN_LENGTH,
} from './passwordPolicy';

describe('passwordPolicy', () => {
  it('aprova uma senha com minúscula, maiúscula, número e símbolo no tamanho mínimo', () => {
    expect(isPasswordValid('Abcdef1!')).toBe(true);
  });

  it('reprova quando falta a letra minúscula (config do Supabase exige)', () => {
    expect(isPasswordValid('ABCDEF1!')).toBe(false);
    expect(checkPassword('ABCDEF1!').lower).toBe(false);
  });

  it('reprova quando falta maiúscula, número ou símbolo', () => {
    expect(isPasswordValid('abcdef1!')).toBe(false); // sem maiúscula
    expect(isPasswordValid('Abcdefg!')).toBe(false); // sem número
    expect(isPasswordValid('Abcdefg1')).toBe(false); // sem símbolo
  });

  it('reprova senha curta mesmo com todas as classes de caractere', () => {
    expect(isPasswordValid('Ab1!')).toBe(false);
  });

  it('aceita qualquer não-alfanumérico como símbolo (igual ao Supabase)', () => {
    for (const sym of ['_', '-', '+', '=', '[', ']', '~', '/', ' ']) {
      expect(checkPassword(`Abcdef1${sym}`).symbol).toBe(true);
    }
  });

  it('a checklist tem um item por regra e reflete o estado atual', () => {
    const list = passwordRequirementList('Abcdef1!');
    expect(list).toHaveLength(5);
    expect(list.every((i) => i.met)).toBe(true);
    expect(list[0].label).toContain(String(PASSWORD_MIN_LENGTH));
  });
});

import { isWeakPasswordError, MSG_SENHA_VAZADA } from './passwordPolicy';
describe('senha vazada (HaveIBeenPwned)', () => {
  it('reconhece o erro do Supabase por code e por mensagem', () => {
    expect(isWeakPasswordError({ code: 'weak_password' })).toBe(true);
    expect(isWeakPasswordError({ message: 'Password is known to be weak and easy to guess, please choose a different one.' })).toBe(true);
    expect(isWeakPasswordError({ message: 'Password has been pwned' })).toBe(true);
  });
  it('não confunde com outros erros', () => {
    expect(isWeakPasswordError({ message: 'User already registered' })).toBe(false);
    expect(isWeakPasswordError(null)).toBe(false);
    expect(MSG_SENHA_VAZADA).toContain('vazamentos');
  });
});
