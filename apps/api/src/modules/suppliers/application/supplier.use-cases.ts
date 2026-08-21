import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  SupplierContact,
  type SupplierContactFields,
  type SupplierContactPatch,
  type SupplierContactState,
} from '../domain/supplier-contact.entity';
import {
  SupplierInteraction,
  assertEmbeddingDimensions,
  withSupplierHeader,
  type SupplierInteractionState,
} from '../domain/supplier-interaction.entity';
import {
  Supplier,
  type SupplierFields,
  type SupplierPatch,
  type SupplierState,
} from '../domain/supplier.entity';
import { SupplierContactNotFoundError, SupplierNotFoundError } from '../domain/suppliers.error';
import { SUPPLIERS_EMBEDDING_ACTION } from '../suppliers.rate-limits';
import {
  type ListPage,
  type SupplierRepository,
  type UnindexedInteraction,
} from './supplier.repository.port';

/**
 * Tedarikci yasam dongusu (ADR-0040 §1, §2, §6).
 *
 * ============================================================================
 * UC KAYNAK TEK DOSYADA — `InventoryUseCases` ile ayni
 * ============================================================================
 * Ucu de AYNI kaynagin CRUD'udur: ayni repository, ayni transaction sinirlari,
 * ayni "bulunamadi -> 404" kurali. Kisi ve gorusme, tedarikci OLMADAN VAR
 * OLAMAZ (`ON DELETE CASCADE`).
 *
 * ============================================================================
 * ⚠️ BU MODUL HICBIR IS MODULUNU IMPORT ETMEZ (ADR-0040 §4)
 * ============================================================================
 * `ContactDirectory` / `CompanyDirectory` / `ProjectDirectory` gibi hicbir
 * cross-modul bagimlilik YOKTUR ve bu, ADR-0039'dan (Stok) daha GUCLU bir
 * ifadedir: orada hedef sema MEVCUT DEGILDI, burada `inventory` CANLI ve
 * ROADMAP §3.6 kenari acikca sayiyor (_"Tedarikci → Stok"_) — yine de
 * eklenmiyor.
 *
 * Gerekce §4.1'de uc maddede yazili; ozeti: baglantinin bir FIILI yok (katalog,
 * olgu degil), sekil bugune kadarki desenin sekli degil (N:N ara tablosu) ve
 * gercek talep 8. modulden gelecek.
 *
 * ⚠️ O gun `inventory.public.ts`i YAZAN modul STOK olacaktir (ADR-0039 §9.1) —
 * talip degil SAHIP yazar.
 *
 * ============================================================================
 * ⚠️ YAPISAL BIR KATKI URETEN HICBIR METOT YOKTUR (§3)
 * ============================================================================
 * `summarizePeriod` / `findUpcoming` / `findLowStock` gibi bir "durum ozeti"
 * metodu BURADA ARANMASIN: bu modulun yapisal katkicisi YOKTUR ve bu, ADR-0036'nin
 * yeniden gozden gecirme esigine (yapisal kaynak 6) DOKUNMAMA KARARIDIR.
 *
 * Uc aday degerlendirildi ve ucu de reddedildi (§3.2): "tedarikci performansi"
 * (turetecek veri yok — siparis/teslimat kapsam disi), "durgun tedarikci"
 * (turetilebilir ama HABER DEGIL), "odeme vadesi yaklasan" (serbest metinden
 * vade CIKARILAMAZ).
 */
export interface SupplierDependencies {
  readonly repository: SupplierRepository;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik EMBEDDING payi — tedarikci ya da kisi payi DEGIL. */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA gorusme. */
  readonly reindexBatchSize: number;
}

export class SupplierUseCases {
  constructor(private readonly deps: SupplierDependencies) {}

  // ==========================================================================
  // Tedarikci
  // ==========================================================================

