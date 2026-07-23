import { Module } from '@nestjs/common';

import { EMAIL_PORT } from '../../shared/email.port';
import { ConsoleEmailAdapter } from './console-email.adapter';

/**
 * `EmailPort` wiring'i (ARCHITECTURE 9.3).
 *
 * ============================================================================
 * BUGUN KONSOL, YARIN RESEND — ve degisen tek sey bu satir olacak
 * ============================================================================
 * Adapter secimi TEK bir yerde yapilir; hicbir use case somut saglayiciyi
 * bilmez. Resend'e gecis, burada baska bir sinif baglamaktan ibarettir.
 *
 * `ConsoleEmailAdapter` icerigi (dogrulama kodu dahil) loglar ve bu YALNIZCA
 * dev/CI icin dogrudur (AUTH §7.7, P1). Uretim wiring'i secilirken bu adapter
 * ASLA baglanmamalidir; o gun bu modul ortama gore secim yapacak sekilde
 * genisletilir.
 * ============================================================================
 */
@Module({
  providers: [{ provide: EMAIL_PORT, useClass: ConsoleEmailAdapter }],
  exports: [EMAIL_PORT],
})
export class EmailModule {}
