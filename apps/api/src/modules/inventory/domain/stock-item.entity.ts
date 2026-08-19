import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import {
  InvalidInventoryTimestampError,
  InvalidStockItemEmbeddingDimensionsError,
  StockItemNoteTooLongError,
} from './inventory.error';
import { normalizeQuantity } from './quantity';

/**
 * Kalem notunun SERT karakter siniri (ADR-0039 §5).
 *
 * ============================================================================
 * ⚠️ YENI BIR SAYI ICAT EDILMEDI — `TARGET_CHUNK_CHARS` REFERANS ALINDI
 * ============================================================================
 * `MAX_SERVICE_NOTE_CHARS` (Randevu) ile birebir ayni gerekce, ikinci kez: bu
 * modulde chunking YOKTUR, dolayisiyla notun TAMAMI tek bir parcanin
 * buyuklugunde kalmak ZORUNDADIR.
 *
 * ⚠️ BAGIMLILIK KASITLI: chunking hedefi bir gun degisirse bu sinir da onunla
 * birlikte degisir. Kopya bir sabit yazilsaydi ikisi SESSIZCE ayrisirdi ve
 * kalem notu bir chunk'a sigmamaya baslardi — yani tam olarak §5'in dayandigi
 * varsayim bozulurdu.
 */
export const MAX_ITEM_NOTE_CHARS = TARGET_CHUNK_CHARS;

/** Ad ve birim icin ust sinirlar — GIRDI kurallari, veri butunlugu degil. */
export const MAX_ITEM_NAME_CHARS = 200;
export const MAX_ITEM_SKU_CHARS = 64;

/**
 * ⚠️ BIRIM KISA TUTULUR — ve bu bir bicim tercihi degil.
 *
 * `unit` serbest metindir (ADR-0039 §4) ama yapisal katkinin her satirinda
 * gonderilir (`"Vida M8: 4 adet (esik 20)"`). Serbest ve UZUN bir birim, her
 * soruda token harcayan bir aciklama alanina donusurdu.
 */
export const MAX_ITEM_UNIT_CHARS = 16;

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0039 §6.2).
 *
 * ============================================================================
 * NEDEN GEREKLI
 * ============================================================================
 * Bir kalemin KIMLIGI (adi, SKU'su) KOLONLARDADIR, notta degil. Kullanici
 * "parti no 2026-04" yazar; "Vida M8" kelimesi hic gecmez ve "vida partisi
 * hangisiydi" sorusu HICBIR SATIRLA ESLESMEZ.
 *
 * ============================================================================
 * ⚠️ BAYATLAMA PENCERESI YOK — PROJEDE ILK KEZ
 * ============================================================================
 * Onceki dort baslikta denormalize edilen ad BASKA BIR SATIRDA (hatta Randevu'da
 * BASKA BIR SEMADA) yasiyordu; yeniden adlandirma vektoru BAYATLATIYOR ve
 * telafi `reindex`e kaliyordu.
 *
 * Burada ad AYNI SATIRIN kolonudur. Yani yeniden adlandirma zaten bu satirin
 * `PATCH`idir ve embedding AYNI ISLEMDE yeniden uretilir (use case bunu
 * `identityChanged` daliyla zorlar). `POST /inventory/reindex` yine ILK GUNDEN
 * vardir ama tek bir isi kalmistir: GOMULEMEMIS notlari onarmak.
 *
 * ⚠️ SKU basliga girer ve bu ADR-0033'un "yalnizca BIR ad" kuralini BOZMAZ:
 * SKU ikinci bir bayatlama YUZEYI degildir, ayni satirin ikinci kolonudur.
 */
export function withStockItemHeader(input: {
  name: string;
  sku: string | null;
  note: string;
}): string {
  const sku = input.sku === null ? '' : ` · ${input.sku}`;
  return `[Stok${sku} · ${input.name}] ${input.note}`;
}

/**
 * Embedding boyutunu DOGRULAR.
 *
 * ⚠️ Bu modulde bir `Chunk` ENTITY'si YOK (§5), yani boyut kontrolunun dogal
 * evi de yok. Yine de `domain`de duruyor: kural bir IS KURALIDIR (`vector(1536)`
 * kolonuyla baglidir) ve adapter'a guvenmek yerine SINIRDA kontrol etmek,
 * yanlis yapilandirilmis bir modeli VERI YAZILMADAN yakalar.
 */
export function assertEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new InvalidStockItemEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, embedding.length);
  }
}

