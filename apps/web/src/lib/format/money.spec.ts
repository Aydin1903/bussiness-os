import { describe, expect, it } from 'vitest';

import { formatMoney, formatMoneyCompact } from './money';

/**
 * PARA BİÇİMLENDİRME — davranış SABİTLENMİŞTİR.
 *
 * ============================================================================
 * BU TESTİN ASIL KONUSU: ORTAM BAĞIMSIZLIĞI
 * ============================================================================
 * Bu projede locale'e duyarlı bir dönüşüm bir kez sessizce yanlış çıktı üretti:
 * `text-transform: uppercase`, belge `lang="tr"` olduğu için "Business OS"u
 * ekranda **"BUSİNESS OS"** diye çizdi (noktalı İ). `toLocaleString` /
 * `Intl.NumberFormat` aynı sınıftan bir risktir — çıktı tarayıcıya, işletim
 * sistemine ve ICU verisine göre değişebilir.
 *
 * Bu yüzden ayraçlar KODA yazılıdır ve bu testler onları kilitler. Biri
 * `Intl`e geçerse testler kırmızı yanar; ekran ise çalışmaya devam ederdi.
 */

describe('formatMoney — TR binlik ayracı', () => {
  it.each([
    ['1284500.00', '1.284.500,00'],
    ['840000.00', '840.000,00'],
    ['100500.00', '100.500,00'],
    ['999.99', '999,99'],
    ['1000.00', '1.000,00'],
    ['0.50', '0,50'],
    ['1234567890.12', '1.234.567.890,12'],
  ])('%s → %s', (canonical, expected) => {
    expect(formatMoney(canonical)).toBe(expected);
  });

  it('gruplama SAĞDAN SOLA yapılır', () => {
    // Soldan gruplamak `12345`i `123.45` yapardı — klasik hata ve sessizdir:
    // rakam yine "makul" görünür, yalnızca yanlıştır.
    expect(formatMoney('12345')).toBe('12.345');
    expect(formatMoney('1234')).toBe('1.234');
    expect(formatMoney('123')).toBe('123');
  });

  it('negatif tutar TİPOGRAFİK eksi alır', () => {
    // `-` yerine `−`: rakamlarla aynı genişlikte durur ve `tabular` hizasını
    // bozmaz. Sütun hâlinde tutarlar bu yüzden hizalı kalır.
    expect(formatMoney('-530000.00')).toBe('−530.000,00');
    expect(formatMoney('-0.01')).toBe('−0,01');
  });

  it('ondalıksız kanonik dizede ondalık AYRACI da yazılmaz', () => {
    expect(formatMoney('840000')).toBe('840.000');
  });

  it('⚠️ ORTAM LOCALE’İNE BAĞIMLI DEĞİL', () => {
    /*
     * `toLocaleString` kullanılsaydı bu iddia ortama göre değişirdi: bazı
     * ortamlarda "1,284,500.00" (en-US), bazılarında dar boşluklu ayraç
     * çıkardı. Ayraçlar sabit olduğu için çıktı her yerde aynıdır.
     */
    const result = formatMoney('1284500.00');

    expect(result).toContain('.'); // binlik
    expect(result).toContain(','); // ondalık
    expect(result).not.toContain(' '); // sert boşluk YOK
    expect(result).not.toMatch(/,\d{3}/); // en-US gruplaması DEĞİL
  });

  it('TANIMADIĞI girdiyi olduğu gibi döner — uydurmaz, fırlatmaz', () => {
    /*
     * Sunucudan beklenmedik bir şekil gelirse ekranda ham hâliyle görünür.
     * Yanlış biçimlendirilmiş bir tutar göstermektense ham göstermek doğrudur:
     * ikincisi FARK EDİLİR, birincisi edilmez.
     */
    for (const weird of ['', 'abc', '1e5', '1,5', '1.2.3', '  ']) {
      expect(formatMoney(weird)).toBe(weird);
    }
  });

  it('tutarı SAYIYA çevirmez — 17 haneli tam sayı bozulmaz', () => {
    /*
     * ⚠️ Bu, `Number` kullanılmadığının kanıtıdır. IEEE-754 çift duyarlık
     * yalnızca 2^53'e kadar tam sayıları kayıpsız taşır; aşağıdaki değer
     * `Number`dan geçseydi son basamağı DEĞİŞİRDİ.
     */
    expect(formatMoney('99999999999999999.99')).toBe('99.999.999.999.999.999,99');
  });
});

describe('formatMoneyCompact — yoğun listeler için', () => {
  it('sıfır kuruşu gizler', () => {
    // "250.000" ile "250.000,00" aynı bilgiyi taşır; ikincisi listeyi
    // gürültüyle doldurur (CRM fırsat kartlarının kararı).
    expect(formatMoneyCompact('250000.00')).toBe('250.000');
  });

  it('sıfırdan farklı kuruşu KORUR', () => {
    expect(formatMoneyCompact('250000.50')).toBe('250.000,50');
    expect(formatMoneyCompact('250000.01')).toBe('250.000,01');
  });

  it('negatifte de çalışır', () => {
    expect(formatMoneyCompact('-250000.00')).toBe('−250.000');
  });
});
