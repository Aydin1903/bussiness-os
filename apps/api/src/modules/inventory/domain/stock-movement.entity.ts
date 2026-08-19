import { InvalidMovementDirectionError, InvalidOccurredAtError } from './inventory.error';
import {
  absoluteQuantity,
  assertPositiveQuantity,
  isQuantityNegative,
  isQuantityZero,
  normalizeQuantity,
} from './quantity';

/**
 * Hareket YONU — ARITMETIK EKSEN (ADR-0039 §3.1).
 *
 * ============================================================================
 * ⚠️ UC DEGERLI DEGIL — "DUZELTME" BURADA YOK
 * ============================================================================
 * Ilk akla gelen sekil `('in' | 'out' | 'adjustment')`tir ve CALISMAZ:
 * `adjustment` tek basina miktarin HANGI YONE gittigini soylemez. Iki cikis
 * yolu vardi ve ikisi de kotu:
 *
 *   1. `quantity`i ISARETLI yapmak — ADR-0034 §5'in ACIKCA reddettigi sey.
 *      Isaret koymayi unutan tek bir yazma yolu cikisi giris gibi toplar ve
 *      hata SESSIZDIR. (Finans'ta gideri gelir gibi toplamakti; burada cikisi
 *      giris gibi toplamak. AYNI TUZAK, IKINCI MODULDE.)
 *   2. `direction`i `adjustment` satirlarinda NULLABLE yapmak — kolon satir
 *      bazinda FARKLI ANLAMLAR tasirdi ve `SUM(CASE WHEN direction = 'in' ...)`
 *      NULL satirlari SESSIZCE atlardi.
 *
 * Sebep ayri bir kolonda yasar: `isCorrection`.
 *
 * ⚠️ Sozluk hem BURADA hem migration `0029`'un `movements_direction_valid`
 * CHECK'inde yazilir ve ikisi senkron kalmak zorundadir. Ayrim bilincli: CHECK,
 * uygulamayi ATLAYAN yollari da baglar.
 */
export const MOVEMENT_DIRECTIONS = ['in', 'out'] as const;

export type MovementDirection = (typeof MOVEMENT_DIRECTIONS)[number];

export function isMovementDirection(value: string): value is MovementDirection {
  return MOVEMENT_DIRECTIONS.some((direction) => direction === value);
}

/** Hareket notunun ust siniri — GIRDI kurali. ⚠️ Bu not EMBED EDILMEZ (§5). */
export const MAX_MOVEMENT_NOTE_CHARS = 500;

export interface StockMovementFields {
  readonly itemId: string;
  readonly direction: MovementDirection;
  /** ⚠️ HER ZAMAN POZITIF; isaret `direction`dadir. Kanonik dize. */
  readonly quantity: string;
  /**
   * Fiziksel sayimdan dogan fark mi (ADR-0039 §3.1)?
   *
   * ⚠️ Bir susleme DEGILDIR: "gercek akis" ile "sayimda ortaya cikan fark" bir
   * isletme icin FARKLI seylerdir; ikincisinin toplami FIRE/KAYIP demektir.
   */
  readonly isCorrection: boolean;
  /** ⚠️ `createdAt` ile AYNI SEY DEGIL: hareket dun olmus, bugun girilmis olabilir. */
  readonly occurredAt: Date;
  /** Serbest aciklama ("irsaliye 4412"). ⚠️ EMBED EDILMEZ. */
  readonly note: string | null;
}

