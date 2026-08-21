import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type ContributeInput,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type SupplierRepository } from '../application/supplier.repository.port';
import { withSupplierHeader } from '../domain/supplier-interaction.entity';
import { SUPPLIER_INTERACTION_READ } from '../suppliers.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const SUPPLIER_INTERACTIONS_SOURCE = 'supplier-interactions';

/**
 * Tedarikci'nin ANLAMSAL katkisi (ADR-0040 §3, §6).
 *
 * ============================================================================
 * ⚠️ BU MODULUN TEK KATKICISIDIR — VE BU, ADR'NIN MERKEZI KARARIDIR
 * ============================================================================
 * `CrmInteractionsContributor` · `ProjectNotesContributor` ·
 * `FinanceCommentariesContributor` · `AppointmentNotesContributor` ·
 * `DocumentsContributor` · `InventoryNotesContributor` ile SIMETRIKTIR: ayni
 * port, ayni desen. Yedi modul birbirinin semasini GORMEZ; birlestirmeyi
 * platform yapar.
 *
 * ⚠️ YANINDA BIR `SupplierStatusContributor` ARANMASIN: yapisal katkici
 * YOKTUR ve bu bir eksik degil, ADR-0036'NIN ESIGINE DOKUNMAMA KARARIDIR.
 *
 * ADR-0039 §7.2 bu ADR'ye acikca soru birakmisti:
 *
 *     "⚠️ 7. modul (Tedarikci Yonetimi) bir YAPISAL katkici eklerse esik ASILIR
 *      ve ADR-0036 yeniden acilmak ZORUNDADIR."
 *
 * Satir okundu. Yapisal kaynak sayisi **5'te kaliyor**, ADR-0036'nin esigi (6)
 * **ASILMIYOR** ve o karar **yeniden acilmiyor**.
 *
 * ============================================================================
 * ⚠️ UC YAPISAL ADAY DEGERLENDIRILDI — UCU DE REDDEDILDI (§3.2)
 * ============================================================================
 * Karar "yazmadik" degil, "BAKILDI VE YOKTU"dur (ADR-0037 §8'in ayni
 * disiplini):
 *
 *   1. "TEDARIKCI PERFORMANSI / GECIKME RISKI" -> siparis ve teslim tarihinden
 *      turetilirdi; IKISI DE v1'de YOK (§9). Katkicinin HESAPLAYACAK HICBIR
 *      SEYI OLMAZDI ve gerceklestirilebilir tek hali "12 tedarikciniz var"
 *      gibi bir SAYIM olurdu. ADR-0037 §8: _"bir sayim, bir hafiza degil.
 *      AI'a hicbir sey ogretmez."_
 *
 *   2. "DURGUN TEDARIKCI" (N gundur gorusulmedi) -> `MAX(occurred_on)`dan
 *      TURETILEBILIRDI ama HABER DEGILDIR. Durgun bir FIRSAT kayip gelirdir;
 *      durgun bir TEDARIKCI normaldir — ihtiyac olunca aranir. Yilda bir kez
 *      calisilan bir tedarikci 364 gun "durgun" gorunur ve katkici HER SORUDA
 *      gurultu uretir. ⚠️ Ustelik bu gurultu bir TABAN YUVASI ISGAL EDERDI.
 *
 *   3. "ODEME VADESI YAKLASAN" -> `payment_terms` SERBEST METINDIR (§1.2) ve
 *      vade ONDAN CIKARILAMAZ. Regex ile "60 gun" aramak bir SESSIZ HATA
 *      MAKINESI olurdu: "60 is gunu" ile "60 gun" arasindaki farki bir regex
 *      bilmez ve ekran MAKUL GORUNEN YANLIS bir tarih gosterir.
 *
 * ⚠️ Uydurma bir yapisal katkici yazmak, ADR-0036'nin taban kisitindan HAKSIZ
 * BIR YUVA CALMAK olurdu — taban yapisal kaynaklara GARANTI verdigi icin
 * "yapisal" etiketi bir IMTIYAZDIR (ADR-0037 §8).
 *
 * ⚠️ VE BU MODULDE BEDEL ILK KEZ CIFT TARAFLIDIR: uydurma bir katkici yalnizca
 * kendi degersiz satirini iceri sokmaz, AYNI ZAMANDA esigi asarak ADR-0036'yi
 * yeniden acilmak zorunda birakirdi. Yani bedeli bir satir kod degil, BIR
 * PLATFORM KARARIDIR.
 *
 * ⚠️ Bir "tedarikci performansi" katkicisi ISTENIRSE sira DEGISTIRILEMEZ (§3.3):
 * (1) siparis/teslimat ayri ADR, (2) ADR-0036 YENIDEN ACILIR, (3) ancak ondan
 * sonra katkici yazilir.
 *
 * ============================================================================
 * ⚠️ BASLIKTA TEDARIKCI ADI VAR — RANDEVU'DAN AYRILDIGIMIZ YER
 * ============================================================================
 * `AppointmentNotesContributor` basliga adi KOYAMIYORDU ve gerekcesi sertti:
 * ad `crm.contacts`taydi (BASKA SEMA), okumanin tek mesru yolu IZIN KAPILI
 * `ContactDirectory`ydi ve `ContributeInput` rol TASIMAZ.
 *
 * Burada ad `suppliers.suppliers`tadir — AYNI SEMADA. `JOIN` mesrudur (Mutlak
 * Kural 5 yalnizca CROSS-SCHEMA join'i yasaklar), izin kapisi gerekmez
 * (cagiran zaten `supplier_interaction:read` tasiyor) ve ad OKUMA ANINDA
 * cozulur.
 *
 * ⚠️ Bunun somut kazanci: VEKTOR bayat olabilir (ad degistiyse, §6) ama
 * MODELE GIDEN METIN daima TAZE adi tasir. Chunk tablolarinda ikisi de
 * bayatlardi.
 */
