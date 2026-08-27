import { Injectable } from '@nestjs/common';
import { desc, eq, sql, type SQL } from 'drizzle-orm';

import { loyaltyAccounts, loyaltyPointEntries } from '../../../infrastructure/database/schema';
import { isPgError, PG_UNIQUE_VIOLATION } from '../../../infrastructure/database/pg-error';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type ListPage,
  type LoyaltyAccountRecord,
  type LoyaltyRepository,
  type LoyaltySummaryRow,
} from '../application/loyalty.repository.port';
import { LoyaltyAccount } from '../domain/loyalty-account.entity';
import { InvalidPointDirectionError, LoyaltyAccountExistsError } from '../domain/loyalty.error';
import {
  POINT_DIRECTIONS,
  PointEntry,
  type PointDirection,
  type PointEntryState,
} from '../domain/point-entry.entity';

/**
 * ⚠️ BAKIYENIN TEK SQL TANIMI (ADR-0051 §4.1).
 *
 * ============================================================================
 * ⚠️ NEDEN BURADA VE NEDEN TEK
 * ============================================================================
 * Bu ifade UC yerde kullanilir ve UCUNUN DE AYNI SEYI soylemesi zorunludur:
 *
 *   1. `deriveBalance`  -> harcama kontrolunun girdisi (KILIT ALTINDA)
 *   2. `listAccounts`   -> listedeki her satirin bakiyesi
 *   3. `summarize`      -> duvarin "dolasimdaki toplam puan" rakami
 *
 * ⚠️ Ayrisirlarsa ekran bir sey der, kontrol baska bir sey hesaplar ve fark
 * SESSIZ olur — ADR-0047'nin kapanis denetiminde `hasResultGap`/`gapSnapshot`
 * ayrismasinin dogurdugu ayni risk, burada ILK GUNDEN tekillestirilerek
 * kapatiliyor.
 *
 * ⚠️ `COALESCE(..., 0)`: hicbir hareketi olmayan hesap `0` doner, `NULL`
 * DEGIL. "Hic hareket yok" ile "toplami sifir" AYNI BAKIYE DURUMUDUR.
 *
 * ⚠️ `::int` ZORUNLUDUR: PostgreSQL'de `SUM(integer)` `bigint` doner ve `pg`
 * surucusu `bigint`i DIZE olarak verir. Doner tipi `number` diye ISARETLEYIP
 * dize almak, ADR-0047'nin kapanis denetiminin bulduğu `sql<Date | null>`
 * kusurunun BIREBIR AYNI SINIFIDIR — bir tip anotasyonu BIR IDDIADIR, BIR
 * DONUSUM DEGIL. Burada donusum SQL'de ACIKCA yapiliyor.
 */
const BALANCE_SUM = sql<number>`COALESCE(SUM(CASE WHEN ${loyaltyPointEntries.direction} = 'earn' THEN ${loyaltyPointEntries.points} ELSE -${loyaltyPointEntries.points} END), 0)::int`;

const ENTRY_COUNT = sql<number>`count(${loyaltyPointEntries.id})::int`;

/**
 * ⚠️ TURETILMIS — `last_activity_at` kolonu YOKTUR (projede besinci kez).
 *
 * ⚠️ TIP PARAMETRESI `string | null`, `Date | null` DEGIL — VE BU, ADR-0047'NIN
 * KAPANIS DENETIMINDE OLCULMUS BIR KUSURDUR. Drizzle yalnizca TANIMLI
 * KOLONLARI esler; ham bir `max(timestamptz)` ifadesi surucuden NE GELIYORSA o
 * gelir (bir DIZE). `sql<Date>` yazmak yalnizca DERLEYICIYE bir iddiadir ve
 * calisma zamaninda `moment.getTime is not a function` verir.
 *
 * ⚠️ `feedback-satisfaction` bu yuzden COKMUSTU ve birim testleri goremezdi
 * (hepsi gercek `Date` besliyordu). Donusum burada ACIKCA yapiliyor (`toDate`).
 */
const LAST_ENTRY_AT = sql<string | null>`max(${loyaltyPointEntries.occurredAt})`;

const ACCOUNT_COLUMNS = {
  id: loyaltyAccounts.id,
  tenantId: loyaltyAccounts.tenantId,
  crmContactId: loyaltyAccounts.crmContactId,
  createdByUserId: loyaltyAccounts.createdByUserId,
  createdAt: loyaltyAccounts.createdAt,
};

