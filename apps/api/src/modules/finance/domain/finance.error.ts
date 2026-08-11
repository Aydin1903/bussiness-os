/** Finans domain hatalari (ADR-0034). */
export abstract class FinanceDomainError extends Error {
  abstract readonly code: string;
}

export class BlankCategoryNameError extends FinanceDomainError {
  readonly code = 'FINANCE_CATEGORY_NAME_BLANK';
  constructor() {
    super('Kategori adi bos olamaz.');
  }
}

export class InvalidDirectionError extends FinanceDomainError {
  readonly code = 'FINANCE_DIRECTION_INVALID';
  constructor(direction: string) {
    super(`Gecersiz yon: ${direction}`);
  }
}

/**
 * Kayit bulunamadi.
 *
 * ============================================================================
 * BASKA TENANT'IN KAYDI DA BU HATAYI ALIR — bilincli
 * ============================================================================
 * RLS, baska tenant'in satirini zaten GORUNMEZ kilar; repository `null` doner
 * ve buraya duser. "Yok" ile "senin degil" AYIRT EDILMEZ: ayirmak, bir id'nin
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini,
 * `ProjectNotFoundError` / `CompanyNotFoundError` ile ayni gerekce).
 * ============================================================================
 */
export class CategoryNotFoundError extends FinanceDomainError {
  readonly code = 'FINANCE_CATEGORY_NOT_FOUND';
  constructor() {
    super('Kategori bulunamadi.');
  }
}

/**
 * Ayni ad + ayni yon zaten var (migration `0023`'un unique index'i).
 *
 * ============================================================================
 * ARSIVLENMIS BIR KATEGORI DE CAKISIR — ve mesaj bunu SOYLER
 * ============================================================================
 * Unique index kismi DEGILDIR: arsivlenmis "Kira" varken ikinci bir "Kira"
 * acilamaz. Sebebi §3e'nin devamidir — iki ayni adli satir ozet listesinde yan
 * yana gorunurdu ve hangisinin hangi donemi tasidigi anlasilmazdi.
 *
 * Mesaj arsivi ACIKCA anar, cunku aksi halde kullanici "ama boyle bir kategori
 * yok" diye dusunurdu: listede gormedigi bir satirla cakisiyor.
 */
export class DuplicateCategoryError extends FinanceDomainError {
  readonly code = 'FINANCE_CATEGORY_DUPLICATE';
  constructor() {
    super('Bu ad ve yonde bir kategori zaten var (arsivlenmis olabilir).');
  }
}

/**
 * Kullanimdaki kategori silinemez (ADR-0034 §3e).
 *
 * ============================================================================
 * ⚠️ BUGUN TETIKLENEMEZ — VE BU BILEREK BOYLE
 * ============================================================================
 * Kisiti doguran FK (`finance.transactions.category_id -> ON DELETE RESTRICT`)
 * migration `0024`'te, yani SLICE 2'de aciliyor. Bugun `finance.categories`'e
 * isaret eden hicbir satir yok, dolayisiyla her silme basarili olur.
 *
 * Hata tipi yine de SIMDI yaziliyor ve repository FK ihlalini SIMDIDEN
 * ceviriyor. Alternatifi, Slice 2'de bunu hatirlamaya guvenmekti: unutulsaydi
 * kullanimdaki bir kategoriyi silme denemesi ham bir PostgreSQL hatasi olarak
 * 500'e donusurdu. Birim testi cevirinin calistigini BUGUN kanitliyor
 * (`category.use-cases.spec.ts`); entegrasyon testi Slice 2'de eklenir.
 * ============================================================================
 */
export class CategoryInUseError extends FinanceDomainError {
  readonly code = 'FINANCE_CATEGORY_IN_USE';
  constructor() {
    super('Kullanimdaki bir kategori silinemez; arsivleyebilirsiniz.');
  }
}

