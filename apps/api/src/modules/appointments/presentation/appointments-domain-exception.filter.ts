import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { type Response } from 'express';

import { EmbeddingFailedError } from '../../../shared/embedding.port';
import { CompletionFailedError } from '../../../shared/llm.port';
import { RateLimitExceededError } from '../../../shared/rate-limit.policy';
import { AppointmentsDomainError } from '../domain/appointments.error';

/**
 * Randevu domain hatalarini HTTP'ye cevirir.
 *
 * `FinanceDomainExceptionFilter` / `ProjectsDomainExceptionFilter` ile ayni
 * disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ SLICE 3: UC HATA TIPI EKLENDI — ve UCU DE `AppointmentsDomainError`DAN
 * TUREMEZ
 * ============================================================================
 * `@Catch(...)` listesi artik DORT tip tasiyor. Ucu `shared/`in PAYLASILAN
 * hata tipleridir:
 *
 *     EmbeddingFailedError      -> 502  (`shared/embedding.port`)
 *     RateLimitExceededError    -> 429 + `Retry-After` (`shared/rate-limit.policy`)
 *     CompletionFailedError     -> 502  (`shared/llm.port`)
 *
 * ⚠️ `@Catch(...)`E AYRICA YAZILMASALARDI FILTRE ONLARI GORMEZDI ve kullanici
 * 429/502 yerine ISLENMEMIS 500 alirdi. Hata SESSIZDIR: sunucu "bir sey ters
 * gitti" der, neyin ters gittigini soylemez — oran siniri asan bir kullanici
 * ne zaman tekrar deneyecegini, saglayici cokmesinde ise sorunun kendisinde mi
 * olduğunu bilemez.
 *
 * ⚠️ CRM'DE BU DERS DORT KEZ OGRENILDI (Slice 2, Slice 3, Slice 6 ve Katman 2)
 * ve her seferinde bir testin KIRMIZI YANMASIYLA bulundu. Projeler ve Finans
 * onu ONCEDEN uyguladi; Randevu da oyle — bu satirlar eklenirken HICBIR TEST
 * KIRMIZI YANMADI.
 *
 * Genellenmis kural: BIR MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA, O PORTUN
 * HATA TIPI BURAYA EKLENMELIDIR.
 *
 * ============================================================================
 * ⚠️ `CompletionFailedError` BU MODULDE BUGUN URETILEMEZ — VE YINE DE YAZILI
 * ============================================================================
 * Randevu `LLMPort` KULLANMAZ: modul ici AI yuzeyi v1'de yoktur (ADR-0035 §7)
 * ve `appointments.module.ts` `LLM_PORT` SAGLAMAZ. Finans ve Projeler bu
 * gerekceyle onu DISARIDA BIRAKTI ve gerekce o gun dogruydu.
 *
 * ⚠️ Ama CRM'in AYNI gerekcesi Katman 2'de (musteri ozeti eklenirken)
 * YANLISLANDI ve satir o gun hatirlanmak zorunda kalindi. Product Owner karari
 * (ADR-0035 §8): ucu de BASTAN yazilir. Bedeller SIMETRIK DEGIL — bir satirlik
 * OLU KOD ile ISLENMEMIS BIR 500. Simetrik olmayan bir riskte ucuz tarafta
 * durulur.
 *
 * ⚠️ Bu, "her modul her hata tipini yakalasin" DEGILDIR: filtre yalnizca
 * `shared/`daki UC AI hatasini kapsar, cunku ucu de bu modulun kullandigi ya da
 * YARIN KULLANMASI COK MUHTEMEL olan portlara aittir.
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  APPOINTMENT_STATUS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  APPOINTMENT_DURATION_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  APPOINTMENT_SCHEDULED_AT_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  APPOINTMENTS_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  APPOINTMENT_NOT_FOUND: HttpStatus.NOT_FOUND,
  // Cross-modul yumusak referans (ADR-0035 §4): "yok", "baska tenant'in" ve
  // "izin yok" AYIRT EDILMEZ — ucu de 404. `PROJECT_COMPANY_NOT_FOUND` /
  // `FINANCE_TRANSACTION_COMPANY_NOT_FOUND` ile ayni desen.
  APPOINTMENT_CONTACT_NOT_FOUND: HttpStatus.NOT_FOUND,

  // ⚠️ SESSIZ KIRPMA YASAK (ADR-0035 §3d): sinir asilirsa istek REDDEDILIR.
  APPOINTMENT_SERVICE_NOTE_TOO_LONG: HttpStatus.UNPROCESSABLE_ENTITY,
  APPOINTMENT_EMBEDDING_DIMENSIONS_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
};

/**
 * Randevu KAYDEDILDI ama not indekslenemedi (ADR-0029 §4'un bilinen siniri).
 *
 * ⚠️ Genel bir hata donmek kullaniciyi randevuyu YENIDEN GIRMEYE ve MUKERRER
 * kayda iterdi — ve bu modulde mukerrer kayit, takvimde ust uste iki blok
 * demektir. Mesaj acikca durumu soyler ve onarim yolunu gosterir.
 */
const EMBEDDING_FAILED_DETAIL =
  'Randevu kaydedildi ancak notu arama icin indekslenemedi; /appointments/reindex ile onarilabilir.';

/** Completion bu modulde bugun URETILEMEZ; mesaj yine de anlamli olmali. */
const COMPLETION_FAILED_DETAIL = 'AI saglayicisina ulasilamadi; lutfen tekrar deneyin.';

@Catch(AppointmentsDomainError, EmbeddingFailedError, RateLimitExceededError, CompletionFailedError)
export class AppointmentsDomainExceptionFilter implements ExceptionFilter {
  catch(
    exception:
      | AppointmentsDomainError
      | EmbeddingFailedError
      | RateLimitExceededError
      | CompletionFailedError,
    host: ArgumentsHost,
  ): void {
    if (exception instanceof EmbeddingFailedError) {
      throw new HttpException(EMBEDDING_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof CompletionFailedError) {
      throw new HttpException(COMPLETION_FAILED_DETAIL, HttpStatus.BAD_GATEWAY);
    }

    if (exception instanceof RateLimitExceededError) {
      // `Retry-After` 429'un standart tamamlayicisidir. Govde degil BASLIK
      // oldugu icin RFC 7807 bicimlendirmesine dokunmaz.
      host
        .switchToHttp()
        .getResponse<Response>()
        .setHeader('Retry-After', String(exception.retryAfterSeconds));
      throw new HttpException(exception.message, HttpStatus.TOO_MANY_REQUESTS);
    }

    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