interface AccountRow {
  readonly id: string;
  readonly tenantId: string;
  readonly crmContactId: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

/**
 * `LoyaltyRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0039`).
 * ⚠️ Bu modulde bedeli Stok'taki kadar agirdir: bakiye bir TOPLAMDIR, yani
 * eksik bir filtre "eksik liste" degil YANLIS BIR SAYI uretirdi.
 */
@Injectable()
export class DrizzleLoyaltyRepository implements LoyaltyRepository {
  // ==========================================================================
  // Hesap
  // ==========================================================================

  async insertAccount(account: LoyaltyAccount): Promise<LoyaltyAccountRecord> {
    const { db } = requireTransaction();
    const state = account.toState();

    try {
      await db.insert(loyaltyAccounts).values({
        id: state.id,
        tenantId: state.tenantId,
        crmContactId: state.crmContactId,
        createdByUserId: state.createdByUserId,
        createdAt: state.createdAt,
      });
    } catch (error) {
      // ⚠️ IKINCI KATMAN — yarisi VERITABANI kapatir.
      //
      // Use-case once `findAccountByContactId` ile bakar (guzel bir mesaj ve
      // mevcut id icin), ama iki es zamanli istek o okumada IKISI DE "yok"
      // gorurdu. `accounts_tenant_contact_unique` ikincisini reddeder ve
      // burada AYNI domain hatasina cevrilir.
      //
      // ⚠️ Kisit adi ACIKCA veriliyor: kod tek basina "bir unique ihlali oldu"
      // der; yanlis kisiti yakalayan bir ceviri kullaniciya YANLIS MESAJ
      // gosterirdi (`pg-error.ts`in yazili gerekcesi).
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'accounts_tenant_contact_unique')) {
        // ⚠️ Id `null` GECILIYOR ve bu bir eksiklik degil bir ZORUNLULUKTUR:
        // kisit ihlali transaction'i BASARISIZ HALE getirir ve mevcut satiri
        // okumak icin yeni bir sorgu ACILAMAZ ("current transaction is
        // aborted"). ⚠️ Uydurulmus bir id — ornegin `crmContactId` — kullaniciyi
        // VAR OLMAYAN bir hesaba goturur; bilinmeyeni bilinmeyen birakmak
        // dogrudur.
        throw new LoyaltyAccountExistsError(null);
      }
      throw error;
    }

