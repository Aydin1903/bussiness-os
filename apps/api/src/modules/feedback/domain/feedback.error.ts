/** Musteri Geri Bildirimi domain hatalari (ADR-0045). */
export abstract class FeedbackDomainError extends Error {
  abstract readonly code: string;
}

/**
 * Puan 1..5 araliginin disinda (ADR-0045 §1.3).
 *
 * ============================================================================
 * ⚠️ UC KATMANDA BIRDEN KORUNUR — VE UCU DE GEREKLI
 * ============================================================================
 *   Zod        -> istemciye HIZLI ve ALAN ADIYLA cevap verir
 *   domain     -> HTTP'yi ATLAYAN her yolu baglar (test, ileride bir worker)
 *   CHECK      -> ⚠️ UYGULAMAYI ATLAYAN her yolu baglar (ham SQL, migration)
 *
 * Olcek SABITTIR ve `scale` kolonu YOKTUR: NPS bir sayi degil bir
 * METODOLOJIDIR (0..10 + promoter/detractor). Ayni tabloya karistirilsaydi
 * `rating`in ANLAMI satirdan satira degisir ve ortalama SESSIZCE YANLIS olurdu.
 */
export class InvalidFeedbackRatingError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_RATING_INVALID';
  constructor(value: number) {
    super(`Gecersiz puan: ${String(value)}. Puan 1 ile 5 arasinda bir tam sayi olmalidir.`);
  }
}

/**
 * Yorum SERT karakter sinirini asti (ADR-0045 §1.2, §1.4).
 *
 * ============================================================================
 * ⚠️ SESSIZ KIRPMA YASAK — VE BU HATANIN VAR OLMA SEBEBI BUDUR
 * ============================================================================
 * Bu modulde chunk tablosu YOKTUR: yorum TEK BIR vektore gomulur. Sinir
 * zorlanmasaydi metin embedding modelinin girdi sinirina kadar buyur ve adapter
 * onu SESSIZCE KIRPARDI — kullanici, MUSTERISININ SOZUNUN yarisinin arandigini
 * HIC OGRENEMEZDI. `ServiceNoteTooLongError` / `SupplierInteractionBodyTooLong
 * Error`in ayni gerekcesi, DORDUNCU kez.
 *
 * ⚠️ Bedel bu modulde biraz daha agirdir: kirpilan sey CALISANIN yazdigi bir
 * not degil, MUSTERININ SOYLEDIGIDIR — ve o metin tekrar toplanamaz.
 */
export class FeedbackCommentTooLongError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_COMMENT_TOO_LONG';
  constructor(actual: number, max: number) {
    super(
      `Geri bildirim yorumu cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir. ` +
        'Uzun bir yazismayi belge olarak yuklemek daha dogrudur.',
    );
  }
}

/** Kanal etiketi SERT karakter sinirini asti (ADR-0045 §1.5). */
export class FeedbackChannelTooLongError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_CHANNEL_TOO_LONG';
  constructor(actual: number, max: number) {
    super(
      `Kanal etiketi cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir. Kanal bir ETIKETTIR, bir aciklama degil.`,
    );
  }
}

/**
 * `receivedAt` gecerli bir an degil.
 *
 * ⚠️ Zod yalnizca ISO KALIBINI dogrular; `2026-02-31T10:00:00Z` o kalibi
 * GECEBILIR. Kontrol edilmeseydi `Invalid Date` sessizce veritabanina kadar
 * gider ve kullanici 422 yerine 500 alirdi (`InvalidScheduledAtError`in ayni
 * gerekcesi).
 */
export class InvalidFeedbackReceivedAtError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_RECEIVED_AT_INVALID';
  constructor(value: string) {
    super(`Gecersiz geri bildirim zamani: ${value}. Gercek bir an bekleniyor.`);
  }
}

/**
 * Geri bildirim bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner ve
 * buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini).
 */
export class FeedbackResponseNotFoundError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_RESPONSE_NOT_FOUND';
  constructor() {
    super('Geri bildirim kaydi bulunamadi.');
  }
}

/**
 * Embedding boyutu beklenenden farkli.
 *
 * `vector(1536)` kolonuyla birebir baglidir; saglayici/model degisirse bu hata
 * ONCE burada gorunur — veri yazilmadan.
 */
export class InvalidFeedbackEmbeddingDimensionsError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_EMBEDDING_DIMENSIONS_INVALID';
  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}

/**
 * Bagli CRM kisisi GORUNMUYOR (ADR-0045 §6.1).
 *
 * ============================================================================
 * ⚠️ UC DURUM AYNI HATAYI VERIR — VE BU KASITLIDIR
 * ============================================================================
 *   1. Kisi YOK (silinmis — sarkan isaretci tolere edilir),
 *   2. Kisi BASKA TENANT'IN (RLS zaten gormez),
 *   3. ⚠️ Cagiran `contact:read` TASIMIYOR.
 *
 * `ContactDirectory` ucunu AYIRT ETMEZ (kapi arayuzun ICINDE), dolayisiyla
 * cagiran da ayirt edemez ve reddin sebebinden o kisinin VAR OLDUGUNU
 * cikaramaz. `AppointmentContactNotFoundError`in birebir ayni deseni.
 *
 * ⚠️ `null` GECERLIDIR ve HIC KONTROL EDILMEZ: geri bildirimlerin cogu
 * ANONIMDIR (§6.2).
 */
export class FeedbackContactNotFoundError extends FeedbackDomainError {
  readonly code = 'FEEDBACK_CONTACT_NOT_FOUND';
  constructor() {
    super('Bagli musteri kisisi bulunamadi.');
  }
}
