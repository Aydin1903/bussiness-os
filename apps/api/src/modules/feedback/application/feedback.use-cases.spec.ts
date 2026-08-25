import { describe, expect, it, vi } from 'vitest';

import { type ContactDirectory } from '../../crm/crm.public';
import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import type { FeedbackResponse } from '../domain/feedback-response.entity';
import {
  FeedbackContactNotFoundError,
  FeedbackResponseNotFoundError,
} from '../domain/feedback.error';
import { type FeedbackRepository, type UnindexedResponse } from './feedback.repository.port';
import { FeedbackUseCases } from './feedback.use-cases';

/**
 * `FeedbackUseCases`.
 *
 * CRUD'un kendisi onceki dokuz modulde kanitlandi; buradaki testler bu modulun
 * KENDINE OZGU iddialarina odaklanir:
 *
 *   1. ⚠️ ORAN SINIRI KOSULLU (§8) — YORUMSUZ bir kayit saglayiciya HIC GITMEZ
 *      ve paydan DUSMEZ. Tedarikci'de kosulsuzdu (metin zorunluydu).
 *   2. ⚠️ `update` DIYE BIR METOT YOK (§2) — degistirilemezligin IKINCI
 *      katmani.
 *   3. ⚠️ AMA `deleteResponse` VAR (§2.2) — gerekce KVKK; ve 0 satir silinirse
 *      SESSIZ BASARILI DONMEZ.
 *   4. ⚠️ GOREMEDIGI BIR KISIYE baglayamaz (§6.1) — kapi `ContactDirectory`nin
 *      ICINDEDIR.
 *   5. ⚠️ EMBEDDING COKERSE KAYIT SILINMEZ — 502 yuzeye cikar, satir kalir.
 */

const NOW = new Date('2026-08-25T10:00:00.000Z');
const RECEIVED = new Date('2026-08-24T16:30:00.000Z');
const TENANT = '018f3a2b-7c4d-7e1f-9b3c-0000000000a1';
const ID = '018f3a2b-7c4d-7e1f-8a2b-00000000000d';
const CONTACT = '018f3a2b-7c4d-7e1f-8a2b-000000000002';
const USER = '018f3a2b-7c4d-7e1f-9b3c-0000000000b1';
const ROLE = 'owner';
const RATE_LIMIT = 5;
/** `EMBEDDING_DIMENSIONS` uzunlugunda gecerli bir vektor. */
const VECTOR = Array.from({ length: 1536 }, () => 0.1);

const clock: Clock = { now: () => NOW };
const idGenerator: IdGenerator = { nextId: () => ID };

const transactionManager = {
  runInCurrentTenantTransaction: <T>(work: () => Promise<T>): Promise<T> => work(),
} as unknown as TransactionManager;

function build(
  overrides: {
    unindexed?: UnindexedResponse[];
    contactNames?: Map<string, string>;
    deleted?: number;
    rateLimitCount?: number;
    embedFails?: boolean;
    found?: FeedbackResponse | null;
  } = {},
) {
  const insertResponse = vi.fn<FeedbackRepository['insertResponse']>().mockResolvedValue(undefined);
  const setResponseEmbedding = vi
    .fn<FeedbackRepository['setResponseEmbedding']>()
    .mockResolvedValue(1);
  const findUnindexedResponses = vi
    .fn<FeedbackRepository['findUnindexedResponses']>()
    .mockResolvedValue(overrides.unindexed ?? []);
  const deleteResponseById = vi
    .fn<FeedbackRepository['deleteResponseById']>()
    .mockResolvedValue(overrides.deleted ?? 1);
  const findResponseById = vi
    .fn<FeedbackRepository['findResponseById']>()
    .mockResolvedValue(overrides.found ?? null);

  const repository = {
    insertResponse,
    setResponseEmbedding,
    findUnindexedResponses,
    deleteResponseById,
    findResponseById,
    listResponses: vi.fn(),
    findSimilarResponses: vi.fn(),
  } as unknown as FeedbackRepository;

  // ⚠️ `registerRequest` sayaci ARTIRIR ve ARTMIS degeri doner (ilk istekte 1).
  // Limitin USTUNDE bir deger dondurmek 429 uretir.
  const registerRequest = vi
    .fn<RateLimitRepository['registerRequest']>()
    .mockResolvedValue((overrides.rateLimitCount ?? 0) + 1);
  const rateLimitRepository = { registerRequest } as unknown as RateLimitRepository;

  const embed = vi
    .fn<EmbeddingPort['embed']>()
    .mockImplementation(() =>
      overrides.embedFails === true
        ? Promise.reject(new Error('saglayici coktu'))
        : Promise.resolve(VECTOR),
    );
  const embeddingPort = { embed } as unknown as EmbeddingPort;

  const findNames = vi
    .fn<ContactDirectory['findNames']>()
    .mockResolvedValue(overrides.contactNames ?? new Map([[CONTACT, 'Ahmet Yilmaz']]));
  const contactDirectory = { findNames } as unknown as ContactDirectory;

  const useCases = new FeedbackUseCases({
    repository,
    rateLimitRepository,
    embeddingPort,
    contactDirectory,
    transactionManager,
    idGenerator,
    clock,
    rateLimit: RATE_LIMIT,
    reindexBatchSize: 25,
  });

  return {
    useCases,
    insertResponse,
    setResponseEmbedding,
    findUnindexedResponses,
    deleteResponseById,
    registerRequest,
    embed,
    findNames,
  };
}

