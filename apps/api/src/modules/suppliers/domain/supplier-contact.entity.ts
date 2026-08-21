import { BlankSupplierContactNameError, InvalidSuppliersTimestampError } from './suppliers.error';

/**
 * Tedarikcideki kisi (ADR-0040 §1).
 *
 * `crm.contacts`in karsiligi — "ucuz tekrar"in en duz kismi: burada gercekten
 * YENI BIR KARAR YOKTUR ve olmamasi kararin kendisidir.
 *
 * `supplierId` ZORUNLUDUR ve DEGISTIRILEMEZ: her kisi bir tedarikciye aittir.
 * Kisiyi baska tedarikciye tasimak `PATCH`in isi degildir — o bir TASIMA
 * islemidir ve gerekirse kendi ucunu ister; sessizce izin vermek, tedarikci
 * silinince yanlis kisilerin cascade ile gitmesine yol acardi (`Contact`in
 * birebir ayni gerekcesi).
 *
 * ============================================================================
 * ⚠️ BU KISININ SILINMESI GORUSME KAYDINI SILMEZ (§1.3)
 * ============================================================================
 * `suppliers.interactions.contact_id` `ON DELETE SET NULL` tasir, `CASCADE`
 * DEGIL. Ayrilan bir satin alma sorumlusunun silinmesi, o tedarikciyle ilgili
 * TUM kurumsal hafizayi goturseydi hata SESSIZ olurdu.
 *
 * `Company`/`Contact` ile ayni iyimser-eszamanlilik sinirini tasir (son yazan
 * kazanir).
 */
export interface SupplierContactFields {
  readonly fullName: string;
  readonly title: string | null;
  readonly email: string | null;
  readonly phone: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<...>` YETMEZ (`exactOptionalPropertyTypes`): `undefined` = dokunma,
 * `null` = temizle.
 */
export type SupplierContactPatch = {
  readonly [K in keyof SupplierContactFields]?: SupplierContactFields[K] | undefined;
};

export interface SupplierContactState extends SupplierContactFields {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class SupplierContact {
  private constructor(private readonly state: SupplierContactState) {}

  static create(input: {
    id: string;
    tenantId: string;
    supplierId: string;
    fields: SupplierContactFields;
    now: Date;
  }): SupplierContact {
    return new SupplierContact({
      id: input.id,
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      ...normalize(input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static fromPersistence(state: SupplierContactState): SupplierContact {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidSuppliersTimestampError();
    }
    return new SupplierContact(state);
  }

  /** KISMI guncelleme. `supplierId` BURADA DEGISTIRILEMEZ (sinif yorumu). */
  update(changes: SupplierContactPatch, now: Date): SupplierContact {
    const current = this.state;

    const merged: SupplierContactFields = {
      fullName: changes.fullName ?? current.fullName,
      title: pick(changes.title, current.title),
      email: pick(changes.email, current.email),
      phone: pick(changes.phone, current.phone),
    };

    return new SupplierContact({ ...current, ...normalize(merged), updatedAt: now });
  }

  toState(): SupplierContactState {
    return this.state;
  }
}

function normalize(fields: SupplierContactFields): SupplierContactFields {
  const fullName = fields.fullName.trim();
  if (fullName === '') {
    throw new BlankSupplierContactNameError();
  }

  return {
    fullName,
    title: blankToNull(fields.title),
    email: blankToNull(fields.email),
    phone: blankToNull(fields.phone),
  };
}

/** Bos dizeler `null`a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** `undefined` = dokunma, `null`/bos = temizle. */
function pick(change: string | null | undefined, current: string | null): string | null {
  return change === undefined ? current : blankToNull(change);
}
