import { Injectable } from '@nestjs/common';

import type { Clock } from '../../shared/clock.port';

/**
 * `Clock` port'unun uretim implementasyonu.
 *
 * `new Date()` cagrisinin sistemde TEK YERDE olmasi bilinclidir: domain ve
 * application katmanlari zamani port uzerinden okur (DEVELOPMENT_RULES 3.2),
 * boylece testler sahte saat kurmak zorunda kalmaz ve "ay sonu ise su davranis
 * degisir" gibi kurallar sistem saatini degistirmeden dogrulanabilir.
 */
@Injectable()
export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}
