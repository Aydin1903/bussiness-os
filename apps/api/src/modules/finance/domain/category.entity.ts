import {
  BlankCategoryNameError,
  InvalidDirectionError,
  InvalidFinanceTimestampError,
} from './finance.error';

/**
 * Gelir/gider yonu (ADR-0034 §2).
 *
 * ============================================================================
 * NEDEN AYRI BIR KOLON, ISARETLI TUTAR DEGIL
 * ============================================================================
 * `0024`'te `transactions.amount` DAIMA POZITIF olacak ve yonu bu sozluk
 * tasiyacak. Cazip alternatif tek kolondu (gider negatif yazilir, yon
 * turetilir) ve REDDEDILDI: isaret koymayi unutan TEK bir yazma yolu bir gideri
 * gelir gibi toplar ve hata SESSIZDIR — ekran bir sayi gosterir, sayi
 * yanlistir, hicbir sey patlamaz.
 *
 * `direction` + `amount > 0` ayni bilgiyi tasir ama CHECK ile zorlanabilir,
 * index'lenebilir ve filtrelenebilir.
 *
 * ⚠️ Sozluk BURADA (kodda) ve migration `0023`'un `categories_direction_valid`
 * CHECK'inde IKI KEZ yazilir; ikisi senkron kalmak zorundadir. Ayrim bilincli:
 * CHECK, uygulamayi ATLAYAN yollari da baglar (`crm.opportunities.stage` ile
 * ayni karar).
 */
export const FINANCE_DIRECTIONS = ['income', 'expense'] as const;

export type FinanceDirection = (typeof FINANCE_DIRECTIONS)[number];

export function isFinanceDirection(value: string): value is FinanceDirection {
  return FINANCE_DIRECTIONS.some((direction) => direction === value);
}

/**
 * Gelir/gider kategorisi (ADR-0034 §3).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez — `Project`, `Company` ve `Note` ile ayni disiplin.
 *
 * ============================================================================
 * ⚠️ `direction` DEGISTIRILEMEZ — `update()` onu ALMAZ
 * ============================================================================
 * Sebep iki katmanlidir:
 *
 * 1. **Veritabani zaten reddeder.** `0024`'un bilesik FK'si
 *    `(category_id, direction)` ciftini baglar; kullanimdaki bir kategorinin
 *    yonunu degistirmek, ona isaret eden her islemi gecersiz kilardi ve
 *    PostgreSQL bunu KRIPTIK bir FK hatasiyla reddeder (ADR-0034 §3c'nin
 *    acikca yazdigi bedel).
 *
 * 2. **Kullanimda DEGILKEN izin vermek, YARIM CALISAN bir sozlesme olurdu.**
 *    Ayni uc bazen 200 bazen 409 donerdi ve farkin sebebi kullanicinin
 *    goremedigi bir sey olurdu (o kategoriye bagli kac islem var).
 *
 * Kacis yolu vardir ve dardir: kullanilmayan bir kategori SILINEBILIR, sonra
 * dogru yonle yeniden acilir. Kullanimdaysa zaten dogru cevap yeni bir kategori
 * acmaktir — gecmis kayitlarin siniflandirmasi geriye donuk degismemelidir.
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * `Project` / `Company` ile ayni bilinen sinir: iki kullanici ayni kategoriyi
 * ayni anda duzenlerse ikincisi birincinin degisikligini SESSIZCE ezer.
 * `updatedAt` tutuluyor ama bir VERSIYON alani ya da `If-Match` kontrolu
 * YOKTUR.
 * ============================================================================
 */
export interface CategoryFields {
  readonly name: string;
  readonly direction: FinanceDirection;
  readonly isArchived: boolean;
}

/**
 * KISMI guncelleme govdesi — `direction` BILEREK DISARIDA (bkz. sinif yorumu).
 *
 * `Partial<...>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip "alan YOK"
 * der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()` ciktisi
 * ikincisidir.
 */
export type CategoryPatch = {
  readonly [K in keyof Omit<CategoryFields, 'direction'>]?:
    Omit<CategoryFields, 'direction'>[K] | undefined;
};

export interface CategoryState extends CategoryFields {
  readonly id: string;
  readonly tenantId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Category {
  private constructor(private readonly state: CategoryState) {}

  static create(input: {
    id: string;
    tenantId: string;
    fields: CategoryFields;
    now: Date;
  }): Category {
    const name = input.fields.name.trim();
    if (name === '') {
      throw new BlankCategoryNameError();
    }
    assertDirection(input.fields.direction);

    return new Category({
      id: input.id,
      tenantId: input.tenantId,
      ...input.fields,
      name,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; DOGRULAMA YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: CategoryState): Category {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidFinanceTimestampError();
    }
    return new Category(state);
  }

  /** KISMI guncelleme; `undefined` = "dokunma". */
  update(changes: CategoryPatch, now: Date): Category {
    const current = this.state;

    const name = (changes.name ?? current.name).trim();
    if (name === '') {
      throw new BlankCategoryNameError();
    }

    return new Category({
      ...current,
      name,
      isArchived: changes.isArchived ?? current.isArchived,
      updatedAt: now,
    });
  }

  toState(): CategoryState {
    return this.state;
  }
}

function assertDirection(direction: string): void {
  if (!isFinanceDirection(direction)) {
    throw new InvalidDirectionError(direction);
  }
}
