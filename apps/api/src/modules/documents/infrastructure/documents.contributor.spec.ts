import { describe, expect, it, vi } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type DocumentRepository } from '../application/document.repository.port';
import { DocumentsContributor } from './documents.contributor';

/**
 * `DocumentsContributor` — ALTINCI anlamsal kaynak (ADR-0037 §8).
 *
 * Bes onceki anlamsal katkiciyla SIMETRIK; buradaki testler bu modulun
 * GERCEKTEN KENDINE OZGU iki iddiasina odaklanir:
 *
 *   1. ⚠️ `contributionKind` ZORUNLU ALANI DOGRU deklare edilmis — ADR-0036'nin
 *      taban kisiti bunun uzerinden isler,
 *   2. Baslik SAKLANDIGI GIBI doner (chunk tablosu var) — `appointment-notes`in
 *      "okuma aninda yeniden kur" davranisindan FARKLI.
 */

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

const DOCUMENT_ID = '018f3a2b-7c4d-7e1f-9c4d-000000000001';

function build(
  chunks: { documentId: string; content: string }[] = [
    {
      documentId: DOCUMENT_ID,
      content: '[Belge · Kira Sozlesmesi.pdf · sozlesme] Fesih bildirimi otuz gun oncesinden.',
    },
  ],
) {
  const findSimilarChunks = vi
    .fn<DocumentRepository['findSimilarChunks']>()
    .mockResolvedValue(chunks);

  const contributor = new DocumentsContributor(
    { findSimilarChunks } as unknown as DocumentRepository,
    transactionManager,
  );

  return { contributor, findSimilarChunks };
}

describe('DocumentsContributor', () => {
  it('sorunun vektorunu repository ye OLDUGU GIBI gecirir', async () => {
    const { contributor, findSimilarChunks } = build();
    const embedding = [0.1, 0.2, 0.3];

    await contributor.contribute({ question: 'fesih', embedding, limit: 4 });

    expect(findSimilarChunks).toHaveBeenCalledWith({ embedding, limit: 4 });
  });

  it('⚠️ BASLIK SAKLANDIGI GIBI doner — `appointment-notes`tan FARK', async () => {
    // Randevu'da chunk tablosu YOKTU, dolayisiyla baslikli metnin saklanacagi
    // bir kolon da yoktu ve baslik OKUMA ANINDA yeniden kuruluyordu. Burada
    // saklanir (§3 — chunk tablosu geri dondu).
    //
    // Bedeli acikca: dosya adi degisirse (§7) saklanan baslik BAYATLAR ve
    // telafi `POST /documents/reindex`tir.
    const { contributor } = build();

    const [fragment] = await contributor.contribute({ question: 'x', embedding: [], limit: 4 });

    expect(fragment?.content).toBe(
      '[Belge · Kira Sozlesmesi.pdf · sozlesme] Fesih bildirimi otuz gun oncesinden.',
    );
  });

  it('skor AZALAN — siralamayi korur', async () => {
    const { contributor } = build([
      { documentId: 'a', content: 'ilk' },
      { documentId: 'b', content: 'ikinci' },
    ]);

    const fragments = await contributor.contribute({ question: 'x', embedding: [], limit: 4 });

    // Repository skor DONDURMEZ, SIRALI liste verir; sentetik skor sirayi
    // korur (bes onceki anlamsal katkiciyla AYNI formul).
    expect(fragments[0]?.score).toBeGreaterThan(fragments[1]?.score ?? 1);
  });

  it('kaynak etiketi ve atif dogru', async () => {
    const { contributor } = build();

    const [fragment] = await contributor.contribute({ question: 'x', embedding: [], limit: 4 });

    expect(fragment?.source).toBe('documents');
    expect(fragment?.reference).toEqual({ kind: 'document', id: DOCUMENT_ID });
  });

  it('sonuc yoksa BOS dizi doner', async () => {
    const { contributor } = build([]);

    await expect(
      contributor.contribute({ question: 'x', embedding: [], limit: 4 }),
    ).resolves.toEqual([]);
  });
});

describe('ADR-0036 sozlesmesi', () => {
  it('⚠️ `contributionKind` `semantic` DEKLARE EDILIYOR — taban kisiti buna dayanir', () => {
    // ============================================================================
    // ⚠️ BU TEST ADR-0036'NIN ALTINCI MODULDE TUTTUGUNU KILITLIYOR
    // ============================================================================
    // Alan ZORUNLUDUR ve unutulmasi bir DERLEME hatasidir — yani bu satirin
    // varligini derleyici zaten garanti ediyor. Test DEGERI baska: alanin
    // YANLIS yazilmasini yakalar.
    //
    // `'structural'` yazilsaydi kod derlenirdi ve bu katkici, ADR-0036'nin
    // yapisal kaynaklara ayirdigi GARANTILI yuvalardan birini haksiz yere
    // alirdi — gercekten alarm ureten bir kaynagi (`finance-cashflow`,
    // `appointment-schedule`) disari iterek. Hata SESSIZ olurdu: cevap uretilir,
    // yalnizca yanlis parcalarla.
    const { contributor } = build();

    expect(contributor.contributionKind).toBe('semantic');
  });

  it('⚠️ YAPISAL KATKICI YOK — ve bu bir eksiklik degil', () => {
    // Onceki DORT modulun DORDU DE ikinci bir yapisal katkici kaydetmisti. Bir
    // belgenin turetilebilir bir DURUMU yoktur: bir sozlesme "gecikmis" ya da
    // "durgun" olmaz, yalnizca VARDIR.
    //
    // Bu dosyada TEK bir katkici sinifi export ediliyor; ikinci bir tane
    // eklendigi gun bu testin varligi, kararin YENIDEN OKUNMASINI zorlar.
    const { contributor } = build();

    expect(contributor.source).toBe('documents');
    expect(contributor.contributionKind).not.toBe('structural');
  });
});

describe('izin kapisi (ADR-0037 §8, §10)', () => {
  it('⚠️ katkici `document:read` DEKLARE eder — eleme PLATFORMUN isi', () => {
    // Modulun sorumlulugu tek satirdir: DOGRU izni deklare etmek. Yanlis bir
    // izin yazilsaydi (ornegin `document:write`) hata SESSIZ olurdu — okuma
    // yapan bir kullanici kendi belgelerini AI'a soramaz hale gelirdi ve
    // hicbir test kirmizi yanmazdi.
    //
    // ⚠️ Dort rol de `document:read` tasidigi icin bu modul `POST /ask` izin
    // filtresini TETIKLEMEZ; tetikci HALA yalnizca Finans'tir.
    const { contributor } = build();

    expect(contributor.permission).toBe('document:read');
  });
});
