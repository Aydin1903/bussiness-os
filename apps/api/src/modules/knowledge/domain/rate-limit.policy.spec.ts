import { describe, expect, it } from 'vitest';

import {
  currentWindowStart,
  evaluateRateLimit,
  RATE_LIMIT_WINDOW_MINUTES,
} from './rate-limit.policy';

const WINDOW_START = new Date('2026-08-02T10:00:00.000Z');

describe('evaluateRateLimit', () => {
  it('limit ALTINDA izin verir', () => {
    expect(
      evaluateRateLimit({
        count: 1,
        limit: 30,
        windowStart: WINDOW_START,
        now: new Date('2026-08-02T10:05:00.000Z'),
      }),
    ).toEqual({ action: 'allow' });
  });

  it('ESITLIKTE izin verir — limit "EN FAZLA N" demektir', () => {
    // Sayac ARTIRILMIS gelir: 30. istekte `count = 30`. Burada reddetseydik
    // limit fiilen 29 olurdu ve config'teki sayi yalan soylerdi.
    expect(
      evaluateRateLimit({
        count: 30,
        limit: 30,
        windowStart: WINDOW_START,
        now: new Date('2026-08-02T10:05:00.000Z'),
      }).action,
    ).toBe('allow');
  });

  it('limit ASILINCA reddeder', () => {
    expect(
      evaluateRateLimit({
        count: 31,
        limit: 30,
        windowStart: WINDOW_START,
        now: new Date('2026-08-02T10:05:00.000Z'),
      }).action,
    ).toBe('exceeded');
  });
});

describe('evaluateRateLimit — Retry-After', () => {
  it('pencerenin BITISINE kalan sureyi doner, sabit bir saat DEGIL', () => {
    // 10:59'da reddedilen kullaniciya "bir saat bekle" demek yanlis olurdu:
    // pencere 60 saniye sonra donuyor.
    const decision = evaluateRateLimit({
      count: 31,
      limit: 30,
      windowStart: WINDOW_START,
      now: new Date('2026-08-02T10:59:00.000Z'),
    });

    expect(decision).toEqual({ action: 'exceeded', retryAfterSeconds: 60 });
  });

  it('pencerenin BASINDA neredeyse tum pencere kadar bekletir', () => {
    const decision = evaluateRateLimit({
      count: 31,
      limit: 30,
      windowStart: WINDOW_START,
      now: new Date('2026-08-02T10:00:30.000Z'),
    });

    expect(decision).toEqual({
      action: 'exceeded',
      retryAfterSeconds: RATE_LIMIT_WINDOW_MINUTES * 60 - 30,
    });
  });

  it('ASLA 0 donmez — "hemen dene" aninda ikinci bir 429 uretirdi', () => {
    const decision = evaluateRateLimit({
      count: 31,
      limit: 30,
      windowStart: WINDOW_START,
      now: new Date('2026-08-02T11:00:00.000Z'),
    });

    expect(decision).toEqual({ action: 'exceeded', retryAfterSeconds: 1 });
  });
});

describe('currentWindowStart', () => {
  it('SAATE yuvarlar', () => {
    expect(currentWindowStart(new Date('2026-08-02T10:47:13.512Z')).toISOString()).toBe(
      '2026-08-02T10:00:00.000Z',
    );
  });

  it('ayni saat icindeki iki an AYNI pencereyi verir', () => {
    const first = currentWindowStart(new Date('2026-08-02T10:00:00.000Z'));
    const second = currentWindowStart(new Date('2026-08-02T10:59:59.999Z'));

    expect(first.getTime()).toBe(second.getTime());
  });

  it('saat donunce YENI pencere verir — sifirlama isi YOK', () => {
    // Sayac satirinin kimligi `window_start` icerir; yeni saat = yeni satir =
    // sifirdan sayim. Ayri bir temizleme/sifirlama gorevi gerekmez.
    const before = currentWindowStart(new Date('2026-08-02T10:59:59.999Z'));
    const after = currentWindowStart(new Date('2026-08-02T11:00:00.000Z'));

    expect(after.getTime() - before.getTime()).toBe(RATE_LIMIT_WINDOW_MINUTES * 60_000);
  });
});
