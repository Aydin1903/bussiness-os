import { describe, expect, it } from 'vitest';

import {
  createDocumentSchema,
  listDocumentsQuerySchema,
  updateDocumentSchema,
} from './documents.dto';

/**
 * `documents.dto` — `multipart` govdesinin OPSIYONEL alanlari.
 *
 * ============================================================================
 * ⚠️ BU DOSYA BIR KAPANIS DENETIMI BULGUSUNDAN DOGDU
 * ============================================================================
 * Ilk yazimda `optionalFormText` soyleydi:
 *
 *     z.string().trim().transform((v) => (v === '' ? undefined : v))
 *
 * `.optional()` YOKTU. Alan hic gonderilmediginde `z.string()` "expected
 * string, received undefined" ile patliyordu — yani `contactId`/`projectId`
 * yazmayan HER yukleme **422** aliyordu. Ve modulun tanimi geregi bu, EN
 * YAYGIN durumdur: bir belge hicbir kayda bagli olmak zorunda degildir
 * (ADR-0037 §4).
 *
 * ⚠️ IKINCI VE DAHA SINSI SONUCU: govde dogrulamasi dosya kontrolunden ONCE
 * calistigi icin desteklenmeyen bir tur de **415 yerine 422** donuyordu. Yani
 * tek bir eksik `.optional()`, IKI ayri kurali birden gorunmez kilmisti.
 *
 * ⚠️ NEDEN BIRIM TESTLERI KACIRDI: `document.use-cases.spec` govdeyi ZATEN
 * COZULMUS haliyle veriyor (`crmContactId: null`). Zod katmanina hic
 * ugramiyordu. Kusur ancak GERCEK bir `multipart` istegiyle gorundu — bu
 * yuzden bu dosya semayi DOGRUDAN sinar.
 */

describe('createDocumentSchema — opsiyonel alanlar GERCEKTEN opsiyonel', () => {
  it('⚠️ BOS govde kabul edilir — belge hicbir kayda bagli olmak zorunda degil', () => {
    // Denetimde patlayan tam olarak bu durumdu.
    const parsed = createDocumentSchema.safeParse({});

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({});
  });

  it('yalnizca etiket gonderilebilir', () => {
    const parsed = createDocumentSchema.safeParse({ label: 'sozlesme' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.label).toBe('sozlesme');
  });

  it('⚠️ BOS DIZE "verilmedi"dir — `multipart` alanlari her zaman dizedir', () => {
    // Tarayici bos bir metin alanini `''` olarak gonderir; bunu bir deger
    // saymak, domainde bos etiketli bir kayit uretirdi.
    const parsed = createDocumentSchema.safeParse({ label: '', contactId: '', projectId: '' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.label).toBeUndefined();
    expect(parsed.data?.contactId).toBeUndefined();
    expect(parsed.data?.projectId).toBeUndefined();
  });

  it('IKI baglanti BAGIMSIZDIR — yalnizca biri gonderilebilir', () => {
    const parsed = createDocumentSchema.safeParse({
      contactId: '018f3a2b-7c4d-7e1f-9c4d-0000000000e1',
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.contactId).toBe('018f3a2b-7c4d-7e1f-9c4d-0000000000e1');
    expect(parsed.data?.projectId).toBeUndefined();
  });

  it('gecersiz UUID REDDEDILIR — opsiyonel olmak dogrulamayi kaldirmaz', () => {
    const parsed = createDocumentSchema.safeParse({ contactId: 'bu-bir-uuid-degil' });

    expect(parsed.success).toBe(false);
  });

  it('cok uzun etiket REDDEDILIR', () => {
    const parsed = createDocumentSchema.safeParse({ label: 'a'.repeat(200) });

    expect(parsed.success).toBe(false);
  });
});

describe('updateDocumentSchema — `null` TEMIZLER, alan yok DOKUNMAZ', () => {
  it('`null` etiket kabul edilir (temizleme)', () => {
    const parsed = updateDocumentSchema.safeParse({ label: null });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.label).toBeNull();
  });

  it('bos govde REDDEDILIR — anlamsiz bir `PATCH` 200 donmemeli', () => {
    expect(updateDocumentSchema.safeParse({}).success).toBe(false);
  });

  it('taninmayan alan REDDEDILIR (`.strict()`)', () => {
    expect(updateDocumentSchema.safeParse({ storageKey: 'x' }).success).toBe(false);
  });
});

describe('listDocumentsQuerySchema', () => {
  it('varsayilan sayfa boyutu uygular', () => {
    const parsed = listDocumentsQuerySchema.safeParse({});

    expect(parsed.success).toBe(true);
    expect(parsed.data?.limit).toBe(20);
    expect(parsed.data?.offset).toBe(0);
  });

  it('filtreler opsiyoneldir', () => {
    const parsed = listDocumentsQuerySchema.safeParse({ label: 'sozlesme' });

    expect(parsed.success).toBe(true);
    expect(parsed.data?.contactId).toBeUndefined();
  });
});