    // Yeni acilan hesabin defteri BOSTUR; `SUM` yerine sabitler yaziliyor —
    // hem bir sorgu tasarrufu hem de "yeni hesap sifir bakiyelidir" iddiasinin
    // kodda GORUNUR olmasi.
    return { account, balance: 0, entryCount: 0, lastEntryAt: null };
  }

  async findAccountByContactId(crmContactId: string): Promise<LoyaltyAccountRecord | null> {
    return this.#findOne(eq(loyaltyAccounts.crmContactId, crmContactId));
  }

  async findAccountById(id: string): Promise<LoyaltyAccountRecord | null> {
    return this.#findOne(eq(loyaltyAccounts.id, id));
  }

  /**
   * ⚠️ `SELECT ... FOR UPDATE` — projedeki IKINCI satir kilidi (ADR-0051 §4.3).
   *
   * ============================================================================
   * ⚠️ NEDEN AGREGASYON YOK VE OLMAMALI
   * ============================================================================
   * `findAccountById` bakiyeyi de doner (LEFT JOIN + GROUP BY). Bu metot
   * DONMEZ ve donmemelidir: `FOR UPDATE` bir `GROUP BY` ile BIRLIKTE
   * KULLANILAMAZ (PostgreSQL "FOR UPDATE is not allowed with GROUP BY clause"
   * hatasi verir).
   *
   * ⚠️ Ayrim bir zahmet degil, kilidin ISININ dogru anlasilmasidir: kilit
   * HESAP SATIRINI tutar, bakiye ise DEFTERDEN AYRI bir sorguyla turetilir
   * (`deriveBalance`) — ve o sorgu, kilit bizde oldugu icin TUTARLI okur.
   *
   * ⚠️ Kilit YALNIZCA cagiranin transaction'i suresince tutulur ve o
   * transaction `runInCurrentTenantTransaction` icindedir; icinde AG CAGRISI
   * YOKTUR (bu modulde hicbir saglayici cagrisi yok).
   */
  async lockAccountById(id: string): Promise<LoyaltyAccount | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select(ACCOUNT_COLUMNS)
      .from(loyaltyAccounts)
      .where(eq(loyaltyAccounts.id, id))
      .limit(1)
      .for('update');

    const row = rows[0];
    return row === undefined ? null : LoyaltyAccount.fromPersistence(row);
  }

  async listAccounts(input: {
    limit: number;
    offset: number;
  }): Promise<ListPage<LoyaltyAccountRecord>> {
    const { db } = requireTransaction();

    // ⚠️ TEK SORGU, `LEFT JOIN` + `GROUP BY` — hesap basina AYRI bir `SUM`
    // sorgusu (N+1) DEGIL.
    //
    // ⚠️ VE PROJEKSIYONA GOMULU KORELASYONLU ALT SORGU DA DEGIL: ADR-0037'nin
    // kapanis denetimi tam olarak oyle bir alt sorgunun HATA VERMEDIGINI ve
    // HER ZAMAN 0 DONDURDUGUNU buldu (parcasi olan bir belge ekranda
    // "Aranamiyor" gorunuyordu). ⚠️ Burada ayni kusur DAHA TEHLIKELIDIR:
    // sessizce `0` donen bir bakiye musteriye "puaniniz yok" demektir.
    // Bir entegrasyon testi SIFIRDAN FARKLI bir bakiyeyi dogrular.
    //
    // ⚠️ `LEFT`: hic hareketi olmayan hesap da listede GORUNUR.
    const rows = await db
      .select({
        ...ACCOUNT_COLUMNS,
        balance: BALANCE_SUM,
        entryCount: ENTRY_COUNT,
        lastEntryAt: LAST_ENTRY_AT,
      })
      .from(loyaltyAccounts)
      .leftJoin(loyaltyPointEntries, eq(loyaltyPointEntries.accountId, loyaltyAccounts.id))
      .groupBy(loyaltyAccounts.id)
      // ⚠️ `id` TIE-BREAKER: ayni ana dusen iki hesap MESRUDUR ve kararsiz bir
      // siralama, sayfalamada bir kaydin iki kez ya da HIC gorunmesi demektir.
      .orderBy(desc(loyaltyAccounts.createdAt), desc(loyaltyAccounts.id))
      .limit(input.limit)
      .offset(input.offset);

    // ⚠️ Sayac `GROUP BY`siz ve JOIN'siz: hesap sayisi hareket sayisindan
    // BAGIMSIZDIR. JOIN'li bir `count(*)` hareket sayisini sayardi.
    const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(loyaltyAccounts);

    return {
      items: rows.map((row) => toRecord(row)),
      total: counted?.total ?? 0,
    };
  }

  async deleteAccountById(id: string): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ Defter `ON DELETE CASCADE` ile BIRLIKTE gider ve burada ACIK BIR
    // `DELETE FROM point_entries` YOKTUR — bu, ADR-0051 §2.3'un sinanan
    // iddiasidir: `businessos_app` rolune `point_entries` uzerinde `DELETE`
    // VERILMEZ ve cascade yine de calisir (referans butunlugu tetikleyicileri
    // BASVURULAN TABLONUN SAHIBININ yetkisiyle kosar; `FORCE RLS` politikasi
    // ise `app.current_tenant_id` transaction icinde SET oldugu icin gecer).
    //
    // ⚠️ Iddia bir entegrasyon testiyle (`loyalty-schema.integration.spec.ts`)
    // GERCEK BIR PostgreSQL'de kanitlanir.
    const deleted = await db
      .delete(loyaltyAccounts)
      .where(eq(loyaltyAccounts.id, id))
      .returning({ id: loyaltyAccounts.id });

    return deleted.length;
  }

  // ==========================================================================
  // Defter
  // ==========================================================================

  async deriveBalance(accountId: string): Promise<number> {
    const { db } = requireTransaction();

    const [row] = await db
      .select({ balance: BALANCE_SUM })
      .from(loyaltyPointEntries)
      .where(eq(loyaltyPointEntries.accountId, accountId));

    // ⚠️ Hicbir hareket yoksa `SUM` tek satir doner ve `COALESCE` ile `0`dir.
    // Yine de `?? 0` savunmasi var: bu davranisa GUVENMEK yerine ACIKCA
    // yazmak, sessiz bir `undefined`in bakiye yerine gecmesini onler
    // (`deriveQuantity`nin ayni karari).
    return row?.balance ?? 0;
  }

  async insertEntry(entry: PointEntry): Promise<void> {
    const { db } = requireTransaction();
    const state = entry.toState();

    await db.insert(loyaltyPointEntries).values({
      id: state.id,
      tenantId: state.tenantId,
      accountId: state.accountId,
      direction: state.direction,
      points: state.points,
      note: state.note,
      occurredAt: state.occurredAt,
      createdByUserId: state.createdByUserId,
      createdAt: state.createdAt,
    });
  }

  async listEntries(input: {
    accountId: string;
    limit: number;
    offset: number;
  }): Promise<ListPage<PointEntryState>> {
    const { db } = requireTransaction();
    const filter = eq(loyaltyPointEntries.accountId, input.accountId);

    const rows = await db
      .select()
      .from(loyaltyPointEntries)
      .where(filter)
      // ⚠️ AZALAN — defter bir GECMIS akisidir ("en son ne oldu");
      // `inventory.movements` ile ayni sinif. `id` TIE-BREAKER.
      .orderBy(desc(loyaltyPointEntries.occurredAt), desc(loyaltyPointEntries.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(loyaltyPointEntries)
      .where(filter);

    return {
      items: rows.map((row) =>
        PointEntry.fromPersistence({ ...row, direction: toDirection(row.direction) }).toState(),
      ),
      total: counted?.total ?? 0,
    };
  }

  async summarize(since: Date): Promise<LoyaltySummaryRow> {
    const { db } = requireTransaction();

    // ⚠️ Toplama SQL'de yapilir; istemci satirlari TOPLAMAZ.
    const [totals] = await db
      .select({
        outstandingPoints: BALANCE_SUM,
        earnedInWindow: sql<number>`COALESCE(SUM(CASE WHEN ${loyaltyPointEntries.direction} = 'earn' AND ${loyaltyPointEntries.occurredAt} >= ${since} THEN ${loyaltyPointEntries.points} ELSE 0 END), 0)::int`,
        spentInWindow: sql<number>`COALESCE(SUM(CASE WHEN ${loyaltyPointEntries.direction} = 'spend' AND ${loyaltyPointEntries.occurredAt} >= ${since} THEN ${loyaltyPointEntries.points} ELSE 0 END), 0)::int`,
      })
      .from(loyaltyPointEntries);

    // ⚠️ AYRI SORGU: hesap sayisi defterden turetilemez — hic hareketi olmayan
    // bir hesap da bir hesaptir ve duvarin sayimina GIRER.
    const [accounts] = await db
      .select({ accountCount: sql<number>`count(*)::int` })
      .from(loyaltyAccounts);

    return {
      outstandingPoints: totals?.outstandingPoints ?? 0,
      earnedInWindow: totals?.earnedInWindow ?? 0,
      spentInWindow: totals?.spentInWindow ?? 0,
      accountCount: accounts?.accountCount ?? 0,
    };
  }

  async #findOne(filter: SQL): Promise<LoyaltyAccountRecord | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        ...ACCOUNT_COLUMNS,
        balance: BALANCE_SUM,
        entryCount: ENTRY_COUNT,
        lastEntryAt: LAST_ENTRY_AT,
      })
      .from(loyaltyAccounts)
      .leftJoin(loyaltyPointEntries, eq(loyaltyPointEntries.accountId, loyaltyAccounts.id))
      .where(filter)
      .groupBy(loyaltyAccounts.id)
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toRecord(row);
  }
}

