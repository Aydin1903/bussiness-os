import { type FeedbackResponse } from '../domain/feedback-response.entity';

export const FEEDBACK_REPOSITORY = Symbol('FEEDBACK_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * `feedback` semasinin kaliciligi — TEK TABLO, TEK PORT.
 *
 * ============================================================================
 * ⚠️ `update` DIYE BIR METOT YOKTUR — VE BU BIR EKSIK DEGIL (ADR-0045 §2)
 * ============================================================================
 * Degistirilemezligin UC katmanindan IKINCISI burada yasar:
 *
 *   1. `feedback:write` DIYE BIR IZIN YOK (katalogda `create` + `delete`)
 *   2. ⚠️ BURASI: entity'de `update`, bu port'ta `update`/`save` YOK
 *   3. Veritabani: `UPDATE` yalnizca `embedding` kolonunda (migration `0037`)
 *
 * ⚠️ `saveResponse` DEGIL `insertResponse`: UPSERT YOKTUR ve bu bir eksik
 * degil, degistirilemezligin tasiyicisidir (`insertMovement` ve
 * `insertInteraction`in ayni karari). UPSERT yazilsaydi id cakismasi durumunda
 * SESSIZCE bir gecmis satirini degistirirdi.
 *
 * ⚠️ AMA `deleteResponseById` VARDIR ve bu, `SupplierRepository`den
 * AYRILDIGIMIZ TEK NOKTADIR: gerekce kolaylik degil KVKK'dir (§2.2) — yorum
 * kisisel veri icerebilir ve veri sahibinin silme talebi hakki vardir.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0037`) ve cagiran zaten
 * tenant transaction'i icindedir. Elle bir `WHERE tenant_id` eklemek (a)
 * korumanin RLS'te oldugu gercegini bulaniklastirir, (b) filtre bir gun
 * unutulursa RLS'in hala koruyor oldugu FARK EDILMEZ ve yanlis bir guven
 * duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur.
 * ============================================================================
 */
export interface FeedbackRepository {
  /**
   * Geri bildirim EKLER.
   *
   * ⚠️ `embedding` KOLONUNA DOKUNMAZ. Vektor `setResponseEmbedding` ile yazilir
   * cunku uretimi bir AG CAGRISI gerektirir ve o cagri transaction'in DISINDA
   * kalmak zorundadir.
   */
  insertResponse(response: FeedbackResponse): Promise<void>;

  findResponseById(id: string): Promise<FeedbackResponse | null>;

  /**
   * Sayfali liste — EN YENI ONCE.
   *
   * `minRating` / `maxRating` verilirse puan bandi filtrelenir (ekranin
   * "dusuk / orta / yuksek" seridi). ⚠️ "Filtre yok" `null` ile ifade edilir,
   * `undefined` ile DEGIL (`exactOptionalPropertyTypes` altinda ikisi ayri
   * tiptir ve Zod'un `.optional()` ciktisi ikincisidir).
   */
  listResponses(input: {
    limit: number;
    offset: number;
    minRating: number | null;
    maxRating: number | null;
  }): Promise<ListPage<FeedbackResponse>>;

  /**
   * Kaydi SILER — GERCEK bir `DELETE` (ADR-0045 §2.2).
   *
   * ⚠️ "Soft-delete" DEGIL ve bu ayrim bu modulde HUKUKIDIR: `deleted_at`
   * isaretli bir satir, SILINMESI ISTENEN veriyi tabloda TUTMAYA devam ederdi —
   * yani KVKK yukumlulugunu karsiliyor GORUNUP karsilamazdi.
   *
   * ⚠️ Vektor de gider: `embedding` satirin KENDI kolonunda yasar (§1.2), yani
   * silinen bir geri bildirim AI'IN HAFIZASINDAN DA silinir. Chunk tablosu
   * olsaydi ikinci bir silme yolu gerekirdi.
   *
   * @returns silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  deleteResponseById(id: string): Promise<number>;

  /**
   * Vektoru YAZAR.
   *
   * ⚠️ `null` KABUL ETMEZ: yorum SILINEMEZ (satir guncellenmiyor), yani
   * "metni silinmis bir kayit" diye bir durum YOKTUR. `null` kabul etmek, var
   * olmayan bir durumu IMA EDERDI (`setInteractionEmbedding` ile ayni karar).
   *
   * @returns yazilan satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  setResponseEmbedding(input: { id: string; embedding: readonly number[] }): Promise<number>;

  /**
   * Vektoru eksik AMA YORUMU OLAN kayitlar — `reindex`in is listesi.
   *
   * ============================================================================
   * ⚠️ IKI YUKLEM SART: `embedding IS NULL` **AND** `comment IS NOT NULL`
   * ============================================================================
   * Onceki modullerde tek yuklem yetiyordu. Burada YETMEZ ve sebebi §1.4'tur:
   * YORUM OPSIYONELDIR, yani vektorsuz iki AYRI satir sinifi vardir:
   *
   *   yorumu VAR, vektoru YOK  -> ONARILACAK (saglayici cokmesi)
   *   yorumu YOK,  vektoru YOK -> ⚠️ NORMAL ve KALICI hal
   *
   * Ikinci yuklem olmasaydi onarim her cagrida ayni yorumsuz satirlari secer,
   * her seferinde `repaired: 0` doner ve GERCEKTEN onarilmasi gereken kayitlara
   * HIC SIRA GELMEZDI — `reindexBatchSize` yuvalarini kalici olarak isgal
   * ederlerdi. ⚠️ Hata SESSIZ olurdu: uc 200 doner, sayilar makul gorunur.
   *
   * (Randevu ve Stok'ta not da opsiyoneldi ve ayni yuklem orada da gerekliydi;
   * fark, orada notun SILINEBILIR olmasiydi — burada silinemez.)
   *
   * ⚠️ AYRI BIR "onarilacaklar" TABLOSU YOKTUR — projede YEDINCI kez ayni
   * karar. Bir is tablosu, ikinci bir dogruluk kaynagi ve senkron kalmasi
   * gereken ikinci bir yazma yolu demekti.
   */
  findUnindexedResponses(limit: number): Promise<UnindexedResponse[]>;

  /**
   * Duvarin ozeti — TEK SORGUDA, SQL'de TOPLANIR (ADR-0045 §9).
   *
   * ============================================================================
   * ⚠️ BU BIR YAPISAL KATKICI DEGILDIR — VE AYRIM ONEMLIDIR
   * ============================================================================
   * Ayni sayilari uretiyor gibi gorunur ama BASKA BIR SEYDIR:
   *
   *   `RetrievalContributor` -> `POST /ask` HAVUZUNA girer, taban yuvasi
   *                             tuketir, ADR-0042'nin T2 esigini SAYAR.
   *   ⚠️ BU METOT          -> yalnizca EKRANA gider. Havuza girmez, kayit
   *                             defterinde yeri yoktur, T2'yi ETKILEMEZ.
   *
   * Yani modulun `POST /ask`e katkisi HALA TEK ve ANLAMSALDIR (§3.4). Bir gun
   * `feedback-satisfaction` yazilirsa bu metodu YENIDEN KULLANABILIR — ama o
   * gun once ADR-0036/0042 yeniden acilmak zorundadir. ⚠️ Bu metodun var olmasi
   * o karari VERMEZ ve kolaylastirmaz.
   *
   * ============================================================================
   * ⚠️ TOPLAMA SQL'DE — ISTEMCIDE DEGIL, UYGULAMADA DA DEGIL
   * ============================================================================
   * Projede besinci kez ayni disiplin (`cashflow`, `inventory` miktari,
   * `invoicing` ozeti). Satirlari cekip JS'te toplamak, sayfa sinirina takilan
   * ve SESSIZCE YANLIS bir ortalama uretirdi: kullanici 20 kayitlik sayfayi
   * gorur, ortalama 200 kaydin degil O 20'NIN ortalamasi olurdu.
   *
   * @param since Pencerenin baslangici — cagiran hesaplar (`Clock`), repository
   *   `now()` CAGIRMAZ (DEVELOPMENT_RULES 3.2: zaman disaridan gelir).
   * @param lowRatingMax Bu degere KADAR (dahil) olan puanlar "dusuk" sayilir.
   */
  summarize(input: { since: Date; lowRatingMax: number }): Promise<FeedbackSummaryRow>;
  /**
   * ⚠️ Yapisal katkicinin KENDI sorgusu — ekranin `summarize`i DEGIL
   * (ADR-0045 §3.4, ADR-0049 sonrasi eklendi).
   *
   * ⚠️ AYRI TUTULMASI BILINCLIDIR. ADR-0045'in kapanis denetimi
   * `GET /feedback/summary`in bir katkici OLMADIGINI uc yerde birden yaziya
   * gecirmisti; ayni sayilari uretiyor gorunen iki yolun TEK metoda
   * indirilmesi, o ayrimi kodda gorunmez kilardi.
   *
   * ⚠️ Ustelik ihtiyaclari da farkli: ekran TEK pencere ozetler, katkici IKI
   * pencere karsilastirir (`finance-cashflow`in deseni) ve dusuk puanin NE
   * ZAMAN geldigini bilmek zorundadir — "3 dusuk puan" ile "3 dusuk puan,
   * sonuncusu 2 gun once" ayni haber degildir.
   */
  satisfactionSnapshot(input: {
    from: Date;
    to: Date;
    previousFrom: Date;
    lowRatingMax: number;
  }): Promise<SatisfactionSnapshot>;

  /**
   * ANLAMSAL arama (ADR-0045 §3.1 — `feedback-comments` katkicisi).
   *
   * ⚠️ `embedding IS NOT NULL` SUZULUR: vektoru olmayan satirlar (yorumsuz
   * kayitlar VE henuz onarilmamis olanlar) sonuca GIREMEZ. Suzulmeseydi
   * pgvector `NULL` satirlari mesafe hesabina sokmaz ama `LIMIT` yuvalarini
   * bosa harcayabilirdi.
   *
   * TENANT FILTRESI YOK ve bu BILINCLI: daraltmayi RLS yapar (migration `0037`)
   * ve cagiran zaten tenant transaction'i icindedir.
   */
  findSimilarResponses(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarResponse[]>;
}

/**
 * `reindex`in isledigi satir.
 *
 * ⚠️ Baslik icin gereken HER SEY BU SATIRDA (tarih, puan, kanal) — ADR-0040'in
 * `UnindexedInteraction`i `supplierId` tasimak ZORUNDAYDI cunku ad BASKA BIR
 * SATIRDA yasiyordu. Burada ikinci bir okuma GEREKMEZ.
 *
 * ⚠️ Ve bunun daha buyuk sonucu §4'tedir: basligin uc bileseni de
 * DEGISTIRILEMEZ, yani bu modulde BAYATLAMA PENCERESI YOKTUR.
 */
export interface UnindexedResponse {
  readonly id: string;
  readonly rating: number;
  readonly channel: string | null;
  readonly receivedAt: Date;
  /** ⚠️ `NOT NULL` — sorgu zaten `comment IS NOT NULL` suzuyor. */
  readonly comment: string;
}

/**
 * Anlamsal arama sonucu.
 *
 * ⚠️ `content` DEGIL, baslik BILESENLERI doner — chunk tablosu tasiyan dort
 * modulden AYRILDIGI yer. Onlarda gomulen metin (baslik DAHIL) tabloda
 * SAKLANIR; burada saklanmaz, cunku saklamak `comment`i ikinci kez (baslikli
 * haliyle) yazmak demekti. Baslik OKUMA ANINDA yeniden kurulur.
 *
 * ⚠️ KISI ADI YOK ve bu ADR-0045 §4'un karari: ad `crm.contacts`tadir (BASKA
 * SEMA), okumanin tek mesru yolu IZIN KAPILI `ContactDirectory`dir ve
 * `ContributeInput` ROL TASIMAZ — `AppointmentNotesContributor` icin
 * kaydedilmis olan ayni sinir. Tedarikci'de ad ayni semadaydi, burada degil.
 */
export interface SimilarResponse {
  readonly id: string;
  readonly rating: number;
  readonly channel: string | null;
  readonly receivedAt: Date;
  readonly comment: string;
}

/**
 * Duvarin ham ozeti (ADR-0045 §9).
 *
 * ⚠️ `average` bir `string | null` — VE IKISI DE KASITLI:
 *
 *   `string` -> ortalama SUNUCUDA yuvarlanir (`round(avg, 1)`) ve KANONIK
 *     DIZE olarak gelir. JS'te `4.166666...` uretip istemcide bicimlendirmek,
 *     iki yerde iki farkli yuvarlama demekti.
 *   ⚠️ `null` -> `N = 0` iken ortalama YOKTUR ve TIP SEVIYESINDE gosterilemez
 *     (§9.1). `0` donseydi arayuz "0,0" basar ve "cok kotu" ile "hic veri yok"
 *     AYNI GORUNURDU — hata SESSIZ olurdu. Tip, o hatayi IMKANSIZ kilar.
 */
/**
 * `feedback-satisfaction` katkicisinin girdisi (ADR-0045 §3.2).
 *
 * ⚠️ `lastLowRatingAt` NULLABLE ve bu bir eksiklik degil: dusuk puan yoksa
 * "sonuncusu" diye bir sey de yoktur. `null` ile eski bir tarih arasindaki
 * fark, alarm bandinin ateslenip ateslenmedigidir.
 */
export interface SatisfactionSnapshot {
  readonly average: string | null;
  readonly count: number;
  readonly lowRatingCount: number;
  readonly lastLowRatingAt: Date | null;
  /** ⚠️ ONCEKI pencerenin ortalamasi — dusus ancak karsilastirmayla gorulur. */
  readonly previousAverage: string | null;
}

export interface FeedbackSummaryRow {
  readonly average: string | null;
  readonly count: number;
  readonly lowRatingCount: number;
  readonly withoutCommentCount: number;
}
