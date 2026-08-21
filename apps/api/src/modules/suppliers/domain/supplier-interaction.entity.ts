import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import {
  BlankSupplierInteractionBodyError,
  InvalidSupplierEmbeddingDimensionsError,
  InvalidSupplierOccurredOnError,
  SupplierInteractionBodyTooLongError,
} from './suppliers.error';

/**
 * Gorusme metninin SERT karakter siniri (ADR-0040 §2.2).
 *
 * ============================================================================
 * ⚠️ YENI BIR SAYI ICAT EDILMEDI — `TARGET_CHUNK_CHARS` REFERANS ALINDI
 * ============================================================================
 * `shared/chunking.ts`in TEK PARCA hedefi budur. Bu modulde chunking YOKTUR
 * (§2.2), dolayisiyla metnin TAMAMI tek bir parcanin buyuklugunde kalmak
 * ZORUNDADIR — sinir tam olarak "bir chunk kadar" demektir.
 *
 * ⚠️ BAGIMLILIK KASITLI: chunking hedefi bir gun degisirse bu sinir da onunla
 * birlikte degisir. Kopya bir sabit yazilsaydi ikisi SESSIZCE ayrisirdi ve
 * gorusme metni bir chunk'a sigmamaya baslardi — yani tam olarak §2.2'nin
 * dayandigi varsayim bozulurdu. `MAX_SERVICE_NOTE_CHARS` ile ayni desen,
 * UCUNCU kez.
 *
 * ⚠️ CRM'IN AYNI ALANINDA BOYLE BIR SINIR YOKTUR ve bu bir tutarsizlik degil,
 * §2.2'nin dogrudan sonucudur: CRM parcaliyor, biz parcalamiyoruz. Sinir
 * asilirsa **422** doner; SESSIZ KIRPMA YASAKTIR.
 */
export const MAX_INTERACTION_BODY_CHARS = TARGET_CHUNK_CHARS;

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0040 §6).
 *
 * ============================================================================
 * NEDEN GEREKLI — projede ALTINCI kez ayni karar
 * ============================================================================
 * Bir gorusmenin KIMLIGI (hangi tedarikci, ne zaman) KOLONLARDADIR, METINDE
 * DEGIL. Satin almaci "fiyat listesi guncellendi, M8 vidada %6 zam" yazar;
 * "Yildiz Civata" kelimesi hic gecmez ve "Yildiz Civata ile ne konusmustuk"
 * sorusu HICBIR SATIRLA ESLESMEZ.
 *
 * Uc parca: SABIT etiket + gorusme TARIHI + TEDARIKCI ADI.
 *
 * ⚠️ KISININ ADI BASLIGA GIRMEZ (ADR-0033'un kurali: basliga YALNIZCA BIR ad
 * girer). Iki gerekce: (a) ikinci bir bayatlama yuzeyi acardi, (b) `contactId`
 * `ON DELETE SET NULL` tasiyan bir alandir — silinen bir kisinin adi vektorde
 * yasamaya devam ederdi.
 *
 * ============================================================================
 * ⚠️ BEDELI: BAYATLAMA PENCERESI VAR — ADR-0039'DAN AYRILDIGI YER
 * ============================================================================
 * Tedarikci adi gomulen metne KOPYALANIR. Ad `suppliers.suppliers`ta yasar,
 * vektor `suppliers.interactions`ta — yani AYRI SATIRLARDA. Bir tedarikci
 * yeniden adlandirildiginda TUM gorusmelerinin vektoru BAYATLAR.
 *
 * Stok'ta boyle degildi: orada ad kalemin KENDI satirindaydi ve yeniden
 * adlandirma embedding'i AYNI ISLEMDE yeniliyordu ("bayatlama penceresi YOK").
 * Burada CRM / Projeler / Randevu ile ayni siniftayiz ve telafi ayni:
 * `POST /suppliers/reindex` ILK GUNDEN vardir.
 *
 * ⚠️ Telafi mekanizmasi olmasaydi ad basliga KONAMAZDI.
 */
export function withSupplierHeader(input: {
  /** `YYYY-MM-DD`. */
  occurredOn: string;
  /** `null` = ad cozulemedi (silinmis tedarikci); baslik onsuz kurulur. */
  supplierName: string | null;
  body: string;
}): string {
  const who = input.supplierName === null ? '' : ` · ${input.supplierName}`;
  return `[Tedarikci · ${input.occurredOn}${who}] ${input.body}`;
}

/**
 * Embedding boyutunu DOGRULAR.
 *
 * ⚠️ Bu modulde bir `Chunk` ENTITY'si YOK (§2.2), yani boyut kontrolunun dogal
 * evi de yok. Yine de `domain`de duruyor: kural bir IS KURALIDIR (`vector(1536)`
 * kolonuyla baglidir) ve adapter'a guvenmek yerine SINIRDA kontrol etmek,
 * yanlis yapilandirilmis bir modeli VERI YAZILMADAN yakalar.
 */
