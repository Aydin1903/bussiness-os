import {
  computeLineTotals,
  normalizeQuantity,
  normalizeTaxRate,
  normalizeUnitPrice,
  type LineTotals,
} from './document-money';
import { BlankLineDescriptionError } from './invoicing.error';

/** Satir aciklamasinin SERT karakter siniri — bir GIRDI kurali. */
export const MAX_LINE_DESCRIPTION_CHARS = 500;

/** Birim adinin ust siniri (`inventory.items.unit` ile ayni sinif). */
export const MAX_LINE_UNIT_CHARS = 40;

/**
 * Belge satiri (ADR-0041 §1).
 *
 * ============================================================================
 * ⚠️ SATIR KALEMI BIR IZIN KAYNAGI DEGILDIR (§9.1)
 * ============================================================================
 * ADR-0039 §8.2 `item` -> `stock_item` nitelemesini TAM OLARAK BU MODULUN
 * getirecegi _line item_ kavrami icin yapmisti. Kavram geldi; CAKISMA GELMEDI —
 * cunku satir kalemi bir KAYNAK DEGILDIR:
 *
 *   - bagimsiz bir yasami yoktur (belgesiz satir anlamsizdir, `CASCADE`),
 *   - bagimsiz bir ucu yoktur (kalemler belgenin BUTUNU olarak yazilir),
 *   - bagimsiz bir yetkisi yoktur ("belgeyi gorebilen ama satirlarini
 *     goremeyen" bir rol TANIMSIZDIR).
 *
 * ⚠️ ADR-0039'un nitelemesi yine de DOGRUYDU ve geri alinmaz: bir tedbirin
 * tetiklenmemesi, tedbirin gereksiz oldugunu KANITLAMAZ.
 *
 * ============================================================================
 * ⚠️ STOK KALEMINE BAGLI DEGIL (§7.3)
 * ============================================================================
 * `stockItemId` diye bir alan ARANMASIN. Aday degerlendirildi ve reddedildi:
 * baglantinin dogal beklentisi STOK DUSULMESIDIR ve o, bu modulun envanterin
 * dogrulugundan SORUMLU olmasi demektir — tek bir kolon degil, BIR MODULUN
 * ANLAMININ GENISLEMESI.
 *
 * ============================================================================
 * ⚠️ TOPLAM SAKLANMAZ, TURETILIR (§1.3)
 * ============================================================================
 * `lineTotal` diye bir alan da YOKTUR. `totals()` her cagrildiginda
 * `document-money.ts`ten hesaplanir.
 */
export interface SalesDocumentLineFields {
  readonly description: string;
  /** Kanonik ondalik dize — POZITIF (`document-money.ts`). */
  readonly quantity: string;
  readonly unit: string | null;
  /** ⚠️ NEGATIF OLABILIR: iskonto satiri (§1.7). */
  readonly unitPrice: string;
  /** Yuzde. ⚠️ Bir SAYIDIR, bir kural degil (§1.8). */
  readonly taxRate: string;
}

export interface SalesDocumentLineState extends SalesDocumentLineFields {
  readonly id: string;
  readonly tenantId: string;
  readonly documentId: string;
  /** Kullanicinin verdigi SIRA — `createdAt`e birakilamaz. */
  readonly position: number;
  readonly createdAt: Date;
}

export class SalesDocumentLine {
  private constructor(private readonly state: SalesDocumentLineState) {}

  static create(input: {
    id: string;
    tenantId: string;
    documentId: string;
    position: number;
    fields: SalesDocumentLineFields;
    now: Date;
  }): SalesDocumentLine {
    return new SalesDocumentLine({
      id: input.id,
      tenantId: input.tenantId,
      documentId: input.documentId,
      position: input.position,
      ...normalize(input.fields),
      createdAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: SalesDocumentLineState): SalesDocumentLine {
    return new SalesDocumentLine(state);
  }

  /**
   * ⚠️ `update` METODU YOKTUR — ve bu bir eksik degil.
   *
   * Satirlar TEK TEK guncellenmez: belgenin kalemleri her `PATCH`te BUTUN
   * olarak degistirilir (`replaceLines`). Sebep §2'dir — degistirilebilirligin
   * tek kapisi BELGENIN DURUMUDUR ve o kapiyi belge tutar. Satir bazinda bir
   * `update`, kapiyi ATLAYAN ikinci bir yol acardi.
   */

  get position(): number {
    return this.state.position;
  }

  totals(): LineTotals {
    return computeLineTotals(this.state);
  }

  toState(): SalesDocumentLineState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde. */
function normalize(fields: SalesDocumentLineFields): SalesDocumentLineFields {
  const description = fields.description.trim();
  if (description === '') {
    throw new BlankLineDescriptionError();
  }

  const unit = fields.unit?.trim() ?? '';

  return {
    description: description.slice(0, MAX_LINE_DESCRIPTION_CHARS),
    quantity: normalizeQuantity(fields.quantity),
    // "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `null`dur.
    unit: unit === '' ? null : unit.slice(0, MAX_LINE_UNIT_CHARS),
    unitPrice: normalizeUnitPrice(fields.unitPrice),
    taxRate: normalizeTaxRate(fields.taxRate),
  };
}
