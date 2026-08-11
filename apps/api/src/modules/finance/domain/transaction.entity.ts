import { isFinanceDirection, type FinanceDirection } from './category.entity';
import {
  InvalidDirectionError,
  InvalidFinanceTimestampError,
  InvalidOccurredOnError,
} from './finance.error';
import { normalizeAmount, normalizeCurrency } from './money';

/**
 * Gerceklesmis nakit hareketi (ADR-0034 §2).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2).
 *
 * ============================================================================
 * SINIF ADI NEDEN `FinanceTransaction`, `Transaction` DEGIL
 * ============================================================================
 * Bu kod tabaninda "transaction" kelimesi VERITABANI TRANSACTION'i demektir ve
 * her yerdedir: `TransactionManager`, `runInCurrentTenantTransaction`,
 * `requireTransaction`, `transaction-context`. Ayni dosyada `Transaction` adli
 * bir is nesnesi ile `requireTransaction()` yan yana dursaydi, okuyan kisi her
 * seferinde hangisinin kastedildigini cozmek zorunda kalirdi.
 *
 * Tablo adi ADR'nin dedigi gibi `finance.transactions` KALIR — belirsizlik
 * SQL'de yoktur (sema nitelemesi var), TypeScript'te vardir.
 *
 * ============================================================================
 * ⚠️ GUNCELLENEBILIR VE SILINEBILIR — `interactions`/`progress_notes`ten SAPMA
 * ============================================================================
 * Onlar EKLEME-YALNIZ birer gunluktu. Islem oyle degildir: yanlis yazilmis bir
 * tutar DUZELTILEBILMELIDIR. Engellemek kullaniciyi telafi kayitlari (0 TL'lik
 * satirlar, ters isaretli "duzeltme" kalemleri) yazmaya iterdi — yani
 * YAZILIMA YALAN SOYLEMEYE, ki ADR-0031 §2'nin durum makinesi karariyla ayni
 * ilkedir.
 *
 * ⚠️ Bedeli acikca: DEGISIKLIK DENETIM IZI YOKTUR. `createdByUserId` yalnizca
 * OLUSTURANI tutar; bir tutarin ne zaman, kim tarafindan degistirildigi
 * SORULAMAZ (ADR-0034 §8). `platform/audit` ARCHITECTURE §6.2'nin zincirinde
 * yaziyor ama kod olarak yok. Tetikleyici acik: Teklif/Fatura (8. modul).
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * `Project` / `Company` / `Category` ile ayni bilinen sinir.
 */
export interface TransactionFields {
  readonly direction: FinanceDirection;
  /** ⚠️ `string` — para hicbir yerde `number` degildir (`money.ts`). */
  readonly amount: string;
  readonly currency: string;
  /** `YYYY-MM-DD`. Takvim gunu, an DEGIL. */
  readonly occurredOn: string;
  readonly description: string | null;
  /** `null` = kategorisiz; mesru bir durumdur ("hizli gir, sonra siniflandir"). */
  readonly categoryId: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * ⚠️ `companyId` / `projectId` BURADA YOK ve bu bilincli: kolonlar `0024`'te
 * acildi ama API onlari SLICE 3'e kadar kabul etmiyor. Dogrulamasi ve adin
 * cozulmesi icin gereken `projects.public.ts` o slice'ta yaziliyor;
 * dogrulanamayan bir cross-modul isaretciyi bugunden kabul etmek ILK GUNDEN
 * sarkan satir uretmek olurdu (ADR-0033 Slice 1'in birebir ayni karari).
 *
 * `Partial<...>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip "alan YOK"
 * der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()` ciktisi ikincisidir.
 */
export type TransactionPatch = {
  readonly [K in keyof TransactionFields]?: TransactionFields[K] | undefined;
};

export interface TransactionState extends TransactionFields {
  readonly id: string;
  readonly tenantId: string;
  readonly createdByUserId: string;
  /** Cross-modul yumusak referanslar — Slice 3'e kadar DAIMA `null`. */
  readonly companyId: string | null;
  readonly projectId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class FinanceTransaction {
  private constructor(private readonly state: TransactionState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: TransactionFields;
    now: Date;
  }): FinanceTransaction {
    const normalized = normalize(input.fields);

    return new FinanceTransaction({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalized,
      companyId: null,
      projectId: null,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; DOGRULAMA YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: TransactionState): FinanceTransaction {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidFinanceTimestampError();
    }
    return new FinanceTransaction(state);
  }

  /**
   * KISMI guncelleme.
   *
   * `undefined` = "dokunma", `null` = "temizle". Ikisi ayirt edilir; `PUT`
   * secilseydi unutulan her alan sessizce `null`'lanirdi.
   *
   * ⚠️ `direction` BURADA DEGISTIRILEBILIR — `Category`den SAPMA. Kategorinin
   * yonu kalici bir SINIFLANDIRMADIR ve gecmis kayitlarin anlamini degistirir;
   * islemin yonu ise bir VERI ALANIDIR ve yanlis girilebilir. Ama degisince
   * kategori esleşmesi YENIDEN dogrulanmak zorundadir — o kontrol use case'te
   * (bir veritabani sorgusu gerektirir ve `domain` framework'suzdur).
   */
  update(changes: TransactionPatch, now: Date): FinanceTransaction {
    const current = this.state;

    const merged: TransactionFields = {
      direction: changes.direction ?? current.direction,
      amount: changes.amount ?? current.amount,
      currency: changes.currency ?? current.currency,
      occurredOn: changes.occurredOn ?? current.occurredOn,
      description: changes.description === undefined ? current.description : changes.description,
      categoryId: changes.categoryId === undefined ? current.categoryId : changes.categoryId,
    };

    return new FinanceTransaction({ ...current, ...normalize(merged), updatedAt: now });
  }

  toState(): TransactionState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(fields: TransactionFields): TransactionFields {
  if (!isFinanceDirection(fields.direction)) {
    throw new InvalidDirectionError(fields.direction);
  }

  return {
    direction: fields.direction,
    amount: normalizeAmount(fields.amount),
    currency: normalizeCurrency(fields.currency),
    occurredOn: assertCalendarDay(fields.occurredOn),
    description: blankToNull(fields.description),
    categoryId: fields.categoryId,
  };
}

/**
 * `YYYY-MM-DD` bicimi VE gercek bir takvim gunu.
 *
 * ⚠️ Yalnizca kalip kontrolu YETMEZ: `2026-02-31` kalibi gecer ama var olmayan
 * bir gundur ve PostgreSQL onu `date` kolonuna yazarken reddeder — yani
 * kullanici 422 yerine 500 alirdi. `Date.UTC` ile geri cevrim, kalibin
 * anlattigi gunun GERCEKTEN var oldugunu dogrular.
 *
 * `Date`e cevirmek burada saat dilimi sorusunu GERI GETIRMEZ: UTC kullaniliyor
 * ve sonuc saklanmiyor, yalnizca dogrulama icin uretilip atiliyor.
 */
function assertCalendarDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (match === null) {
    throw new InvalidOccurredOnError(value);
  }

  const [, year = '', month = '', day = ''] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));

  if (
    date.getUTCFullYear() !== Number(year) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day)
  ) {
    throw new InvalidOccurredOnError(value);
  }

  return `${year}-${month}-${day}`;
}

/** Bos dizeler `null`'a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
