import { describe, expect, it } from 'vitest';

import { buildStorageKey } from './storage.port';

/**
 * `buildStorageKey` (ADR-0009, ADR-0037 §5.2).
 *
 * ============================================================================
 * ⚠️ BU DOSYA BIR GUVENLIK TESTIDIR, BIR BICIMLENDIRME TESTI DEGIL
 * ============================================================================
 * Nesne deposunda RLS YOKTUR. Tenant izolasyonunun oradaki TEK mekanik
 * dayanagi bu fonksiyonun urettigi onektir. Bozulursa hata SESSIZ olur: dosya
 * yuklenir, indirilir, her sey calisir — yalnizca izolasyon garantisi kaybolur
 * ve hicbir baska test kirmizi yanmaz.
 */

const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const DOCUMENT = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const SUFFIX = '018f3a2b-7c4d-7e1f-8a2b-00000000000e';

function key(filename: string): string {
  return buildStorageKey({
    tenantId: TENANT,
    module: 'documents',
    resourceId: DOCUMENT,
    uniqueSuffix: SUFFIX,
    filename,
  });
}

describe('buildStorageKey', () => {
  it('⚠️ ANAHTAR `tenants/<tenantId>/` ILE BASLAR — izolasyonun tek dayanagi', () => {
    expect(key('sozlesme.pdf')).toBe(
      `tenants/${TENANT}/documents/${DOCUMENT}/${SUFFIX}-sozlesme.pdf`,
    );
  });

  it('⚠️ DOSYA ADINDAKI `/` ONEKTEN KACMAYA IZIN VERMEZ', () => {
    // ============================================================================
    // BU, DOSYANIN EN ONEMLI TESTIDIR
    // ============================================================================
    // `/` anahtarda bir dizin ayiracidir. Temizlenmeseydi
    // `../../baska-tenant/gizli.pdf` gibi bir ad, nesneyi BEKLENEN ONEKIN
    // DISINA yazabilirdi — yani tenant izolasyonunu deler.
    const produced = key('../../baska-tenant/gizli.pdf');

    expect(produced.startsWith(`tenants/${TENANT}/documents/${DOCUMENT}/`)).toBe(true);
    // Onekten sonra BASKA bir `/` kalmamali: ad parcasi tek segmenttir.
    expect(produced.slice(`tenants/${TENANT}/documents/${DOCUMENT}/`.length)).not.toContain('/');
  });

  it('`..` dizisi anahtarda kalmaz', () => {
    expect(key('..')).not.toContain('..');
  });

  it('Turkce karakterler ve bosluklar ANAHTARDA temizlenir', () => {
    // ⚠️ Bu, KULLANICIYA GOSTERILEN adi degistirmez — o `original_filename`
    // kolonunda oldugu gibi saklanir. Temizlenen yalnizca ANAHTARDIR.
    const produced = key('Ofis Kira Sozlesmesi 2026 (imzali).pdf');

    expect(produced).not.toMatch(/[ ()]/);
    expect(produced.endsWith('.pdf')).toBe(true);
  });

  it('tumuyle temizlenen bir ad anahtari BOZUK BIRAKMAZ', () => {
    // Yalnizca ASCII disi karakterlerden olusan bir ad bos bir segment
    // uretirdi; `resourceId` zaten kimligi tasidigi icin sabit bir yedek ad
    // yeterlidir.
    const produced = key('文書');

    expect(produced).toBe(`tenants/${TENANT}/documents/${DOCUMENT}/${SUFFIX}-dosya`);
  });

  it('cok uzun adlar kirpilir — S3 anahtar siniri', () => {
    const produced = key(`${'a'.repeat(500)}.pdf`);

    expect(produced.length).toBeLessThan(400);
  });

  it('⚠️ AYNI GIRDI + FARKLI SUFFIX = FARKLI ANAHTAR (§5.2)', () => {
    // Her yukleme YENI bir anahtar uretmek ZORUNDA: ustune yazmak, nesne
    // deposunun tutarlilik modeline ve araya giren onbelleklere guvenmek
    // demektir — kullanici yeni dosyayi yukler, ESKISINI indirir ve FARK ETMEZ.
    const first = buildStorageKey({
      tenantId: TENANT,
      module: 'documents',
      resourceId: DOCUMENT,
      uniqueSuffix: 'aaa',
      filename: 'ayni.pdf',
    });
    const second = buildStorageKey({
      tenantId: TENANT,
      module: 'documents',
      resourceId: DOCUMENT,
      uniqueSuffix: 'bbb',
      filename: 'ayni.pdf',
    });

    expect(first).not.toBe(second);
  });
});
