import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import {
  FeedbackChannelTooLongError,
  FeedbackCommentTooLongError,
  InvalidFeedbackEmbeddingDimensionsError,
  InvalidFeedbackRatingError,
  InvalidFeedbackReceivedAtError,
} from './feedback.error';

/** Olcegin alt ve ust ucu — SABIT (ADR-0045 §1.3). */
export const MIN_RATING = 1;
export const MAX_RATING = 5;

/**
 * Yorumun SERT karakter siniri (ADR-0045 §1.2).
 *
 * ============================================================================
 * ⚠️ YENI BIR SAYI ICAT EDILMEDI — `TARGET_CHUNK_CHARS` REFERANS ALINDI
 * ============================================================================
 * `shared/chunking.ts`in TEK PARCA hedefi budur. Bu modulde chunking YOKTUR
 * (§1.2), dolayisiyla metnin TAMAMI tek bir parcanin buyuklugunde kalmak
 * ZORUNDADIR — sinir tam olarak "bir chunk kadar" demektir.
 *
 * ⚠️ BAGIMLILIK KASITLI: chunking hedefi bir gun degisirse bu sinir da onunla
 * birlikte degisir. Kopya bir sabit yazilsaydi ikisi SESSIZCE ayrisirdi ve
 * yorum bir chunk'a sigmamaya baslardi — yani tam olarak §1.2'nin dayandigi
 * varsayim bozulurdu. `MAX_SERVICE_NOTE_CHARS` / `MAX_INTERACTION_BODY_CHARS`
 * ile ayni desen, DORDUNCU kez.
 */
export const MAX_FEEDBACK_COMMENT_CHARS = TARGET_CHUNK_CHARS;

/**
 * Kanal etiketinin ust siniri (ADR-0045 §1.5).
 *
 * ⚠️ Yorumdan COK DAHA DAR ve bu bilincli: kanal bir ETIKETTIR ("Google",
 * "telefon"), bir cumle degil. Genis birakmak alani ikinci bir serbest not
 * alanina cevirirdi — oysa modulun anlatisal yuzeyi YORUMDUR.
 */
export const MAX_FEEDBACK_CHANNEL_CHARS = 80;

/**
 * Gomulecek metne eklenen BAGLAM BASLIGI (ADR-0045 §4).
 *
 * ============================================================================
 * NEDEN GEREKLI — projede YEDINCI kez ayni karar
 * ============================================================================
 * Bir geri bildirimin KIMLIGI (ne zaman, kac puan, hangi kanaldan)
 * KOLONLARDADIR, METINDE DEGIL. Musteri "siparisim iki hafta gecikti" yazar;
 * "2 puan" ya da "memnuniyetsiz" kelimeleri HIC GECMEZ ve _"memnun olmayan
 * musteriler"_ sorusu HICBIR SATIRLA ESLESMEZ.
 *
 * ⚠️ PUAN BASLIGA KONUYOR VE BU KASITLIDIR: puan bir SAYIDIR, ama vektorun
 * icinde bir ISARETTIR. `2/5` ibaresi, metninde tek bir olumsuz kelime
 * gecmeyen bir yorumu da "memnuniyetsizlik" sorgusuna yaklastirir.
 *
 * ============================================================================
 * ⚠️ KISI ADI BASLIGA GIRMEZ — ADR-0035'TEN BILINCLI SAPMA (Belge'nin karari)
 * ============================================================================
 * Iki gerekce:
 *
 *   1. BAYATLAMA: ad `crm.contacts`ta yasar; CRM'de bir yeniden adlandirma
 *      BUTUN vektorleri bayatlatirdi (ADR-0040'in `staleAfterRename` bedeli).
 *   2. ⚠️ COZULEMEZ: adi okumak IZIN KAPILI bir dizin ister ve
 *      `ContributeInput` ROL TASIMAZ — `AppointmentNotesContributor` icin
 *      kaydedilmis olan ayni sinir. Tedarikci'de ad AYNI SEMADAYDI, burada
 *      DEGIL.
 *
 * ============================================================================
 * ⚠️ SONUC — PROJEDE ILK: BAYATLAMA PENCERESI YOK
 * ============================================================================
 * Basligin UC bileseninin UCU de DEGISTIRILEMEZ (§2): tarih, puan ve kanal.
 * Yani bu modulde bir vektor ASLA bayatlamaz.
 *
 * ⚠️ Pratik sonucu: `staleAfterRename` gibi bir bayrak, `reindex { supplierId }`
 * gibi hedefli bir onarim ucu GEREKMEZ. `POST /feedback/reindex`in TEK isi
 * BASARISIZ embedding'i onarmaktir — Tedarikci'de IKI isi vardi.
 */