  /**
   * Tedarikci olusturur.
   *
   * ⚠️ ORAN SINIRI PAYI ODENMEZ ve bu dogrudur: bir tedarikci kaydi HICBIR
   * embedding cagrisi uretmez (anlamsal yuzey GORUSME GUNLUGUDUR). Kosulsuz
   * bir sayac, kotasini "kac tedarikci actim" diye sayan bir kullaniciya
   * YANLIS BILGI verirdi ve bu bilgi SESSIZ kalirdi.
   */
  async createSupplier(input: {
    tenantId: string;
    userId: string;
    fields: SupplierFields;
  }): Promise<SupplierState> {
    // Entity ONCE kurulur: ad/odeme kosullari dogrulamasi bir veritabani
    // sorgusu ACMADAN once patlar.
    const supplier = Supplier.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveSupplier(supplier),
    );

    return supplier.toState();
  }

  async listSuppliers(input: {
    limit: number;
    offset: number;
    search: string | null;
  }): Promise<ListPage<SupplierState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listSuppliers(input),
    );

    return { items: page.items.map((supplier) => supplier.toState()), total: page.total };
  }

  async getSupplier(id: string): Promise<SupplierState> {
    const supplier = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findSupplierById(id),
    );

    if (supplier === null) {
      throw new SupplierNotFoundError();
    }

    return supplier.toState();
  }

  /**
   * KISMI guncelleme.
   *
   * Okuma ve yazma AYNI transaction'dadir. ⚠️ Bu bir KILIT DEGILDIR — es
   * zamanli iki `PATCH`te son yazan kazanir (bilinen sinir, YEDINCI kez).
   *
   * ============================================================================
   * ⚠️ AD DEGISTIGINDE VEKTORLER BAYATLAR — VE BURADA OTOMATIK ONARIM YOKTUR
   * ============================================================================
   * Ad BAGLAM BASLIGINA girer (§6) ama `suppliers.suppliers`ta yasar; vektorler
   * `suppliers.interactions`ta. Yani bir yeniden adlandirma, o tedarikcinin
   * TUM gorusmelerinin vektorunu bayatlatir.
   *
   * ⚠️ ADR-0039'DAN AYRILDIGIMIZ YER: Stok'ta ad kalemin KENDI satirindaydi ve
   * `PATCH` vektoru AYNI ISLEMDE yeniliyordu ("bayatlama penceresi yok").
   * Burada yenilemek, tek bir `PATCH` istegini N embedding cagrisina cevirirdi
   * — 200 gorusmesi olan bir tedarikcinin adini duzeltmek 200 cagri demektir ve
   * oran siniri onu ORTASINDA keserdi (yarisi yeni, yarisi eski baslikli bir
   * vektor kumesi: en kotu hal).
   *
   * Bu yuzden onarim ACIK ve BUTCELIDIR: `POST /suppliers/reindex`
   * `{ supplierId }` ile cagrilir. Cevap `staleAfterRename` bayragini tasir ki
   * arayuz bunu KULLANICIYA SOYLEYEBILSIN — sessizce bayat birakmak, "arama
   * neden bulmuyor" sorusunu cevapsiz birakirdi.
   */
  async updateSupplier(input: {
    id: string;
    changes: SupplierPatch;
  }): Promise<SupplierUpdateResult> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const before = await this.deps.repository.findSupplierById(input.id);

      if (before === null) {
        throw new SupplierNotFoundError();
      }

      const updated = before.update(input.changes, this.deps.clock.now());
      await this.deps.repository.saveSupplier(updated);

      return {
        supplier: updated.toState(),
        // ⚠️ Karsilastirma NORMALIZE EDILMIS degerler uzerinde: `"  Acme "`
        // gonderen bir istek adi DEGISTIRMEZ ve gereksiz bir onarim uyarisi
        // uretmemelidir.
        staleAfterRename: updated.toState().name !== before.toState().name,
      };
    });
  }

  /**
   * SERT silme — kisiler ve gorusmeler `ON DELETE CASCADE` ile birlikte gider.
   *
   * ⚠️ CASCADE BURADA BIR KVKK GIRDISIDIR (§1.3): vektor `interactions`
   * satirinin KENDISINDE yasadigi icin silinen bir tedarikci AI'IN
   * HAFIZASINDAN DA silinir. Gorusmeler `knowledge.notes`a yazilsaydi bu
   * cascade YAZILAMAZDI (ADR-0031 §4.1'in ayni kaniti, YEDINCI kez).
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR; `supplier:delete`in ayri bir
   * izin olmasinin ve `member`a VERILMEMESININ sebebi budur.
   */
  async deleteSupplier(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteSupplierById(id),
    );

    if (deleted === 0) {
      throw new SupplierNotFoundError();
    }
  }

  // ==========================================================================
  // Kisi
  // ==========================================================================

  async createContact(input: {
    tenantId: string;
    supplierId: string;
    fields: SupplierContactFields;
  }): Promise<SupplierContactState> {
    // ⚠️ VARLIK KONTROLU ZORUNLU ve FK YETMEZ: FK ihlali ham bir PostgreSQL
    // hatasi uretir ve kullanici 404 yerine 500 alirdi. Kontrol ile yazma AYNI
    // transaction'da — arada silinen bir tedarikcide FK yine son sozu soyler.
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#requireSupplier(input.supplierId);
    });

    const contact = SupplierContact.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.saveContact(contact),
    );

    return contact.toState();
  }

  async listContacts(supplierId: string): Promise<SupplierContactState[]> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#requireSupplier(supplierId);
      const contacts = await this.deps.repository.listContactsBySupplier(supplierId);
      return contacts.map((contact) => contact.toState());
    });
  }

  async updateContact(input: {
    id: string;
    changes: SupplierContactPatch;
  }): Promise<SupplierContactState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const before = await this.deps.repository.findContactById(input.id);

      if (before === null) {
        throw new SupplierContactNotFoundError();
      }

      const updated = before.update(input.changes, this.deps.clock.now());
      await this.deps.repository.saveContact(updated);
      return updated.toState();
    });
  }

  /**
   * Kisiyi siler.
   *
   * ⚠️ GORUSME KAYITLARI SILINMEZ: `contact_id` `ON DELETE SET NULL` tasir
   * (§1.3). Ayrilan bir satin alma sorumlusunun silinmesi, o tedarikciyle
   * ilgili TUM kurumsal hafizayi goturseydi hata SESSIZ olurdu.
   */
  async deleteContact(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteContactById(id),
    );

    if (deleted === 0) {
      throw new SupplierContactNotFoundError();
    }
  }

  // ==========================================================================
  // Gorusme gunlugu
  // ==========================================================================

  /**
   * Gorusme kaydeder ve gomer.
   *
   * ⚠️ GUNCELLEME/SILME YOLU YOKTUR (ekleme-yalniz, §1). Bir gunluk kaydi
   * duzeltilmez; yanlissa yenisi yazilir.
   *
   * ============================================================================
   * ⚠️ AG CAGRISI TRANSACTION'IN DISINDA — uc gerekce, ALTINCI kez
   * ============================================================================
   * 1. Pahali cagrilar transaction DISINDA kalir: bir OpenAI cagrisi boyunca
   *    havuzdan baglanti tutmak, yuk altinda havuzu tuketir.
   * 2. `reindex` ucunun VAR OLMASI zaten iki asamali akisi ONGORUR: is listesi
   *    "vektoru olmayan" satirlardir. Tek transaction olsaydi bu durum HIC
   *    OLUSAMAZDI ve onarim ucunun isi kalmazdi.
   * 3. Gorusmenin KENDISI birincil veridir; aranabilirligi ikincildir.
   *    Embedding cokerse GORUSME KAYBOLMAMALIDIR.
   *
   * ⚠️ BEDELI ACIKCA: T1 ile T2 arasinda kisa bir pencere vardir; embedding
   * cokerse ortaya VEKTORU OLMAYAN bir kayit cikar. Hata YUZEYE CIKAR (502,
   * `DisclosableProblem` ile GOVDESI ACIK) ve gorusme SILINMEZ.
   */
  async createInteraction(input: {
    tenantId: string;
    userId: string;
    supplierId: string;
    contactId: string | null;
    occurredOn: string;
    body: string;
  }): Promise<SupplierInteractionState> {
    // Entity ONCE kurulur: tarih ve uzunluk dogrulamasi (SESSIZ KIRPMA YOK,
    // §2.2) bir veritabani sorgusu ACMADAN once patlar.
    const interaction = SupplierInteraction.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      supplierId: input.supplierId,
      contactId: input.contactId,
      authorUserId: input.userId,
      occurredOn: input.occurredOn,
      body: input.body,
      now: this.deps.clock.now(),
    });

    const state = interaction.toState();

    // Baslik icin ad da AYNI okumada alinir: iki ayri sorgu acmanin sebebi
    // olmazdi ve `#requireSupplier` zaten entity'yi getiriyor.
    const supplierName = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const supplier = await this.#requireSupplier(input.supplierId);
        // ⚠️ Kisi, BAGLI OLDUGU TEDARIKCININ kisisi olmak ZORUNDA. Yalnizca
        // "var mi" diye bakmak, baska bir tedarikcinin kisisini bu gorusmeye
        // baglamaya izin verirdi — sema ici bir FK bunu YAKALAMAZ.
        await this.#assertContactBelongsToSupplier(input.contactId, input.supplierId);
        return supplier.toState().name;
      },
    );

    // --- T0: oran siniri — HER gorusme bir embedding uretir ------------------
    // ⚠️ Randevu/Stok'tan farkli olarak bu KOSULSUZDUR: orada not OPSIYONELDI
    // ("notsuz randevu cok yaygin"), burada gorusme metni ZORUNLUDUR. Yani her
    // yazma bir cagri uretir ve her yazma pay oder — sayac ile maliyet
    // arasindaki oran SABIT.
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    // --- T1: gorusme --------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.insertInteraction(interaction),
    );

    // --- Ag + T2: vektor ----------------------------------------------------
    await this.#embedInteraction({
      id: state.id,
      occurredOn: state.occurredOn,
      body: state.body,
      supplierName,
    });

    return state;
  }

  async listInteractions(input: {
    limit: number;
    offset: number;
    supplierId: string | null;
  }): Promise<ListPage<SupplierInteractionState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listInteractions(input),
    );

    return { items: page.items.map((row) => row.toState()), total: page.total };
  }

  /**
   * Vektorleri onarir (ADR-0040 §6).
   *
   * ============================================================================
   * ⚠️ BU UCUN IKI ISI VAR — VE IKINCISI STOK'TA YOKTU
   * ============================================================================
   *   1. VEKTORSUZ gorusmeleri gomer (`WHERE embedding IS NULL`) — saglayici
   *      cokmesinden kalan kayitlar.
   *   2. ⚠️ BAYAT BASLIKLI vektorleri tazeler: bir tedarikci yeniden
   *      adlandirildiginda TUM gorusmelerinin basligi eskir. Bu, `supplierId`
   *      verilerek cagrilir.
   *
   * ADR-0039'da ikinci is YOKTU (ad kalemin ayni satirindaydi, `PATCH` vektoru
   * ayni islemde yeniliyordu). Burada ad AYRI SATIRDA yasar — CRM / Projeler /
   * Randevu ile ayni sinif.
   *
   * ⚠️ `supplierId` verilmezse YALNIZCA 1. is yapilir. Ikisini birlestirmek
   * ("her cagride her seyi yenile") tek bir istekle SINIRSIZ embedding cagrisi
   * demek olurdu; `reindexBatchSize` asil frendir ve oran siniri yazma yoluyla
   * AYNI kovayi paylasir (ADR-0029'un gerekcesi, ALTINCI kez: ayri bir kova,
   * onarimi BUTCESIZ BIR YAN KAPIYA cevirirdi).
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
    supplierId: string | null;
  }): Promise<{ repaired: number; failed: number }> {
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      if (input.supplierId === null) {
        return this.deps.repository.findUnindexedInteractions(this.deps.reindexBatchSize);
      }

      // Ad cozulebilsin diye once tedarikci dogrulanir: olmayan bir id icin
      // sessizce "0 onarildi" donmek, kullanicinin yanlis id yazdigini
      // ogrenmesini engellerdi.
      await this.#requireSupplier(input.supplierId);
      return this.deps.repository.findInteractionsBySupplier({
        supplierId: input.supplierId,
        limit: this.deps.reindexBatchSize,
      });
    });

    // Adlar TEK TOPLU sorguyla cozulur; satir basina cagri N+1 olurdu.
    const names = await this.#resolveSupplierNames(pending);

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her gorusme AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        // Toplu bir transaction, tek bir bozuk kayit yuzunden onarilan her seyi
        // geri alirdi.
        await this.#embedInteraction({
          id: item.id,
          occurredOn: item.occurredOn,
          body: item.body,
          supplierName: names.get(item.supplierId) ?? null,
        });
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  // ==========================================================================
  // Yardimcilar
  // ==========================================================================

  /**
   * T0 — pahali is BASLAMADAN once payi oder, gerekirse reddeder.
   *
   * ⚠️ CAGRILDIGI YERLER SECICIDIR: yalnizca GERCEKTEN embedding uretilecek
   * yollarda (gorusme yazma ve `reindex`). Tedarikci olusturmak, kisi eklemek
   * ve bir tedarikciyi yeniden adlandirmak paydan DUSMEZ — hicbiri saglayiciya
   * gitmez.
   */
  async #enforceEmbeddingBudget(tenantId: string, userId: string): Promise<void> {
    await enforceRateLimit(this.deps, {
      tenantId,
      userId,
      action: SUPPLIERS_EMBEDDING_ACTION,
      limit: this.deps.rateLimit,
    });
  }

  /** Baglam basligini kurar, gomer ve vektoru YAZAR. */
  async #embedInteraction(input: {
    id: string;
    occurredOn: string;
    body: string;
    supplierName: string | null;
  }): Promise<void> {
    const content = withSupplierHeader({
      occurredOn: input.occurredOn,
      supplierName: input.supplierName,
      body: input.body,
    });

    const embedding = await this.#embed(content);
    // Boyut SINIRDA dogrulanir: yanlis yapilandirilmis bir model VERI
    // YAZILMADAN yakalanir.
    assertEmbeddingDimensions(embedding);

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.setInteractionEmbedding({ id: input.id, embedding }),
    );
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  /** Tedarikci VAR mi — yoksa 404. Cagiran zaten transaction icindedir. */
  async #requireSupplier(supplierId: string): Promise<Supplier> {
    const supplier = await this.deps.repository.findSupplierById(supplierId);

    if (supplier === null) {
      throw new SupplierNotFoundError();
    }

    return supplier;
  }

  /**
   * Kisi, verilen tedarikcinin kisisi mi (§1.3).
   *
   * ⚠️ "Yok", "baska tenant'in" ve "BASKA BIR TEDARIKCININ kisisi" AYNI hatayi
   * verir. Ucuncusu ayirt edilseydi, baska bir tedarikcide o id'nin VAR OLDUGU
   * sizardi.
   *
   * `null` gecerlidir ve kontrol edilmez: bir gorusme bir kisiye bagli olmak
   * ZORUNDA degildir (santral, genel e-posta, ilk temas).
   */
  async #assertContactBelongsToSupplier(
    contactId: string | null,
    supplierId: string,
  ): Promise<void> {
    if (contactId === null) {
      return;
    }

    const contact = await this.deps.repository.findContactById(contactId);

    // ⚠️ `?.` ile TEK IFADE: "kisi yok" ile "baska tedarikcinin kisisi" AYNI
    // dala duser ve ayirt EDILMEZ (gerekce metot yorumunda).
    if (contact?.toState().supplierId !== supplierId) {
      throw new SupplierContactNotFoundError();
    }
  }

  /** Onarilacak satirlarin tedarikci adlari — TEK toplu sorgu. */
  async #resolveSupplierNames(
    pending: readonly UnindexedInteraction[],
  ): Promise<Map<string, string>> {
    if (pending.length === 0) {
      return new Map();
    }

    const ids = [...new Set(pending.map((item) => item.supplierId))];

    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findSupplierNames(ids),
    );
  }
}

/**
 * `PATCH /suppliers/:id` cevabi.
 *
 * ⚠️ `staleAfterRename` bir SUSLEME DEGILDIR: ad degistiginde o tedarikcinin
 * TUM gorusme vektorleri bayatlar (§6) ve bunu kullaniciya SOYLEMEZSEK "arama
 * neden bulmuyor" sorusu cevapsiz kalir. Bayrak, arayuzun `POST
 * /suppliers/reindex` onerisini gostermesi icindir.
 */
export interface SupplierUpdateResult {
  readonly supplier: SupplierState;
  readonly staleAfterRename: boolean;
}
