import { describe, expect, it } from 'vitest';

import {
  detectDocumentMimeType,
  Document,
  DocumentChunk,
  DOCX_MIME_TYPE,
  PDF_MIME_TYPE,
  requireSupportedMimeType,
  withDocumentHeader,
  type DocumentFields,
} from './document.entity';
import { UnsupportedDocumentTypeError } from './documents.error';

/**
 * `Document` + tur tespiti + baglam basligi (ADR-0037 §1, §2, §6.1, §7, §8.1).
 *
 * Testler bu modulun GERCEKTEN KENDINE OZGU kararlarina odaklanir:
 *
 *   1. Tur ICERIKTEN tespit edilir — uzanti ve `Content-Type` YALAN SOYLEYEBILIR,
 *   2. DOCX ile diger ZIP'ler (xlsx/pptx) AYIRT EDILIR,
 *   3. Baglam basliginda BAGLI VARLIK ADI YOKTUR (ADR-0035'ten bilincli sapma),
 *   4. Dosya degisimi VERSIYON ACMAZ ve anahtar HER ZAMAN yenidir.
 */

const NOW = new Date('2026-08-18T09:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const VECTOR = Array.from({ length: 1536 }, () => 0.1);

/** Gercek bir PDF'in ilk baytlari; imza standardin kendisinde tanimli. */
const PDF_BYTES = Buffer.from('%PDF-1.7\n1 0 obj\n<< >>\n', 'latin1');

/**
 * DOCX: ZIP imzasi + ic giris adi.
 *
 * ZIP bicimi dosya adlarini yerel baslikta SIKISTIRMADAN saklar, yani ham
 * tamponda duz metin olarak aranabilir — tespit tam olarak buna dayanir.
 */
const DOCX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('.......word/document.xml.......', 'latin1'),
]);

/** xlsx de bir ZIP'tir — ve REDDEDILMELIDIR. */
const XLSX_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('.......xl/workbook.xml.......', 'latin1'),
]);

function fields(overrides: Partial<DocumentFields> = {}): DocumentFields {
  return {
    originalFilename: 'Kira Sozlesmesi.pdf',
    storageKey: `tenants/${TENANT}/documents/${ID}/abc-Kira-Sozlesmesi.pdf`,
    mimeType: PDF_MIME_TYPE,
    sizeBytes: 1024,
    label: null,
    crmContactId: null,
    projectId: null,
    ...overrides,
  };
}

function build(overrides: Partial<DocumentFields> = {}): Document {
  return Document.create({
    id: ID,
    tenantId: TENANT,
    createdByUserId: USER,
    fields: fields(overrides),
    now: NOW,
  });
}

describe('detectDocumentMimeType (ADR-0037 §6.1)', () => {
  it('PDF imzasini taniyor', () => {
    expect(detectDocumentMimeType(PDF_BYTES)).toBe(PDF_MIME_TYPE);
  });

  it('DOCX i ZIP icindeki `word/document.xml` girisinden taniyor', () => {
    expect(detectDocumentMimeType(DOCX_BYTES)).toBe(DOCX_MIME_TYPE);
  });

  it('⚠️ xlsx REDDEDILIYOR — ZIP olmak DOCX olmak DEMEK DEGIL', () => {
    // Bu, tespitin en kolay yanlis yapilacagi yerdir: yalnizca ZIP imzasina
    // bakan bir kontrol xlsx ve pptx'i de kabul ederdi ve dosya, ayristirici
    // cokene kadar GECERLI gorunurdu.
    expect(detectDocumentMimeType(XLSX_BYTES)).toBeNull();
  });

  it('⚠️ UZANTI VE `Content-Type` DIKKATE ALINMAZ — yalnizca ICERIK', () => {
    // Ikisi de istemci tarafindan serbestce yazilabilir. `sozlesme.pdf` adli
    // bir dosyanin gercekte ne oldugunu yalnizca icerigi soyler.
    const yalanci = Buffer.from('Bu duz bir metin dosyasi, PDF degil.', 'utf8');

    expect(detectDocumentMimeType(yalanci)).toBeNull();
  });

  it('kisa/bos tampon cokmez, `null` doner', () => {
    expect(detectDocumentMimeType(Buffer.alloc(0))).toBeNull();
    expect(detectDocumentMimeType(Buffer.from([0x50, 0x4b]))).toBeNull();
  });

  it('`requireSupportedMimeType` allowlist disini 415 e goturen hatayla reddeder', () => {
    expect(() => requireSupportedMimeType(XLSX_BYTES)).toThrow(UnsupportedDocumentTypeError);
    expect(requireSupportedMimeType(PDF_BYTES)).toBe(PDF_MIME_TYPE);
  });
});

