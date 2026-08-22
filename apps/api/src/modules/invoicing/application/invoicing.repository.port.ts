import { type SalesDocumentLine } from '../domain/sales-document-line.entity';
import {
  type SalesDocument,
  type SalesDocumentKind,
  type SalesDocumentStatus,
} from '../domain/sales-document.entity';

export const INVOICING_REPOSITORY = Symbol('INVOICING_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * `invoicing` semasinin kaliciligi — UC TABLO, TEK PORT.
 *
 * ============================================================================
 * ⚠️ GENEL BIR `list()` YOKTUR — VE BU, TEK TABLO KARARINDAN DOGAR
 * ============================================================================
 * Teklif ve fatura AYNI tabloda yasar (`kind` ile ayrilir, ADR-0041 §1.1).
 * Bu kararin tek gercek riski `kind` filtresini UNUTMAKTIR ve o risk burada
 * kapatilir:
 *
 *     HER OKUMA METODU TURUNU IMZASINDA ISTER.
 *
 * Unutulacak bir parametre yoktur, cunku parametre OPSIYONEL DEGILDIR. Bir
 * entegrasyon testi ayrica her iki listenin de KARSI TURU hic dondurmedigini
 * iddia eder.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0031`) ve cagiran zaten
 * tenant transaction'i icindedir. Elle bir `WHERE tenant_id` eklemek (a)
 * korumanin RLS'te oldugu gercegini bulaniklastirir, (b) filtre bir gun
 * unutulursa RLS'in hala koruyor oldugu FARK EDILMEZ.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur.
 */
export interface InvoicingRepository {
  // ==========================================================================
  // Belge
  // ==========================================================================

  /** Ekler ya da gunceller (tek deyimlik UPSERT). */
  saveDocument(document: SalesDocument): Promise<void>;

  /**
   * Tek belge — TURUYLE BIRLIKTE aranir.
   *
   * ⚠️ `kind` bir FILTREDIR, bir dogrulama degil: yanlis turde bir id icin
   * `null` doner ve cagiran onu `SalesDocumentNotFoundError`a cevirir. Ayirt
   * edilseydi (`409 kind mismatch`) `invoice:read` TASIMAYAN biri
   * `/quotes/<fatura-id>` ile bir faturanin VAR OLDUGUNU yoklayabilirdi.
   */
  findDocumentById(input: { id: string; kind: SalesDocumentKind }): Promise<SalesDocument | null>;

  /** Sayfali liste — en yeni once. */
  listDocuments(input: {
    kind: SalesDocumentKind;
    status: SalesDocumentStatus | null;
    limit: number;
    offset: number;
  }): Promise<ListPage<SalesDocument>>;

  /**
   * Siler.
   *
   * ⚠️ CAGIRAN once `assertEditable()` cagirir (§2): yalnizca `draft` silinir.
   * Veritabani tarafinda ayrica `converted_from_id` `ON DELETE RESTRICT`
   * tasir — bir faturaya kaynaklik eden teklif silinemez.
   *
   * @returns silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  deleteDocumentById(id: string): Promise<number>;

  // ==========================================================================
  // Satirlar
  // ==========================================================================

  /**
   * Belgenin satirlarini BUTUN OLARAK degistirir (sil + yaz).
   *
   * ⚠️ Satir bazinda `update` YOKTUR (§2): degistirilebilirligin tek kapisi
   * BELGENIN DURUMUDUR ve o kapiyi belge tutar. Satir bazli bir yol, kapiyi
   * ATLAYAN ikinci bir yol acardi.
   *
   * ⚠️ Bu metot `draft` OLMAYAN bir belgede cagrilirsa VERITABANI TRIGGER'I
   * (`sales_document_lines_immutable_after_send`) onu reddeder — uygulama
   * kontrolu atlansa bile. Ucuncu katman tam olarak bunun icin var.
   */
  replaceLines(input: { documentId: string; lines: readonly SalesDocumentLine[] }): Promise<void>;

  /** Bir belgenin satirlari — `position` sirasinda. */
  listLines(documentId: string): Promise<SalesDocumentLine[]>;

  /**
   * COKLU belgenin satirlari — TEK sorgu.
   *
   * ⚠️ Yapisal katkici (§4) icin: birkac aday belgenin toplamini hesaplamak
   * gerekir ve tekil bir metot N+1 sorgu uretirdi.
   */
  listLinesByDocumentIds(ids: readonly string[]): Promise<Map<string, SalesDocumentLine[]>>;

  // ==========================================================================
  // Belge numarasi
  // ==========================================================================

  /**
   * Bir sonraki numarayi ATOMIK olarak alir ve sayaci ilerletir (§1.6).
   *
   * ⚠️ `SELECT ... FOR UPDATE` ile — ADR-0039 §3.2'nin fiziksel sayim kilidinin
   * IKINCI uygulamasi. Iki es zamanli `release` istegi ayni numarayi ALAMAZ;
   * kilit DEKORATIF DEGILDIR.
   *
   * ⚠️ `max(number) + 1` REDDEDILDI: silinen bir taslaktan sonra numarayi
   * YENIDEN KULLANIRDI ve iki belge zaman icinde ayni numarayi tasirdi — hata
   * BIZIM GOREMEDIGIMIZ yerde, musterinin elinde ortaya cikardi.
   *
   * @returns ham sayac degeri; bicimlendirme DOMAIN'in isidir.
   */
  claimNextNumber(kind: SalesDocumentKind): Promise<number>;

  // ==========================================================================
  // Yapisal katki (ADR-0041 §4)
  // ==========================================================================

  /**
   * `invoicing-pipeline` katkicisinin TEK sorgusu.
   *
   * ⚠️ Uc alarm kumesi SINIRLIDIR (`limit`) ve ozet SAYIMDIR — gerekce
   * `invoicing-pipeline.contributor.ts`te.
   */
  snapshotPipeline(input: {
    /** `YYYY-MM-DD` — "suresi dolmus" karsilastirmasi bunun uzerinden. */
    today: string;
    /** ⚠️ `sent_at` bundan ONCEYSE teklif "cevapsiz bekliyor" sayilir. */
    staleBefore: Date;
    limit: number;
  }): Promise<PipelineSnapshot>;
}

/** Yapisal katkida gorunecek tek teklif. */
export interface PipelineQuote {
  readonly id: string;
  readonly number: string | null;
  readonly customerName: string;
  readonly currency: string;
  readonly issuedOn: string;
  readonly validUntil: string | null;
}

/**
 * Acik tekliflerin para birimi bazinda SAYIMI.
 *
 * ⚠️ TUTAR TASIMAZ — ve bu, ADR-0041 §4.1'in parantez ici ifadesinden
 * ("sayi + para birimi bazinda tutar") BILINCLI BIR DARALTMADIR. Gerekce
 * projenin kendi disiplinidir: toplam tutar SQL'de hesaplansaydi, satir bazinda
 * yuvarlama kurali (`document-money.ts`) IKINCI KEZ — bu sefer SQL'de —
 * yazilmis olurdu. Iki aritmetik uygulama zamanla AYRISIR ve hata SESSIZDIR:
 * belgede yazan toplam ile katkida yazan toplam farkli olur, ikisi de "dogru"
 * gorunur.
 *
 * Uc ALARM kumesi tutar TASIR (asagida) cunku onlar SINIRLIDIR: satirlari
 * gercekten yuklenir ve toplam AYNI domain fonksiyonuyla hesaplanir. Acik
 * teklifler sinirsiz oldugu icin ayni yol orada kullanilamaz.
 */
export interface OpenQuoteCount {
  readonly currency: string;
  readonly count: number;
}

export interface PipelineSnapshot {
  /** ⚠️ EN AGIR SINIF (0.95): para masada duruyor. */
  readonly acceptedNotInvoiced: readonly PipelineQuote[];
  /** Gecerlilik tarihi gecmis, hala `sent` (0.95). */
  readonly expired: readonly PipelineQuote[];
  /** `staleBefore`dan once gonderilmis, hala cevapsiz (0.90). */
  readonly stale: readonly PipelineQuote[];
  /** Acik tekliflerin para birimi bazinda sayimi (0.75). */
  readonly openCounts: readonly OpenQuoteCount[];
}
