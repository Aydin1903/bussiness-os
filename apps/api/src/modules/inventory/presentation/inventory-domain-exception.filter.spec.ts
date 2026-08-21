import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { StorageFailedError } from '../../../shared/storage.port';
import {
  DuplicateSkuError,
  InventoryDomainError,
  InvalidQuantityError,
  NegativeMinQuantityError,
  StockItemArchivedError,
  StockItemHasMovementsError,
  StockItemNotFoundError,
  StockItemNoteTooLongError,
} from '../domain/inventory.error';
import { InventoryDomainExceptionFilter } from './inventory-domain-exception.filter';

/**
 * `InventoryDomainExceptionFilter` (ADR-0039 §10).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — HTTP TURUYLE URETILEMEYEN BIR YOL
 * ============================================================================
 * Entegrasyon testleri `EMBEDDING_PROVIDER=fake` ile kosar ve sahte adapter'in
 * HATA MODU YOKTUR. Asil risk zaten HTTP'de degil, `@Catch(...)` KAYDINDA: uc
 * paylasilan hata tipi `InventoryDomainError`DAN TUREMEZ ve listeye
 * yazilmazlarsa filtre onlari GORMEZ.
 *
 * ⚠️ Bu dosya ayrica CLAUDE.md'nin kalici kuralinin ("DisclosableProblem — AI
 * hata tipleri her modulde bastan") bu moduldeki KANITIDIR: `CompletionFailedError`
 * bugun URETILEMEZ, dolayisiyla davranisini yalnizca bu test gosterebilir.
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

function run(exception: Parameters<InventoryDomainExceptionFilter['catch']>[0]) {
  const filter = new InventoryDomainExceptionFilter();
  const { host, setHeader } = hostWithResponse();

  try {
    filter.catch(exception, host);
  } catch (thrown) {
    return { status: statusOf(thrown), thrown, setHeader };
  }

  throw new TypeError('Filtre firlatmadi.');
}

describe('InventoryDomainExceptionFilter — `@Catch(...)` KAYDI (ADR-0039 §10)', () => {
  it('⚠️ BES tipi de KAYDEDIYOR — uc AI tipi + iki domain koku', () => {
    // ⚠️ BU TESTIN ISI BIR KAYDIN VARLIGINI KORUMAKTIR. Bir tip listeden
    // dusurulurse davranis testleri de kirmizi yanar, ama bu satir SEBEBI
    // dogrudan gosterir: sorun eslemede degil, filtrenin o tipi HIC GORMEMESI.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      InventoryDomainExceptionFilter,
    );

    expect(registered).toEqual(
      expect.arrayContaining([
        InventoryDomainError,
        EmbeddingFailedError,
        RateLimitExceededError,
        CompletionFailedError,
      ]),
    );
  });

  it('⚠️ `StorageFailedError` KAYITLI DEGIL — ve bu DOGRU (§10.2)', () => {
    // ⚠️ Kural AI HATA TIPLERI icindir ve gerekcesi "her modul er ya da gec
    // AI'a dokunur"dur (bu proje AI merkezlidir). Depolama FARKLI BIR
    // KATEGORIDIR: bu modul `StoragePort`u bugun kullanmiyor ve KULLANMAYACAK —
    // envanterin sakladigi hicbir sey dosya degil.
    //
    // Yani `StorageFailedError` burada olu kod DEGIL, YANILTICI olurdu: okuyan
    // biri modulun bir depolama yuzeyi oldugunu sanardi.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      InventoryDomainExceptionFilter,
    );

    expect(registered).not.toEqual(expect.arrayContaining([StorageFailedError]));
  });

  it('⚠️ EmbeddingFailedError -> 502, ISLENMEMIS 500 DEGIL', () => {
    const { status, thrown } = run(new EmbeddingFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
    const detail: unknown = (thrown as HttpException).getResponse();
    expect(detail).toMatch(/reindex/);
  });

  it('⚠️ CompletionFailedError -> 502 — BUGUN URETILEMEZ ama YAKALANIR (§10.1)', () => {
    // Stok `LLMPort` kullanmaz ve `inventory.module.ts` `LLM_PORT` saglamaz;
    // bu satir OLU KODDUR. Product Owner'in kalici standardi geregi yazildi
    // (CLAUDE.md). Bedeller simetrik degil: bir satirlik olu kod ile ISLENMEMIS
    // BIR 500 — ve ikincisinde kullanici TEKRAR DENEMESI gerektigini ogrenemez.
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
function render(exception: Parameters<InventoryDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/inventory/items' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new InventoryDomainExceptionFilter().catch(exception, host);
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
class UnmappedInventoryError extends InventoryDomainError {
  readonly code = 'INVENTORY_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('InventoryDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ "kaydedildi ancak indekslenemedi, reindex ile onarilabilir" ULASIR', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Kalem kaydedildi');
    expect(result.body.detail).toContain('/inventory/reindex');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new EmbeddingFailedError('OPENAI_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin TUMUYLE kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedInventoryError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});

describe('InventoryDomainExceptionFilter — domain hatalari', () => {
  it('⚠️ hareketi olan kalem -> 409 ve mesaj ARSIVLEMEYI soyler (§3.4)', () => {
    // Yalnizca "silinemez" demek, kullaniciyi hareketleri tek tek silmeye
    // calismaya iterdi — ve o yol da yoktur (defter degistirilemez).
    const { status, thrown } = run(new StockItemHasMovementsError());

    expect(status).toBe(HttpStatus.CONFLICT);
    expect((thrown as HttpException).getResponse()).toMatch(/ARSIVLEYIN/);
  });

  it('ayni SKU -> 409 ve mesaj HARF DUYARSIZLIGINI soyler (§1.1)', () => {
    const { status, thrown } = run(new DuplicateSkuError('VDA-M8'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect((thrown as HttpException).getResponse()).toMatch(/duyarsiz/);
  });

  it('arsivlenmis kaleme hareket -> 409', () => {
    expect(run(new StockItemArchivedError()).status).toBe(HttpStatus.CONFLICT);
  });

  it('bulunamayan kalem -> 404 (yok / baska tenant in AYIRT EDILMEZ)', () => {
    expect(run(new StockItemNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('sinir asan not -> 422 (SESSIZ KIRPMA YOK)', () => {
    expect(run(new StockItemNoteTooLongError(2000, 1250)).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('⚠️ NEGATIF ESIK -> 422, HAM 500 DEGIL (kapanis denetimi bulgusu)', () => {
    // Bu kod eslenmeden once veritabani CHECK'i ham bir hata firlatiyor ve
    // filtre onu eslenmemis sayip 500 donduruyordu.
    const { status, thrown } = run(new NegativeMinQuantityError('-1.000'));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    // Mesaj KURALI ogretir: `null` ile `0` bu modulde farkli seylerdir.
    expect((thrown as HttpException).getResponse()).toMatch(/tukendiginde haber ver/);
  });

  it('gecersiz miktar -> 422', () => {
    expect(run(new InvalidQuantityError('abc')).status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
  });
});
