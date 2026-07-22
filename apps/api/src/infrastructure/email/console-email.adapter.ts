import { Injectable, Logger } from '@nestjs/common';

import type { EmailMessage, EmailPort } from '../../shared/email.port';

/**
 * `EmailPort`'un konsol (log) implementasyonu — YALNIZCA DEV / CI.
 *
 * E-posta GONDERMEZ; icerigi loglar (ARCHITECTURE 9.3) — boylece gelistirici
 * dogrulama kodunu gorebilir ve akisi test edebilir. Uretim RESEND kullanir; bu
 * adapter uretimde ASLA baglanmaz.
 *
 * ============================================================================
 * NEDEN ICERIGI LOGLAR — ve neden bu uretimde yasak
 * ============================================================================
 * AUTH §7.7/§9.3: kod/token URETIM loglarina girmez (P1). Bu adapter icerigi
 * (kod dahil) BILEREK loglar cunku dev/CI'da amac tam olarak budur. Bu yuzden
 * uretime baglanmasi kurala aykiridir — wiring, uretimde Resend adapter'ini secer.
 * ============================================================================
 */
@Injectable()
export class ConsoleEmailAdapter implements EmailPort {
  readonly #logger = new Logger(ConsoleEmailAdapter.name);

  send(message: EmailMessage): Promise<void> {
    this.#logger.log(
      `[DEV e-posta] -> ${message.to} · konu: "${message.subject}"\n${message.textBody}`,
    );
    return Promise.resolve();
  }
}
