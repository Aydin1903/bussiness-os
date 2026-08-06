import { BlankContactNameError, InvalidCrmTimestampError } from './crm.error';

/**
 * Sirketteki kisi (ADR-0031 §1).
 *
 * `companyId` ZORUNLUDUR ve DEGISTIRILEMEZ: her kisi bir sirkete aittir
 * (ADR-0031 §1.1'in dogal hiyerarsi karari). Kisiyi baska sirkete tasimak
 * `PATCH`'in isi degildir — o bir TASIMA islemidir ve gerekirse kendi ucunu
 * ister; sessizce izin vermek, sirket silinince yanlis kisilerin cascade ile
 * gitmesine yol acardi.
 *
 * `Company` ile ayni iyimser-eszamanlilik sinirini tasir (son yazan kazanir).
 */
export interface ContactFields {
  readonly fullName: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<ContactFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip
 * "alan YOK" der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()`
 * ciktisi ikincisidir. Ayrim anlamlidir: `undefined` = dokunma,
 * `null` = temizle.
 */
export type ContactPatch = {
  readonly [K in keyof ContactFields]?: ContactFields[K] | undefined;
};

export interface ContactState extends ContactFields {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Contact {
  private constructor(private readonly state: ContactState) {}

  static create(input: {
    id: string;
    tenantId: string;
    companyId: string;
    fields: ContactFields;
    now: Date;
  }): Contact {
    const fullName = input.fields.fullName.trim();
    if (fullName === '') {
      throw new BlankContactNameError();
    }

    return new Contact({
      id: input.id,
      tenantId: input.tenantId,
      companyId: input.companyId,
      ...normalize(input.fields),
      fullName,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static fromPersistence(state: ContactState): Contact {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidCrmTimestampError();
    }
    return new Contact(state);
  }

  /** KISMI guncelleme. `companyId` BURADA DEGISTIRILEMEZ (sinif yorumu). */
  update(changes: ContactPatch, now: Date): Contact {
    const current = this.state;
    const fullName = (changes.fullName ?? current.fullName).trim();
    if (fullName === '') {
      throw new BlankContactNameError();
    }

    return new Contact({
      ...current,
      fullName,
      title: pick(changes.title, current.title),
      email: pick(changes.email, current.email),
      phone: pick(changes.phone, current.phone),
      updatedAt: now,
    });
  }

  toState(): ContactState {
    return this.state;
  }
}

/** Bos dizeler `null`'a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function normalize(fields: ContactFields): Omit<ContactFields, 'fullName'> {
  return {
    title: blankToNull(fields.title),
    email: blankToNull(fields.email),
    phone: blankToNull(fields.phone),
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** `undefined` = dokunma, `null`/bos = temizle. Bkz. `Company.pick`. */
function pick(change: string | null | undefined, current: string | null): string | null {
  return change === undefined ? current : blankToNull(change);
}