function toRecord(
  row: AccountRow & { balance: number; entryCount: number; lastEntryAt: string | Date | null },
): LoyaltyAccountRecord {
  return {
    account: LoyaltyAccount.fromPersistence({
      id: row.id,
      tenantId: row.tenantId,
      crmContactId: row.crmContactId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt,
    }),
    balance: row.balance,
    entryCount: row.entryCount,
    lastEntryAt: toDate(row.lastEntryAt),
  };
}

/**
 * Veritabani `text` doner; birlesim tipine DARALTILIR.
 *
 * ⚠️ Tip ZORLAMASI (`as`) KULLANILMAZ (DEVELOPMENT_RULES 2.3) — bir `as`,
 * veritabaninda beklenmedik bir deger olsaydi onu SESSIZCE gecirirdi.
 * Pratikte ULASILMAZ: satir `point_entries_direction_valid` CHECK kisitindan
 * gecmistir. Savunma katmani.
 */
function toDirection(value: string): PointDirection {
  const found = POINT_DIRECTIONS.find((direction) => direction === value);
  if (found === undefined) {
    throw new InvalidPointDirectionError(value);
  }
  return found;
}

/**
 * Ham SQL toplamasindan gelen zaman degerini `Date`e cevirir.
 *
 * ⚠️ ADR-0047'nin kapanis denetiminin bulduğu kusurun karsiligi: `sql<Date>`
 * BIR IDDIADIR, BIR DONUSUM DEGIL. Bu fonksiyon o boslugu kapatir ve
 * ⚠️ KORUMA TIP SISTEMINE BAGLIDIR — cevirici kaldirilirsa `LAST_ENTRY_AT`in
 * `string | null` tipi `LoyaltyAccountRecord.lastEntryAt`in `Date | null`
 * tipine ATANAMAZ ve DERLEME KIRILIR.
 */
function toDate(value: string | Date | null): Date | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
