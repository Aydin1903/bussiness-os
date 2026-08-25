import { describe, expect, it } from 'vitest';

import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import {
  FeedbackResponse,
  MAX_FEEDBACK_CHANNEL_CHARS,
  MAX_FEEDBACK_COMMENT_CHARS,
  assertEmbeddingDimensions,
  withFeedbackHeader,
} from './feedback-response.entity';
import {
  FeedbackChannelTooLongError,
  FeedbackCommentTooLongError,
  InvalidFeedbackEmbeddingDimensionsError,
  InvalidFeedbackRatingError,
  InvalidFeedbackReceivedAtError,
} from './feedback.error';

const NOW = new Date('2026-08-25T10:00:00.000Z');
const RECEIVED = new Date('2026-08-24T16:30:00.000Z');

function create(
  overrides: {
    rating?: number;
    comment?: string | null;
    channel?: string | null;
    crmContactId?: string | null;
    receivedAt?: Date;
  } = {},
) {
  return FeedbackResponse.create({
    id: 'fb-1',
    tenantId: 'tenant-1',
    createdByUserId: 'user-1',
    rating: overrides.rating ?? 4,
    comment: overrides.comment === undefined ? 'hizli teslimat, tesekkurler' : overrides.comment,
    channel: overrides.channel === undefined ? 'Google' : overrides.channel,
    crmContactId: overrides.crmContactId ?? null,
    receivedAt: overrides.receivedAt ?? RECEIVED,
    now: NOW,
  });
}

