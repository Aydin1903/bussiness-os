import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { StorageFailedError } from '../../../shared/storage.port';
import {
  FeedbackChannelTooLongError,
  FeedbackCommentTooLongError,
  FeedbackContactNotFoundError,
  FeedbackDomainError,
  FeedbackResponseNotFoundError,
  InvalidFeedbackRatingError,
  InvalidFeedbackReceivedAtError,
} from '../domain/feedback.error';
import { FeedbackDomainExceptionFilter } from './feedback-domain-exception.filter';

/**
 * `FeedbackDomainExceptionFilter` (ADR-0045 §7).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — HTTP TURUYLE URETILEMEYEN BIR YOL
 * ============================================================================
 * Entegrasyon testleri `EMBEDDING_PROVIDER=fake` ile kosar ve sahte adapter'in
 * HATA MODU YOKTUR. Asil risk zaten HTTP'de degil, `@Catch(...)` KAYDINDA: uc
 * paylasilan hata tipi `FeedbackDomainError`DAN TUREMEZ ve listeye
 * yazilmazlarsa filtre onlari GORMEZ.
 *
 * ⚠️ ONCEKI IKI MODULDEN (Teklif/Fatura, IK) FARKI: burada ILK IKI TIP
 * GERCEKTEN TETIKLENEBILIR — modul embedding uretir ve oran siniri tasir.
 * Yalnizca `CompletionFailedError` olu koddur.
 */

function hostWithResponse(): { host: ArgumentsHost; setHeader: ReturnType<typeof vi.fn> } {
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ArgumentsHost;

  return { host, setHeader };
}

function statusOf(thrown: unknown): number {
  if (!(thrown instanceof HttpException)) {
    throw new TypeError('Filtre bir HttpException firlatmaliydi.');
  }
  return thrown.getStatus();
}

function run(exception: Parameters<FeedbackDomainExceptionFilter['catch']>[0]) {
  const filter = new FeedbackDomainExceptionFilter();
  const { host, setHeader } = hostWithResponse();

  try {
    filter.catch(exception, host);
  } catch (thrown) {
    return { status: statusOf(thrown), thrown, setHeader };
  }

  throw new TypeError('Filtre firlatmadi.');
}

describe('FeedbackDomainExceptionFilter — `@Catch(...)` KAYDI (ADR-0045 §7)', () => {
  it('⚠️ DORT tipi de KAYDEDIYOR — uc AI tipi + domain koku (ONBIRINCI kez)', () => {
    // ⚠️ BU TESTIN ISI BIR KAYDIN VARLIGINI KORUMAKTIR. Bir tip listeden
    // dusurulurse davranis testleri de kirmizi yanar, ama bu satir SEBEBI
    // dogrudan gosterir: sorun eslemede degil, filtrenin o tipi HIC GORMEMESI.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      FeedbackDomainExceptionFilter,
    );

    expect(registered).toEqual(
      expect.arrayContaining([
        FeedbackDomainError,
        EmbeddingFailedError,
        RateLimitExceededError,
        CompletionFailedError,
      ]),
    );
  });

  it('⚠️ `StorageFailedError` KAYITLI DEGIL — ve bu DOGRU (§7)', () => {
    // Kural AI HATA TIPLERI icindir ve gerekcesi "her modul er ya da gec AI'a
    // dokunur"dur. Depolama FARKLI BIR KATEGORIDIR: bir geri bildirime dosya
    // eklemek diye bir kavram YOKTUR. Satir olu kod degil, YANILTICI olurdu.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      FeedbackDomainExceptionFilter,
    );

    expect(registered).not.toEqual(expect.arrayContaining([StorageFailedError]));
  });

  it('⚠️ EmbeddingFailedError -> 502, ISLENMEMIS 500 DEGIL', () => {
    const { status, thrown } = run(new EmbeddingFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
    const detail: unknown = (thrown as HttpException).getResponse();
    expect(detail).toMatch(/reindex/);
  });

  it('⚠️ CompletionFailedError -> 502 — BUGUN URETILEMEZ ama YAKALANIR (§7)', () => {
    // Modul `LLMPort` kullanmaz ve `feedback.module.ts` `LLM_PORT` saglamaz; bu
    // satir OLU KODDUR. Product Owner'in kalici standardi geregi yazildi.
    // Bedeller simetrik degil: bir satirlik olu kod ile ISLENMEMIS BIR 500 — ve
    // ikincisinde kullanici TEKRAR DENEMESI gerektigini ogrenemez.
    const { status } = run(new CompletionFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
  });

  it('⚠️ RateLimitExceededError -> 429 ve `Retry-After` BASLIGI', () => {
    const { status, setHeader } = run(new RateLimitExceededError(60, 1800));

    expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1800');
  });
});

interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<FeedbackDomainExceptionFilter['catch']>[0]): Rendered {
  let status = 0;
  let body: ProblemDetails | undefined;

  const response = {
    setHeader: () => undefined,
    status: (code: number) => {
      status = code;
      return response;
    },
    type: () => response,
    json: (payload: ProblemDetails) => {
      body = payload;
      return response;
    },
  };

  const host = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/feedback' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new FeedbackDomainExceptionFilter().catch(exception, host);
  } catch (error) {
    thrown = error;
  }

  if (!(thrown instanceof HttpException)) {
    throw new TypeError('Modul filtresi bir HttpException firlatmaliydi.');
  }

  new ProblemDetailsFilter().catch(thrown, host);

  if (body === undefined) {
    throw new Error('Global filtre bir cevap uretmedi.');
  }

  return { status, body };
}

/** Eslenmemis bir domain kodu: govdesi SIZMAMALI. */
class UnmappedFeedbackError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('FeedbackDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ "kaydedildi ancak indekslenemedi, reindex ile onarilabilir" ULASIR', () => {
    // ⚠️ Bu modulde mesajin degeri OZELLIKLE yuksek: genel bir hata kullaniciyi
    // kaydi YENIDEN GIRMEYE iterdi ve MUKERRER bir geri bildirim ORTALAMAYI
    // BOZAR (ayni musteri iki kez sayilir).
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Geri bildirim kaydedildi');
    expect(result.body.detail).toContain('/feedback/reindex');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new EmbeddingFailedError('OPENAI_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin TUMUYLE kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedFeedbackError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});

describe('FeedbackDomainExceptionFilter — domain hatalari', () => {
  it('⚠️ olcek disi puan -> 422 (§1.3)', () => {
    const { status, thrown } = run(new InvalidFeedbackRatingError(6));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    expect((thrown as HttpException).getResponse()).toMatch(/1 ile 5/);
  });

  it('⚠️ sinir asan yorum -> 422 (SESSIZ KIRPMA YOK, §1.4)', () => {
    const { status, thrown } = run(new FeedbackCommentTooLongError(2000, 1250));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    // ⚠️ Mesaj DOGRU YOLU soyler: yalnizca "cok uzun" demek, kullaniciyi metni
    // keserek MUSTERININ SOZUNUN yarisini kaybetmeye iterdi.
    expect((thrown as HttpException).getResponse()).toMatch(/belge olarak yuklemek/);
  });

  it('sinir asan kanal etiketi -> 422', () => {
    expect(run(new FeedbackChannelTooLongError(200, 80)).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('⚠️ gecersiz zaman -> 422, HAM 500 DEGIL', () => {
    // Zod yalnizca ISO KALIBINI dogrular; `2026-02-31T10:00:00Z` onu gecebilir.
    expect(run(new InvalidFeedbackReceivedAtError('Invalid Date')).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('bulunamayan kayit -> 404 (yok / baska tenant in AYIRT EDILMEZ)', () => {
    expect(run(new FeedbackResponseNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('⚠️ bulunamayan kisi -> 404 — "`contact:read` YOK" da AYNI cevap (§6.1)', () => {
    // Ayirt edilseydi, goremedigi bir kisinin VAR OLDUGU sizardi.
    expect(run(new FeedbackContactNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });
});