describe('withDocumentHeader (ADR-0037 §8.1)', () => {
  it('dosya adini ve etiketi tasir', () => {
    expect(
      withDocumentHeader({
        originalFilename: 'Kira Sozlesmesi.pdf',
        label: 'sozlesme',
        content: 'Fesih bildirimi otuz gun oncesinden yapilir.',
      }),
    ).toBe('[Belge · Kira Sozlesmesi.pdf · sozlesme] Fesih bildirimi otuz gun oncesinden yapilir.');
  });

  it('etiket yoksa baslik onsuz kurulur', () => {
    expect(withDocumentHeader({ originalFilename: 'a.pdf', label: null, content: 'metin' })).toBe(
      '[Belge · a.pdf] metin',
    );
  });

  it('⚠️ BAGLI KISI/PROJE ADI BASLIGA GIRMEZ — ADR-0035 ten BILINCLI SAPMA', () => {
    // ============================================================================
    // ⚠️ BU TEST BIR SINIRI KILITLIYOR, BIR OZELLIGI DEGIL
    // ============================================================================
    // Randevu bagli kisinin ADINI basliga koyuyordu ve bedelini (bayatlama)
    // `reindex` ile oduyordu. Burada konmaz cunku belgenin IKI bagimsiz
    // baglantisi var (§4) ve ADR-0033'un kurali acik: "basliga YALNIZCA BIR ad
    // girer". Ikisini koymak kurali ihlal eder, BIRINI secmek KEYFIDIR.
    //
    // Bedeli acikca: "Ahmet'le olan sozlesmede ne yaziyordu" sorusu, ad dosya
    // adinda ya da etikette gecmiyorsa ESLESMEZ. Bu, kayitli bir bilinen
    // sinirdir — ve bu satir birinin ileride "ad da eklensin" demesini bir
    // KARAR haline getirir, sessiz bir ekleme degil.
    const header = withDocumentHeader({
      originalFilename: 'Kira Sozlesmesi.pdf',
      label: 'sozlesme',
      content: 'metin',
    });

    expect(header).not.toMatch(/Ahmet/);
    // Baslikta bayatlayabilecek TEK sey kaydin KENDI kolonlaridir.
    expect(header).toContain('Kira Sozlesmesi.pdf');
  });
});

describe('Document', () => {
  it('etiket TRIM edilir; bos dize `null` a duser', () => {
    // "Girilmedi" ile "bos girildi" AYNI seydir — bos bir etiket baglam
    // basligina anlamsiz bir " · " eklerdi.
    expect(build({ label: '   ' }).toState().label).toBeNull();
    expect(build({ label: '  sozlesme  ' }).toState().label).toBe('sozlesme');
  });

  it('⚠️ `null` TEMIZLER, `undefined` DOKUNMAZ', () => {
    // `??` kullanilsaydi `null` gonderen bir istek SESSIZCE yok sayilirdi:
    // kullanici baglantiyi kaldirdigini sanip kaldirmamis olurdu.
    const document = build({ label: 'sozlesme', crmContactId: ID, projectId: ID });

    expect(document.update({ label: null }, NOW).toState().label).toBeNull();
    expect(document.update({ crmContactId: null }, NOW).toState().crmContactId).toBeNull();
    // Gonderilmeyen alanlara dokunulmaz.
    expect(document.update({ label: null }, NOW).toState().crmContactId).toBe(ID);
  });

  it('iki referans BAGIMSIZDIR — biri temizlenince digeri kalir', () => {
    const document = build({ crmContactId: ID, projectId: TENANT });

    const next = document.update({ crmContactId: null }, NOW).toState();

    expect(next.crmContactId).toBeNull();
    expect(next.projectId).toBe(TENANT);
  });

  it('⚠️ `replaceFile` VERSIYON ACMAZ — dortlu BIRLIKTE degisir (§7)', () => {
    // Dordu tek bir dosyanin ozellikleridir; ayrisirlarsa liste ekrani YALAN
    // soyler (eski ad, yeni boyut).
    const next = build()
      .replaceFile(
        {
          originalFilename: 'Yeni Sozlesme.docx',
          storageKey: 'tenants/x/documents/y/zzz-Yeni-Sozlesme.docx',
          mimeType: DOCX_MIME_TYPE,
          sizeBytes: 2048,
        },
        new Date('2026-08-19T09:00:00.000Z'),
      )
      .toState();

    expect(next).toMatchObject({
      originalFilename: 'Yeni Sozlesme.docx',
      storageKey: 'tenants/x/documents/y/zzz-Yeni-Sozlesme.docx',
      mimeType: DOCX_MIME_TYPE,
      sizeBytes: 2048,
    });
    // Kimlik ve olusturma bilgisi KORUNUR: bu bir yeni kayit degil, ayni
    // kaydin yeni dosyasidir.
    expect(next.id).toBe(ID);
    expect(next.createdAt).toEqual(NOW);
    expect(next.updatedAt).not.toEqual(NOW);
  });
});

describe('DocumentChunk', () => {
  it('yanlis boyutlu embedding i SINIRDA reddeder', () => {
    // Adapter'a guvenmek yerine sinirda kontrol etmek, yanlis yapilandirilmis
    // bir modeli VERI YAZILMADAN yakalar.
    expect(() =>
      DocumentChunk.create({
        id: ID,
        tenantId: TENANT,
        documentId: ID,
        chunkIndex: 0,
        content: 'x',
        embedding: [0.1, 0.2],
      }),
    ).toThrow(/1536/);
  });

  it('dogru boyutta kabul eder', () => {
    const chunk = DocumentChunk.create({
      id: ID,
      tenantId: TENANT,
      documentId: ID,
      chunkIndex: 3,
      content: 'metin',
      embedding: VECTOR,
    });

    expect(chunk.toState().chunkIndex).toBe(3);
  });
});
