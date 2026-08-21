import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { StorageFailedError } from '../../../shared/storage.port';
import {
  BlankSupplierInteractionBodyError,
  DuplicateTaxNumberError,
  InvalidSupplierOccurredOnError,
  PaymentTermsTooLongError,
  SupplierContactNotFoundError,
  SupplierInteractionBodyTooLongError,
  SupplierNotFoundError,
  SuppliersDomainError,
} from '../domain/suppliers.error';
import { SuppliersDomainExceptionFilter } from './suppliers-domain-exception.filter';

/**
 * `SuppliersDomainExceptionFilter` (ADR-0040 §7).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — HTTP TURUYLE URETILEMEYEN BIR YOL
 * ============================================================================
 * Entegrasyon testleri `EMBEDDING_PROVIDER=fake` ile kosar ve sahte adapter'in
 * HATA MODU YOKTUR. Asil risk zaten HTTP'de degil, `@Catch(...)` KAYDINDA: uc
 * paylasilan hata tipi `SuppliersDomainError`DAN TUREMEZ ve listeye
 * yazilmazlarsa filtre onlari GORMEZ.
 *
 * ⚠️ Bu dosya ayrica CLAUDE.md'nin kalici kuralinin ("DisclosableProblem — AI
 * hata tipleri her modulde bastan") bu moduldeki KANITIDIR:
 * `CompletionFailedError` bugun URETILEMEZ, dolayisiyla davranisini yalnizca
 * bu test gosterebilir.
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

function run(exception: Parameters<SuppliersDomainExceptionFilter['catch']>[0]) {
  const filter = new SuppliersDomainExceptionFilter();
  const { host, setHeader } = hostWithResponse();

  try {
    filter.catch(exception, host);
  } catch (thrown) {
    return { status: statusOf(thrown), thrown, setHeader };
  }

  throw new TypeError('Filtre firlatmadi.');
}

describe('SuppliersDomainExceptionFilter — `@Catch(...)` KAYDI (ADR-0040 §7)', () => {
  it('⚠️ DORT tipi de KAYDEDIYOR — uc AI tipi + domain koku', () => {
    // ⚠️ BU TESTIN ISI BIR KAYDIN VARLIGINI KORUMAKTIR. Bir tip listeden
    // dusurulurse davranis testleri de kirmizi yanar, ama bu satir SEBEBI
    // dogrudan gosterir: sorun eslemede degil, filtrenin o tipi HIC GORMEMESI.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      SuppliersDomainExceptionFilter,
    );

    expect(registered).toEqual(
      expect.arrayContaining([
        SuppliersDomainError,
        EmbeddingFailedError,
        RateLimitExceededError,
        CompletionFailedError,
      ]),
    );
  });

  it('⚠️ `StorageFailedError` KAYITLI DEGIL — ve bu DOGRU (§7)', () => {
    // ⚠️ Kural AI HATA TIPLERI icindir ve gerekcesi "her modul er ya da gec
    // AI'a dokunur"dur. Depolama FARKLI BIR KATEGORIDIR: tedarikciyle ilgili
    // bir sozlesmenin yeri BELGE moduludur (ADR-0040 §9) ve orasi zaten
    // `contactId`/`projectId` bagliyor.
    //
    // Yani `StorageFailedError` burada olu kod DEGIL, YANILTICI olurdu.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      SuppliersDomainExceptionFilter,
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
    // Tedarikci `LLMPort` kullanmaz ve `suppliers.module.ts` `LLM_PORT`
    // saglamaz; bu satir OLU KODDUR. Product Owner'in kalici standardi geregi
    // yazildi. Bedeller simetrik degil: bir satirlik olu kod ile ISLENMEMIS BIR
    // 500 — ve ikincisinde kullanici TEKRAR DENEMESI gerektigini ogrenemez.
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
function render(exception: Parameters<SuppliersDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/suppliers/interactions' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new SuppliersDomainExceptionFilter().catch(exception, host);
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
class UnmappedSupplierError extends SuppliersDomainError {
  readonly code = 'SUPPLIERS_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('SuppliersDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ "kaydedildi ancak indekslenemedi, reindex ile onarilabilir" ULASIR', () => {
    // ⚠️ Bu modulde mesajin degeri OZELLIKLE yuksek: gunluk EKLEME-YALNIZDIR
    // (§1), yani kullanici mukerrer bir kayit girerse onu SILEMEZ.
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Gorusme kaydedildi');
    expect(result.body.detail).toContain('/suppliers/reindex');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    const result = render(new EmbeddingFailedError('OPENAI_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin TUMUYLE kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedSupplierError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});

describe('SuppliersDomainExceptionFilter — domain hatalari', () => {
  it('⚠️ ayni vergi numarasi -> 409 ve mesaj HARF DUYARSIZLIGINI soyler (§1.1)', () => {
    const { status, thrown } = run(new DuplicateTaxNumberError('1234567890'));

    expect(status).toBe(HttpStatus.CONFLICT);
    expect((thrown as HttpException).getResponse()).toMatch(/duyarsiz/);
  });

  it('bulunamayan tedarikci -> 404 (yok / baska tenant in AYIRT EDILMEZ)', () => {
    expect(run(new SupplierNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('⚠️ bulunamayan kisi -> 404 — "BASKA TEDARIKCININ kisisi" de ayni cevap', () => {
    // Ayirt edilseydi, baska bir tedarikcide o id'nin VAR OLDUGU sizardi.
    expect(run(new SupplierContactNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('⚠️ sinir asan gorusme metni -> 422 (SESSIZ KIRPMA YOK, §2.2)', () => {
    const { status, thrown } = run(new SupplierInteractionBodyTooLongError(2000, 1250));

    expect(status).toBe(HttpStatus.UNPROCESSABLE_ENTITY);
    // ⚠️ Mesaj DOGRU YOLU soyler: yalnizca "cok uzun" demek, kullaniciyi metni
    // keserek yarisini KAYBETMEYE iterdi.
    expect((thrown as HttpException).getResponse()).toMatch(/belge olarak yuklemek/);
  });

  it('sinir asan odeme kosullari -> 422', () => {
    expect(run(new PaymentTermsTooLongError(400, 200)).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('bos gorusme metni -> 422', () => {
    expect(run(new BlankSupplierInteractionBodyError()).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('⚠️ takvimde olmayan gun -> 422, HAM 500 DEGIL', () => {
    // Zod yalnizca KALIBI dogrular; `2026-02-31` onu gecer. Kontrol edilmeseydi
    // deger veritabanina kadar gider ve kullanici 500 alirdi.
    expect(run(new InvalidSupplierOccurredOnError('2026-02-31')).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });
});