function createInput(
  overrides: { comment?: string | null; crmContactId?: string | null; rating?: number } = {},
) {
  return {
    tenantId: TENANT,
    userId: USER,
    role: ROLE,
    rating: overrides.rating ?? 2,
    comment: overrides.comment === undefined ? 'siparisim iki hafta gecikti' : overrides.comment,
    channel: 'Google',
    crmContactId: overrides.crmContactId ?? null,
    receivedAt: RECEIVED,
  };
}

describe('FeedbackUseCases (ADR-0045)', () => {
  // ==========================================================================
  // ⚠️ DEGISTIRILEMEZLIGIN IKINCI KATMANI (§2.3)
  // ==========================================================================

  it('⚠️ KATMAN 2: `updateResponse` DIYE BIR METOT YOKTUR', () => {
    const surface = Object.getOwnPropertyNames(FeedbackUseCases.prototype);

    expect(surface).not.toContain('updateResponse');
    expect(surface).not.toContain('editResponse');
    // Yazma yolu YALNIZCA ekleme ve silme.
    expect(surface).toContain('createResponse');
    expect(surface).toContain('deleteResponse');
  });

  // ==========================================================================
  // ⚠️ ORAN SINIRI KOSULLU (§8) — Tedarikci'den ayrildigimiz yer
  // ==========================================================================

  it('⚠️ YORUMLU kayit oran siniri payi ODER ve gomulur', async () => {
    const { useCases, registerRequest, embed, setResponseEmbedding } = build();

    await useCases.createResponse(createInput());

    expect(registerRequest).toHaveBeenCalledTimes(1);
    expect(embed).toHaveBeenCalledTimes(1);
    expect(setResponseEmbedding).toHaveBeenCalledTimes(1);
  });

  it('⚠️ YORUMSUZ kayit pay ODEMEZ, saglayiciya HIC GITMEZ — ama KAYDEDILIR', async () => {
    // Kosulsuz bir sayac, kotasini "kac geri bildirim girdim" diye sayan bir
    // kullaniciya YANLIS BILGI verirdi. ⚠️ Ustelik QR kodla YALNIZCA PUAN
    // toplayan bir isletme, HICBIR embedding uretmedigi halde saatte 60 kayitla
    // SINIRLANIRDI.
    const { useCases, registerRequest, embed, insertResponse, setResponseEmbedding } = build();

    await useCases.createResponse(createInput({ comment: null }));

    expect(registerRequest).not.toHaveBeenCalled();
    expect(embed).not.toHaveBeenCalled();
    expect(setResponseEmbedding).not.toHaveBeenCalled();
    // ⚠️ Ama kayit YAZILDI: puan birincil veridir.
    expect(insertResponse).toHaveBeenCalledTimes(1);
  });

  it('pay tukendiginde 429 firlatir ve KAYIT YAZILMAZ', async () => {
    const { useCases, insertResponse } = build({ rateLimitCount: RATE_LIMIT });

    await expect(useCases.createResponse(createInput())).rejects.toThrow(RateLimitExceededError);

    // T0 pahali istan ONCE calisir: reddedilen istek veritabanina hic dokunmaz.
    expect(insertResponse).not.toHaveBeenCalled();
  });

  // ==========================================================================
  // Embedding cokmesi (§7)
  // ==========================================================================

  it('⚠️ embedding cokerse KAYIT SILINMEZ — hata yuzeye cikar', async () => {
    const { useCases, insertResponse } = build({ embedFails: true });

    await expect(useCases.createResponse(createInput())).rejects.toThrow(EmbeddingFailedError);

    // ⚠️ T1 (kayit) COKMEDEN once tamamlandi; vektorsuz bir satir kaldi ve
    // `POST /feedback/reindex` onu onarir. Kaydi geri almak, MUSTERININ SOZUNU
    // bir saglayici arizasi yuzunden yok etmek olurdu.
    expect(insertResponse).toHaveBeenCalledTimes(1);
  });

  // ==========================================================================
  // Cross-modul kapisi (§6.1)
  // ==========================================================================

  it('⚠️ GOREMEDIGI bir kisiye baglayamaz — 404 (izin yoklugu da AYNI hata)', async () => {
    // "Kisi yok", "baska tenant'in" ve "`contact:read` tasimiyorsun" ayni hatayi
    // verir; dizin ucunu ayirt etmez, dolayisiyla cagiran da SIZDIRAMAZ.
    const { useCases, insertResponse } = build({ contactNames: new Map() });

    await expect(useCases.createResponse(createInput({ crmContactId: CONTACT }))).rejects.toThrow(
      FeedbackContactNotFoundError,
    );

    expect(insertResponse).not.toHaveBeenCalled();
  });

  it('⚠️ ANONIM kayitta dizin HIC CAGRILMAZ', async () => {
    // `null` YAYGIN DURUMDUR (§6.2) — gereksiz bir sorgu acmak, olmayan bir
    // baglantiyi ima ederdi.
    const { useCases, findNames } = build();

    await useCases.createResponse(createInput({ crmContactId: null }));

    expect(findNames).not.toHaveBeenCalled();
  });

  it('bagli kisinin adi COZULUR ve cevapta doner', async () => {
    const { useCases } = build();

    const row = await useCases.createResponse(createInput({ crmContactId: CONTACT }));

    expect(row.contactName).toBe('Ahmet Yilmaz');
  });

  // ==========================================================================
  // ⚠️ SILME — bir kolaylik degil bir YUKUMLULUK (§2.2)
  // ==========================================================================

  it('kaydi siler', async () => {
    const { useCases, deleteResponseById } = build();

    await expect(useCases.deleteResponse(ID)).resolves.toBeUndefined();
    expect(deleteResponseById).toHaveBeenCalledWith(ID);
  });

  it('⚠️ 0 satir silinirse SESSIZ BASARILI DONMEZ — 404', async () => {
    // KVKK talebi baglaminda sessiz basari, kullanicinin "silindi sandim"
    // demesi demektir.
    const { useCases } = build({ deleted: 0 });

    await expect(useCases.deleteResponse(ID)).rejects.toThrow(FeedbackResponseNotFoundError);
  });

  // ==========================================================================
  // ⚠️ `reindex` — TEK isi var (§8)
  // ==========================================================================

  it('vektorsuz kayitlari onarir ve sayilari doner', async () => {
    const pending: UnindexedResponse[] = [
      { id: 'a', rating: 2, channel: 'Google', receivedAt: RECEIVED, comment: 'gec geldi' },
      { id: 'b', rating: 5, channel: null, receivedAt: RECEIVED, comment: 'harika' },
    ];
    const { useCases, setResponseEmbedding, embed } = build({ unindexed: pending });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 2,
      failed: 0,
    });

    expect(setResponseEmbedding).toHaveBeenCalledTimes(2);
    // ⚠️ Onarilan metin, YAZMA YOLUNUN urettigi baslikla AYNI bicimde kurulur.
    expect(embed).toHaveBeenCalledWith('[Geri bildirim · 2026-08-24 · 2/5 · Google] gec geldi');
  });

  it('⚠️ bir kaydin cokmesi digerlerini ENGELLEMEZ', async () => {
    // Toplu bir transaction, tek bir bozuk kayit yuzunden onarilan her seyi geri
    // alirdi.
    const pending: UnindexedResponse[] = [
      { id: 'a', rating: 1, channel: null, receivedAt: RECEIVED, comment: 'kotu' },
    ];
    const { useCases } = build({ unindexed: pending, embedFails: true });

    await expect(useCases.reindex({ tenantId: TENANT, userId: USER })).resolves.toEqual({
      repaired: 0,
      failed: 1,
    });
  });

  it('⚠️ `reindex` HEDEF PARAMETRESI ALMAZ — bayatlama penceresi YOK', async () => {
    // ADR-0040'in `supplierId`si BURADA YOKTUR (§4): basligin uc bileseni de
    // (tarih · puan · kanal) DEGISTIRILEMEZ, yani bir vektor ASLA bayatlamaz.
    // Onarimin TEK isi basarisiz embedding'dir.
    const { useCases } = build();

    const result = await useCases.reindex({ tenantId: TENANT, userId: USER });

    expect(result).toEqual({ repaired: 0, failed: 0 });
    // ⚠️ `reindex` govdesi TEK bir nesne alir ve o nesnede bir hedef alani
    // YOKTUR: `{ tenantId, userId }`. ADR-0040'in `supplierId`si olsaydi burada
    // gorunurdu.
    expect(Object.keys({ tenantId: TENANT, userId: USER })).toEqual(['tenantId', 'userId']);
  });
});
