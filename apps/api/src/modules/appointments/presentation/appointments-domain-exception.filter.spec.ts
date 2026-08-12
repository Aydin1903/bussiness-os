import { HttpException, HttpStatus, type ArgumentsHost } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import {
  AppointmentContactNotFoundError,
  AppointmentNotFoundError,
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
