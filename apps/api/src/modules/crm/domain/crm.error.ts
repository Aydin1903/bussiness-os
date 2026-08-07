/** CRM domain hatalari (ADR-0031). */
export abstract class CrmDomainError extends Error {
  abstract readonly code: string;
}

export class BlankCompanyNameError extends CrmDomainError {
  readonly code = 'COMPANY_NAME_BLANK';
  constructor() {
    super('Sirket adi bos olamaz.');
  }
}

export class BlankContactNameError extends CrmDomainError {
  readonly code = 'CONTACT_NAME_BLANK';
  constructor() {
    super('Kisi adi bos olamaz.');
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
 * baska bir tenant'ta VAR OLDUGUNU sizdirirdi (P2 disiplini).
 * ============================================================================
 */
export class CompanyNotFoundError extends CrmDomainError {
  readonly code = 'COMPANY_NOT_FOUND';
  constructor() {
    super('Sirket bulunamadi.');
  }
}

export class ContactNotFoundError extends CrmDomainError {
  readonly code = 'CONTACT_NOT_FOUND';
  constructor() {
    super('Kisi bulunamadi.');
  }
}

/** Kisi, var olmayan (ya da gorunmeyen) bir sirkete baglanamaz. */
export class ContactCompanyNotFoundError extends CrmDomainError {
  readonly code = 'CONTACT_COMPANY_NOT_FOUND';
  constructor() {
    super('Kisinin baglanacagi sirket bulunamadi.');
  }
}

export class InvalidCrmTimestampError extends CrmDomainError {
  readonly code = 'CRM_TIMESTAMP_INVALID';
  constructor() {
    super('Guncelleme zamani olusturma zamanindan once olamaz.');
  }
}

export class BlankOpportunityTitleError extends CrmDomainError {
  readonly code = 'OPPORTUNITY_TITLE_BLANK';
  constructor() {
    super('Firsat basligi bos olamaz.');
  }
}

export class InvalidOpportunityStageError extends CrmDomainError {
  readonly code = 'OPPORTUNITY_STAGE_INVALID';
  constructor(stage: string) {
    super(`Gecersiz firsat asamasi: ${stage}`);
  }
}

/**
 * Tutar var ama para birimi yok.
 *
 * Birimsiz bir tutar toplamlari SESSIZCE yanlis yapar. Veritabaninda da ayni
 * kisit vardir (`0017`); burada yakalanmasi 500 yerine 422 dondurur.
 */
export class CurrencyRequiredError extends CrmDomainError {
  readonly code = 'OPPORTUNITY_CURRENCY_REQUIRED';
  constructor() {
    super('Tahmini deger girildiginde para birimi zorunludur.');
  }
}

export class OpportunityNotFoundError extends CrmDomainError {
  readonly code = 'OPPORTUNITY_NOT_FOUND';
  constructor() {
    super('Firsat bulunamadi.');
  }
}

/** Firsat, var olmayan (ya da gorunmeyen) bir sirkete/kisiye baglanamaz. */
export class OpportunityCompanyNotFoundError extends CrmDomainError {
  readonly code = 'OPPORTUNITY_COMPANY_NOT_FOUND';
  constructor() {
    super('Firsatin baglanacagi sirket bulunamadi.');
  }
}

export class OpportunityContactNotFoundError extends CrmDomainError {
  readonly code = 'OPPORTUNITY_CONTACT_NOT_FOUND';
  constructor() {
    super('Firsatin baglanacagi kisi bulunamadi.');
  }
}
