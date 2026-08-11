import { describe, expect, it, vi } from 'vitest';

import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type CommentaryRepository } from './commentary.repository.port';
import { CommentaryUseCases } from './commentary.use-cases';

/**
 * `CommentaryUseCases` — Finans'in AI'a dokunan tek yolu.
 *
 * Testler dort seye odaklaniyor ve dordu de SESSIZ HATA onluyor:
 *   1. oran siniri embedding'den ONCE (reddedilen istek para harcamamali),
 *   2. embedding cokerse yorum KAYITLI kalir (kullanici metni kaybetmez),
 *   3. baglam basligi gomulen metnin PARCASIDIR,
 *   4. onarim TEK TEK ilerler; birinin cokmesi digerlerini engellemez.
 */

const NOW = new Date('2026-08-11T10:00:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const USER = '018f3a2b-7c4d-7e1f-9b3c-00000000000a';

const clock: Clock = { now: () => NOW };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

/** 1536 boyutlu sahte vektor — `CommentaryChunk` boyutu DOGRULAR. */
function embedding(): number[] {
  return Array.from({ length: 1536 }, () => 0.1);
}

function build(
  overrides: {
    count?: number;
    limit?: number;
    embed?: EmbeddingPort['embed'];
    unindexed?: { commentaryId: string; occurredOn: string; body: string }[];
    saveChunks?: CommentaryRepository['saveChunks'];
  } = {},
) {
  let sequence = 0;
  const idGenerator: IdGenerator = {
    nextId: () => {
      sequence += 1;
      return `018f3a2b-7c4d-7e1f-8a2b-${String(sequence).padStart(12, '0')}`;
    },
  };

  const saveCommentary = vi
    .fn<CommentaryRepository['saveCommentary']>()
    .mockResolvedValue(undefined);
  const saveChunks =
    overrides.saveChunks ??
    vi.fn<CommentaryRepository['saveChunks']>().mockResolvedValue(undefined);
  const findUnindexed = vi
    .fn<CommentaryRepository['findUnindexed']>()
    .mockResolvedValue(overrides.unindexed ?? []);

  const embed = overrides.embed ?? vi.fn<EmbeddingPort['embed']>().mockResolvedValue(embedding());

  // Sayac deposu: `registerRequest` PENCEREDEKI istek sayisini doner.
  const registerRequest = vi
    .fn<RateLimitRepository['registerRequest']>()
    .mockResolvedValue(overrides.count ?? 1);

  const useCases = new CommentaryUseCases({
    repository: { saveCommentary, saveChunks, findUnindexed } as unknown as CommentaryRepository,
    rateLimitRepository: { registerRequest },
    embeddingPort: { embed },
    transactionManager,
    idGenerator,
    clock,
    rateLimit: overrides.limit ?? 30,
    reindexBatchSize: 10,
  });

  return { useCases, saveCommentary, saveChunks, embed, registerRequest, findUnindexed };
}

describe('CommentaryUseCases — olusturma', () => {
  it('yorumu kaydeder ve parcalarini gomer', async () => {
    const { useCases, saveCommentary, saveChunks } = build();

    const result = await useCases.create({
      tenantId: TENANT,
      userId: USER,
      occurredOn: '2026-03-31',
      body: 'Mart ta nakit sikisti, tahsilat gecikti.',
    });

    expect(saveCommentary).toHaveBeenCalledOnce();
    expect(saveChunks).toHaveBeenCalledOnce();
    expect(result.chunkCount).toBe(1);
    expect(result.commentary.occurredOn).toBe('2026-03-31');
  });

  it('occurredOn verilmezse BUGUNE duser', async () => {
    const { useCases } = build();

    const result = await useCases.create({
      tenantId: TENANT,
      userId: USER,
      occurredOn: null,
      body: 'Bugun icin not',
    });

    expect(result.commentary.occurredOn).toBe('2026-08-11');
  });

  it('BAGLAM BASLIGI gomulen metnin PARCASIDIR', async () => {
    // ⚠️ Baslik yalnizca gosterim degil: parcanin NE OLDUGU metinde yazmaz ve
    // "tahsilat gecikti" cumlesi bir gider aciklamasindan ayirt edilemez.
    const embed = vi.fn<EmbeddingPort['embed']>().mockResolvedValue(embedding());
    const { useCases } = build({ embed });

    await useCases.create({
      tenantId: TENANT,
      userId: USER,
      occurredOn: '2026-03-31',
      body: 'Tahsilat gecikti',
    });

    expect(embed).toHaveBeenCalledWith('[Finansal yorum · 2026-03-31] Tahsilat gecikti');
  });
});

describe('CommentaryUseCases — oran siniri (T0)', () => {
  it('pay TUKENMISSE embedding HIC CAGRILMAZ', async () => {
    // ⚠️ ASIL IDDIA BUDUR: reddedilecek bir istek TEK KURUS harcamamali.
    // Sayac embedding'den SONRA kontrol edilseydi, reddedilen her istek yine
    // de para harcamis olurdu.
    const { useCases, embed, saveCommentary } = build({ count: 31, limit: 30 });

    await expect(
      useCases.create({ tenantId: TENANT, userId: USER, occurredOn: null, body: 'x' }),
    ).rejects.toThrow(RateLimitExceededError);

    expect(embed).not.toHaveBeenCalled();
    expect(saveCommentary).not.toHaveBeenCalled();
  });

  it('onarim AYNI kovayi paylasir', async () => {
    // Ayri bir kova, onarimi BUTCESIZ BIR YAN KAPIYA cevirirdi (ADR-0029).
    const { useCases, registerRequest } = build();

    await useCases.reindex({ tenantId: TENANT, userId: USER });

    expect(registerRequest).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create_commentary' }),
    );
  });
});

