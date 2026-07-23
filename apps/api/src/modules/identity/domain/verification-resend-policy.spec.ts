import { describe, expect, it } from 'vitest';

import {
  evaluateResend,
  RESEND_COOLDOWN_SECONDS,
  RESEND_MAX_PER_ACCOUNT_HOURLY,
  RESEND_MAX_PER_IP_HOURLY,
  type ResendCounts,
} from './verification-resend-policy';

const NOW = new Date('2026-07-22T10:00:00.000Z');

function counts(overrides: Partial<ResendCounts> = {}): ResendCounts {
  return {
    lastRequestedAt: null,
    accountRequestsInWindow: 0,
    ipRequestsInWindow: 0,
    ...overrides,
  };
}

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe('evaluateResend — izin', () => {
  it('hic istek yoksa izin verir', () => {
    expect(evaluateResend(counts(), NOW)).toEqual({ action: 'allow' });
  });

  it('bekleme suresi TAM dolduysa izin verir', () => {
    const decision = evaluateResend(
      counts({ lastRequestedAt: secondsAgo(RESEND_COOLDOWN_SECONDS) }),
      NOW,
    );

    // Sinir "60 saniyeden az"dir; tam 60. saniye gecerlidir.
    expect(decision).toEqual({ action: 'allow' });
  });

  it('esiklerin BIR ALTINDA izin verir', () => {
    const decision = evaluateResend(
      counts({
        accountRequestsInWindow: RESEND_MAX_PER_ACCOUNT_HOURLY - 1,
        ipRequestsInWindow: RESEND_MAX_PER_IP_HOURLY - 1,
      }),
      NOW,
    );

    expect(decision).toEqual({ action: 'allow' });
  });
});

describe('evaluateResend — hesap sinirlari SESSIZDIR', () => {
  it('bekleme suresi dolmadan sessizce atlar', () => {
    const decision = evaluateResend(counts({ lastRequestedAt: secondsAgo(59) }), NOW);

    // 429 DEGIL: hesap bazli bir sinire 429 donmek hesabin varligini dogrular.
    expect(decision).toEqual({ action: 'skip-silently', reason: 'cooldown' });
  });

  it('saatlik hesap siniri dolduysa sessizce atlar', () => {
    const decision = evaluateResend(
      counts({ accountRequestsInWindow: RESEND_MAX_PER_ACCOUNT_HOURLY }),
      NOW,
    );

    expect(decision).toEqual({ action: 'skip-silently', reason: 'account-hourly-limit' });
  });

  it('esik asilmis olsa da sessiz kalir', () => {
    const decision = evaluateResend(
      counts({ accountRequestsInWindow: RESEND_MAX_PER_ACCOUNT_HOURLY + 10 }),
      NOW,
    );

    expect(decision.action).toBe('skip-silently');
  });
});

describe('evaluateResend — IP siniri 429 uretir', () => {
  it('kaynak siniri dolduysa rate-limited doner', () => {
    const decision = evaluateResend(counts({ ipRequestsInWindow: RESEND_MAX_PER_IP_HOURLY }), NOW);

    // Hesaptan bagimsizdir: hangi e-posta yazilirsa yazilsin ayni sonuc.
    expect(decision).toEqual({ action: 'rate-limited' });
  });

  it('IP siniri hesap sinirlarindan ONCE degerlendirilir', () => {
    const decision = evaluateResend(
      counts({
        ipRequestsInWindow: RESEND_MAX_PER_IP_HOURLY,
        lastRequestedAt: secondsAgo(1),
        accountRequestsInWindow: RESEND_MAX_PER_ACCOUNT_HOURLY,
      }),
      NOW,
    );

    // Kaynak siniri isteme hakkinin kendisini keser.
    expect(decision).toEqual({ action: 'rate-limited' });
  });
});

describe('evaluateResend — esik degerleri ADR-0019 ile ayni', () => {
  it('60 sn · 5/saat · 20/saat', () => {
    expect(RESEND_COOLDOWN_SECONDS).toBe(60);
    expect(RESEND_MAX_PER_ACCOUNT_HOURLY).toBe(5);
    expect(RESEND_MAX_PER_IP_HOURLY).toBe(20);
  });
});