export function assertEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new InvalidSupplierEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, embedding.length);
  }
}

/**
 * `YYYY-MM-DD` dizesinin GERCEK bir takvim gunu olup olmadigini dogrular.
 *
 * ⚠️ Zod yalnizca KALIBI dogrular; `2026-02-31` o kalibi GECER. Kontrol
 * edilmeseydi deger veritabanina kadar gider ve kullanici 422 yerine 500
 * alirdi.
 *
 * `Date.parse` TEK BASINA YETMEZ: `new Date('2026-02-31')` PATLAMAZ, 3 Mart'a
 * TASAR. Bu yuzden geri cevrilen ISO gunu girdiyle KARSILASTIRILIR — tasma
 * olduysa iki dize ayrisir.
 */
function assertCalendarDay(value: string): void {
  const parsed = new Date(`${value}T00:00:00Z`);

  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidSupplierOccurredOnError(value);
  }
}

/**
 * Tedarikci gorusme kaydi (ADR-0040 §1, §2.2).
 *
 * ============================================================================
 * ⚠️ EKLEME-YALNIZ: `update()` METODU YOKTUR
 * ============================================================================
 * `Interaction` (CRM) ile ayni karar: bir gunluk kaydi duzeltilmez; yanlissa
 * yenisi yazilir. Izin adi bu yuzden `supplier_interaction:create`tir,
 * `write` DEGIL (ADR-0031 §6'nin adlandirmasi) — var olmayan bir fiili deklare
 * etmek yanlis olurdu.
 *
 * ⚠️ BU, ADR-0039'UN DEGISTIRILEMEZ DEFTERI DEGILDIR ve iki durum
 * KARISTIRILMAMALIDIR:
 *
 *   `inventory.movements` -> degistirilemez cunku BUGUNKU MIKTAR ondan
 *                            TURETILIR; gecmisi degistirmek bugunu SESSIZCE
 *                            yeniden yazardi. Koruma UC KATMANLI (izin yok +
 *                            FK RESTRICT + metot yok).
 *   `suppliers.interactions` -> yalnizca GUNCELLENMIYOR; turetilen hicbir sayi
 *                            yok. `update` metodunun ve `write` izninin
 *                            olmamasi YETER.
 *
 * ============================================================================
 * ⚠️ BU ENTITY EMBEDDING TASIMAZ — ama vektor AYNI SATIRDA yasar
 * ============================================================================
 * `Note` / `Appointment` ile ayni disiplin: gorusme kullanicinin yazdigi
 * metindir. Vektor `setEmbedding` ile ayri bir deyimde yazilir cunku uretimi
 * bir AG CAGRISI gerektirir ve o cagri transaction'in DISINDA kalir.
 *
 * Her okumada 1536 `float` (~6 KB) tasimanin bir bedeli var ve hicbir okuma
 * yolu ona ihtiyac duymuyor.
 */
export interface SupplierInteractionState {
  readonly id: string;
  readonly tenantId: string;
  readonly supplierId: string;
  /** `null` = kisiye bagli degil YA DA kisi silindi (`ON DELETE SET NULL`). */
  readonly contactId: string | null;
  readonly authorUserId: string;
  /** `YYYY-MM-DD` — gorusmenin GERCEKLESTIGI gun. */
  readonly occurredOn: string;
  readonly body: string;
  readonly createdAt: Date;
}

export class SupplierInteraction {
  private constructor(private readonly state: SupplierInteractionState) {}

  static create(input: {
    id: string;
    tenantId: string;
    supplierId: string;
    contactId: string | null;
    authorUserId: string;
    occurredOn: string;
    body: string;
    now: Date;
  }): SupplierInteraction {
    assertCalendarDay(input.occurredOn);

    const body = input.body.trim();
    if (body === '') {
      throw new BlankSupplierInteractionBodyError();
    }

    // ⚠️ SINIR BURADA ZORLANIR — adapter'da DEGIL. Adapter kirpar; domain
    // REDDEDER (§2.2). Kontrol `trim`DEN SONRA: bosluklarla sisirilmis bir
    // metin, kirpildiktan sonraki GERCEK uzunluguyla olculur.
    if (body.length > MAX_INTERACTION_BODY_CHARS) {
      throw new SupplierInteractionBodyTooLongError(body.length, MAX_INTERACTION_BODY_CHARS);
    }

    return new SupplierInteraction({
      id: input.id,
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      // ⚠️ BURADA DOGRULANMAZ: kisinin AYNI TEDARIKCIYE ait olup olmadigi bir
      // veritabani sorgusu gerektirir ve `domain` katmani framework'suzdur.
      // Kontrol use case'tedir (`#assertContactBelongsToSupplier`).
      contactId: input.contactId,
      authorUserId: input.authorUserId,
      occurredOn: input.occurredOn,
      body,
      createdAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ. */
  static fromPersistence(state: SupplierInteractionState): SupplierInteraction {
    return new SupplierInteraction(state);
  }

  toState(): SupplierInteractionState {
    return this.state;
  }
}
