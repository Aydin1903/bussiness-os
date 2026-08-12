import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { AppointmentsDomainError } from '../domain/appointments.error';

/**
 * Randevu domain hatalarini HTTP'ye cevirir.
 *
 * `FinanceDomainExceptionFilter` / `ProjectsDomainExceptionFilter` ile ayni
 * disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ SLICE 3'TE UC HATA TIPI EKLENECEK — VE BU BIR HATIRLATMA DEGIL, SOZ
 * ============================================================================
 * `@Catch(...)` listesi bugun TEK tip tasiyor ve bu DOGRUDUR: bu modul henuz
 * hicbir port kullanmiyor. Var olmayan bir bagimliligin hatasini yakalamak,
 * yuzeyi gereksizce genisletirdi (Finans'in Slice 1-4 boyunca uyguladigi ayni
 * disiplin).
 *
 * Slice 3 `EmbeddingPort`u ve oran sinirini getirir. O GUN, HICBIR TEST KIRMIZI
 * YANMADAN, su uc satir buraya eklenir (ADR-0035 §8):
 *
 *     EmbeddingFailedError      -> 502  (`shared/embedding.port`)
 *     RateLimitExceededError    -> 429 + `Retry-After` (`shared/rate-limit.policy`)
 *     CompletionFailedError     -> 502  (`shared/llm.port`)
 *
 * Ilk ikisi `AppointmentsDomainError`dan TUREMEZ; `@Catch(...)`e
 * yazilmazlarsa filtre onlari GORMEZ ve kullanici ISLENMEMIS 500 alir. Hata
 * SESSIZDIR: sunucu "bir sey ters gitti" der, neyin ters gittigini soylemez.
 *
 * ⚠️ CRM'DE BU DERS DORT KEZ OGRENILDI (Slice 2, Slice 3, Slice 6 ve Katman 2)
 * ve her seferinde bir testin KIRMIZI YANMASIYLA bulundu. Projeler ve Finans
 * onu onceden uyguladi. Randevu, `EmbeddingPort`u kullanan BESINCI modul
 * olacak.
 *
 * Genellenmis kural: BIR MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA, O PORTUN
 * HATA TIPI BURAYA EKLENMELIDIR.
 *
 * ⚠️ UCUNCUSU (`CompletionFailedError`) DIGER IKISINDEN FARKLI ve ADR-0035 §8
 * bu ayrimi acikca kaydetti: Randevu v1'de modul ici bir AI YUZEYI YOKTUR, yani
 * `LLMPort` cagrilmaz. Finans ve Projeler bu gerekceyle onu DISARIDA BIRAKTI ve
 * gerekce dogruydu — ama CRM'in ayni satiri Katman 2'de (musteri ozeti
 * eklenirken) YANLISLANDI. Product Owner karari: Slice 3'te ucu de yazilir.
 * Bedeller simetrik degil — bir satirlik olu kod ile islenmemis bir 500.
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
};

@Catch(AppointmentsDomainError)
export class AppointmentsDomainExceptionFilter implements ExceptionFilter {
  catch(exception: AppointmentsDomainError, _host: ArgumentsHost): void {
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
