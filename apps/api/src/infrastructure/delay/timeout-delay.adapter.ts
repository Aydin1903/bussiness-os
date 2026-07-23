import { setTimeout as sleep } from 'node:timers/promises';

import { Injectable } from '@nestjs/common';

import type { Delay } from '../../shared/delay.port';

/**
 * `Delay` port'unun uretim implementasyonu.
 *
 * `node:timers/promises` kullanilir — callback tabanli `setTimeout`'u elle
 * Promise'e sarmaktan daha az hata yuzeyi tasir ve iptal (AbortSignal) destegi
 * ileride hazirdir.
 */
@Injectable()
export class TimeoutDelay implements Delay {
  async wait(milliseconds: number): Promise<void> {
    if (milliseconds <= 0) {
      return;
    }
    await sleep(milliseconds);
  }
}
