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
  /**
   * Mesaji gonderir. Saglayici bir adapter detayidir; sozlesme degismez.
   *
   * Basarisizlikta `EmailDeliveryError` firlatmalidir — cagiran tarafin yeniden
   * deneyip denemeyecegine karar verebilmesi icin.
   */
  send(message: EmailMessage): Promise<void>;
}

/**
 * Teslimat basarisiz oldu — ve YENIDEN DENENEBILIR OLUP OLMADIGI belli.
 *
 * ============================================================================
 * NEDEN KALICI/GECICI AYRIMI PORT'TA YASIYOR
 * ============================================================================
 * Bir hatanin yeniden denenmeye deger olup olmadigini YALNIZCA adapter bilebilir:
 * "550 gecersiz alici" ile "503 servis mesgul" arasindaki farki saglayicinin
 * protokolu soyler. Ama KARARI (kac kez dene, ne zaman vazgec) teslimat
 * politikasi verir.
 *
 * Bu yuzden sinif sinirda durur: adapter SINIFLANDIRIR, politika DAVRANIR.
 * Ayrim olmasaydi gecersiz bir adres, gecici bir kesinti gibi 5 kez denenir ve
 * kuyrugu bosuna mesgul ederdi — ya da tersi, gecici bir kesinti kalici sanilip
 * gercek e-postalar olu mektuba dusurdu.
 * ============================================================================
 */
export class EmailDeliveryError extends Error {
  /**
   * `true` ise yeniden denemek ANLAMSIZDIR (gecersiz adres, reddedilen alan,
   * kimlik dogrulama hatasi). Cagiran kaydi dogrudan dead-letter'a alir.
   */
  readonly permanent: boolean;

  constructor(message: string, options: { readonly permanent: boolean }) {
    super(message);
    this.name = 'EmailDeliveryError';
    this.permanent = options.permanent;
  }
}