export interface StockMovementState extends StockMovementFields {
  readonly id: string;
  readonly tenantId: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

/**
 * Stok hareketi — DEGISTIRILEMEZ defter satiri (ADR-0039 §3.3).
 *
 * ============================================================================
 * ⚠️ BU SINIFTA `update` METODU YOKTUR — VE OLMAYACAKTIR
 * ============================================================================
 * Bir hareket olusturulduktan sonra guncellenmez ve silinmez. Yanlis girilen
 * bir hareketin telafisi TERS YONDE bir hareket yazmaktir (fiziksel sayim akisi
 * bunu otomatik yapar).
 *
 * ADR-0034'ten BILINCLI SAPMA — `FinanceTransaction`in `update`i vardir ve o
 * karar orada DOGRUYDU. Fark §2'den dogar:
 *
 *   Finans -> her islem KENDI BASINA bir olgudur; duzeltmek olguyu duzeltir.
 *   Stok   -> bugunku miktar GECMISIN TAMAMINDAN turetilir; gecmisi
 *             degistirmek BUGUNU SESSIZCE YENIDEN YAZAR ve "nasil bu hale
 *             geldik" sorusu cevaplanamaz olur.
 *
 * ⚠️ Koruma UC KATMANLIDIR ve tekrar degil, derinliktir:
 *   1. bu sinifta `update` YOK,
 *   2. `stock_movement:delete` IZNI YOK (ADR-0039 §8),
 *   3. `movements.item_id -> items.id ON DELETE RESTRICT` — defterin toptan
 *      silinmesini VERITABANI reddeder.
 *
 * ⚠️ `state`te `updatedAt` DE YOKTUR (kolonu da yok): guncellenmeyen bir
 * satirin guncellenme zamani olmaz.
 */
export class StockMovement {
  private constructor(private readonly state: StockMovementState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: StockMovementFields;
    now: Date;
  }): StockMovement {
    return new StockMovement({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalize(input.fields),
      createdAt: input.now,
    });
  }

  static fromPersistence(state: StockMovementState): StockMovement {
    return new StockMovement(state);
  }

  toState(): StockMovementState {
    return this.state;
  }
}

/**
 * ISARETLI bir farki YON + POZITIF MIKTARA cevirir (ADR-0039 §3.2).
 *
 * ============================================================================
 * ⚠️ FIZIKSEL SAYIMIN KALBI BU FONKSIYONDUR
 * ============================================================================
 * Kullanici SAYDIGI mutlak miktari yazar; sunucu `delta = sayilan - mevcut`
 * hesabini yapar ve sonucu buraya verir. Burasi tek bir sey yapar: isareti
 * yonе, buyuklugu miktara cevirir.
 *
 * ⚠️ `null` DONMESI ANLAMLI BIR SONUCTUR: `delta === 0` ise HICBIR HAREKET
 * YAZILMAZ. Sifir miktarli bir hareket hem `movements_quantity_positive`
 * kisitini ihlal ederdi hem de OLMAMIS bir akis hakkinda yalan olurdu.
 *
 * ⚠️ Bunun BEDELI kayitlidir (ADR-0039 § Bilinen sinirlar): "sayim yapildi ve
 * TUTTU" bilgisi hicbir yerde kalmaz. Bir sayim gunlugu v2'dir; bugun onu
 * uydurma bir hareketle temsil etmek, defteri KIRLETMEK olurdu.
 */
export function directionFromDelta(
  delta: string,
): { direction: MovementDirection; quantity: string } | null {
  if (isQuantityZero(delta)) {
    return null;
  }

  return {
    direction: isQuantityNegative(delta) ? 'out' : 'in',
    quantity: absoluteQuantity(delta),
  };
}

/** Tum alan kurallari TEK yerde. */
function normalize(fields: StockMovementFields): StockMovementFields {
  if (!isMovementDirection(fields.direction)) {
    throw new InvalidMovementDirectionError(fields.direction);
  }

  // ⚠️ `Invalid Date` TIP OLARAK `Date`TIR ve sessizce veritabanina kadar
  // giderdi; PostgreSQL onu reddeder ve kullanici 422 yerine 500 alirdi.
  if (Number.isNaN(fields.occurredAt.getTime())) {
    throw new InvalidOccurredAtError(String(fields.occurredAt));
  }

  const quantity = normalizeQuantity(fields.quantity);
  // ⚠️ POZITIFLIK BURADA ZORLANIR: isaret `direction`dadir, sayida DEGIL.
  // Negatif bir miktar, yon kolonuyla birlikte cift isaret uretirdi ve toplama
  // SESSIZCE ters calisirdi.
  assertPositiveQuantity(quantity);

  return {
    itemId: fields.itemId,
    direction: fields.direction,
    quantity,
    isCorrection: fields.isCorrection,
    occurredAt: fields.occurredAt,
    note: blankToNull(fields.note),
  };
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
