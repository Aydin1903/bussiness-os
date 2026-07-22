/**
 * E-posta gonderim port'u — SAGLAYICI BAGIMSIZ (ARCHITECTURE 9.3, AUTH §7.7).
 *
 * `shared/` altinda yasar cunku yalnizca Identity'nin degil, ileride her modulun
 * (fatura, bildirim, davet) ihtiyac duyabilecegi ortak bir port'tur —
 * `DomainEventPublisher` ile ayni gerekce. Framework'suzdur; somut saglayici
 * (Resend / konsol / SES) bir adapter detayidir.
 *
 * ============================================================================
 * KRITIK KURALLAR (AUTH §7.7, §9.3)
 * ============================================================================
 * 1. Gonderim DOMAIN EVENT uzerinden, outbox akisiyla tetiklenir. Use case
 *    `send()`'i DOGRUDAN cagirmaz — aksi halde ya DB commit olur e-posta gitmez,
 *    ya e-posta gider ama transaction geri alinir ve kullanici olmayan bir kod alir.
 * 2. Dogrulama kodu, sifirlama kodu ve token'lar URETIM loglarina girmez (P1).
 * 3. Teslimat hatasi kullaniciya sizdirilmaz; "kod gonderildi" yaniti teslimatin
 *    basarisindan bagimsizdir (P2). Handler idempotent ve yeniden denenebilirdir.
 * ============================================================================
 */
/** DI token'i. */
export const EMAIL_PORT = Symbol('EMAIL_PORT');

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
  /** Zengin icerik istege bagli; duz metin daima bulunur. */
  readonly htmlBody?: string;
}

export interface EmailPort {
  /** Mesaji gonderir. Saglayici bir adapter detayidir; sozlesme degismez. */
  send(message: EmailMessage): Promise<void>;
}
