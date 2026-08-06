import { BlankCompanyNameError, InvalidCrmTimestampError } from './crm.error';

/**
 * Musteri kaydi (ADR-0031 §1).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez — `Note` ve `Tenant` ile ayni disiplin.
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * BILINEN SINIR (Product Owner onayi, ADR-0031 Slice 4): iki kullanici ayni
 * sirketi ayni anda duzenlerse ikincisi birincinin degisikligini SESSIZCE
 * ezer. `updatedAt` tutuluyor ama bir VERSIYON alani ya da `If-Match` kontrolu
 * YOKTUR.
 *
 * Gerekce: bugun es zamanli duzenlemenin gercek bir senaryo oldugunu gosteren
 * kanit yok ve ETag disiplini tum okuma uclarina yayilmayi gerektirir. Gercek
 * bir cakisma gorulunce ayri bir istir.
 * ============================================================================
 */
export interface CompanyFields {
  readonly name: string;
  readonly industry: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly website: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<CompanyFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip
 * "alan YOK" der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()`
 * ciktisi ikincisidir. Ayrim anlamlidir: `undefined` = dokunma,
 * `null` = temizle.
 */
export type CompanyPatch = {
  readonly [K in keyof CompanyFields]?: CompanyFields[K] | undefined;
};

export interface CompanyState extends CompanyFields {
  readonly id: string;
  readonly tenantId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Company {
  private constructor(private readonly state: CompanyState) {}

  static create(input: {
    id: string;
    tenantId: string;
    fields: CompanyFields;
    now: Date;
  }): Company {
    const name = input.fields.name.trim();
    if (name === '') {
      throw new BlankCompanyNameError();
    }

    return new Company({
      id: input.id,
      tenantId: input.tenantId,
      ...normalize(input.fields),
      name,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kalicilikitan geri yukler; DOGRULAMA YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: CompanyState): Company {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidCrmTimestampError();
    }
    return new Company(state);
  }

  /**
   * KISMI guncelleme (PATCH).
   *
   * `undefined` = "dokunma", `null` = "temizle". Ikisi ayirt edilir; `PUT`
   * secilseydi unutulan her alan sessizce `null`'lanirdi.
   */
  update(changes: CompanyPatch, now: Date): Company {
    const current = this.state;
    const name = (changes.name ?? current.name).trim();
    if (name === '') {
      throw new BlankCompanyNameError();
    }

    return new Company({
      ...current,
      name,
      industry: pick(changes.industry, current.industry),
      email: pick(changes.email, current.email),
      phone: pick(changes.phone, current.phone),
      website: pick(changes.website, current.website),
      updatedAt: now,
    });
  }

  toState(): CompanyState {
    return this.state;
  }
}

/** Bos dizeler `null`'a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function normalize(fields: CompanyFields): Omit<CompanyFields, 'name'> {
  return {
    industry: blankToNull(fields.industry),
    email: blankToNull(fields.email),
    phone: blankToNull(fields.phone),
    website: blankToNull(fields.website),
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * Bir alanin yeni degerini secer.
 *
 * `undefined` = DOKUNMA (alan `PATCH` govdesinde yoktu).
 * `null` ya da bos dize = TEMIZLE.
 * Bu ayrim `PUT` yerine `PATCH` secmenin butun sebebidir.
 */
function pick(change: string | null | undefined, current: string | null): string | null {
  return change === undefined ? current : blankToNull(change);
}
