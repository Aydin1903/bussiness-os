import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';

import { FinanceDomainError } from '../domain/finance.error';

/**
 * Finans domain hatalarini HTTP'ye cevirir.
 *
 * `CrmDomainExceptionFilter` / `ProjectsDomainExceptionFilter` ile ayni
 * disiplin: karar tek yerde, controller'da dagitik `try/catch` YOK.
 *
 * ============================================================================
 * ⚠️ BU FILTRE BUGUN YALNIZCA `FinanceDomainError` YAKALIYOR — ve bu DOGRU
 * ============================================================================
 * Projeler'in filtresi `RateLimitExceededError` ve `EmbeddingFailedError`'i de
 * yakaliyor cunku o modul oran siniri ve embedding portu KULLANIYOR. Finans
 * Slice 1'de ikisini de kullanmiyor; var olmayan bir bagimliligin hatasini
 * yakalamak yuzeyi gereksizce genisletirdi.
 *
 * ⚠️ AMA KURAL HATIRLANMALI, cunku CRM'de DORT KEZ bir testin kirmizi
 * yanmasiyla ogrenildi ve genellendi:
 *
 *   BIR MODUL YENI BIR PORT KULLANMAYA BASLADIGINDA, O PORTUN HATA TIPI BURAYA
 *   EKLENMELIDIR.
 *
 * Finans icin bunun ne zaman gerekecegi BUGUNDEN BELLI:
 *   - Slice 4 (yorumlar + embedding) -> `RateLimitExceededError` +
 *     `EmbeddingFailedError`
 *   - Modul ici bir AI yuzeyi eklenirse -> `CompletionFailedError`
 * Eklenmezlerse filtre onlari GORMEZ ve 429/502 yerine ISLENMEMIS 500 doner.
 * ============================================================================
 */
const STATUS_BY_CODE: Readonly<Record<string, HttpStatus>> = {
  FINANCE_CATEGORY_NAME_BLANK: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_DIRECTION_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,
  FINANCE_TIMESTAMP_INVALID: HttpStatus.UNPROCESSABLE_ENTITY,

  // "Yok" ile "baska tenant'in" AYIRT EDILMEZ — ikisi de 404 (P2).
  FINANCE_CATEGORY_NOT_FOUND: HttpStatus.NOT_FOUND,

  // 409, 422 DEGIL: govdedeki alan gecerlidir — CAKISAN sey KAYNAGIN MEVCUT
  // DURUMUDUR. Ayni ayrim asagidaki "kullanimda" hatasi icin de gecerli.
  FINANCE_CATEGORY_DUPLICATE: HttpStatus.CONFLICT,
  FINANCE_CATEGORY_IN_USE: HttpStatus.CONFLICT,
};

@Catch(FinanceDomainError)
export class FinanceDomainExceptionFilter implements ExceptionFilter {
  catch(exception: FinanceDomainError, _host: ArgumentsHost): void {
    const status = STATUS_BY_CODE[exception.code] ?? HttpStatus.INTERNAL_SERVER_ERROR;

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Beklenmeyen bir domain hatasinin MESAJI disari sizmaz.
      throw new HttpException('Internal server error', status);
    }

    throw new HttpException(exception.message, status);
  }
}
