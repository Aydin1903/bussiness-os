import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type FeedbackRepository } from '../application/feedback.repository.port';
import { withFeedbackHeader } from '../domain/feedback-response.entity';
import { FEEDBACK_READ } from '../feedback.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const FEEDBACK_COMMENTS_SOURCE = 'feedback-comments';

/**
 * Musteri Geri Bildirimi'nin ANLAMSAL katkisi (ADR-0045 §3.1, §4).
 *
 * ============================================================================
 * ⚠️ HAVUZA DISARIDAN GELEN ILK SES
 * ============================================================================
 * `CrmInteractionsContributor` · `ProjectNotesContributor` ·
 * `FinanceCommentariesContributor` · `AppointmentNotesContributor` ·
 * `DocumentsContributor` · `InventoryNotesContributor` ·
 * `SupplierInteractionsContributor` ile SIMETRIKTIR: ayni port, ayni desen.
 *
 * ⚠️ Ama bir farki var ve bu, modulun kurucu kisita verdigi cevaptir: bugune
 * kadar havuzdaki HER ANLATIYI SIRKET KENDISI YAZMISTI (gorusme notu, ilerleme
 * notu, finansal yorum, servis notu, kalem notu). Burada gomulen metin
 * MUSTERININ KENDI CUMLESIDIR.
 *
 * ============================================================================
 * ⚠️ BU MODULUN TEK KATKICISIDIR — VE YANINDA BIR YAPISAL KATKICI ARANMASIN
 * ============================================================================
 * ⚠️ AMA GEREKCE ADR-0040 / ADR-0043'TEKIYLE AYNI DEGILDIR VE BU AYRIM
 * ONEMLIDIR:
 *
 *     ADR-0040 (Tedarikci) -> uc aday, ucu de LIYAKATSIZ. "Bakildi ve yoktu."
 *     ADR-0043 (IK)        -> uc aday, ucu de LIYAKATSIZ. "Bakildi ve yoktu."
 *     ⚠️ ADR-0045 (burasi) -> aday LIYAKATLI. "Bakildi, VAR, ve TEK BASINA
 *                             EKLENEMEZ."
 *
 * Aday: `feedback-satisfaction` — _"Son 30 gunde 12 geri bildirim, ortalama
 * 4,2; 3 dusuk puan (<=2), sonuncusu 2 gun once."_ Dort olcut sirayla
 * uygulandi (§3.2):
 *
 *   1. HABER MI, SAYIM MI?  -> ✅ GECIYOR. Dusuk puan varsa alarm bandi (0.95),
 *      yoksa 0.75. IK'nin "12 aktif calisan" ozeti HER ZAMAN ayni cumleyi
 *      kurardi; bu kurmaz.
 *   2. FIIL MI, KATALOG MU? -> ✅ GECIYOR. "Musteri 2 puan verdi" TARIHLI bir
 *      olaydir. Tedarikci listesi bir katalogdu; bu bir defterdir.
 *   3. SEYREK MI?           -> ✅ GECIYOR. IK'nin "bu ay 1 katilim" adayi ayda
 *      sifir satir donduruyordu; geri bildirim her musteri temasinda gelebilir.
 *   4. ⚠️ AYNI HABERI SOYLEYEN BIR SES ZATEN VAR MI? -> ⚠️ BUYUK OLCUDE
 *      KALIYOR. Bugune kadarki her yapisal katkicinin soyledigi sey HICBIR
 *      METINDE YAZMIYORDU ("takip gecikti", "stok tukeniyor" — kolonlardan
 *      TURETILIR). ⚠️ Burada TERSTIR: olumsuz geri bildirimin haberi
 *      MUSTERININ KENDI CUMLESIDIR ve o cumle zaten BU KATKICIYLA havuza
 *      girer. "3 dusuk puan var" ozeti, "siparisim iki hafta gecikti ve kimse
 *      donmedi" cumlesinin ZAYIF BIR OZETI olurdu — ve taban garantisiyle
 *      iceri girip modulun KENDI EN IYI CUMLESINI disari itebilirdi.
 *
 * ⚠️ TEK ISTISNA DURUSTCE KAYITLI: YORUMSUZ puanlarin metni yoktur, yani
 * anlamsal sesi de yoktur — o kayitlar icin yapisal katkici TEK SES olurdu.
 * Dorduncu olcut bu yuzden "tam" degil "BUYUK OLCUDE" karsilaniyor ve aday
 * REDDEDILMIYOR.
 *
 * ============================================================================
 * ⚠️ EKLENMEMESININ ASIL SEBEBI USULDUR — VE OLCULEBILIR
 * ============================================================================
 * Eklemek [ADR-0042](docs/adr/0042) §3'un **T2** esigini tetikler:
 *
 *     kayitli yapisal kaynak       6 -> 7   (esik `2K/3` = 6, "gectiginde")
 *     ⚠️ satir donduren yapisal    ? -> ?   ⚠️ BU SAYI HIC OLCULMEDI
 *
 * T2 KAYITLI kaynaklari degil SATIR DONDURENLERI sayar ve o sayiyi uretecek
 * arac BUGUN YOKTUR: ADR-0043'un kapanis denetimi ADR-0042 §4'un olcum
 * protokolunu UYGULAYAMADI (`retrieval.select` gozlemlenebilirlik satiri yok).
 *
 * ADR-0042'nin ilkesinin AYNASI:
 *
 *     "Bir platform karari, onu degistirmesi gereken VERIYE SAHIP OLMADAN
 *      revize edilmez."  ->  ⚠️ "Bir esik, onu OLCECEK ARAC YOKKEN gecilmez."
 *
 * ⚠️ SIRA TERSINE CEVRILEMEZ (§3.4): (1) `retrieval.select` yazilir,
 * (2) bir kapanis denetiminde olcum yapilir, (3) ADR-0036/0042 AYRI BIR
 * PLATFORM ADR'SIYLE yeniden acilir, (4) ancak ondan sonra
 * `feedback-satisfaction` yazilir.
 *
 * ============================================================================
 * ⚠️ BASLIKTA KISI ADI YOK — BELGE'NIN KARARI, IKINCI KEZ
 * ============================================================================
 * `SupplierInteractionsContributor` basliga adi KOYABILIYORDU cunku ad AYNI
 * SEMADAYDI. Burada ad `crm.contacts`tadir:
 *
 *   - cross-schema `JOIN` YASAK (Mutlak Kural 5),
 *   - okumanin tek mesru yolu IZIN KAPILI `ContactDirectory`dir,
 *   - ⚠️ ve `ContributeInput` ROL TASIMAZ — `AppointmentNotesContributor` icin
 *     kaydedilmis olan ayni sinir.
 *
 * ⚠️ Ama bunun BEKLENMEDIK BIR KAZANCI var (§4): baslikta kalan uc bilesenin
 * (tarih · puan · kanal) UCU DE DEGISTIRILEMEZDIR (§2), yani BU MODULDE
 * BAYATLAMA PENCERESI YOKTUR — projede ILK. `staleAfterRename` gibi bir bayrak
 * ve hedefli bir onarim ucu GEREKMEZ.
 */
