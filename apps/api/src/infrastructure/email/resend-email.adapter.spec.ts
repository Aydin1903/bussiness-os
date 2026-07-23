import { afterEach, describe, expect, it, vi } from 'vitest';

import { EmailDeliveryError, type EmailMessage } from '../../shared/email.port';
import { ResendEmailAdapter } from './resend-email.adapter';

const MESSAGE: EmailMessage = {
  to: 'user@example.com',
  subject: 'Dogrulama kodu',
  textBody: 'Kodunuz: 123456',
};

function createAdapter(): ResendEmailAdapter {
  return new ResendEmailAdapter({ apiKey: 'test-key', from: 'no-reply@example.com' });
}

/** `fetch`'i verilen yanitla degistirir ve cagri argumanlarini kaydeder. */
function stubFetch(response: Response | Error): { calls: unknown[][] } {
  const calls: unknown[][] = [];

  vi.stubGlobal('fetch', (...args: unknown[]) => {
    calls.push(args);
    return response instanceof Error ? Promise.reject(response) : Promise.resolve(response);
  });

  return { calls };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ResendEmailAdapter — basarili gonderim', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('basarili yanitta hata FIRLATMAZ', async () => {
    stubFetch(jsonResponse(200, { id: 'msg-1' }));

    await expect(createAdapter().send(MESSAGE)).resolves.toBeUndefined();
  });

  it('API anahtarini Bearer basliginda tasir', async () => {
    const { calls } = stubFetch(jsonResponse(200, { id: 'msg-1' }));

    await createAdapter().send(MESSAGE);

    const init = calls[0]?.[1] as { headers: Record<string, string> };
    expect(init.headers.authorization).toBe('Bearer test-key');
  });

  it('govdeyi Resend sozlesmesine gore kurar', async () => {
    const { calls } = stubFetch(jsonResponse(200, { id: 'msg-1' }));

    await createAdapter().send(MESSAGE);

    const init = calls[0]?.[1] as { body: string };
    expect(JSON.parse(init.body)).toEqual({
      from: 'no-reply@example.com',
      to: ['user@example.com'],
      subject: 'Dogrulama kodu',
      text: 'Kodunuz: 123456',
    });
  });

  it('htmlBody yoksa gonderilmez (alan hic olusmaz)', async () => {
    const { calls } = stubFetch(jsonResponse(200, { id: 'msg-1' }));

    await createAdapter().send(MESSAGE);

    const init = calls[0]?.[1] as { body: string };
    expect(JSON.parse(init.body)).not.toHaveProperty('html');
  });
});

describe('ResendEmailAdapter — KALICI hatalar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [422, 'gecersiz alici adresi'],
    [403, 'alan adi reddedildi'],
    [401, 'gecersiz API anahtari'],
  ])('HTTP %i kalici olarak isaretlenir', async (status, message) => {
    stubFetch(jsonResponse(status, { message }));

    // Yeniden denemek bu hatalari duzeltmez; kayit dogrudan olu mektuba duser.
    await expect(createAdapter().send(MESSAGE)).rejects.toMatchObject({
      name: 'EmailDeliveryError',
      permanent: true,
    });
  });

  it('saglayicinin sebebini hata metnine tasir (teshis)', async () => {
    stubFetch(jsonResponse(422, { message: 'gecersiz alici adresi' }));

    await expect(createAdapter().send(MESSAGE)).rejects.toThrow(/gecersiz alici adresi/);
  });

  it('e-posta ICERIGINI hata metnine KOYMAZ (P1)', async () => {
    stubFetch(jsonResponse(422, { message: 'gecersiz alici adresi' }));

    const error = await createAdapter()
      .send(MESSAGE)
      .catch((caught: unknown) => caught);

    // Dogrulama kodu ve govde loglara girmemeli.
    expect(String(error)).not.toContain('123456');
    expect(String(error)).not.toContain('Kodunuz');
  });
});

describe('ResendEmailAdapter — GECICI hatalar', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('429 (oran siniri) GECICI sayilir', async () => {
    stubFetch(jsonResponse(429, { message: 'too many requests' }));

    // 4xx olmasina RAGMEN gecici: backoff tam da bunun icin var.
    await expect(createAdapter().send(MESSAGE)).rejects.toMatchObject({ permanent: false });
  });

  it.each([[500], [502], [503]])('HTTP %i gecici sayilir', async (status) => {
    stubFetch(jsonResponse(status, { message: 'sunucu hatasi' }));

    await expect(createAdapter().send(MESSAGE)).rejects.toMatchObject({ permanent: false });
  });

  it('ag hatasi gecici sayilir', async () => {
    stubFetch(new TypeError('fetch failed'));

    // Saglayiciya ULASILAMADI: mesajin gidip gitmedigi bilinmiyor. Kayip riski
    // tekrar riskinden agirdir (ADR-0006 at-least-once).
    await expect(createAdapter().send(MESSAGE)).rejects.toMatchObject({
      name: 'EmailDeliveryError',
      permanent: false,
    });
  });

  it('okunamayan govdede de EmailDeliveryError uretir', async () => {
    stubFetch(new Response('<html>bozuk</html>', { status: 500 }));

    // Govde okunamamasi ASIL hatayi golgelememeli.
    await expect(createAdapter().send(MESSAGE)).rejects.toBeInstanceOf(EmailDeliveryError);
  });
});
