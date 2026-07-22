import { describe, expect, it } from 'vitest';

import {
  type BruteForceCounts,
  evaluateBruteForce,
  LAYER1_MAX_FAILURES,
  LAYER2_MAX_FAILURES,
  LAYER3_MAX_FAILURES,
  THROTTLE_MAX_DELAY_MS,
} from './brute-force-policy';

function counts(overrides: Partial<BruteForceCounts> = {}): BruteForceCounts {
  return { emailIpFailures: 0, emailFailures: 0, ipFailures: 0, ...overrides };
}

describe('evaluateBruteForce — esik altinda', () => {
  it('tum sayimlar esik altindaysa gecikmesiz izin verir', () => {
    expect(evaluateBruteForce(counts())).toEqual({ action: 'allow', throttleDelayMs: 0 });
  });

  it('esiklerin bir altinda hala izin verir', () => {
    const decision = evaluateBruteForce(
      counts({
        emailIpFailures: LAYER1_MAX_FAILURES - 1,
        emailFailures: LAYER2_MAX_FAILURES - 1,
        ipFailures: LAYER3_MAX_FAILURES - 1,
      }),
    );

    expect(decision).toEqual({ action: 'allow', throttleDelayMs: 0 });
  });
});

describe('evaluateBruteForce — katman 1 (kilit)', () => {
  it('(e-posta, IP) esigine ulasinca kilitler', () => {
    expect(evaluateBruteForce(counts({ emailIpFailures: LAYER1_MAX_FAILURES }))).toEqual({
      action: 'locked',
    });
  });

  it('katman 1 diger katmanlara ONCELIKLIDIR ve gecikme tasimaz', () => {
    // L1 asili + L3 de asili olsa bile sonuc 'locked' (429 degil), gecikmesiz.
    const decision = evaluateBruteForce(
      counts({ emailIpFailures: LAYER1_MAX_FAILURES, emailFailures: 100, ipFailures: 100 }),
    );

    expect(decision).toEqual({ action: 'locked' });
  });
});

describe('evaluateBruteForce — katman 2 (ustel gecikme)', () => {
  it('e-posta esiginde 1 sn gecikmeyle izin verir', () => {
    expect(evaluateBruteForce(counts({ emailFailures: LAYER2_MAX_FAILURES }))).toEqual({
      action: 'allow',
      throttleDelayMs: 1000,
    });
  });

  it('her adimda gecikmeyi iki katina cikarir', () => {
    expect(evaluateBruteForce(counts({ emailFailures: 21 }))).toEqual({
      action: 'allow',
      throttleDelayMs: 2000,
    });
    expect(evaluateBruteForce(counts({ emailFailures: 22 }))).toEqual({
      action: 'allow',
      throttleDelayMs: 4000,
    });
    expect(evaluateBruteForce(counts({ emailFailures: 23 }))).toEqual({
      action: 'allow',
      throttleDelayMs: 8000,
    });
  });

  it('gecikmeyi ust sinirda sabitler', () => {
    // 2^5 * 1000 = 32000 > 30000 -> sabitlenir.
    expect(evaluateBruteForce(counts({ emailFailures: 25 }))).toEqual({
      action: 'allow',
      throttleDelayMs: THROTTLE_MAX_DELAY_MS,
    });
    expect(evaluateBruteForce(counts({ emailFailures: 1000 }))).toEqual({
      action: 'allow',
      throttleDelayMs: THROTTLE_MAX_DELAY_MS,
    });
  });
});

describe('evaluateBruteForce — katman 3 (429)', () => {
  it('IP esigine ulasinca rate-limited doner', () => {
    expect(evaluateBruteForce(counts({ ipFailures: LAYER3_MAX_FAILURES }))).toEqual({
      action: 'rate-limited',
      throttleDelayMs: 0,
    });
  });

  it('katman 2 gecikmesini katman 3 karariyla birlikte tasir', () => {
    const decision = evaluateBruteForce(counts({ emailFailures: 22, ipFailures: LAYER3_MAX_FAILURES }));

    expect(decision).toEqual({ action: 'rate-limited', throttleDelayMs: 4000 });
  });
});
