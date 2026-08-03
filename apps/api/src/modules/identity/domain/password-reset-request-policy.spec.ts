import { describe, expect, it } from 'vitest';

import {
  evaluatePasswordResetRequest,
  PASSWORD_RESET_COOLDOWN_SECONDS,
} from './password-reset-request-policy';
import {
  RESEND_MAX_PER_ACCOUNT_HOURLY,
  RESEND_MAX_PER_IP_HOURLY,
  type ResendCounts,
} from './verification-resend-policy';

const NOW = new Date('2026-07-22T10:00:00.000Z');

function counts(overrides: Partial<ResendCounts> = {}): ResendCounts {
  return { lastRequestedAt: null, accountRequestsInWindow: 0, ipRequestsInWindow: 0, ...overrides };
}

function secondsAgo(s: number): Date {
  return new Date(NOW.getTime() - s * 1000);
}

describe('evaluatePasswordResetRequest — bekleme suresi resend in IKI KATI', () => {
  it('120 saniyedir (resend 60)', () => {
    expect(PASSWORD_RESET_COOLDOWN_SECONDS).toBe(120);
  });

  it('119 saniyede sessizce atlar', () => {
    expect(evaluatePasswordResetRequest(counts({ lastRequestedAt: secondsAgo(119) }), NOW)).toEqual(
      {
        action: 'skip-silently',
        reason: 'cooldown',
      },
    );
  });

  it('TAM 120 saniyede izin verir', () => {
    expect(evaluatePasswordResetRequest(counts({ lastRequestedAt: secondsAgo(120) }), NOW)).toEqual(
      {
        action: 'allow',
      },
    );
  });
});

describe('evaluatePasswordResetRequest — sinirlar (resend ile ayni)', () => {
  it('hic istek yoksa izin verir', () => {
    expect(evaluatePasswordResetRequest(counts(), NOW)).toEqual({ action: 'allow' });
  });

  it('saatlik hesap siniri dolduysa SESSIZCE atlar (429 degil, P2)', () => {
    expect(
      evaluatePasswordResetRequest(
        counts({ accountRequestsInWindow: RESEND_MAX_PER_ACCOUNT_HOURLY }),
        NOW,
      ),
    ).toEqual({ action: 'skip-silently', reason: 'account-hourly-limit' });
  });

  it('IP siniri dolduysa 429 uretir (hesaptan bagimsiz)', () => {
    expect(
      evaluatePasswordResetRequest(counts({ ipRequestsInWindow: RESEND_MAX_PER_IP_HOURLY }), NOW),
    ).toEqual({ action: 'rate-limited' });
  });

  it('IP siniri hesap sinirlarindan ONCE degerlendirilir', () => {
    const decision = evaluatePasswordResetRequest(
      counts({
        ipRequestsInWindow: RESEND_MAX_PER_IP_HOURLY,
        lastRequestedAt: secondsAgo(1),
        accountRequestsInWindow: RESEND_MAX_PER_ACCOUNT_HOURLY,
      }),
      NOW,
    );

    expect(decision).toEqual({ action: 'rate-limited' });
  });
});
