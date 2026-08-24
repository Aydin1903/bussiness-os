import { describe, expect, it } from 'vitest';

import { listAuditSchema } from './list-audit.dto';

const RESOURCE = '018f3a2b-7c4d-7e1f-9b3c-0000000000b7';

describe('listAuditSchema', () => {
  it('bos sorguda varsayilan sayfalamayi uygular', () => {
    expect(listAuditSchema.parse({})).toEqual({ limit: 20, offset: 0 });
  });

  it('query string in metin degerlerini sayiya cevirir', () => {
    const parsed = listAuditSchema.parse({ limit: '50', offset: '10' });

    expect(parsed.limit).toBe(50);
    expect(parsed.offset).toBe(10);
  });

  it('ust siniri asan limit i REDDEDER', () => {
    // ⚠️ Bu tabloda ust sinir digerlerinden daha anlamli: sinirsiz bir limit,
    // tek istekte butun denetim gecmisini cekmenin kapisi olurdu.
    expect(() => listAuditSchema.parse({ limit: '5000' })).toThrow();
  });

  it('bilinmeyen parametreyi REDDEDER (strict)', () => {
    expect(() => listAuditSchema.parse({ sort: 'value' })).toThrow();
  });

  it('kaynak turu + id birlikte verilebilir', () => {
    const parsed = listAuditSchema.parse({ resourceType: 'hr.employee', resourceId: RESOURCE });

    expect(parsed.resourceType).toBe('hr.employee');
    expect(parsed.resourceId).toBe(RESOURCE);
  });

  it('kaynak turu TEK BASINA verilebilir (tur akisi)', () => {
    expect(listAuditSchema.parse({ resourceType: 'hr.employee' }).resourceId).toBeUndefined();
  });

  it('⚠️ resourceId TEK BASINA verilemez', () => {
    // Kaynak turu bilinmeden bir uuid filtrelemek, iki farkli modulun ayni
    // id'sini TEK LISTEDE karistirabilirdi — okuyan kisinin fark edemeyecegi
    // bir yanlis.
    expect(() => listAuditSchema.parse({ resourceId: RESOURCE })).toThrow();
  });

  it('gecersiz uuid i reddeder', () => {
    expect(() =>
      listAuditSchema.parse({ resourceType: 'hr.employee', resourceId: 'not-a-uuid' }),
    ).toThrow();
  });

  it('⚠️ kaynak turu NUMARALANDIRILMAZ — bilinmeyen bir modulun turu de gecerlidir', () => {
    // Platform, modullerin kaynak sozlugunu BILMEZ (tablonun CHECK kisitiyla
    // ayni karar). Bir enum, her yeni modulde bu dosyayi degistirmeyi
    // gerektirirdi.
    expect(listAuditSchema.parse({ resourceType: 'gelecek.modul' }).resourceType).toBe(
      'gelecek.modul',
    );
  });
});
