import { describe, expect, it, vi } from 'vitest';

import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type FeedbackRepository,
  type SimilarResponse,
} from '../application/feedback.repository.port';
import { FEEDBACK_READ } from '../feedback.permissions';
import { FeedbackCommentsContributor } from './feedback-comments.contributor';

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function build(rows: SimilarResponse[] = []) {
  const findSimilarResponses = vi
    .fn<FeedbackRepository['findSimilarResponses']>()
    .mockResolvedValue(rows);
  const repository = { findSimilarResponses } as unknown as FeedbackRepository;

  return {
    contributor: new FeedbackCommentsContributor(repository, transactionManager),
    findSimilarResponses,
  };
}

const input = { question: 'musteriler neden memnun degil', embedding: [0.1, 0.2], limit: 3 };

const RECEIVED = new Date('2026-08-24T16:30:00.000Z');

describe('FeedbackCommentsContributor (ADR-0045 §3)', () => {
  it('ADR-0036: kendini ANLAMSAL ilan eder ve kapisi `feedback:read`', () => {
    const { contributor } = build();

    expect(contributor.contributionKind).toBe('semantic');
    expect(contributor.source).toBe('feedback-comments');
    expect(contributor.permission).toBe(FEEDBACK_READ);
  });

  it('⚠️ `structural` DEGIL — ADR-0042 nin T2 ESIGINE DOKUNMAMA KARARI', () => {
    // ⚠️ GEREKCE ADR-0040 / ADR-0043'TEKIYLE AYNI DEGIL VE BU AYRIM ONEMLI:
    //   ADR-0040 (Tedarikci) -> uc aday, ucu de LIYAKATSIZ. "Bakildi ve yoktu."
    //   ADR-0043 (IK)        -> uc aday, ucu de LIYAKATSIZ. "Bakildi ve yoktu."
    //   ⚠️ ADR-0045 (burasi) -> aday LIYAKATLI. "Bakildi, VAR, ve TEK BASINA
    //                           EKLENEMEZ."
    //
    // `feedback-satisfaction` adayi dort testten UCUNU geciyor: bir esik
    // asilinca konusuyor (SAYIM DEGIL), bir FIILE dayaniyor (KATALOG DEGIL) ve
    // seyrek degil. Dorduncude (⚠️ "ayni haberi soyleyen bir ses zaten var mi")
    // buyuk olcude kaliyor: olumsuz geri bildirimin haberi MUSTERININ KENDI
    // CUMLESIDIR ve o cumle zaten BU KATKICIYLA havuza girer.
    //
    // ⚠️ AMA EKLENMEMESININ ASIL SEBEBI USULDUR: bu satir `'structural'` olsa
    // KAYITLI yapisal kaynak 6'dan 7'ye cikar ve ADR-0042 §3'un T2 esigi
    // (`2K/3` = 6, "gectiginde") ATESLERDI. ⚠️ T2 KAYITLI kaynaklari degil
    // SATIR DONDURENLERI sayar ve o sayiyi uretecek arac BUGUN YOKTUR —
    // ADR-0043'un kapanis denetimi ADR-0042 §4'un olcum protokolunu
    // UYGULAYAMADI (`retrieval.select` gozlemlenebilirlik satiri yok).
    //
    // ADR-0042'nin ilkesinin aynasi: "bir esik, onu OLCECEK ARAC YOKKEN
    // gecilmez." Sira TERSINE CEVRILEMEZ: arac -> olcum -> AYRI BIR PLATFORM
    // ADR'si -> ancak sonra katkici.
    const { contributor } = build();

    expect(contributor.contributionKind).not.toBe('structural');
  });

  it('⚠️ BASLIKTA KISI ADI YOK — Belge nin karari, ikinci kez', async () => {
    // `SupplierInteractionsContributor` basliga adi KOYABILIYORDU cunku ad AYNI
    // SEMADAYDI. Burada ad `crm.contacts`tadir: cross-schema JOIN yasak, tek
    // mesru yol IZIN KAPILI `ContactDirectory` ve `ContributeInput` ROL TASIMAZ.
    //
    // ⚠️ BEKLENMEDIK KAZANCI: baslikta kalan uc bilesenin (tarih · puan · kanal)
    // ucu de DEGISTIRILEMEZ, yani BU MODULDE BAYATLAMA PENCERESI YOK.
    const rows: SimilarResponse[] = [
      { id: 'a', rating: 2, channel: 'Google', receivedAt: RECEIVED, comment: 'gec geldi' },
    ];
    const { contributor } = build(rows);

    const [fragment] = await contributor.contribute(input);

    expect(fragment?.content).toBe('[Geri bildirim · 2026-08-24 · 2/5 · Google] gec geldi');
    expect(fragment?.content).not.toContain('Ahmet');
  });

  it('kaynak atfi doner, MODELE id GITMEZ', async () => {
    const rows: SimilarResponse[] = [
      { id: 'fb-1', rating: 1, channel: null, receivedAt: RECEIVED, comment: 'kotu' },
    ];
    const { contributor } = build(rows);

    const [fragment] = await contributor.contribute(input);

    expect(fragment?.reference).toEqual({ kind: 'feedback-response', id: 'fb-1' });
    expect(fragment?.content).not.toContain('fb-1');
  });

  it('skor AZALAN — repository siralamasi korunur', async () => {
    const rows: SimilarResponse[] = [
      { id: 'a', rating: 1, channel: null, receivedAt: RECEIVED, comment: 'birinci' },
      { id: 'b', rating: 2, channel: null, receivedAt: RECEIVED, comment: 'ikinci' },
      { id: 'c', rating: 3, channel: null, receivedAt: RECEIVED, comment: 'ucuncu' },
    ];
    const { contributor } = build(rows);

    const fragments = await contributor.contribute(input);
    const scores = fragments.map((fragment) => fragment.score);

    expect(scores[0]).toBeGreaterThan(scores[1] ?? 1);
    expect(scores[1]).toBeGreaterThan(scores[2] ?? 1);
    // ⚠️ Skor kaynaklar ARASI karsilastirilabilir DEGILDIR (ADR-0031'in bilinen
    // siniri); yalnizca kendi icinde siralama korumasidir.
    for (const score of scores) {
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThanOrEqual(1);
    }
  });

  it('bos sonuc bos dizi doner — hata DEGIL', async () => {
    const { contributor } = build();

    await expect(contributor.contribute(input)).resolves.toEqual([]);
  });

  it('istenen `limit` porta GECIRILIR', async () => {
    const { contributor, findSimilarResponses } = build();

    await contributor.contribute(input);

    expect(findSimilarResponses).toHaveBeenCalledWith({ embedding: input.embedding, limit: 3 });
  });
});
