import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type ContactDirectory } from '../../crm/crm.public';
import { LoyaltyAccount } from '../domain/loyalty-account.entity';
import {
  InsufficientPointsError,
  LoyaltyAccountExistsError,
  LoyaltyAccountNotFoundError,
  LoyaltyContactNotFoundError,
} from '../domain/loyalty.error';
import { PointEntry, type PointEntryState } from '../domain/point-entry.entity';
import {
  type ListPage,
  type LoyaltyAccountRecord,
  type LoyaltyRepository,
} from './loyalty.repository.port';

/**
 * Ekrana giden hesap satiri.
 *
 * ⚠️ `contactName` KOLONDA SAKLANMAZ, her okumada cozulur (ADR-0051 §6.1).
 * Saklansaydi CRM'de yapilan bir yeniden adlandirma burada BAYATLARDI ve
 * musteri kimliginin IKINCI BIR DOGRULUK KAYNAGI olusurdu.
 *
 * ⚠️ `null` GELEBILIR ve bu modulde bedeli DIGERLERINDEN AGIRDIR: adi
 * cozulemeyen bir sadakat hesabi KULLANILAMAZ — kimin oldugu bilinmeyen bir
 * bakiyedir. Ekran satiri LISTEDEN DUSURMEZ (bakiye gercek, hak gercek) ama
 * ACIKCA isaretler; ⚠️ "silinmis" DEMEZ — o kelime silinmis bir kaydin BIR
 * ZAMANLAR VAR OLDUGUNU sizdirirdi (ADR-0035'in yazili karari).
 */
export interface LoyaltyAccountRow {
  readonly id: string;
  readonly crmContactId: string;
  readonly contactName: string | null;
  readonly balance: number;
  readonly entryCount: number;
  readonly lastEntryAt: Date | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export interface LoyaltySummary {
  readonly outstandingPoints: number;
  readonly accountCount: number;
  readonly earnedInWindow: number;
  readonly spentInWindow: number;
  /** ⚠️ SUNUCUDAN doner — arayuz "son 30 gunde" metnini KENDI yazmaz. */
  readonly windowDays: number;
}

export interface LoyaltyUseCasesDeps {
  readonly repository: LoyaltyRepository;
  readonly contactDirectory: ContactDirectory;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/** Duvarin "son N gun" penceresi — sunucunun kanonik degeri. */
export const LOYALTY_SUMMARY_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export class LoyaltyUseCases {
  constructor(private readonly deps: LoyaltyUseCasesDeps) {}

  // ==========================================================================
  // Hesap
  // ==========================================================================

  /**
   * Hesap acar (ADR-0051 §6.1, §6.2).
   *
   * ============================================================================
   * ⚠️ HESAP ACIKCA ACILIR — ILK PUANDA OTOMATIK DEGIL
   * ============================================================================
   * "Upsert" kolayligi degerlendirildi ve reddedildi: yanlis yazilmis bir
   * `crmContactId` HAYALET BIR HESAP yaratirdi ve `POST .../entries` sessizce
   * IKINCI BIR KAYNAK olustururdu. Stok'un "once kalem, sonra hareket" deseni.
   *
   * ============================================================================
   * ⚠️ KISI DOGRULAMASI KOSULSUZDUR — Projeler'den AYRILDIGIMIZ NOKTA
   * ============================================================================
   * `ProjectUseCases.#assertCompanyVisible` `null` gecerse KONTROL ETMEZ (ic
   * proje mesrudur). Burada isaretci ZORUNLUDUR (§6.1), yani kontrol her
   * zaman calisir ve ⚠️ `contact:read` FIILEN BIR ON KOSUL olur.
   *
   * ⚠️ Dizin uc durumu AYIRT ETTIRMEZ (silinmis · baska tenant'in · izin yok)
   * ve bu KASITLIDIR: cagiran reddin sebebinden o kisinin VAR OLDUGUNU
   * cikaramaz. Bedeli kayitli: `contact:read` tasimayan bir kullanici icin
   * mesaj YANILTICIDIR — bugun tetiklenemez, dort rol de o izni tasir.
   */
  async createAccount(input: {
    tenantId: string;
    userId: string;
    role: string;
    crmContactId: string;
  }): Promise<LoyaltyAccountRow> {
    await this.#assertContactVisible(input.crmContactId, input.role);

    const record = await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      // ⚠️ ILK KATMAN: guzel bir hata mesaji icin okunur — 409'un govdesi
      // MEVCUT HESABIN ID'SINI tasir ve arayuz kullaniciyi o hesaba goturur.
      // ⚠️ IKINCI KATMAN veritabanindadir: iki es zamanli istekte bu okuma
      // ikisinde de "yok" derdi; `accounts_tenant_contact_unique` kisiti
      // ikincisini reddeder ve repository onu AYNI hataya cevirir.
      const existing = await this.deps.repository.findAccountByContactId(input.crmContactId);
      if (existing !== null) {
        throw new LoyaltyAccountExistsError(existing.account.toState().id);
      }

      const account = LoyaltyAccount.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        createdByUserId: input.userId,
        crmContactId: input.crmContactId,
        now: this.deps.clock.now(),
      });

