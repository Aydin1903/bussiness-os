import { type SupplierContact } from '../domain/supplier-contact.entity';
import { type SupplierInteraction } from '../domain/supplier-interaction.entity';
import { type Supplier } from '../domain/supplier.entity';

export const SUPPLIER_REPOSITORY = Symbol('SUPPLIER_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * `suppliers` semasinin kaliciligi — UC TABLO, TEK PORT.
 *
 * ============================================================================
 * NEDEN TEK PORT, CRM GIBI UC AYRI DEGIL
 * ============================================================================
 * CRM her kaynak icin ayri bir repository yazdi (`CompanyRepository`,
 * `ContactRepository`, `InteractionRepository`) ve o gun dogruydu: CRM'in
 * kaynaklari BAGIMSIZ yasam donguleri tasiyordu (bir firsat bir sirketten
 * bagimsiz asama degistirir).
 *
 * Burada oyle degil: kisi de gorusme de bir tedarikci OLMADAN VAR OLAMAZ
 * (ikisi de `ON DELETE CASCADE`) ve ucu de ayni transaction sinirlarini,
 * ayni "bulunamadi -> 404" kuralini paylasir. `InventoryRepository`nin
 * (items + movements) ayni sekli, ikinci kez.
 *
 * ⚠️ Bolumler yorum basliklariyla ayrilir; dosya buyudugunde bolmek
 * MUMKUNDUR ve ucuz — tersi (uc porti birlestirmek) degil.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0030`) ve cagiran zaten
 * tenant transaction'i icindedir. Elle bir `WHERE tenant_id` eklemek (a)
 * korumanin RLS'te oldugu gercegini bulaniklastirir, (b) filtre bir gun
 * unutulursa RLS'in hala koruyor oldugu FARK EDILMEZ ve yanlis bir guven
 * duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur.
 * ============================================================================
 */
export interface SupplierRepository {
  // ==========================================================================
  // Tedarikci
  // ==========================================================================

  /**
   * Ekler ya da gunceller (tek deyimlik UPSERT).
   *
   * @throws {DuplicateTaxNumberError} Ayni vergi numarasi (kucuk/buyuk harften
   * bagimsiz) baska bir satirda varsa — ceviri repository'de yapilir cunku
   * kisit VERITABANINDADIR (§1.1) ve tek satira bakarak dogrulanamaz.
   */
  saveSupplier(supplier: Supplier): Promise<void>;

  findSupplierById(id: string): Promise<Supplier | null>;

  /**
   * Sayfali liste — alfabetik.
   *
   * `search` verilirse ad VE vergi numarasi uzerinde kucuk/buyuk harf duyarsiz
   * ALT DIZE aramasi yapar. ⚠️ Bu ANLAMSAL BIR ARAMA DEGILDIR ve oyle
   * gorunmemelidir: `ILIKE '%...%'` bir liste filtresidir. Anlamsal arama
   * `POST /ask`in isidir (ADR-0011, SEKIZINCI kez).
   *
   * ⚠️ "Filtre yok" `null` ile ifade edilir, `undefined` ile DEGIL
   * (`exactOptionalPropertyTypes` altinda ikisi ayri tiptir ve Zod'un
   * `.optional()` ciktisi ikincisidir).
   */
  listSuppliers(input: {
    limit: number;
    offset: number;
    search: string | null;
  }): Promise<ListPage<Supplier>>;

  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteSupplierById(id: string): Promise<number>;

  /**
   * Verilen id'lerin ADLARINI dondurur — BAGLAM BASLIGI icin (§6).
   *
   * ⚠️ `crm.public.ts`in `findNames`ine benzer ama O DEGILDIR: bu METOT MODULUN
   * KENDI SEMASINI okur, cross-modul bir yuzey degildir ve IZIN KAPISI TASIMAZ.
   * Cagiran zaten `supplier_interaction:*` kapisindan gecmistir.
   *
   * ⚠️ `suppliers.public.ts` BU SLICE'TA YAZILMAZ (§4.2): bugun bir tedarikciyi
   * gostermek isteyen HICBIR MODUL YOK. Ilk talip geldiginde dizini TEDARIKCI
   * yazar — talip degil SAHIP.
   */
  findSupplierNames(ids: readonly string[]): Promise<Map<string, string>>;

  // ==========================================================================
  // Kisi
  // ==========================================================================

  saveContact(contact: SupplierContact): Promise<void>;

  findContactById(id: string): Promise<SupplierContact | null>;

  /** Bir tedarikcinin kisileri — alfabetik, sayfasiz (bir firmada az kisi olur). */
  listContactsBySupplier(supplierId: string): Promise<SupplierContact[]>;

  deleteContactById(id: string): Promise<number>;

  // ==========================================================================
  // Gorusme gunlugu (EKLEME-YALNIZ)
  // ==========================================================================

  /**
   * Gorusme EKLER.
   *
   * ⚠️ `saveInteraction` DEGIL `insertInteraction`: UPSERT YOKTUR ve bu bir
   * eksik degil, ekleme-yalnizligin tasiyicisidir (`insertMovement`in ayni
   * karari). UPSERT yazilsaydi id cakismasi durumunda sessizce bir gecmis
   * satirini DEGISTIRIRDI.
   *
   * ⚠️ `embedding` KOLONUNA DOKUNMAZ. Vektor `setInteractionEmbedding` ile
   * yazilir cunku uretimi bir AG CAGRISI gerektirir ve o cagri transaction'in
   * DISINDA kalmak zorundadir.
   */
  insertInteraction(interaction: SupplierInteraction): Promise<void>;

  /**
   * Vektoru YAZAR.
   *
   * ⚠️ `null` KABUL ETMEZ — `AppointmentRepository.setEmbedding`den BILINCLI
   * sapma. Orada not SILINEBILIYORDU (`serviceNote: null`) ve vektorun de
   * silinmesi gerekiyordu; burada gorusme metni ZORUNLUDUR ve gunluk
   * EKLEME-YALNIZDIR, yani "metni silinmis bir kayit" diye bir durum YOKTUR.
   * `null` kabul etmek, var olmayan bir durumu IMA EDERDI.
   *
   * @returns yazilan satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  setInteractionEmbedding(input: { id: string; embedding: readonly number[] }): Promise<number>;

  /**
   * Vektoru eksik gorusmeler — `reindex`in is listesi.
   *
   * ⚠️ IS LISTESI TURETILMISTIR: `WHERE embedding IS NULL`. Ayri bir
   * "onarilacaklar" tablosu ve deneme sayaci YOKTUR — projede ALTINCI kez ayni
   * karar. Bir is tablosu, ikinci bir dogruluk kaynagi ve senkron kalmasi
   * gereken ikinci bir yazma yolu demekti.
   *
   * ⚠️ `serviceNote IS NOT NULL` gibi bir ek yuklem GEREKMEZ: bu modulde metin
   * ZORUNLUDUR, yani vektorsuz her satir onarilacak bir satirdir.
   */
  findUnindexedInteractions(limit: number): Promise<UnindexedInteraction[]>;

  /**
   * BAYAT baslikli gorusmeler — `reindex`in IKINCI isi (§6).
   *
   * ⚠️ "Bayat"i SORGUYLA TESPIT EDEMEYIZ: baslik vektorun icindedir ve
   * vektorun hangi adla uretildigi hicbir kolonda yazmaz. Bu yuzden onarim
   * yalnizca VEKTORSUZ satirlari otomatik bulur; ad degisiminden sonra
   * kullanicinin `reindex`i CAGIRMASI gerekir ve o cagri BU metodu kullanir.
   *
   * @param supplierId Yalnizca bu tedarikcinin gorusmeleri.
   */
  findInteractionsBySupplier(input: {
    supplierId: string;
    limit: number;
  }): Promise<UnindexedInteraction[]>;

  /** Bir tedarikcinin gorusmeleri — en yeni once. */
  listInteractions(input: {
    limit: number;
    offset: number;
    supplierId: string | null;
  }): Promise<ListPage<SupplierInteraction>>;

  /**
   * ANLAMSAL arama (ADR-0040 §3 — `supplier-interactions` katkicisi).
   *
   * ⚠️ `embedding IS NOT NULL` SUZULUR: vektoru olmayan satirlar (henuz
   * onarilmamis kayitlar) sonuca GIREMEZ. Suzulmeseydi pgvector `NULL`
   * satirlari mesafe hesabina sokmaz ama `LIMIT` yuvalarini bosa harcayabilirdi.
   *
   * TENANT FILTRESI YOK ve bu BILINCLI: daraltmayi RLS yapar (migration `0030`)
   * ve cagiran zaten tenant transaction'i icindedir.
   */
  findSimilarInteractions(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarInteraction[]>;
}

/**
 * `reindex`in isledigi satir.
 *
 * ⚠️ `supplierId` TASINIR cunku baslik icin AD COZULMESI gerekir (§6) ve o ad
 * BASKA BIR SATIRDA yasar. ADR-0039'da bu alan GEREKMEZDI: orada ad kalemin
 * kendi satirindaydi.
 */
export interface UnindexedInteraction {
  readonly id: string;
  readonly supplierId: string;
  readonly occurredOn: string;
  readonly body: string;
}

/**
 * Anlamsal arama sonucu.
 *
 * ⚠️ `content` DEGIL `body` + `occurredOn` DONER — chunk tablosu tasiyan dort
 * modulden AYRILDIGI yer. Onlarda gomulen metin (baslik DAHIL) tabloda
 * SAKLANIR; burada saklanmaz, cunku saklamak `body`yi ikinci kez (baslikli
 * haliyle) yazmak demekti.
 *
 * Sonucu: baslik OKUMA ANINDA yeniden kurulur ve gosterilen TARIH daima
 * TAZEDIR (`SimilarAppointmentNote`in ayni yan faydasi).
 *
 * ============================================================================
 * ⚠️ `supplierName` BURADA VAR — VE RANDEVU'DAN AYRILDIGIMIZ YER BURASI
 * ============================================================================
 * `AppointmentNotesContributor` basliga adi KOYAMIYORDU ve gerekcesi sertti:
 * ad `crm.contacts`taydi, yani BASKA BIR SEMADA, ve okumanin tek mesru yolu
 * IZIN KAPILI `ContactDirectory`ydi — `ContributeInput` ise rol TASIMAZ.
 *
 * Burada ad `suppliers.suppliers`tadir, yani AYNI SEMADA. `JOIN` MESRUDUR
 * (Mutlak Kural 5 yalnizca CROSS-SCHEMA join'i yasaklar), izin kapisi
 * GEREKMEZ (cagiran zaten `supplier_interaction:read` tasiyor) ve ad
 * OKUMA ANINDA cozuldugu icin fragment'te gosterilen ad DAIMA TAZEDIR —
 * vektor bayat olsa bile.
 *
 * ⚠️ Yani bu modulde vektor bayatlayabilir ama METIN bayatlamaz.
 */
export interface SimilarInteraction {
  readonly id: string;
  readonly occurredOn: string;
  readonly body: string;
  /** `null` teorik olarak imkansiz (`supplier_id` NOT NULL) — savunma katmani. */
  readonly supplierName: string | null;
}