@Injectable()
export class FeedbackCommentsContributor implements RetrievalContributor {
  readonly source = FEEDBACK_COMMENTS_SOURCE;
  /** ADR-0036: vektor benzerligiyle bulunan ANLATISAL icerik. */
  readonly contributionKind = 'semantic' as const;
  readonly permission = FEEDBACK_READ;

  constructor(
    private readonly repository: FeedbackRepository,
    private readonly transactionManager: TransactionManager,
  ) {}

  /**
   * Kendi transaction'ini ACAR.
   *
   * Katkicilar PARALEL cagrilir; ortak bir transaction paylasmak onlari
   * birbirinin kilidine baglardi.
   */
  async contribute(input: ContributeInput): Promise<ContextFragment[]> {
    const rows = await this.transactionManager.runInCurrentTenantTransaction(() =>
      this.repository.findSimilarResponses({
        embedding: input.embedding,
        limit: input.limit,
      }),
    );

    return rows.map((row, index) => ({
      // Baslik `withFeedbackHeader` ile kurulur — gomerken kullanilan AYNI
      // fonksiyon. Iki yerde ayri bicimlendirilseydi model ayni kaydi iki
      // farkli sekilde gorurdu.
      content: withFeedbackHeader({
        receivedAt: row.receivedAt,
        rating: row.rating,
        channel: row.channel,
        comment: row.comment,
      }),
      // Repository skor DONDURMEZ; kosinus mesafesine gore SIRALI bir liste
      // verir. Siralamayi korumak icin sentetik ve AZALAN bir skor uretilir —
      // yedi onceki anlamsal katkiciyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri). Artik DOKUZ anlamsal katkici
      // BES SERBEST YUVA icin yarisiyor: bazi kaynaklarin sifir almasi
      // ADR-0036'nin YAZILI BEKLENTISIDIR, bir kusuru degil — anlamsal
      // kaynaklar arasinda TABAN YOKTUR, eleme LIYAKATTIR.
      //
      // ⚠️ Ve bu modul o baskiyi ARTIRIYOR: ADR-0042'nin son tetikleyicisi
      // ("anlamsal tarafta sifir alan kaynak sayisi besi gectiginde") bir adim
      // yaklasti.
      score: 1 - index / (rows.length + 1),
      source: FEEDBACK_COMMENTS_SOURCE,
      reference: { kind: 'feedback-response', id: row.id },
    }));
  }
}
