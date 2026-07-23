/**
 * Kontrollu bekleme port'u.
 *
 * `shared/` altinda yasar cunku tenant'a veya kimlige ozgu degildir — `Clock`
 * ile ayni sinifta bir zaman yardimcisidir. Framework'suzdur.
 *
 * ============================================================================
 * NEDEN PORT, NEDEN DOGRUDAN setTimeout DEGIL
 * ============================================================================
 * Kaba kuvvet korumasinin 2. katmani KILIT DEGIL GECIKME uygular (ADR-0022):
 * esik asilinca istek yavaslatilir. Bu gecikmeyi use case icine gomulu bir
 * `setTimeout` ile yapmak, testleri GERCEKTEN bekletirdi (yavas ve belirsiz).
 * Port sayesinde test sahte bir bekleyici verir: gecikmenin UYGULANDIGI
 * dogrulanir ama saniyeler harcanmaz.
 * ============================================================================
 */
/** DI token'i. */
export const DELAY = Symbol('DELAY');

export interface Delay {
  /** Verilen sure kadar bekler. `0` veya negatif deger aninda doner. */
  wait(milliseconds: number): Promise<void>;
}
