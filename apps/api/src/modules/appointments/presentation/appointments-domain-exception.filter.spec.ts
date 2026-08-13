import { HttpException, HttpStatus, Logger, type ArgumentsHost } from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProblemDetailsFilter } from '../../../infrastructure/http/problem-details.filter';
import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import {
  AppointmentContactNotFoundError,
  AppointmentNotFoundError,
  AppointmentsDomainError,
  ServiceNoteTooLongError,
} from '../domain/appointments.error';
import { AppointmentsDomainExceptionFilter } from './appointments-domain-exception.filter';

/**
 * `AppointmentsDomainExceptionFilter` (ADR-0035 §8).
 *
 * ============================================================================
 * ⚠️ BU DOSYA NEDEN VAR — HTTP TURUYLA URETILEMEYEN BIR YOL
 * ============================================================================
 * Kabul olcutlerinden biri "embedding saglayicisi hata verdiginde 502 (500
 * degil)". Bu, entegrasyon testinden URETILEMEZ: testler `EMBEDDING_PROVIDER=
 * fake` ile kosar ve sahte adapter'in HATA MODU YOKTUR — yalnizca bu testi
 * mumkun kilmak icin URETIM KODUNA hata modu eklemek yanlis olurdu.
 *
 * Asil risk zaten HTTP'de degil, `@Catch(...)` KAYDINDA: uc paylasilan hata
 * tipi `AppointmentsDomainError`DAN TUREMEZ ve listeye yazilmazlarsa filtre
 * onlari GORMEZ. Bu dosya tam olarak o riski hedefler — hem DAVRANISI hem
 * KAYDIN KENDISINI dogrular.
 */

/** `host.switchToHttp().getResponse()` zincirini karsilayan en dar sahte. */
function hostWithResponse(): { host: ArgumentsHost; setHeader: ReturnType<typeof vi.fn> } {
  const setHeader = vi.fn();
  const host = {
    switchToHttp: () => ({ getResponse: () => ({ setHeader }) }),
  } as unknown as ArgumentsHost;

  return { host, setHeader };
}

/** Filtre HER ZAMAN firlatir; atilan `HttpException`i yakalar. */
function statusOf(thrown: unknown): number {
  if (!(thrown instanceof HttpException)) {
    throw new TypeError('Filtre bir HttpException firlatmaliydi.');
  }
  return thrown.getStatus();
}

function run(exception: Parameters<AppointmentsDomainExceptionFilter['catch']>[0]) {
  const filter = new AppointmentsDomainExceptionFilter();
  const { host, setHeader } = hostWithResponse();

  try {
    filter.catch(exception, host);
  } catch (thrown) {
    return { status: statusOf(thrown), thrown, setHeader };
  }

  throw new TypeError('Filtre firlatmadi.');
}