/**
 * Stok kalemi — bir kalemin TANIMI (ADR-0039 §1).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez.
 *
 * ============================================================================
 * ⚠️ BU ENTITY MIKTAR TASIMAZ — VE BU, MODULUN MERKEZI KARARIDIR (§2)
 * ============================================================================
 * Mevcut miktar `inventory.movements`tan TURETILIR. Bir `quantityOnHand` alani
 * olsaydi entity onu guncel tutmak zorunda kalirdi ve her hareket yazma yolu
 * entity'yi yeniden yuklemek zorunda olurdu — ikinci bir dogruluk kaynagi.
 *
 * Miktar, okuma yollarinin dondurdugu AYRI bir degerdir (`StockItemRow.quantity`)
 * ve `domain` onu HESAPLAMAZ, yalnizca KARSILASTIRIR (`quantity.ts`).
 *
 * ============================================================================
 * ARSIVLENIR, SILINMEZ (§3.4)
 * ============================================================================
 * `archivedAt` bir DURUM MAKINESI degildir, tek yonlu bir isaret de degildir:
 * arsivden cikarmak MESRUDUR (yanlislikla arsivlenmis bir kalem). Bir enum
 * secilseydi ("active"/"archived") ayni bilgiyi tasir ama ZAMANI kaybederdik —
 * "ne zaman arsivlendi" gercek bir sorudur.
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * Altinci kez ayni bilinen sinir. ⚠️ AMA MIKTAR ICIN GECERLI DEGILDIR: miktar
 * bu satirda yasamadigi icin (§2) iki es zamanli hareket birbirini EZEMEZ.
 * Modulun en onemli sayisi, projenin en eski bilinen sinirinin DISINDADIR.
 */