export class InvalidFinanceTimestampError extends FinanceDomainError {
  readonly code = 'FINANCE_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}

// --- Islemler (ADR-0034 §2, §3c) -------------------------------------------

/**
 * Tutar gecersiz.
 *
 * Mesaj KURALI soyler, yalnizca "gecersiz" demez: istemcinin en sik yaptigi
 * hata ikiden fazla ondalik gondermektir (`0.1 + 0.2` sonucu gibi) ve bu,
 * "gecersiz tutar" mesajiyla teshis edilemez.
 */
export class InvalidAmountError extends FinanceDomainError {
  readonly code = 'FINANCE_AMOUNT_INVALID';
  constructor(value: string) {
    super(
      `Gecersiz tutar: ${value}. Tutar SIFIRDAN BUYUK olmali, en fazla 12 tam sayi ve 2 ondalik hane tasimali.`,
    );
  }
}

export class InvalidCurrencyError extends FinanceDomainError {
  readonly code = 'FINANCE_CURRENCY_INVALID';
  constructor(value: string) {
    super(`Gecersiz para birimi: ${value}. Uc harfli ISO 4217 kodu bekleniyor (orn. TRY).`);
  }
}

export class InvalidOccurredOnError extends FinanceDomainError {
  readonly code = 'FINANCE_OCCURRED_ON_INVALID';
  constructor(value: string) {
    super(`Gecersiz tarih: ${value}. YYYY-AA-GG bekleniyor.`);
  }
}

/** `ProjectNotFoundError` ile ayni "yok mu senin degil mi" disiplini. */
export class TransactionNotFoundError extends FinanceDomainError {
  readonly code = 'FINANCE_TRANSACTION_NOT_FOUND';
  constructor() {
    super('Islem bulunamadi.');
  }
}

/**
 * Islem, var olmayan (ya da baska tenant'in) bir kategoriye baglanamaz.
 *
 * `TaskProjectNotFoundError` ile ayni desen: govdedeki bir ALAN var olmayan bir
 * KAYNAGA isaret ediyor, dolayisiyla 404.
 */
export class TransactionCategoryNotFoundError extends FinanceDomainError {
  readonly code = 'FINANCE_TRANSACTION_CATEGORY_NOT_FOUND';
  constructor() {
    super('Islemin baglanacagi kategori bulunamadi.');
  }
}

/**
 * Kategorinin yonu islemin yonuyle uyusmuyor (ADR-0034 §3c).
 *
 * ============================================================================
 * IKI KATMAN AYNI SEYI SOYLUYOR — VE BU BILINCLI
 * ============================================================================
 * Veritabani bunu `transactions_category_direction_fkey` BILESIK FK'si ile
 * zaten IMKANSIZ kiliyor. Uygulama katmani kontrolu yine de yapiyor cunku
 * PostgreSQL'in FK hatasi KRIPTIKTIR ("insert or update on table ... violates
 * foreign key constraint") ve kullaniciya ne yaptigini SOYLEMEZ.
 *
 * Yani: dogru hata mesajini uygulama uretir, GARANTIYI veritabani verir.
 * Ikisinden biri kaldirilirsa ya mesaj anlasilmaz olur ya da uygulamayi atlayan
 * bir yol sessizce bozuk veri yazar.
 *
 * 422, 404 DEGIL: kategori VAR — istekteki iki alan birbiriyle celisiyor.
 */
export class CategoryDirectionMismatchError extends FinanceDomainError {
  readonly code = 'FINANCE_CATEGORY_DIRECTION_MISMATCH';
  constructor() {
    super('Kategorinin yonu islemin yonuyle uyusmuyor (gelir kaydina gider kategorisi secilemez).');
  }
}

/**
 * Arsivlenmis kategori YENI kayitlarda secilemez (ADR-0034 §3e).
 *
 * Arsivlemenin var olma sebebi tam olarak budur: gecmis kayitlar kategoriyi
 * korur, yeni kayitlar onu secemez. Engellenmeseydi arsivleme yalnizca bir
 * GORSEL filtre olurdu ve silmenin gercek alternatifi olamazdi.
 */
export class ArchivedCategoryError extends FinanceDomainError {
  readonly code = 'FINANCE_CATEGORY_ARCHIVED';
  constructor() {
    super('Arsivlenmis bir kategori yeni kayitlarda secilemez.');
  }
}