describe('AppointmentsDomainExceptionFilter — PAYLASILAN AI hatalari (ADR-0035 §8)', () => {
  it('⚠️ `@Catch(...)` DORT tipi de KAYDEDIYOR', () => {
    // ⚠️ BU TESTIN ISI BIR KAYDIN VARLIGINI KORUMAKTIR. Bir tip listeden
    // dusurulurse davranis testleri de kirmizi yanar, ama bu satir SEBEBI
    // dogrudan gosterir: sorun eslemede degil, filtrenin o tipi HIC GORMEMESI.
    const registered: unknown = Reflect.getMetadata(
      '__filterCatchExceptions__',
      AppointmentsDomainExceptionFilter,
    );

    expect(registered).toEqual(
      expect.arrayContaining([EmbeddingFailedError, RateLimitExceededError, CompletionFailedError]),
    );
  });

  it('⚠️ EmbeddingFailedError -> 502, ISLENMEMIS 500 DEGIL', () => {
    // Kabul olcutu. Mesaj onarim yolunu GOSTERIR: genel bir hata kullaniciyi
    // randevuyu yeniden girmeye ve MUKERRER kayda iterdi.
    const { status, thrown } = run(new EmbeddingFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
    // `getResponse()` `string | object` doner; filtre burada DIZE veriyor ve
    // iddia tam olarak onu kilitliyor.
    const detail: unknown = (thrown as HttpException).getResponse();
    expect(detail).toMatch(/reindex/);
  });

  it('⚠️ RateLimitExceededError -> 429 ve `Retry-After` BASLIGI', () => {
    // Kabul olcutu. Baslik govde degil HEADER oldugu icin RFC 7807
    // bicimlendirmesine dokunmaz.
    const { status, setHeader } = run(new RateLimitExceededError(60, 1800));

    expect(status).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1800');
  });

  it('⚠️ CompletionFailedError -> 502 — bugun URETILEMEZ ama YAKALANIR', () => {
    // Randevu `LLMPort` kullanmaz (ADR-0035 §7); bu satir Product Owner
    // karariyla BASTAN yazildi. Bedeller simetrik degil: bir satirlik olu kod
    // ile islenmemis bir 500. CRM'in ayni gerekcesi Katman 2'de YANLISLANMISTI.
    const { status } = run(new CompletionFailedError('saglayici cokti'));

    expect(status).toBe(HttpStatus.BAD_GATEWAY);
  });
});

/**
 * ============================================================================
 * ⚠️ 502'NIN GOVDESI ISTEMCIYE ULASIYOR MU — KUSUR IKI FILTRE ARASINDAYDI
 * ============================================================================
 * Yukaridaki testler filtrenin 502'yi ve anlamli mesaji URETTIGINI kanitliyor
 * ve o gun yesildiler — ama kullanici o mesaji GORMUYORDU: `ProblemDetailsFilter`
 * varsayilan olarak her 5xx govdesini "Beklenmeyen bir hata olustu." ile
 * maskeler (ADR-0035 kapanis denetimi, 2026-08-13; denetim bunu gercersiz bir
 * `OPENAI_API_KEY` ile uctan uca gordu).
 *
 * Yani hata TEK BIR FILTRENIN icinde degil, IKISININ ARASINDAYDI — bu yuzden
 * asagidaki testler ZINCIRI kosturur. Bu, ADR-0035'in somut ornegidir: mesajin
 * var olma sebebi kullaniciyi randevuyu YENIDEN GIRMEKTEN alikoymaktir ve
 * maske altinda o sebep hic isleyemiyordu.
 */
interface Rendered {
  readonly status: number;
  readonly body: ProblemDetails;
}

/** Modul filtresinin firlattigini global filtreye verir ve govdeyi yakalar. */
function render(exception: Parameters<AppointmentsDomainExceptionFilter['catch']>[0]): Rendered {
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
      getRequest: () => ({ originalUrl: '/api/v1/appointments' }),
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;

  let thrown: unknown;
  try {
    new AppointmentsDomainExceptionFilter().catch(exception, host);
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
class UnmappedAppointmentsError extends AppointmentsDomainError {
  readonly code = 'APPOINTMENTS_UNMAPPED_FOR_TEST';

  constructor() {
    super('connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432');
  }
}

describe('AppointmentsDomainExceptionFilter — acilan 5xx govdeleri', () => {
  beforeEach(() => {
    // Beklenen hata loglari test ciktisini kirletmesin.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('⚠️ "kaydedildi ancak indekslenemedi, reindex ile onarilabilir" ULASIR', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('Randevu kaydedildi');
    expect(result.body.detail).toContain('/appointments/reindex');
  });

  it('⚠️ govde artik genel maske metni DEGIL', () => {
    const result = render(new EmbeddingFailedError('saglayici cokti'));

    expect(result.body.detail).not.toBe('Beklenmeyen bir hata olustu.');
  });

  it('CompletionFailedError govdesi de ULASIR', () => {
    const result = render(new CompletionFailedError('saglayici cokti'));

    expect(result.status).toBe(HttpStatus.BAD_GATEWAY);
    expect(result.body.detail).toContain('tekrar deneyin');
  });

  it('saglayicinin KENDI mesaji govdeye GECMEZ', () => {
    // Isaret BIZIM yazdigimiz metni acar, saglayicininkini DEGIL.
    const result = render(new EmbeddingFailedError('OPENAI_API_KEY=sk-SUPER_SECRET gecersiz'));

    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });

  it('⚠️ eslenmemis domain hatasi HALA MASKELENIR — SECICI genisletme', () => {
    // Bu satir olmadan yukaridaki testler, maskenin tumuyle kalktigi bir
    // regresyonda da YESIL yanardi.
    const result = render(new UnmappedAppointmentsError());

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
    expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
  });
});

describe('AppointmentsDomainExceptionFilter — domain hatalari', () => {
  it('sinir asan not -> 422 (SESSIZ KIRPMA YOK)', () => {
    expect(run(new ServiceNoteTooLongError(2000, 1250)).status).toBe(
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  });

  it('bulunamayan randevu -> 404', () => {
    expect(run(new AppointmentNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('gorulemeyen kisi -> 404 (izinsiz/silinmis/yok AYIRT EDILMEZ)', () => {
    expect(run(new AppointmentContactNotFoundError()).status).toBe(HttpStatus.NOT_FOUND);
  });
});
