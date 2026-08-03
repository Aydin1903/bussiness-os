import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ConsoleEmailAdapter } from './console-email.adapter';

const adapter = new ConsoleEmailAdapter();

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ConsoleEmailAdapter', () => {
  it('gonderimi cozer (firlatmaz)', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await expect(
      adapter.send({ to: 'user@example.com', subject: 'Kod', textBody: 'Kodunuz: 123456' }),
    ).resolves.toBeUndefined();
  });

  it('icerigi loglar (dev/CI kolayligi)', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await adapter.send({
      to: 'user@example.com',
      subject: 'Dogrulama',
      textBody: 'Kodunuz: 999999',
    });

    expect(log).toHaveBeenCalledOnce();
    const logged = String(log.mock.calls[0]?.[0]);
    expect(logged).toContain('user@example.com');
    expect(logged).toContain('Dogrulama');
  });
});
