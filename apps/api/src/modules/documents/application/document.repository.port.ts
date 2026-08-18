import { type Document, type DocumentChunk, type DocumentState } from '../domain/document.entity';

export const DOCUMENT_REPOSITORY = Symbol('DOCUMENT_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Kullaniciya donen satir — `DocumentState` + COZULMUS adlar (ADR-0037 §4).
 *
 * ============================================================================
 * NEDEN AYRI BIR TIP: repository BU IKI ALANI URETEMEZ
 * ============================================================================
 * Adlar `crm.contacts` ve `projects.projects`tadir; `documents` semasindan
 * okunamaz (Mutlak Kural 5). Repository kendi semasinin bildigi kadarini
 * dondurur (`Document`); adlari use case, `ContactDirectory` ve
 * `ProjectDirectory` uzerinden EKLER.
 *
 * ⚠️ `AppointmentRow`dan tek farki IKI ad tasimasidir — ve bu, ADR-0037'nin
 * §8.1'de baglam basligina HICBIR ad koymama gerekcesinin ta kendisidir: iki
 * bagimsiz baglanti var, birini secmek keyfi olurdu.
 *
 * ⚠️ Her `null` UC anlama gelir ve UCU AYIRT EDILMEZ: bagli degil, silinmis
 * (sarkan isaretci), ya da cagiran ilgili izni tasimiyor. Arayuz ucunde de
 * HICBIR SEY yazmaz — "silinmis" bile yazmaz, cunku o kelime silinmis bir
 * kaydin BIR ZAMANLAR VAR OLDUGUNU sizdirirdi.
 */
export interface DocumentRow extends DocumentState {
  readonly contactName: string | null;
  readonly projectName: string | null;
  /**
   * Bu belgeden uretilmis parca sayisi (ADR-0037 §6.3).
   *
   * ⚠️ `0` MESRU BIR DEGERDIR ve iki anlama gelir: (a) metni cikarilamadi
   * (taranmis PDF), (b) embedding cokmesi yuzunden henuz uretilmedi. Ikisi de
   * `POST /documents/reindex` ile ayni yoldan ele alinir — ve arayuz bunu
   * GORUNUR KILMAK ZORUNDADIR, aksi halde §6.3'un karari sessiz basarisizliga
   * doner.
   */
  readonly chunkCount: number;
}

/**
 * Parcasiz belge — `reindex`in is listesi (ADR-0037 §6.3, §10).
 *
 * ⚠️ IS LISTESI TURETILMISTIR (`LEFT JOIN ... WHERE chunk IS NULL`); ayri bir
 * "onarilacaklar" tablosu ve deneme sayaci YOKTUR — projede altinci kez ayni
 * karar.
 *
 * ⚠️ BU LISTE "TARANMIS PDF"LERI DE ICERIR ve bu KACINILMAZDIR: veritabani
 * "parcasi yok" ile "parcasi olamaz" arasindaki farki BILEMEZ. Sonucu durustce:
 * her `reindex` cagrisi taranmis belgeleri yeniden dener, metin yine bos doner
 * ve bunlar `repaired` sayilir (bos metin, sifir parca — hata degil). Bir
 * "denendi ve metin yok" isareti tutmak, ikinci bir dogruluk kaynagi ve senkron
 * kalmasi gereken ikinci bir yazma yolu demekti.
 */
export interface UnindexedDocument {
  readonly documentId: string;
  readonly storageKey: string;
  readonly originalFilename: string;
  readonly label: string | null;
  readonly mimeType: string;
}

/**
 * `documents.documents` + `documents.document_chunks` kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0027`/`0028`) ve cagiran
 * zaten tenant transaction'i icindedir. Elle bir `WHERE tenant_id` eklemek (a)
 * korumanin RLS'te oldugu gercegini bulaniklastirir, (b) filtre bir gun
 * unutulursa RLS'in hala koruyor oldugu FARK EDILMEZ ve yanlis bir guven
 * duygusu olusur.
 *
 * ⚠️ BU GUVENCE NESNE DEPOSUNA UZANMAZ. `storageKey` bu tablodan okunur ve
 * `StoragePort`a oyle verilir; oradaki izolasyon RLS'e degil ANAHTAR DUZENINE
 * dayanir (ADR-0037 §5.2).
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur.
 */
export interface DocumentRepository {
  /** Ekler ya da gunceller (tek deyimlik UPSERT). */
  save(document: Document): Promise<void>;

  findById(id: string): Promise<Document | null>;

  /**
   * Sayfali liste — etiket / kisi / proje filtresi (ADR-0037 §10).
   *
   * ⚠️ ETIKET FILTRESI BUYUK-KUCUK HARF DUYARSIZDIR (§2c): serbest metin
   * oldugu icin "Sozlesme" ve "sozlesme" ayni sey sayilir. ⚠️ Sorgu
   * `lower(label)` uzerinden calisir ve migration `0027`'deki index de oyle
   * tanimlidir — ayrisirlarsa hata SESSIZDIR: sonuc dogru doner, sorgu TAM
   * TARAMA yapar.
   *
   * ⚠️ "Filtre yok" `null` ile ifade edilir, `undefined` ile DEGIL
   * (`exactOptionalPropertyTypes` altinda ikisi ayri tiptir ve Zod'un
   * `.optional()` ciktisi ikincisidir).
   */
  list(input: {
    limit: number;
    offset: number;
    label: string | null;
    crmContactId: string | null;
    projectId: string | null;
  }): Promise<ListPage<DocumentWithChunkCount>>;

  /** Tek kayit + parca sayisi — detay ucu icin. */
  findRowById(id: string): Promise<DocumentWithChunkCount | null>;

  /**
   * Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   *
   * ⚠️ Parcalar `ON DELETE CASCADE` ile gider (migration `0028`). R2'deki nesne
   * GITMEZ — onu use case siler, VE BU SIRA ONEMLIDIR (ADR-0037 §5.3).
   */
  deleteById(id: string): Promise<number>;

  /**
   * Bir belgenin TUM parcalarini siler.
   *
   * Dosya degisiminde ve yeniden indekslemede kullanilir: kismi guncelleme
   * YOKTUR (§7), parcalar tumuyle silinip yeniden uretilir.
   */
  deleteChunks(documentId: string): Promise<void>;

  saveChunks(chunks: readonly DocumentChunk[]): Promise<void>;

  /** Parcasiz belgeler — en fazla `limit` tane. */
  findUnindexed(limit: number): Promise<UnindexedDocument[]>;

  /**
   * ANLAMSAL arama (ADR-0037 §8 — `documents` katkicisi).
   *
   * TENANT FILTRESI YOK ve bu BILINCLI: daraltmayi RLS yapar.
   *
   * ⚠️ `embedding` kolonu `NOT NULL` oldugu icin `IS NOT NULL` suzgeci
   * GEREKMEZ — `appointments`tan fark (orada vektorsuz satir mesruydu). Parca
   * yalnizca gomulmek icin uretilir.
   */
  findSimilarChunks(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarDocumentChunk[]>;
}

/** Repository'nin dondurdugu ham satir — adlar HENUZ cozulmemis. */
export interface DocumentWithChunkCount {
  readonly document: Document;
  readonly chunkCount: number;
}

/**
 * Anlamsal arama sonucu.
 *
 * ⚠️ `content` BASLIK DAHIL saklandigi gibi doner — chunk tablosu tasiyan dort
 * modulle AYNI (`appointments`tan fark: orada baslik okuma aninda yeniden
 * kuruluyordu cunku saklanacak bir kolon yoktu).
 *
 * Bunun bedeli acikca: dosya adi degisirse (§7 — dosya degisimi) saklanan
 * baslik BAYATLAR. Telafi `POST /documents/reindex`tir ve ILK GUNDEN vardir.
 */
export interface SimilarDocumentChunk {
  readonly documentId: string;
  readonly content: string;
}
