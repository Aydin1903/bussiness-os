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
