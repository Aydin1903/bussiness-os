import { Module } from '@nestjs/common';

import { EMAIL_PORT, type EmailPort } from '../../shared/email.port';
import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { ConsoleEmailAdapter } from './console-email.adapter';
import { ResendEmailAdapter } from './resend-email.adapter';

/**
 * `EmailPort` wiring'i (ARCHITECTURE 9.3).
 *
 * ============================================================================
 * SAGLAYICI SECIMI TEK BIR YERDE
 * ============================================================================
 * Hicbir use case somut saglayiciyi bilmez; secim yalnizca burada yapilir.
 * Resend'e gecis, ADR'nin one surdugu kabul testiydi: "yeni bir adapter yazmak
 * disinda hicbir yerde degisiklik gerekmemeli" — ve gerekmedi.
 *
 * `ConsoleEmailAdapter` icerigi (dogrulama kodu dahil) loglar; bu YALNIZCA
 * dev/CI icin dogrudur (AUTH §7.7, P1). Uretimde secilmesi env semasinda
 * ACILISTA reddedilir; buradaki secim o dogrulamadan SONRA calisir.
 * ============================================================================
 */
@Module({
  providers: [
    {
      provide: EMAIL_PORT,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): EmailPort =>
        config.email.provider === 'resend'
          ? new ResendEmailAdapter({
              apiKey: config.email.resendApiKey,
              from: config.email.from,
            })
          : new ConsoleEmailAdapter(),
    },
  ],
  exports: [EMAIL_PORT],
})
export class EmailModule {}