export function withFeedbackHeader(input: {
  receivedAt: Date;
  rating: number;
  /** `null` = kanal girilmedi; baslik onsuz kurulur. */
  channel: string | null;
  comment: string;
}): string {
  const day = input.receivedAt.toISOString().slice(0, 10);
  const where = input.channel === null ? '' : ` · ${input.channel}`;

  return `[Geri bildirim · ${day} · ${String(input.rating)}/${String(MAX_RATING)}${where}] ${input.comment}`;
}

/**
 * Embedding boyutunu DOGRULAR.
 *
 * ⚠️ Bu modulde bir `Chunk` ENTITY'si YOK (§1.2), yani boyut kontrolunun dogal
 * evi de yok. Yine de `domain`de duruyor: kural bir IS KURALIDIR (`vector(1536)`
 * kolonuyla baglidir) ve adapter'a guvenmek yerine SINIRDA kontrol etmek,
 * yanlis yapilandirilmis bir modeli VERI YAZILMADAN yakalar.
 */
export function assertEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new InvalidFeedbackEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, embedding.length);
  }
}

export interface FeedbackResponseState {
  readonly id: string;
  readonly tenantId: string;
  readonly rating: number;
  /** `null` = yorum yazilmadi — ⚠️ YAYGIN DURUM (§1.4). */
  readonly comment: string | null;
  /** `null` = kanal girilmedi. */
  readonly channel: string | null;
  /** `null` = anonim geri bildirim — ⚠️ YAYGIN DURUM (§6.2). */
  readonly crmContactId: string | null;
  readonly receivedAt: Date;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

/**
 * Geri bildirim kaydi (ADR-0045 §1, §2).
 *
 * ============================================================================
 * ⚠️ `update()` METODU YOKTUR — DEGISTIRILEMEZLIGIN IKINCI KATMANI
 * ============================================================================
 * Koruma UC katmanlidir ve ucu de ayni seyi soyler:
 *
 *   1. `feedback:write` DIYE BIR IZIN YOK (katalogda `create` + `delete`)
 *   2. ⚠️ BURASI: entity'de `update`, repository'de `update` yok
 *   3. Veritabani: `UPDATE` yalnizca `embedding` kolonunda (migration `0037`)
 *
 * Gerekce, projede ILK KEZ VERI SAHIPLIGI uzerinden kuruluyor: bugune kadar
 * sakladigimiz her sey KULLANICININ KENDI IS VERISIYDI (yazdigi teklif, girdigi
 * hareket, tuttugu not). Bir geri bildirim BASKA BIRININ SOZUDUR ve calisan onu
 * yalnizca AKTARIR.
 *
 * Bir puani "duzeltmek" iki seyden biridir ve ikisi de kabul edilemez:
 *   - musterinin soyledigini DEGISTIRMEK -> hafizaya bir YALAN yazmak,
 *   - yanlis girisi ORTMEK -> ⚠️ ortulen sey bir TURETILMIS RAKAMI (ortalama,
 *     dusuk puan sayisi) SESSIZCE yeniden yazar (ADR-0039'un olcutu: "bugunku
 *     gercek gecmis kayitlardan turetiliyor mu?" -> EVET).
 *
 * ============================================================================
 * ⚠️ AMA SILINEBILIR — VE BU, ADR-0039'DAN AYRILDIGIMIZ YER (§2.2)
 * ============================================================================
 * `inventory.movements` silinemez de. Uc fark var, ucuncusu belirleyici:
 *
 *   1. Stok miktari RAFLA ESLESMESI GEREKEN bir sayidir; memnuniyet ortalamasi
 *      bir GOSTERGEDIR.
 *   2. Yanlis girilen kayit bir OLGU DEGILDIR — hicbir musterinin soylemedigi
 *      bir sey. Birakmak hafizayi ZEHIRLER.
 *   3. ⚠️ VE ASIL GEREKCE — KVKK: yorum KISISEL VERI ICEREBILIR ve veri
 *      sahibinin SILME TALEBI HAKKI vardir (m.7 / m.11). Silme yolu olmayan bir
 *      tablo o talebi KARSILAYAMAZ.
 *
 * ============================================================================
 * ⚠️ BU ENTITY EMBEDDING TASIMAZ — ama vektor AYNI SATIRDA yasar
 * ============================================================================
 * `Note` / `Appointment` / `SupplierInteraction` ile ayni disiplin. Vektor
 * `setResponseEmbedding` ile ayri bir deyimde yazilir cunku uretimi bir AG
 * CAGRISI gerektirir ve o cagri transaction'in DISINDA kalir.
 */
export class FeedbackResponse {
  private constructor(private readonly state: FeedbackResponseState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    rating: number;
    comment: string | null;
    channel: string | null;
    crmContactId: string | null;
    receivedAt: Date;
    now: Date;
  }): FeedbackResponse {
    assertRating(input.rating);

    if (Number.isNaN(input.receivedAt.getTime())) {
      throw new InvalidFeedbackReceivedAtError(String(input.receivedAt));
    }

    return new FeedbackResponse({
      id: input.id,
      tenantId: input.tenantId,
      rating: input.rating,
      comment: normalizeComment(input.comment),
      channel: normalizeChannel(input.channel),
      // ⚠️ BURADA DOGRULANMAZ: kisinin GERCEKTEN var olup olmadigi baska bir
      // SEMADA bir sorgu gerektirir ve `domain` katmani framework'suzdur.
      // Kontrol use case'tedir (`#assertContactExists`) ve `contact:read`
      // iznine baglidir (§6.1).
      crmContactId: input.crmContactId,
      receivedAt: input.receivedAt,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; ALAN DOGRULAMASI YAPMAZ. */
  static fromPersistence(state: FeedbackResponseState): FeedbackResponse {
    return new FeedbackResponse(state);
  }

  toState(): FeedbackResponseState {
    return this.state;
  }

  /**
   * Gomulecek metni URETIR — yoksa `null`.
   *
   * ⚠️ `null` DONMESI BIR HATA DEGIL, §1.4'un DOGRUDAN SONUCUDUR: yorumsuz bir
   * kaydin embed edilecek metni YOKTUR. Cagiran bunu gorup embedding adimini
   * TAMAMEN ATLAR — yani yorumsuz bir kayit ne saglayiciya gider ne de oran
   * siniri payi oder.
   *
   * ⚠️ Baslik BURADA kurulur ve katkici da AYNI fonksiyonu cagirir
   * (`withFeedbackHeader`); iki yerde ayri bicimlendirilseydi model ayni kaydi
   * IKI FARKLI SEKILDE gorurdu.
   */
  embeddableContent(): string | null {
    if (this.state.comment === null) {
      return null;
    }

    return withFeedbackHeader({
      receivedAt: this.state.receivedAt,
      rating: this.state.rating,
      channel: this.state.channel,
      comment: this.state.comment,
    });
  }
}

/**
 * Puan 1..5 TAM SAYI olmali.
 *
 * ⚠️ `Number.isInteger` KONTROLU GEREKLI: `4.5` Zod'un `min/max`ini gecerdi ve
 * `smallint` kolonuna yazilirken PostgreSQL onu 4'e YUVARLAR — yani kullanici
 * 422 yerine SESSIZCE FARKLI BIR PUAN kaydederdi.
 */
function assertRating(rating: number): void {
  if (!Number.isInteger(rating) || rating < MIN_RATING || rating > MAX_RATING) {
    throw new InvalidFeedbackRatingError(rating);
  }
}

/**
 * ⚠️ "Girilmedi" ile "bos girildi" AYNI seydir; ikisi de `null` olur —
 * migration'in `comment IS NULL OR btrim(comment) <> ''` kisitiyla ayni kural.
 *
 * ⚠️ Uzunluk `trim`DEN SONRA olculur: bosluklarla sisirilmis bir metin,
 * kirpildiktan sonraki GERCEK uzunluguyla degerlendirilir.
 */
function normalizeComment(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const comment = value.trim();
  if (comment === '') {
    return null;
  }

  // ⚠️ SINIR BURADA ZORLANIR — adapter'da DEGIL. Adapter kirpar; domain
  // REDDEDER (§1.4). Kirpsaydi kullanici MUSTERISININ SOZUNUN yarisinin
  // arandigini HIC ogrenemezdi.
  if (comment.length > MAX_FEEDBACK_COMMENT_CHARS) {
    throw new FeedbackCommentTooLongError(comment.length, MAX_FEEDBACK_COMMENT_CHARS);
  }

  return comment;
}

function normalizeChannel(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const channel = value.trim();
  if (channel === '') {
    return null;
  }

  if (channel.length > MAX_FEEDBACK_CHANNEL_CHARS) {
    throw new FeedbackChannelTooLongError(channel.length, MAX_FEEDBACK_CHANNEL_CHARS);
  }

  return channel;
}