      return this.deps.repository.insertAccount(account);
    });

    return this.#withContactName(record, input.role);
  }

  async getAccount(input: { id: string; role: string }): Promise<LoyaltyAccountRow> {
    const record = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findAccountById(input.id),
    );

    if (record === null) {
      throw new LoyaltyAccountNotFoundError();
    }

    return this.#withContactName(record, input.role);
  }

  async listAccounts(input: {
    limit: number;
    offset: number;
    role: string;
  }): Promise<ListPage<LoyaltyAccountRow>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listAccounts({ limit: input.limit, offset: input.offset }),
    );

    // ⚠️ TEK TOPLU CAGRI — sayfanin id'leri toplanir (N+1 YOK). `findNames`in
    // sozlesme sekli tam olarak bunun icin `ids: readonly string[]` alir.
    const names = await this.deps.contactDirectory.findNames({
      ids: [...new Set(page.items.map((record) => record.account.toState().crmContactId))],
      role: input.role,
    });

    return {
      total: page.total,
      items: page.items.map((record) => toRow(record, names)),
    };
  }

  /**
   * Hesabi siler — ⚠️ defter `ON DELETE CASCADE` ile BIRLIKTE gider.
   *
   * ⚠️ Bu, tek bir satiri silmekten TAMAMEN FARKLI bir islemdir (§2.1): bir
   * satiri silmek bakiyeyi SESSIZCE YENIDEN YAZAR (yalan uretir), hesabi
   * silmek bakiyeyi yeniden yazmaz — YOK EDER. Hicbir sayiyi yalanlamaz.
   *
   * ⚠️ Ve silme yolunun VAR OLMASI bir kolaylik degil bir YUKUMLULUKTUR: hesap
   * BIR KISIYE baglidir (KVKK m.7/m.11). `RESTRICT` secilseydi hareketi olan
   * her hesap SILINEMEZ olurdu.
   *
   * ⚠️ Acikta kalan sinir kayitli: hesap silinince defter de gider ve "kim
   * sildi" SORULAMAZ — `platform.audit_log` bugun ALAN ADI saklar, bir SILME
   * OLAYI degil (§2.4).
   */
  async deleteAccount(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteAccountById(id),
    );

    if (deleted === 0) {
      throw new LoyaltyAccountNotFoundError();
    }
  }

  // ==========================================================================
  // Defter
  // ==========================================================================

  /**
   * ⚠️ PUAN HAREKETI YAZAR — VE BU, MODULUN TEK KRITIK KOD YOLUDUR.
   *
   * ============================================================================
   * ⚠️ DORT ADIM, TEK TRANSACTION, KILIT ALTINDA (ADR-0051 §4.3)
   * ============================================================================
   *   1. hesap satirini KILITLE          (`SELECT ... FOR UPDATE`)
   *   2. bakiyeyi DEFTERDEN TURET        (`SUM`)
   *   3. `spend` ise: `points <= bakiye` (degilse 422, HICBIR SATIR YAZILMAZ)
   *   4. satiri YAZ                      (`INSERT`)
   *
   * ⚠️ 2 ile 4 ARASINDA BASKA BIR ISTEK GIREMEZ — cunku o istek de 1. adimda
   * ayni satiri kilitlemek zorundadir ve BEKLER. Kilit olmasaydi iki es zamanli
   * harcama 500 puanlik bir bakiyeden 600 puan cikarabilirdi ve
   * ⚠️ **bunu engelleyecek BASKA HICBIR SEY YOKTUR** (§4.4): `CHECK` satirlar
   * arasi bir kosulu goremez.
   *
   * ⚠️ `earn` DE KILIDI ALIR. Aritmetik olarak gerekmez (bakiyeyi yalnizca
   * buyutur, yani es zamanli bir `spend`in kontrolu MUHAFAZAKAR kalir), ama
   * ADR-0039'un yazili dersi geregi TEK YOL tutulur: _"bir yol atlarsa kilit
   * DEKORATIF hale gelir."_ Iki yollu bir tasarim, ucuncu bir yol eklendiginde
   * hangisinin kilit gerektirdigini HATIRLAMAYA guvenirdi.
   *
   * ⚠️ ISTEMCI HESAPLAMAZ (§4.2): kullanici KAC PUAN harcanacagini yazar,
   * yeterli olup olmadigina SUNUCU karar verir. Istemciye hesaplatmak,
   * ADR-0039'un fiziksel sayim tuzagini geri getirirdi — istemcinin okudugu
   * bakiye ile istegin vardigi an arasinda bir satir girerse kontrol YANLIS
   * olur ve hata SESSIZDIR.
   *
   * ⚠️ KILIT ALTINDA AG CAGRISI YOKTUR ve bu modulde KOSULSUZ dogrudur:
   * embedding yok, LLM yok, hicbir saglayici cagrisi yok.
   */
  async recordEntry(input: {
    tenantId: string;
    userId: string;
    accountId: string;
    direction: string;
    points: number;
    note: string | null;
    occurredAt: Date | null;
  }): Promise<{ entry: PointEntryState; balance: number }> {
    const now = this.deps.clock.now();

    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      // 1. KILIT — hesabin varligi da burada dogrulanir, yani EK BIR SORGU
      //    MALIYETI YOKTUR (var olan `SELECT`e `FOR UPDATE` eklenmistir).
      const account = await this.deps.repository.lockAccountById(input.accountId);
      if (account === null) {
        throw new LoyaltyAccountNotFoundError();
      }

      // ⚠️ Entity KILITTEN SONRA kuruluyor. Once kurulsaydi dogrulama hatalari
      // (gelecege tarih, gecersiz yon) BOSU BOSUNA bir satir kilidi alirdi ve
      // ayni hesaba yazan herkesi bekletirdi.
      const entry = PointEntry.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        accountId: input.accountId,
        createdByUserId: input.userId,
        direction: input.direction,
        points: input.points,
        note: input.note,
        occurredAt: input.occurredAt ?? now,
        now,
      });

      // 2. TURET
      const balance = await this.deps.repository.deriveBalance(input.accountId);
      const state = entry.toState();

      // 3. ⚠️ TEK DEGISMEZ KONTROLU — bakiye negatife DUSEMEZ.
      //    ⚠️ Negatif stok Stok'ta SERBESTTI (mal fiziksel olarak eksik
      //    cikabilir); negatif puan GERCEK DEGILDIR — verilmemis bir hakki
      //    harcamak demektir ve isletme onu KARSILAMAK ZORUNDA KALIRDI.
      if (state.direction === 'spend' && state.points > balance) {
        throw new InsufficientPointsError(state.points, balance);
      }

      // 4. YAZ
      await this.deps.repository.insertEntry(entry);

      // ⚠️ Yeni bakiye YENIDEN TURETILMEZ: `balance + signedPoints()` ayni
      // sonucu verir ve kilit hala bizdedir, yani arada bir satir GIREMEZ.
      // Fazladan bir `SUM` sorgusu, defter buyudukce olculebilir bir maliyettir.
      return { entry: state, balance: balance + entry.signedPoints() };
    });
  }

  async listEntries(input: {
    accountId: string;
    limit: number;
    offset: number;
  }): Promise<ListPage<PointEntryState>> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      // ⚠️ Hesabin VARLIGI once dogrulanir: yoksa bos bir liste donmek, olmayan
      // bir hesabi VAR GIBI gosterirdi (404 ile 200-bos arasindaki fark).
      const account = await this.deps.repository.findAccountById(input.accountId);
      if (account === null) {
        throw new LoyaltyAccountNotFoundError();
      }

      return this.deps.repository.listEntries(input);
    });
  }

  /**
   * Duvarin rakamlari (ADR-0051 §9.1).
   *
   * ⚠️ Kahraman rakam PROJEDE ILK KEZ ANLAMLI BIR TOPLAMDIR: ADR-0034'un para
   * birimi kurali ve ADR-0039'un birim kurali burada TETIKLENMEZ — puanin para
   * birimi yoktur ve tek bir birim vardir. ⚠️ Yine de bir PARA rakami degildir.
   */
  async getSummary(): Promise<LoyaltySummary> {
    const since = new Date(this.deps.clock.now().getTime() - LOYALTY_SUMMARY_WINDOW_DAYS * DAY_MS);

    const row = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.summarize(since),
    );

    return { ...row, windowDays: LOYALTY_SUMMARY_WINDOW_DAYS };
  }

  // ==========================================================================
  // Yardimcilar
  // ==========================================================================

  async #assertContactVisible(crmContactId: string, role: string): Promise<void> {
    const names = await this.deps.contactDirectory.findNames({ ids: [crmContactId], role });
    if (!names.has(crmContactId)) {
      throw new LoyaltyContactNotFoundError();
    }
  }

  async #withContactName(record: LoyaltyAccountRecord, role: string): Promise<LoyaltyAccountRow> {
    const names = await this.deps.contactDirectory.findNames({
      ids: [record.account.toState().crmContactId],
      role,
    });
    return toRow(record, names);
  }
}

function toRow(
  record: LoyaltyAccountRecord,
  names: ReadonlyMap<string, string>,
): LoyaltyAccountRow {
  const state = record.account.toState();

  return {
    id: state.id,
    crmContactId: state.crmContactId,
    // ⚠️ Bulunamayan ad `null` olur ve satir LISTEDEN DUSMEZ: sarkan bir
    // isaretci (silinmis kisi) tolere edilen normal bir durumdur ve
    // `contact:read` yoklugu da oyle. ⚠️ Dusseydi bakiye GORUNMEZ olurdu ve
    // duvarin toplami listeyle TUTMAZDI.
    contactName: names.get(state.crmContactId) ?? null,
    balance: record.balance,
    entryCount: record.entryCount,
    lastEntryAt: record.lastEntryAt,
    createdByUserId: state.createdByUserId,
    createdAt: state.createdAt,
  };
}