describe('FeedbackResponse (ADR-0045 §1, §2)', () => {
  // ==========================================================================
  // ⚠️ DEGISTIRILEMEZLIGIN IKINCI KATMANI (§2.3)
  // ==========================================================================

  it('⚠️ KATMAN 2: `update` METODU YOKTUR — kayit GUNCELLENMEZ', () => {
    // Koruma UC katmanlidir ve bu IKINCISIDIR:
    //   1. `feedback:write` DIYE BIR IZIN YOK (`feedback.permissions.spec`)
    //   2. ⚠️ BURASI: entity'de `update` yok
    //   3. Veritabani: `UPDATE` yalnizca `embedding` kolonunda
    //      (`feedback-schema.integration.spec`)
    //
    // Gerekce projede ILK KEZ VERI SAHIPLIGI uzerinden kuruluyor: bir geri
    // bildirim BIZIM SOZUMUZ DEGIL, bir UCUNCU KISININ beyanidir.
    const response = create();

    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(response) as object);

    expect(surface).not.toContain('update');
    expect(surface).not.toContain('changeRating');
    expect(surface).not.toContain('editComment');
  });

  it('⚠️ state `updatedAt` TASIMAZ — guncellenmeyen satirin guncellenme zamani olmaz', () => {
    // Kolonu koymak, ileride birinin "demek ki guncellenebiliyor" diye
    // okuyacagi SESSIZ BIR DAVET olurdu (`suppliers.interactions`in ayni
    // karari).
    expect(create().toState()).not.toHaveProperty('updatedAt');
  });

  // ==========================================================================
  // Puan — olcek SABIT (§1.3)
  // ==========================================================================

  it('1..5 disindaki puani REDDEDER', () => {
    expect(() => create({ rating: 0 })).toThrow(InvalidFeedbackRatingError);
    expect(() => create({ rating: 6 })).toThrow(InvalidFeedbackRatingError);
    expect(() => create({ rating: -1 })).toThrow(InvalidFeedbackRatingError);
  });

  it('⚠️ ONDALIK puani REDDEDER — `smallint` onu SESSIZCE YUVARLARDI', () => {
    // `4.5` yalnizca `min/max` ile gecerdi ve PostgreSQL onu 4'e yuvarlardi;
    // kullanici 422 yerine SESSIZCE FARKLI BIR PUAN kaydederdi.
    expect(() => create({ rating: 4.5 })).toThrow(InvalidFeedbackRatingError);
  });

  it('1 ve 5 SINIR degerlerini kabul eder', () => {
    expect(create({ rating: 1 }).toState().rating).toBe(1);
    expect(create({ rating: 5 }).toState().rating).toBe(5);
  });

  // ==========================================================================
  // Yorum — OPSIYONEL, sessiz kirpma YOK (§1.4)
  // ==========================================================================

  it('yorum OPSIYONELDIR — `null` gecerlidir', () => {
    expect(create({ comment: null }).toState().comment).toBeNull();
  });

  it('⚠️ BOS/BOSLUK yorum `null` olur — "girilmedi" ile "bos girildi" AYNI SEY', () => {
    expect(create({ comment: '   ' }).toState().comment).toBeNull();
    expect(create({ comment: '' }).toState().comment).toBeNull();
  });

  it('⚠️ SINIR ASILIRSA REDDEDER — SESSIZ KIRPMA YOK', () => {
    // Adapter kirpar; domain REDDEDER. Kirpsaydi kullanici MUSTERISININ
    // SOZUNUN yarisinin arandigini HIC ogrenemezdi.
    expect(() => create({ comment: 'a'.repeat(MAX_FEEDBACK_COMMENT_CHARS + 1) })).toThrow(
      FeedbackCommentTooLongError,
    );

    // Tam sinir GECERLI.
    expect(
      create({ comment: 'a'.repeat(MAX_FEEDBACK_COMMENT_CHARS) }).toState().comment,
    ).toHaveLength(MAX_FEEDBACK_COMMENT_CHARS);
  });

  it('⚠️ uzunluk `trim`DEN SONRA olculur', () => {
    const padded = `  ${'a'.repeat(MAX_FEEDBACK_COMMENT_CHARS)}  `;

    expect(create({ comment: padded }).toState().comment).toHaveLength(MAX_FEEDBACK_COMMENT_CHARS);
  });

  it('⚠️ SINIR `TARGET_CHUNK_CHARS`TAN TURETILIR — yeni bir sayi ICAT EDILMEDI', () => {
    // Bagimlilik KASITLI: chunking hedefi degisirse sinir da degisir. Kopya bir
    // sabit yazilsaydi ikisi SESSIZCE ayrisir ve yorum bir chunk'a sigmamaya
    // baslardi — yani §1.2'nin dayandigi TEK PARCA varsayimi bozulurdu.
    expect(MAX_FEEDBACK_COMMENT_CHARS).toBe(TARGET_CHUNK_CHARS);
  });

  // ==========================================================================
  // Kanal — serbest metin, DAR sinir (§1.5)
  // ==========================================================================

  it('kanal OPSIYONELDIR ve bos deger `null` olur', () => {
    expect(create({ channel: null }).toState().channel).toBeNull();
    expect(create({ channel: '  ' }).toState().channel).toBeNull();
  });

  it('kanal sinirini asarsa REDDEDER', () => {
    expect(() => create({ channel: 'x'.repeat(MAX_FEEDBACK_CHANNEL_CHARS + 1) })).toThrow(
      FeedbackChannelTooLongError,
    );
  });

  it('⚠️ kanal siniri YORUMDAN COK DAHA DAR — kanal bir ETIKETTIR', () => {
    expect(MAX_FEEDBACK_CHANNEL_CHARS).toBeLessThan(MAX_FEEDBACK_COMMENT_CHARS);
  });

  // ==========================================================================
  // Zaman (§1.1)
  // ==========================================================================

  it('gecersiz `receivedAt` REDDEDILIR — 500 yerine 422', () => {
    expect(() => create({ receivedAt: new Date('gecersiz') })).toThrow(
      InvalidFeedbackReceivedAtError,
    );
  });

  // ==========================================================================
  // Baglam basligi (§4)
  // ==========================================================================

  it('baslik TARIH · PUAN · KANAL tasir — KISI ADI TASIMAZ', () => {
    const content = withFeedbackHeader({
      receivedAt: RECEIVED,
      rating: 2,
      channel: 'Google',
      comment: 'siparisim iki hafta gecikti',
    });

    expect(content).toBe('[Geri bildirim · 2026-08-24 · 2/5 · Google] siparisim iki hafta gecikti');
  });

  it('kanal yoksa baslik ONSUZ kurulur', () => {
    const content = withFeedbackHeader({
      receivedAt: RECEIVED,
      rating: 5,
      channel: null,
      comment: 'harika',
    });

    expect(content).toBe('[Geri bildirim · 2026-08-24 · 5/5] harika');
  });

  it('⚠️ PUAN BASLIKTA — metninde olumsuz kelime gecmeyen bir yorum da isaretli olur', () => {
    // Puan bir SAYIDIR, ama vektorun icinde bir ISARETTIR (§4).
    expect(create({ rating: 1, comment: 'yine ayni' }).embeddableContent()).toContain('1/5');
  });

  it('⚠️ YORUMSUZ kayit `null` doner — gomulecek metin YOK', () => {
    // Cagiran bunu gorup embedding adimini TAMAMEN atlar: yorumsuz bir kayit ne
    // saglayiciya gider ne de oran siniri payi oder (§8). Bedeli §3.5'te:
    // `POST /ask` havuzunda HICBIR SESI OLMAZ.
    expect(create({ comment: null }).embeddableContent()).toBeNull();
  });

  it('⚠️ yazma yolu ile katkici AYNI fonksiyonu kullanir', () => {
    // Iki yerde ayri bicimlendirilseydi model ayni kaydi IKI FARKLI SEKILDE
    // gorurdu ve fark SESSIZ olurdu.
    const response = create({ rating: 3, comment: 'idare eder', channel: 'telefon' });

    expect(response.embeddableContent()).toBe(
      withFeedbackHeader({
        receivedAt: RECEIVED,
        rating: 3,
        channel: 'telefon',
        comment: 'idare eder',
      }),
    );
  });

  // ==========================================================================
  // Embedding boyutu
  // ==========================================================================

  it('yanlis embedding boyutunu SINIRDA reddeder', () => {
    expect(() => {
      assertEmbeddingDimensions([0.1, 0.2]);
    }).toThrow(InvalidFeedbackEmbeddingDimensionsError);
  });

  it('dogru boyutu kabul eder', () => {
    expect(() => {
      assertEmbeddingDimensions(Array.from({ length: 1536 }, () => 0));
    }).not.toThrow();
  });
});
