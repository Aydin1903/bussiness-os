import { Injectable } from '@nestjs/common';

import { EmailDeliveryError, type EmailMessage, type EmailPort } from '../../shared/email.port';

/** Resend REST API'sinin gonderim ucu. */
const RESEND_ENDPOINT = 'https://api.resend.com/emails';

/**
 * Ag cagrisi ust siniri. Sinirsiz bekleyen bir istek, outbox turunu ve onunla
 * birlikte kaydin KILIDINI acik tutar; kuyruk durur.
 */
const REQUEST_TIMEOUT_MS = 10_000;

export interface ResendEmailOptions {
  readonly apiKey: string;
  /** Gonderen adresi — Resend'de dogrulanmis alan adina ait olmalidir. */
  readonly from: string;
}

/**
 * `EmailPort`'un Resend implementasyonu (ARCHITECTURE 9.3).
 *
 * ============================================================================
 * NEDEN SDK DEGIL `fetch`
 * ============================================================================
 * Resend'in ihtiyacimiz olan yuzeyi TEK bir `POST /emails` cagrisidir. Node 24'te
 * `fetch` global; bir bagimlilik eklemek, ucuncu parti bir surum akisini kalici
 * olarak ustlenmek demekti. Ayrica hata SINIFLANDIRMASI (kalici/gecici) bu
 * mekanizmanin can damaridir ve onu SDK'nin hata tiplerine devretmek yerine
 * burada acikca yapmak istiyoruz. `@nestjs/schedule`'i relay icin reddederken
 * kullandigimiz gerekcenin aynisi.
 * ============================================================================
 *
 * ============================================================================
 * HATA SINIFLANDIRMASI — bu adapter'in ASIL isi
 * ============================================================================
 * Gonderim basarisizsa `EmailDeliveryError` firlatilir ve hatanin YENIDEN
 * DENENEBILIR olup olmadigi isaretlenir. Karari (kac kez, ne zaman) teslimat
 * politikasi verir; SINIFLANDIRMAYI yalnizca buradaki bilgi mumkun kilar.
 *
 *   4xx (422 gecersiz adres, 403 reddedilen alan, 401 gecersiz anahtar)
 *       -> KALICI. Yeniden denemek kuyrugu bosuna mesgul eder.
 *   429 (oran siniri) -> GECICI. Backoff tam da bunun icin var.
 *   5xx, ag hatasi, zaman asimi -> GECICI.
 *
 * 401/403 kalici sayilir: yanlis yapilandirilmis bir anahtar yeniden denemeyle
 * duzelmez. Bu durumda kayitlar olu mektuba duser ve ALARM uretir — sessizce
 * birikip fark edilmemelerinden iyidir.
 * ============================================================================
 *
 * E-POSTA ICERIGI LOGLANMAZ (P1): hata metni yalnizca saglayicinin durum kodunu
 * ve mesajini tasir; govde, dogrulama kodu ve alici adresi ASLA.
 */
@Injectable()
export class ResendEmailAdapter implements EmailPort {
  constructor(private readonly options: ResendEmailOptions) {}

  async send(message: EmailMessage): Promise<void> {
    const response = await this.#post(message);

    if (!response.ok) {
      throw new EmailDeliveryError(
        `Resend gonderimi reddetti (HTTP ${String(response.status)}): ${await readReason(response)}`,
        // 429 bir 4xx'tir ama GECICIDIR — oran siniri backoff ile asilir.
        { permanent: response.status >= 400 && response.status < 500 && response.status !== 429 },
      );
    }
  }

  async #post(message: EmailMessage): Promise<Response> {
    try {
      return await fetch(RESEND_ENDPOINT, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: this.options.from,
          to: [message.to],
          subject: message.subject,
          text: message.textBody,
          ...(message.htmlBody === undefined ? {} : { html: message.htmlBody }),
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      // Ag hatasi / zaman asimi: saglayiciya ULASILAMADI, dolayisiyla mesajin
      // gidip gitmedigi BILINMIYOR. Gecici sayilir ve yeniden denenir —
      // teslimat at-least-once'tir (ADR-0006), kayip riski tekrar riskinden agirdir.
      throw new EmailDeliveryError(`Resend'e ulasilamadi: ${describe(error)}`, {
        permanent: false,
      });
    }
  }
}

/**
 * Yanit govdesinden guvenli bir teshis metni cikarir.
 *
 * Govde okunamazsa gonderim yine de basarisizdir; okuma hatasi asil hatayi
 * GOLGELEMEMELIDIR.
 */
async function readReason(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();

    if (typeof body === 'object' && body !== null && 'message' in body) {
      const { message } = body;
      if (typeof message === 'string') {
        return message;
      }
    }

    return 'saglayici ayrintili sebep bildirmedi';
  } catch {
    return 'yanit govdesi okunamadi';
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