describe('CommentaryUseCases — embedding cokerse', () => {
  it('yorum KAYITLI kalir ve hata YUZEYE CIKAR', async () => {
    // ⚠️ Yorum SILINMEZ: genel bir hata donmek kullaniciyi metni yeniden
    // yazmaya ve MUKERRER kayda iterdi. Filtre bunu "kaydedildi ancak
    // indekslenemedi" (502) mesajina cevirir ve onarim yolunu gosterir.
    const embed = vi.fn<EmbeddingPort['embed']>().mockRejectedValue(new Error('saglayici coktu'));
    const { useCases, saveCommentary, saveChunks } = build({ embed });

    await expect(
      useCases.create({ tenantId: TENANT, userId: USER, occurredOn: null, body: 'x' }),
    ).rejects.toThrow(EmbeddingFailedError);

    expect(saveCommentary).toHaveBeenCalledOnce();
    expect(saveChunks).not.toHaveBeenCalled();
  });
});

describe('CommentaryUseCases — onarim', () => {
  const pending = [
    { commentaryId: 'c1', occurredOn: '2026-03-31', body: 'Mart' },
    { commentaryId: 'c2', occurredOn: '2026-04-30', body: 'Nisan' },
  ];

  it('parcasiz yorumlari onarir', async () => {
    const { useCases } = build({ unindexed: pending });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 2,
      failed: 0,
    });
  });

  it('BIRININ cokmesi digerlerini ENGELLEMEZ', async () => {
    // ⚠️ Her yorum AYRI transaction'da: toplu bir transaction, tek bir bozuk
    // kayit yuzunden onarilan HER SEYI geri alirdi.
    const embed = vi
      .fn<EmbeddingPort['embed']>()
      .mockRejectedValueOnce(new Error('gecici hata'))
      .mockResolvedValue(embedding());
    const { useCases } = build({ unindexed: pending, embed });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 1,
      failed: 1,
    });
  });

  it('UNIQUE ihlali o yorumu failed yapar, sureci DURDURMAZ', async () => {
    // Es zamanli iki onarimda ikincisi kisitla reddedilir — VERI BOZULMAZ.
    const saveChunks = vi
      .fn<CommentaryRepository['saveChunks']>()
      .mockRejectedValueOnce(new Error('duplicate key value violates unique constraint'))
      .mockResolvedValue(undefined);
    const { useCases } = build({ unindexed: pending, saveChunks });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 1,
      failed: 1,
    });
  });
});
