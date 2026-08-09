/** Projeler domain hatalari (ADR-0033). */
export abstract class ProjectsDomainError extends Error {
  abstract readonly code: string;
}

export class BlankProjectNameError extends ProjectsDomainError {
  readonly code = 'PROJECT_NAME_BLANK';
  constructor() {
    super('Proje adi bos olamaz.');
  }
}

export class InvalidProjectStatusError extends ProjectsDomainError {
  readonly code = 'PROJECT_STATUS_INVALID';
  constructor(status: string) {
    super(`Gecersiz proje durumu: ${status}`);
  }
}

/**
 * Bitis tarihi baslangictan once.
 *
 * Yalnizca IKISI DE doluyken kontrol edilir: tek basina bir bitis tarihi
 * ("Cuma'ya kadar, ne zaman basladigi belirsiz") mesru bir durumdur.
 *
 * Veritabaninda da ayni kisit vardir (`0020`); burada yakalanmasi istemciye
 * 500 yerine anlamli bir 422 dondurur — `CurrencyRequiredError` ile ayni desen.
 */
export class ProjectDueBeforeStartError extends ProjectsDomainError {
  readonly code = 'PROJECT_DUE_BEFORE_START';
  constructor() {
    super('Bitis tarihi baslangic tarihinden once olamaz.');
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
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini, `CompanyNotFound`
 * ile ayni gerekce).
 * ============================================================================
 */
export class ProjectNotFoundError extends ProjectsDomainError {
  readonly code = 'PROJECT_NOT_FOUND';
  constructor() {
    super('Proje bulunamadi.');
  }
}

export class InvalidProjectsTimestampError extends ProjectsDomainError {
  readonly code = 'PROJECTS_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}
