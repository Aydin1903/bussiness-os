/**
 * IK modulunun domain hatalari (ADR-0043).
 *
 * FRAMEWORK'SUZ (CLAUDE.md): NestJS `HttpException` buraya GIREMEZ. HTTP
 * eslemesi `presentation/hr-domain-exception.filter.ts`tedir; domain "ne
 * yanlis" der, "hangi statu" DEMEZ.
 */
export abstract class HrDomainError extends Error {
  abstract readonly code: string;

  protected constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class EmployeeNotFoundError extends HrDomainError {
  readonly code = 'EMPLOYEE_NOT_FOUND';

  constructor() {
    super('Calisan bulunamadi.');
  }
}

export class BlankEmployeeNameError extends HrDomainError {
  readonly code = 'EMPLOYEE_NAME_BLANK';

  constructor() {
    super('Calisan adi bos olamaz.');
  }
}

/**
 * ⚠️ Ad, unvan ve iletisim icin SERT karakter siniri.
 *
 * Sinirsiz birakmak, `job_title` alanini ikinci bir SERBEST NOT ALANINA
 * cevirirdi — ve bu modulde serbest not alani BILINCLI OLARAK YOKTUR
 * (ADR-0043 §1.1): bir IK kaydindaki serbest metne ilk yazilacak sey SAGLIK
 * BILGISIDIR. Yani bu sinir bir bicim kurali degil, §3'un sinirinin
 * TASIYICISIDIR.
 */
export class HrFieldTooLongError extends HrDomainError {
  readonly code = 'HR_FIELD_TOO_LONG';

  constructor(
    readonly field: string,
    readonly actual: number,
    readonly max: number,
  ) {
    super(`${field} en fazla ${String(max)} karakter olabilir (girilen: ${String(actual)}).`);
  }
}

/**
 * Ayrilma tarihi ile durum tutarsiz.
 *
 * ⚠️ Veritabaninda da bir CHECK var (`employees_ended_on_consistency`); buradaki
 * kontrol onun YERINE degil ONCESINDEDIR — kullanici ham bir kisit adi degil,
 * anlamli bir mesaj gorur.
 */
export class InconsistentEmploymentStatusError extends HrDomainError {
  readonly code = 'EMPLOYMENT_STATUS_INCONSISTENT';

  /**
   * Mesaj ARAMA yerine SEBEP alinir: metin hatanin yaninda durur ve iki ayri
   * cagirandan iki farkli cumle gelme ihtimali ortadan kalkar.
   */
  constructor(readonly reason: 'ended-without-date' | 'active-with-date') {
    super(
      reason === 'ended-without-date'
        ? 'Isten ayrilmis bir calisan icin ayrilma tarihi zorunludur.'
        : 'Calisan aktifken ayrilma tarihi bulunamaz; once durumu "ayrildi" yapin.',
    );
  }
}

export class InvalidEmploymentDatesError extends HrDomainError {
  readonly code = 'EMPLOYMENT_DATES_INVALID';

  constructor() {
    super('Ayrilma tarihi ise baslama tarihinden once olamaz.');
  }
}

export class InvalidHrDateError extends HrDomainError {
  readonly code = 'HR_DATE_INVALID';

  constructor(readonly value: string) {
    super(`Gecersiz tarih: ${value}. Takvimde var olan bir gun olmali (YYYY-AA-GG).`);
  }
}

/**
 * ⚠️ `platform_user_id` mevcut tenant'in AKTIF bir uyesine isaret etmiyor.
 *
 * Projeler'in `TaskAssigneeNotMemberError`inin birebir karsiligi (ADR-0033) ve
 * ayni yuzeyden dogrulanir: `tenant.public.ts`in `resolveMemberAccess`i.
 * `tenant.public.ts` bu iste TEK SATIR DEGISMEDI — ADR-0037 §4.1'in kurali
 * ucuncu kez TALIP tarafindan dogrulandi.
 */
export class EmployeeUserNotMemberError extends HrDomainError {
  readonly code = 'EMPLOYEE_USER_NOT_MEMBER';

  constructor() {
    super('Baglanmak istenen kullanici bu sirketin aktif bir uyesi degil.');
  }
}

/** Bir platform kullanicisi EN FAZLA BIR calisan kaydina baglanabilir. */
export class EmployeeUserAlreadyLinkedError extends HrDomainError {
  readonly code = 'EMPLOYEE_USER_ALREADY_LINKED';

  constructor() {
    super('Bu kullanici zaten baska bir calisan kaydina bagli.');
  }
}

/**
 * ⚠️ Ucret kaydi olan bir calisan SILINEMEZ (ADR-0043 §1.4).
 *
 * `ON DELETE RESTRICT`in uygulama katmanindaki karsiligi. ADR-0034'un
 * `CategoryInUseError` deseninin UCUNCU uygulamasi (ADR-0039'un
 * `StockItemHasMovementsError`i ikinciydi).
 *
 * ⚠️ Silmeye izin verilseydi `CASCADE` ucret gecmisini de goturur ve §6.2'nin
 * denetim cevabi SESSIZCE yok olurdu. Dogru yol `employment_status = 'ended'`
 * isaretlemektir — silme YALNIZCA hata duzeltmesi icindir.
 */
export class EmployeeHasCompensationError extends HrDomainError {
  readonly code = 'EMPLOYEE_HAS_COMPENSATION';

  constructor() {
    super('Ucret kaydi olan bir calisan silinemez; isten ayrildiysa "ayrildi" olarak isaretleyin.');
  }
}

export class InvalidCompensationAmountError extends HrDomainError {
  readonly code = 'COMPENSATION_AMOUNT_INVALID';

  constructor(readonly value: string) {
    super(`Gecersiz ucret: ${value}. Pozitif ve en fazla iki ondalik haneli olmali.`);
  }
}

export class InvalidCompensationCurrencyError extends HrDomainError {
  readonly code = 'COMPENSATION_CURRENCY_INVALID';

  constructor(readonly value: string) {
    super(`Gecersiz para birimi: ${value}. Uc harfli ISO kodu olmali (orn. TRY).`);
  }
}

/**
 * ⚠️ Ayni calisan icin ayni yururluk tarihine ikinci kayit.
 *
 * 409, 422 DEGIL: istek BICIMSEL olarak gecerlidir, KAYNAGIN DURUMU
 * elverissizdir (`DuplicateSkuError` / `SupplierTaxNumberDuplicateError` ile
 * ayni sinif).
 */
export class DuplicateCompensationDateError extends HrDomainError {
  readonly code = 'COMPENSATION_DATE_DUPLICATE';

  constructor() {
    super('Bu calisan icin ayni yururluk tarihinde bir ucret kaydi zaten var.');
  }
}