@Injectable()
export class SupplierInteractionsContributor implements RetrievalContributor {
  readonly source = SUPPLIER_INTERACTIONS_SOURCE;
  /** ADR-0036: vektor benzerligiyle bulunan ANLATISAL icerik. */
  readonly contributionKind = 'semantic' as const;
  readonly permission = SUPPLIER_INTERACTION_READ;

  constructor(
    private readonly repository: SupplierRepository,
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
      this.repository.findSimilarInteractions({
        embedding: input.embedding,
        limit: input.limit,
      }),
    );

    return rows.map((row, index) => ({
      // Baslik `withSupplierHeader` ile kurulur — gomerken kullanilan AYNI
      // fonksiyon. Iki yerde ayri bicimlendirilseydi model ayni kaydi iki
      // farkli sekilde gorurdu.
      content: withSupplierHeader({
        occurredOn: row.occurredOn,
        supplierName: row.supplierName,
        body: row.body,
      }),
      // Repository skor DONDURMEZ; kosinus mesafesine gore SIRALI bir liste
      // verir. Siralamayi korumak icin sentetik ve AZALAN bir skor uretilir —
      // alti onceki anlamsal katkiciyla AYNI formul.
      //
      // ⚠️ Skor kaynaklar ARASI karsilastirma icin anlamli DEGILDIR (ADR-0031'in
      // "skorlar kalibre degil" bilinen siniri). Artik SEKIZ anlamsal katkici
      // BES SERBEST YUVA icin yarisiyor: uc kaynagin sifir almasi ADR-0036'nin
      // YAZILI BEKLENTISIDIR, bir kusuru degil — anlamsal kaynaklar arasinda
      // TABAN YOKTUR, eleme LIYAKATTIR.
      score: 1 - index / (rows.length + 1),
      source: SUPPLIER_INTERACTIONS_SOURCE,
      reference: { kind: 'supplier-interaction', id: row.id },
    }));
  }
}
