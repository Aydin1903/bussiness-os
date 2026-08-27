/**
 * Sadakat modulunun domain hatalari (ADR-0051).
 *
 * ============================================================================
 * ⚠️ BU MODULDE **409 VARDIR** — ve bu, son iki modulden AYRILDIGIMIZ NOKTA
 * ============================================================================
 * Kampanya (ADR-0047 §1.2) ve Geri Bildirim (ADR-0045) tekillik kisiti
 * TASIMIYORDU ve ikisinde de "409 diye bir cevap yoktur" diye yaziliydi:
 * ayni kampanya adi her ay tekrarlanabilir, iki musteri ayni gun ayni puani
 * verebilir — ikisi de GERCEKTIR.
 *
 * ⚠️ Burada ayni musteriye ikinci bir hesap GERCEK BIR OLGU DEGILDIR: bakiyeyi
 * IKIYE BOLER ve hata SESSIZDIR (ADR-0039'un `ABC-1`/`abc-1` SKU tuzagi).
 * `LoyaltyAccountExistsError` bu yuzden VAR ve govdesi MEVCUT HESABIN ID'SINI
 * tasir — arayuz kullaniciyi yeni bir kayda degil VAR OLAN HESABA goturur.
 */
export abstract class LoyaltyDomainError extends Error {
  abstract readonly code: string;
}

export class LoyaltyAccountNotFoundError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_ACCOUNT_NOT_FOUND';

  constructor() {
    super('Sadakat hesabi bulunamadi.');
  }
}

/**
 * ⚠️ Mevcut hesabin id'sini MESAJDA tasir — ve `null` OLABILIR.
 *
 * ============================================================================
 * ⚠️ NEDEN MESAJDA, AYRI BIR GOVDE ALANINDA DEGIL
 * ============================================================================
 * `ProblemDetailsFilter` bir `HttpException` govdesinden YALNIZCA `detail`
 * cikarir (`describeHttpException`); ek alanlar SESSIZCE DUSER. Yani "govdeye
 * bir alan koyduk" demek, gercekte hicbir sey koymamak olurdu — ve bu, tam
 * olarak bu projenin reddettigi turden bir SESSIZ KAYIPTIR.
 *
 * ⚠️ Id'nin tasinmasinin sebebi kayda deger: 409 alan kullanicinin onunde
 * BASKA BIR YOL YOKTUR — bu modulde kisiye gore hesap arayan bir uc yoktur
 * (§ Bilinen sinirlar). Id mesajda olmasaydi hata bir CIKMAZ SOKAK olurdu.
 *
 * ⚠️ `null` YARIS DURUMUNDADIR: tekillik kisiti veritabaninda yakalandiginda
 * transaction ZATEN BASARISIZ HALDEDIR ve mevcut satiri okumak icin yeni bir
 * sorgu ACILAMAZ. O yolda id BILINMEZ ve mesaj onu UYDURMAZ.
 */
export class LoyaltyAccountExistsError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_ACCOUNT_EXISTS';

  constructor(readonly existingAccountId: string | null) {
    super(
      existingAccountId === null
        ? 'Bu musterinin zaten bir sadakat hesabi var.'
        : `Bu musterinin zaten bir sadakat hesabi var (hesap: ${existingAccountId}).`,
    );
  }
}

/**
 * ⚠️ Kisi GORUNMUYOR — ve uc durum AYNI cevabi verir (ADR-0051 §6.2).
 *
 * `ContactDirectory` "kisi silinmis" · "baska tenant'in" · "cagiran
 * `contact:read` tasimiyor" durumlarini AYIRT ETTIRMEZ (bkz. `crm.public.ts`).
 * Somut sonucu: cagiran reddin sebebinden o kisinin VAR OLDUGUNU cikaramaz.
 *
 * ⚠️ Durust bedeli kayitli: `contact:read` TASIMAYAN bir kullanici icin bu
 * mesaj YANILTICIDIR ("kisi bulunamadi" der, oysa dogru cevap "gorme yetkin
 * yok"tur). Bugun TETIKLENEMEZ — dort rolun dordu de `contact:read` tasir
 * (projede ONBIRINCI kez "kapi var, tetikci yok").
 */
export class LoyaltyContactNotFoundError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_CONTACT_NOT_FOUND';

  constructor() {
    super('Sadakat hesabi acilacak musteri bulunamadi.');
  }
}

/**
 * ⚠️ BAKIYE YETERSIZ — ve govde MEVCUT BAKIYEYI tasir.
 *
 * ============================================================================
 * ⚠️ NEDEN BAKIYE MESAJDA
 * ============================================================================
 * Kullanici harcamayi ISTEMCIDE hesaplamaz (ADR-0051 §4.2 — istemcinin okudugu
 * bakiye ile istegin vardigi an arasinda bir satir girebilir ve kontrol
 * YANLIS olurdu). Dolayisiyla reddi aldiginda elinde GUNCEL bir sayi olmali;
 * yoksa listeyi tazeleyip tekrar denemek zorunda kalir ve o tazeleme de
 * AYNI YARISA girer.
 *
 * ⚠️ Sizinti YOK: cagiran zaten `loyalty_account:read` tasiyor ve ayni bakiyeyi
 * `GET /loyalty/accounts/:id` ile de okuyabilirdi.
 */
export class InsufficientPointsError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_INSUFFICIENT_POINTS';

  constructor(
    readonly requested: number,
    readonly balance: number,
  ) {
    super(
      `Yetersiz bakiye: ${String(requested)} puan kullanilmak istendi, ` +
        `hesapta ${String(balance)} puan var.`,
    );
  }
}

/**
 * ⚠️ GELECEGE TARIHLI HAREKET (ADR-0051 §1.6).
 *
 * Bakiye tarihten BAGIMSIZ olarak butun satirlarin toplamidir; gelecege
 * tarihli bir kazanim BUGUN HENUZ KAZANILMAMIS bir puani bugunun bakiyesinde
 * gosterirdi ve "hangi bakiye dogru" sorusu IKI cevaba sahip olurdu.
 *
 * ⚠️ Gecmise yazmak SERBESTTIR (dunku alisverisin puani bugun girilir).
 */
export class FutureEntryDateError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_ENTRY_DATE_IN_FUTURE';

  constructor() {
    super('Puan hareketi gelecege tarihlendirilemez.');
  }
}

export class InvalidPointAmountError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_POINTS_INVALID';

  constructor(value: number) {
    super(`Puan miktari pozitif bir tam sayi olmali: ${String(value)}.`);
  }
}

export class InvalidPointDirectionError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_DIRECTION_INVALID';

  constructor(value: string) {
    super(`Gecersiz hareket yonu: ${value}. Beklenen: earn, spend.`);
  }
}

export class PointEntryNoteTooLongError extends LoyaltyDomainError {
  readonly code = 'LOYALTY_ENTRY_NOTE_TOO_LONG';

  constructor(actual: number, max: number) {
    super(
      `Aciklama cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir. Bu alan bir ETIKETTIR, bir anlati degil.`,
    );
  }
}