export interface StockItemFields {
  readonly name: string;
  /** `null` = SKU kullanilmiyor; MESRU ve yaygin. */
  readonly sku: string | null;
  /** SERBEST METIN (§4) — enum de tenant sozlugu de degil. */
  readonly unit: string;
  /**
   * Alarm esigi.
   *
   * ⚠️ `null` ile `"0.000"` FARKLI SEYLERDIR (§6.1): `null` = izleme yok,
   * `0` = tukendiginde haber ver. Ikisi de anlamlidir ve biri digerinin
   * yerine gecmez.
   */
  readonly minQuantity: string | null;
  /**
   * Kalemin ANLAMSAL yuzeyi — TEK bir vektore gomulur (§5).
   *
   * ⚠️ `null` ile bos dize AYNI SEYDIR ve ikisi de `null`a normalize edilir.
   * Bos bir dize BOS BIR EMBEDDING CAGRISI demek olurdu.
   *
   * ⚠️ VEKTOR BU TIPTE YOK. `embedding` kolonu ayni satirda yasar ama entity
   * onu TASIMAZ: her okumada 1536 `float` (~6 KB) tasimanin bedeli var ve
   * hicbir okuma yolu ona ihtiyac duymuyor.
   */
  readonly note: string | null;
  /** `null` = aktif. Arsivden cikarmak MESRUDUR. */
  readonly archivedAt: Date | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<StockItemFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip
 * "alan YOK" der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()` ciktisi
 * ikincisidir.
 */
export type StockItemPatch = {
  readonly [K in keyof StockItemFields]?: StockItemFields[K] | undefined;
};

export interface StockItemState extends StockItemFields {
  readonly id: string;
  readonly tenantId: string;
  /** ⚠️ Yalnizca OLUSTURANI tutar; denetim izi DEGILDIR. */
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class StockItem {
  private constructor(private readonly state: StockItemState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    fields: StockItemFields;
    now: Date;
  }): StockItem {
    return new StockItem({
      id: input.id,
      tenantId: input.tenantId,
      createdByUserId: input.createdByUserId,
      ...normalize(input.fields),
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: StockItemState): StockItem {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidInventoryTimestampError();
    }
    return new StockItem(state);
  }

  /**
   * KISMI guncelleme; `undefined` = "dokunma".
   *
   * `PUT` secilseydi unutulan her alan sessizce varsayilanina duserdi — bir stok
   * kaleminde bu, esigin KAYBOLMASI demekti (alarm susardi ve kimse fark
   * etmezdi).
   */
  update(changes: StockItemPatch, now: Date): StockItem {
    const current = this.state;

    const merged: StockItemFields = {
      name: changes.name ?? current.name,
      unit: changes.unit ?? current.unit,
      // ⚠️ `??` DEGIL: uc alan da `null` = TEMIZLE anlami tasir ve ucu de
      // mesrudur (SKU'yu kaldirmak, esigi kaldirmak, notu silmek, arsivden
      // cikarmak). `??` yazilsaydi `null` gonderen bir istek SESSIZCE yok
      // sayilirdi — kullanici esigi kaldirdigini sanip kaldirmamis olurdu.
      sku: changes.sku === undefined ? current.sku : changes.sku,
      minQuantity: changes.minQuantity === undefined ? current.minQuantity : changes.minQuantity,
      note: changes.note === undefined ? current.note : changes.note,
      archivedAt: changes.archivedAt === undefined ? current.archivedAt : changes.archivedAt,
    };

    return new StockItem({ ...current, ...normalize(merged), updatedAt: now });
  }

  /**
   * Baglam basligina giren alanlardan biri degisti mi (§6.2).
   *
   * ⚠️ BU METOT, "bayatlama penceresi yok" iddiasinin TASIYICISIDIR. Ad ya da
   * SKU degistiginde gomulu metin ESKI kimligi tasir; use case bunu gorup
   * embedding'i AYNI ISLEMDE yeniden uretir. Metot olmasaydi kontrol use
   * case'te elle yazilirdi ve baslik formulu degistiginde (ornegin birim de
   * eklenirse) SESSIZCE ayrisirdi.
   */
  identityDiffers(other: StockItem): boolean {
    return this.state.name !== other.state.name || this.state.sku !== other.state.sku;
  }

  isArchived(): boolean {
    return this.state.archivedAt !== null;
  }

  toState(): StockItemState {
    return this.state;
  }
}

/** Tum alan kurallari TEK yerde — `create` ve `update` ayni yoldan gecer. */
function normalize(fields: StockItemFields): StockItemFields {
  const name = fields.name.trim();
  const unit = fields.unit.trim();
  const sku = blankToNull(fields.sku);
  const note = blankToNull(fields.note);

  // ⚠️ SINIR BURADA ZORLANIR — adapter'da DEGIL. Adapter kirpar; domain
  // REDDEDER (§5). Kontrol `blankToNull`DAN SONRA: bosluklarla sisirilmis bir
  // metin, kirpildiktan sonraki GERCEK uzunluguyla olculur.
  if (note !== null && note.length > MAX_ITEM_NOTE_CHARS) {
    throw new StockItemNoteTooLongError(note.length, MAX_ITEM_NOTE_CHARS);
  }

  return {
    name,
    sku,
    unit,
    // ⚠️ Esik KANONIKLESTIRILIR: `"5"` ve `"5.000"` ayni degerdir ama farkli
    // dizelerdir, ve karsilastirmalar (`isQuantityAtMost`) her ikisini de dogru
    // ele alsa bile API cevabinin veritabanindan okunanla AYNI gorunmesi
    // gerekir (`normalizeAmount`in ayni gerekcesi).
    minQuantity: fields.minQuantity === null ? null : normalizeQuantity(fields.minQuantity),
    note,
    archivedAt: fields.archivedAt,
  };
}

/** Bos dizeler `null`a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
