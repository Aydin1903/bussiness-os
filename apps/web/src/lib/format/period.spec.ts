import { describe, expect, it } from 'vitest';

import { monthPeriod, percentChange } from './period';

describe('monthPeriod', () => {
  it('içinde bulunulan ayın ilk ve son gününü verir', () => {
    const period = monthPeriod(0, new Date(2026, 7, 14));

    expect(period.from).toBe('2026-08-01');
    expect(period.to).toBe('2026-08-31');
    expect(period.label).toBe('Ağustos 2026');
  });

  it('önceki ayı doğru hesaplar — yıl sınırında da', () => {
    const period = monthPeriod(1, new Date(2026, 0, 9));

    expect(period.from).toBe('2025-12-01');
    expect(period.to).toBe('2025-12-31');
    expect(period.label).toBe('Aralık 2025');
  });

  it('ayın son gününü elle saymaz — şubat ve artık yıl', () => {
    expect(monthPeriod(0, new Date(2026, 1, 3)).to).toBe('2026-02-28');
    expect(monthPeriod(0, new Date(2028, 1, 3)).to).toBe('2028-02-29');
    expect(monthPeriod(0, new Date(2026, 3, 3)).to).toBe('2026-04-30');
  });

  it('⚠️ YEREL takvim günü üretir, UTC DEĞİL', () => {
    /*
     * ============================================================================
     * BU TEST YILDA ON İKİ KEZ YANLIŞ OLABİLECEK BİR HATAYI KİLİTLER
     * ============================================================================
     * `toISOString()` kullanılsaydı, UTC+3'te ayın 1'i saat 02:00'de üretilen
     * `from` bir önceki AYIN son gününe düşerdi ("2026-07-31"). Ekran sessizce
     * yanlış dönemi gösterir, kimse fark etmez — çünkü rakam yine makul görünür.
     *
     * Yerel saat 00:30, yani UTC'de bir önceki gün.
     */
    const period = monthPeriod(0, new Date(2026, 7, 1, 0, 30));

    expect(period.from).toBe('2026-08-01');
  });
});

describe('percentChange', () => {
  it('artışı ve azalışı yüzde olarak verir', () => {
    expect(percentChange('112', '100')).toBe(12);
    expect(percentChange('88', '100')).toBe(-12);
  });

  it('negatif önceki dönemde MUTLAK değere böler', () => {
    // Nakit akışında önceki dönem eksi olabilir; işaretli bölme oranın
    // yönünü TERS çevirirdi.
    expect(percentChange('-50', '-100')).toBe(50);
  });

  it('önceki dönem SIFIRSA null döner — "%0" yazmak yanlış olurdu', () => {
    // Sıfırdan artış oranı tanımsızdır. Çağıran `null` görünce delta'yı hiç
    // çizmez; uydurma bir sayı, kullanıcının göremeyeceği bir yanlış olurdu.
    expect(percentChange('100', '0')).toBeNull();
  });

  it('sayı olmayan dizede uydurma YAPMAZ', () => {
    expect(percentChange('abc', '100')).toBeNull();
    expect(percentChange('100', '')).toBeNull();
  });
});
