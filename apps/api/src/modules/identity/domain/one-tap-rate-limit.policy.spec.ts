import { describe, expect, it } from 'vitest';

import { TooManyOneTapAttemptsError } from './identity.error';
import {
  assertOneTapAllowed,
  ONE_TAP_MAX_ATTEMPTS_PER_WINDOW,
  ONE_TAP_WINDOW_MINUTES,
} from './one-tap-rate-limit.policy';

/**
 * One Tap oran siniri politikasi — ADR-0053 EK-1.4.
 *
 * ⚠️ Bu politika bir RAKAM DEGIL BIR SINIRDIR ve testi de esigin kendisini
 * degil ESIGIN DAVRANISINI kilitler: son izinli deneme gecer, bir sonraki
 * duser. Sabit degistirilse bile bu iliski dogru kalmalidir.
 */
describe('assertOneTapAllowed — esik davranisi', () => {
  it('pencere bos ise gecer', () => {
    expect(() => {
      assertOneTapAllowed(0);
    }).not.toThrow();
  });

  it('⚠️ SON IZINLI deneme hala gecer (esik "sonuncu istek DAHIL")', () => {
    expect(() => {
      assertOneTapAllowed(ONE_TAP_MAX_ATTEMPTS_PER_WINDOW - 1);
    }).not.toThrow();
  });

  it('esige VARILDIGINDA reddeder', () => {
    expect(() => {
      assertOneTapAllowed(ONE_TAP_MAX_ATTEMPTS_PER_WINDOW);
    }).toThrow(TooManyOneTapAttemptsError);
  });

  it('esigin uzerinde de reddeder', () => {
    expect(() => {
      assertOneTapAllowed(ONE_TAP_MAX_ATTEMPTS_PER_WINDOW + 500);
    }).toThrow(TooManyOneTapAttemptsError);
  });
});

describe('⚠️ Sabitlerin ANLAMI — bir daralma KAZA ILE olmasin', () => {
  /*
   * ⚠️ Bu iki test bir degeri "dogru" ilan etmiyor; onlari DUSURMEYI bilincli
   * bir adim haline getiriyor. ADR-0053 EK-1.4 limitin COMERT secildigini ve
   * sebebini yaziyor (kurumsal NAT arkasindaki mesru kullanicilari kilitlemek,
   * ucun korudugu seyden buyuk bir zarardir). Biri bu sayiyi "daha guvenli"
   * diye 3'e cekerse test kirmizi yanar ve ADR'yi okumak zorunda kalir.
   */
  it('pencere bir saattir', () => {
    expect(ONE_TAP_WINDOW_MINUTES).toBe(60);
  });

  it('limit comerttir (NAT gerekcesi — EK-1.4)', () => {
    expect(ONE_TAP_MAX_ATTEMPTS_PER_WINDOW).toBe(20);
  });
});
