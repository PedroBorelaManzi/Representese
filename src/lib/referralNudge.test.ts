import { describe, it, expect } from 'vitest';
import { shouldShowReferralNudge, referralNudgeHiddenUntil } from './referralNudge';

const NOW = 1_800_000_000_000;

describe('shouldShowReferralNudge', () => {
  it('aparece na página de início para assinante ativo', () => {
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'active', now: NOW })).toBe(true);
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'past_due', now: NOW })).toBe(true);
  });

  it('não aparece em outras telas', () => {
    expect(shouldShowReferralNudge({ pathname: '/dashboard/agenda', subscriptionStatus: 'active', now: NOW })).toBe(false);
    expect(shouldShowReferralNudge({ pathname: '/dashboard/clientes', subscriptionStatus: 'active', now: NOW })).toBe(false);
  });

  it('não aparece para quem ainda não assina', () => {
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'trialing', now: NOW })).toBe(false);
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'inactive', now: NOW })).toBe(false);
    expect(shouldShowReferralNudge({ pathname: '/dashboard', now: NOW })).toBe(false);
  });

  it('fica silenciado até o prazo e volta depois dele', () => {
    const until = referralNudgeHiddenUntil(14, NOW);
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'active', hiddenUntil: until, now: NOW + 1000 })).toBe(false);
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'active', hiddenUntil: until, now: until + 1 })).toBe(true);
  });

  it('valor salvo ausente ou zerado não silencia', () => {
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'active', hiddenUntil: null, now: NOW })).toBe(true);
    expect(shouldShowReferralNudge({ pathname: '/dashboard', subscriptionStatus: 'active', hiddenUntil: 0, now: NOW })).toBe(true);
  });
});
