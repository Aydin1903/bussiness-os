import { type LoyaltyAccount } from '../domain/loyalty-account.entity';
import { type PointEntry, type PointEntryState } from '../domain/point-entry.entity';

export const LOYALTY_REPOSITORY = Symbol('LOYALTY_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Bir hesap + ⚠️ SUNUCUDA TURETILMIS bakiye ve son hareket ani.
 *
 * ============================================================================
 * ⚠️ `balance` NEDEN `LoyaltyAccountState`IN ICINDE DEGIL
 * ============================================================================
 * Cunku SAKLANAN bir alan degil, her okumada TURETILEN bir degerdir —
 * ADR-0047'nin `resultGap` icin verdigi ayni karar (`companyName` ile ayni
 * sinif). `AccountState`e koymak, entity'nin onu TASIDIGINI ve
 * `LoyaltyAccount.create` ile uretilebilecegini IMA ederdi.
 *
 * ⚠️ `lastEntryAt` de turetilmistir (`max(occurred_at)`) ve bir kolon DEGILDIR:
 * `last_activity_at` projede BES kez reddedildi — bir tazeleme yolu
 * unutuldugunda hata SESSIZDIR.
 */
export interface LoyaltyAccountRecord {
  readonly account: LoyaltyAccount;
  readonly balance: number;
  readonly entryCount: number;
  readonly lastEntryAt: Date | null;
}

/** Duvarin rakamlari (ADR-0051 §9.1). */
export interface LoyaltySummaryRow {
  /**
   * ⚠️ PROJEDE ILK KEZ ANLAMLI BIR TOPLAM.
   *
   * ADR-0034'un para birimi kurali ve ADR-0039'un birim kurali burada
   * TETIKLENMEZ: puanin para birimi YOKTUR ve tek bir birim vardir ("puan").
   * ⚠️ Yine de bir PARA rakami degildir — puanin karsiligi girilmedigi surece
   * "12.400 puan" bir TL degeri IFADE ETMEZ (§10).
   */
  readonly outstandingPoints: number;
  readonly accountCount: number;
  readonly earnedInWindow: number;
  readonly spentInWindow: number;
}

export interface LoyaltyRepository {
  // ==========================================================================
  // Hesap
  // ==========================================================================

  insertAccount(account: LoyaltyAccount): Promise<LoyaltyAccountRecord>;

  /**
   * ⚠️ 409'un girdisi — `UNIQUE (tenant_id, crm_contact_id)`.
   *
   * Kontrol EN AZ IKI KATMANLIDIR ve bu bilinclidir: burada okunur (guzel bir
   * hata mesaji icin, mevcut hesabin ID'SIYLE birlikte) ve YARIS DURUMUNDA
   * veritabani kisiti tarafindan da yakalanir — `insertAccount` bir tekillik
   * ihlalini AYNI hataya cevirir. ⚠️ Yalnizca okumaya guvenmek, iki es zamanli
   * istekte IKI HESAP acilmasina izin verirdi.
   */
  findAccountByContactId(crmContactId: string): Promise<LoyaltyAccountRecord | null>;

  findAccountById(id: string): Promise<LoyaltyAccountRecord | null>;

  /**
   * ⚠️ SATIR KILIDI — `SELECT ... FOR UPDATE` (ADR-0051 §4.3).
   *
   * ============================================================================
   * ⚠️ BU KILIT, STOK'UNKINDEN DAHA AGIR BIR IS YAPIYOR
   * ============================================================================
   * `inventory`de kilit bir SAYIM DELTASINI dogru hesaplamak icindi ve negatif
   * stok SERBESTTI. Burada kilit BIR DEGISMEZI koruyor: bakiye negatife
   * DUSEMEZ. Kilit atlanirsa iki es zamanli harcama 500 puanlik bir bakiyeden
   * 600 puan cikarabilir.
   *
   * ⚠️ Ve bu degismezin BASKA HICBIR GARANTISI YOKTUR (§4.4): `CHECK` satirlar
   * arasi bir kosulu goremez, FK ilgisizdir, trigger ise kilidi veritabanina
   * GIZLERDI. Yani bu metot, `balance >= 0` kuralinin TEK dayanagidir.
   *
   * ⚠️ HAREKET YAZAN HER YOL BURADAN GECER — `earn` dahil. Aritmetik olarak
   * `earn` kilide ihtiyac duymaz (bakiyeyi yalnizca buyutur), ama ADR-0039'un
   * yazili dersi geregi tek yol tutulur: _"bir yol atlarsa kilit DEKORATIF
   * hale gelir."_
   *
   * ⚠️ Kilit altinda AG CAGRISI YOKTUR ve bu modulde KOSULSUZ dogrudur:
   * embedding yok, LLM yok, hicbir saglayici cagrisi yok.
   */
  lockAccountById(id: string): Promise<LoyaltyAccount | null>;

  listAccounts(input: { limit: number; offset: number }): Promise<ListPage<LoyaltyAccountRecord>>;

  /**
   * ⚠️ Defter `ON DELETE CASCADE` ile BIRLIKTE gider (ADR-0051 §2.1).
   *
   * ⚠️ Ve burada ADR §2.3'un acik biraktigi soru vardir: `businessos_app`
   * rolune `point_entries` uzerinde `DELETE` VERILMEZ — cascade yine de calisir
   * mi? Beklenen cevap evettir (referans butunlugu tetikleyicileri BASVURULAN
   * TABLONUN SAHIBININ yetkisiyle kosar) ama bu BIR IDDIADIR: bir entegrasyon
   * testi onu gercek bir PostgreSQL'de KANITLAR.
   */
  deleteAccountById(id: string): Promise<number>;

  // ==========================================================================
  // Defter
  // ==========================================================================

  /**
   * ⚠️ BAKIYEYI TURETIR — `balance` kolonu YOKTUR (§4.1).
   *
   * `COALESCE(SUM(CASE WHEN direction = 'earn' THEN points ELSE -points END), 0)`
   *
   * ⚠️ Hicbir hareketi olmayan hesap `0` doner, `null` DEGIL: "hic hareket yok"
   * ile "toplami sifir" AYNI BAKIYE DURUMUDUR.
   */
  deriveBalance(accountId: string): Promise<number>;

  insertEntry(entry: PointEntry): Promise<void>;

  listEntries(input: {
    accountId: string;
    limit: number;
    offset: number;
  }): Promise<ListPage<PointEntryState>>;

  summarize(since: Date): Promise<LoyaltySummaryRow>;
}
