import { describe, it, expect } from 'vitest';
import { hashCommissionPassword, verifyCommissionPassword } from './commissionPrivacy';

describe('commissionPrivacy', () => {
  it('a mesma senha e o mesmo usuário sempre geram o mesmo hash', async () => {
    const a = await hashCommissionPassword('1234', 'user-1');
    const b = await hashCommissionPassword('1234', 'user-1');
    expect(a).toBe(b);
  });

  it('a mesma senha em usuários diferentes gera hashes diferentes (sal implícito)', async () => {
    const a = await hashCommissionPassword('1234', 'user-1');
    const b = await hashCommissionPassword('1234', 'user-2');
    expect(a).not.toBe(b);
  });

  it('verifyCommissionPassword aceita a senha certa e rejeita a errada', async () => {
    const hash = await hashCommissionPassword('minhaSenha', 'user-1');
    expect(await verifyCommissionPassword('minhaSenha', 'user-1', hash)).toBe(true);
    expect(await verifyCommissionPassword('senhaErrada', 'user-1', hash)).toBe(false);
  });

  it('sem hash salvo, nunca aprova (evita "undefined === undefined")', async () => {
    expect(await verifyCommissionPassword('qualquer', 'user-1', '')).toBe(false);
  });
});
