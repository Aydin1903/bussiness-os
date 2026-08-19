import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  cosineDistance,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';

import { inventoryItems, inventoryMovements } from '../../../infrastructure/database/schema';
import {
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isPgError,
} from '../../../infrastructure/database/pg-error';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type InventoryRepository,
  type InventorySummary,
  type ListPage,
  type LowStockItem,
  type SimilarStockItemNote,
  type StockItemRow,
  type UnindexedStockItem,
} from '../application/inventory.repository.port';
import {
  DuplicateSkuError,
  InvalidMovementDirectionError,
  StockItemHasMovementsError,
} from '../domain/inventory.error';
import { StockItem } from '../domain/stock-item.entity';
import {
  StockMovement,
  isMovementDirection,
  type MovementDirection,
  type StockMovementState,
} from '../domain/stock-movement.entity';

/**
 * ============================================================================
 * ⚠️ MEVCUT MIKTARIN TEK TANIMI — ADR-0039 §2
 * ============================================================================
 * Bu ifade projede miktarin YAZILDIGI TEK YERDIR. Liste, tek kayit, sayim ve
 * yapisal katkici DORDU DE bunu kullanir.
 *
 * ⚠️ Dort yerde ayri ayri yazilsaydi, biri degistiginde digerleri SESSIZCE
 * ayrisirdi — ve ayrisma "liste 12 diyor, sayim 9 diyor" seklinde gorunurdu:
 * kullanicinin hangisine inanacagini bilemeyecegi bir hata.
 *
 * `COALESCE(..., 0)`: hicbir hareketi olmayan kalem `0` doner, `NULL` DEGIL.
 * "Hic hareket yok" ile "toplami sifir" AYNI STOK DURUMUDUR.
 */
const QUANTITY_SUM = sql<string>`COALESCE(SUM(CASE WHEN ${inventoryMovements.direction} = 'in' THEN ${inventoryMovements.quantity} ELSE -${inventoryMovements.quantity} END), 0)`;

/**
 * ⚠️ ACIK KOLON PROJEKSIYONU — `select()` (yani `SELECT *`) KULLANILMIYOR.
 *
 * `items` VEKTOR TASIYOR (ADR-0039 §5 — chunk tablosu yok). `SELECT *` her
 * satirda 1536 `float`i (~6 KB) agdan cekerdi ve HICBIRI KULLANILMAZDI:
 * `embedding` yalnizca `<=>` ile SQL ICINDE kullanilan bir alandir.
 * `DrizzleAppointmentRepository`nin ayni karari, ikinci kez.
 */
const ITEM_COLUMNS = {
  id: inventoryItems.id,
  tenantId: inventoryItems.tenantId,
  name: inventoryItems.name,
  sku: inventoryItems.sku,
  unit: inventoryItems.unit,
  minQuantity: inventoryItems.minQuantity,
  note: inventoryItems.note,
  archivedAt: inventoryItems.archivedAt,
  createdByUserId: inventoryItems.createdByUserId,
  createdAt: inventoryItems.createdAt,
  updatedAt: inventoryItems.updatedAt,
};

/**
 * `InventoryRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0029`).
 * ⚠️ Bu modulde bedeli daha agir: miktar bir TOPLAMDIR, yani eksik bir filtre
 * "eksik liste" degil YANLIS BIR SAYI uretirdi.
 */
@Injectable()
export class DrizzleInventoryRepository implements InventoryRepository {
  // ==========================================================================
  // Kalem tanimi
  // ==========================================================================

  async saveItem(item: StockItem): Promise<void> {
    const { db } = requireTransaction();
    const state = item.toState();

    try {
      // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
      //
      // ⚠️ `embedding` SET LISTESINDE YOK ve bu KASITLIDIR: vektorun uretimi bir
      // AG CAGRISI gerektirir ve o cagri transaction'in disinda kalir. Vektor
      // `setEmbedding` ile yazilir.
      await db
        .insert(inventoryItems)
        .values(state)
        .onConflictDoUpdate({
          target: inventoryItems.id,
          set: {
            name: state.name,
            sku: state.sku,
            unit: state.unit,
            minQuantity: state.minQuantity,
            note: state.note,
            archivedAt: state.archivedAt,
            updatedAt: state.updatedAt,
          },
        });
    } catch (error) {
      // ⚠️ KISIT ADI VERILIYOR: bu tabloda baska bir unique kisit da olabilir
      // (bugun yok, yarin olabilir) ve yanlis kisiti yakalayan bir ceviri
      // kullaniciya YANLIS hata mesaji gosterirdi (`pg-error.ts`in uyarisi).
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'items_tenant_sku_unique_idx')) {
        throw new DuplicateSkuError(state.sku ?? '');
      }
      throw error;
    }
  }

  async findItemById(id: string): Promise<StockItem | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select(ITEM_COLUMNS)
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toStockItem(row);
  }

  /**
   * ⚠️ `SELECT ... FOR UPDATE` — projedeki TEK satir kilidi (ADR-0039 §3.2).
   *
   * Kalem satiri, kendi defterinin KILIT CAPASIDIR: `movements` uzerine yapilan
   * bir `INSERT` bu kilidi tek basina beklemez, bu yuzden HAREKET YAZAN HER YOL
   * once buradan gecer (`recordMovement` ve `recordCount`). Bir yol atlarsa
   * kilit DEKORATIF hale gelir.
   *
   * ⚠️ Kilit YALNIZCA cagiranin transaction'i suresince tutulur — ve o
   * transaction `runInCurrentTenantTransaction` icindedir, yani icinde AG
   * CAGRISI YOKTUR. Kilit altinda bir OpenAI cagrisi beklemek, ayni kaleme yazan
   * herkesi saniyelerce bloklardi.
   */
  async lockItemById(id: string): Promise<StockItem | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select(ITEM_COLUMNS)
      .from(inventoryItems)
      .where(eq(inventoryItems.id, id))
      .limit(1)
      .for('update');

    const row = rows[0];
    return row === undefined ? null : toStockItem(row);
  }

  async setEmbedding(input: { id: string; embedding: readonly number[] | null }): Promise<number> {
    const { db } = requireTransaction();

    const updated = await db
      .update(inventoryItems)
      // Drizzle `vector` kolonu `number[]` ister; port `readonly` sozu veriyor
      // ve burada kopyalanarak aciliyor.
      .set({ embedding: input.embedding === null ? null : [...input.embedding] })
      .where(eq(inventoryItems.id, input.id))
      .returning({ id: inventoryItems.id });

    return updated.length;
  }

  async findUnindexed(limit: number): Promise<UnindexedStockItem[]> {
    const { db } = requireTransaction();

    // ⚠️ IS LISTESI TURETILMISTIR — ayri bir "onarilacaklar" tablosu YOK.
    const rows = await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        note: inventoryItems.note,
      })
      .from(inventoryItems)
      .where(and(isNotNull(inventoryItems.note), isNull(inventoryItems.embedding)))
      // En eski once: onarim kuyrugu FIFO'dur, yoksa buyuk bir birikimde ayni
      // satirlar tekrar tekrar secilebilirdi.
      .orderBy(asc(inventoryItems.createdAt), asc(inventoryItems.id))
      .limit(limit);

    return rows.flatMap((row) => (row.note === null ? [] : [{ ...row, note: row.note }]));
  }

  /**
   * Sayfali kalem listesi — MIKTAR TURETILEREK (§2).
   *
   * ============================================================================
   * ⚠️ BU, MODULUN EN SICAK SORGUSUDUR
   * ============================================================================
   * `LEFT JOIN` + `GROUP BY`: hareketi olmayan kalem de listede gorunur
   * (`INNER JOIN` olsaydi yeni acilmis her kalem SESSIZCE KAYBOLURDU — ekran
   * calisir, kalem yok gorunur).
   *
   * ⚠️ `lowStockOnly` `HAVING` ile calisir ve INDEX KULLANAMAZ (once toplanir,
   * sonra elenir). Bu, ADR-0039 § Sonuclari'nda KAYITLI bir bedeldir; kalem
   * sayisi hareket sayisi gibi buyumedigi icin kabul edildi.
   */
  async listItems(input: {
    limit: number;
    offset: number;
    includeArchived: boolean;
    lowStockOnly: boolean;
    search: string | null;
  }): Promise<ListPage<StockItemRow>> {
    const { db } = requireTransaction();

    const conditions: SQL[] = [];
    if (!input.includeArchived) {
      conditions.push(isNull(inventoryItems.archivedAt));
    }
    if (input.search !== null) {
      // ⚠️ `ilike` — SUNUCUDA. ADR-0035'in "kisi filtresi ISTEMCIDE" bilinen
      // sinirini bu modul TEKRARLAMIYOR: envanterde kalem sayisi sayfa
      // sinirini kolayca asar ve istemci tarafi arama YALNIZCA GORUNEN SAYFAYA
      // uygulanirdi — kullanici "yok" sanip ikinci kez ayni kalemi acardi.
      //
      // ⚠️ Bu KLASIK METIN ARAMASI DEGILDIR (ADR-0011 hala acik): tek bir
      // kolonda alt dize eslesmesi, tam metin indeksi degil.
      conditions.push(ilike(inventoryItems.name, `%${input.search}%`));
    }
    const filter = conditions.length === 0 ? undefined : and(...conditions);

    // ⚠️ `HAVING`in yuklemi: negatif VEYA esik altinda. `minQuantity IS NULL`
    // olan kalem ASLA girmez — `NULL` "izleme yok" demektir (§6.1) ve
    // `x <= NULL` zaten `NULL` (yani false) dondururdu; yuklem ACIKCA
    // yazilarak niyet gorunur kilindi.
    const lowStockPredicate = sql`(${QUANTITY_SUM} < 0 OR (${inventoryItems.minQuantity} IS NOT NULL AND ${QUANTITY_SUM} <= ${inventoryItems.minQuantity}))`;

    const rows = await db
      .select({ ...ITEM_COLUMNS, quantity: QUANTITY_SUM })
      .from(inventoryItems)
      // ⚠️ `LEFT`: hareketi olmayan kalem de gorunur.
      .leftJoin(inventoryMovements, eq(inventoryMovements.itemId, inventoryItems.id))
      .where(filter)
      .groupBy(inventoryItems.id)
      .having(input.lowStockOnly ? lowStockPredicate : undefined)
      .orderBy(asc(inventoryItems.name), asc(inventoryItems.id))
      .limit(input.limit)
      .offset(input.offset);

    // ⚠️ SAYAC AYNI FILTRELERI UYGULAR. Yalnizca sayfaya uygulansaydi `total`
    // filtrelenmemis toplami dondururdu ve arayuzun sayfalayicisi VAR OLMAYAN
    // sayfalar gosterirdi (`DrizzleProjectRepository.list`te ogrenilen ders).
    //
    // ⚠️ Sayim `HAVING` yuzunden bir ALT SORGU gerektirir: `count(*)` ile
    // `GROUP BY` ayni seviyede birlestirilirse GRUP BASINA bir satir doner,
    // TOPLAM degil.
    const grouped = db
      .select({ id: inventoryItems.id })
      .from(inventoryItems)
      .leftJoin(inventoryMovements, eq(inventoryMovements.itemId, inventoryItems.id))
      .where(filter)
      .groupBy(inventoryItems.id)
      .having(input.lowStockOnly ? lowStockPredicate : undefined)
      .as('grouped');

    const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(grouped);

    return { items: rows.map(toStockItemRow), total: counted?.total ?? 0 };
  }

  async findItemRowById(id: string): Promise<StockItemRow | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ ...ITEM_COLUMNS, quantity: QUANTITY_SUM })
      .from(inventoryItems)
      .leftJoin(inventoryMovements, eq(inventoryMovements.itemId, inventoryItems.id))
      .where(eq(inventoryItems.id, id))
      .groupBy(inventoryItems.id)
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toStockItemRow(row);
  }

  async deleteItemById(id: string): Promise<number> {
    const { db } = requireTransaction();

    try {
      const deleted = await db
        .delete(inventoryItems)
        .where(eq(inventoryItems.id, id))
        .returning({ id: inventoryItems.id });

      return deleted.length;
    } catch (error) {
      // ⚠️ `ON DELETE RESTRICT` ihlali (ADR-0039 §3.4). Kisit adi VERILMIYOR
      // cunku FK adini PostgreSQL uretir (`movements_item_id_items_id_fk`) ve
      // ada bagimli olmak, migration'da adin degismesiyle SESSIZCE kirilirdi.
      // Bu tabloda `RESTRICT` tasiyan tek FK zaten budur — `tenant_id` de
      // `RESTRICT`tir ama bir KALEM silerken tetiklenemez.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new StockItemHasMovementsError();
      }
      throw error;
    }
  }

  // ==========================================================================
  // Defter
  // ==========================================================================

  async insertMovement(movement: StockMovement): Promise<void> {
    const { db } = requireTransaction();
    // ⚠️ `onConflictDoUpdate` YOK — ve bu bir eksik degil, §3.3'un tasiyicisidir:
    // bir hareket GUNCELLENMEZ. UPSERT yazilsaydi, id cakismasi durumunda
    // sessizce bir gecmis satirini DEGISTIRIRDI.
    await db.insert(inventoryMovements).values(movement.toState());
  }

  /**
   * ⚠️ MEVCUT MIKTAR — TURETILIR (ADR-0039 §2).
   *
   * Toplama SQL'de; satirlari cekip JS'te toplamak binlerce hareketi her
   * okumada aga tasirdi.
   */
  async deriveQuantity(itemId: string): Promise<string> {
    const { db } = requireTransaction();

    const [row] = await db
      .select({ quantity: QUANTITY_SUM })
      .from(inventoryMovements)
      .where(eq(inventoryMovements.itemId, itemId));

    // ⚠️ Hicbir hareket yoksa `SUM` bir satir doner ama degeri `COALESCE` ile
    // `0`dir. Yine de `?? '0'` savunmasi var: `WHERE` hicbir satir eslemezse
    // toplama fonksiyonu tek satir dondurur, ama bu davranisa GUVENMEK yerine
    // ACIKCA yazmak, sessiz bir `undefined`in miktar yerine gecmesini onler.
    return row?.quantity ?? '0';
  }

  async listMovements(input: {
    limit: number;
    offset: number;
    itemId: string | null;
  }): Promise<ListPage<StockMovementState>> {
    const { db } = requireTransaction();

    const filter = input.itemId === null ? undefined : eq(inventoryMovements.itemId, input.itemId);

    const rows = await db
      .select()
      .from(inventoryMovements)
      .where(filter)
      // ⚠️ AZALAN — defter bir GECMIS akisidir ("en son ne oldu");
      // `finance.transactions` ile ayni sinif, `appointments` ile degil.
      // `id` TIE-BREAKER: ayni ana dusen iki hareket MESRUDUR ve kararsiz
      // siralama, sayfalamada bir kaydin iki kez ya da HIC gorunmesi demektir.
      .orderBy(desc(inventoryMovements.occurredAt), desc(inventoryMovements.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(inventoryMovements)
      .where(filter);

    return { items: rows.map(toMovementState), total: counted?.total ?? 0 };
  }

  // ==========================================================================
  // Katkicilar
  // ==========================================================================

  async findSimilarNotes(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarStockItemNote[]> {
    const { db } = requireTransaction();

    // ⚠️ `embedding` SECILMEZ (1536 float agdan gecmesin) ama `IS NOT NULL`
    // SUZULUR: vektoru olmayan satirlar `LIMIT` yuvalarini bosa harcamasin.
    //
    // ⚠️ ARSIVLENMIS kalemler DAHIL — yapisal katkicidan bilincli sapma
    // (gerekce port dosyasinda: "gecen yil hangi tedarikciden almistik"
    // sorusunun cevabi arsivlenmis bir kalemde olabilir ve HALA DOGRUDUR).
    const rows = await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        sku: inventoryItems.sku,
        note: inventoryItems.note,
      })
      .from(inventoryItems)
      .where(isNotNull(inventoryItems.embedding))
      // Siralama `cosineDistance` ARTAN — en YAKIN once. Operator migration
      // `0029`'un `vector_cosine_ops` HNSW index'iyle eslesmek ZORUNDA.
      .orderBy(asc(cosineDistance(inventoryItems.embedding, [...input.embedding])))
      .limit(input.limit);

    return rows.flatMap((row) => (row.note === null ? [] : [{ ...row, note: row.note }]));
  }

  async findLowStock(input: { nearRatio: number; limit: number }): Promise<LowStockItem[]> {
    const { db } = requireTransaction();

    // ⚠️ ARSIVLENMIS kalemler HARIC (§3.4): arsivlenmis bir kalemin stogunun
    // azalmasi HABER DEGILDIR.
    //
    // Yuklem UC durumu kapsar ve siralamasi ONEMLIDIR (en kritik once):
    //   negatif  -> fiziksel olarak imkansiz, KAYIT tutarsiz
    //   esik alti / esit
    //   esige YAKIN (`nearRatio` carpani)
    const rows = await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        unit: inventoryItems.unit,
        minQuantity: inventoryItems.minQuantity,
        quantity: QUANTITY_SUM,
      })
      .from(inventoryItems)
      .leftJoin(inventoryMovements, eq(inventoryMovements.itemId, inventoryItems.id))
      .where(isNull(inventoryItems.archivedAt))
      .groupBy(inventoryItems.id)
      .having(
        sql`${QUANTITY_SUM} < 0 OR (${inventoryItems.minQuantity} IS NOT NULL AND ${QUANTITY_SUM} <= ${inventoryItems.minQuantity} * ${input.nearRatio})`,
      )
      // En kritik once: negatifler, sonra esige gore en dusuk oranli olanlar.
      .orderBy(asc(QUANTITY_SUM), asc(inventoryItems.name))
      .limit(input.limit);

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      minQuantity: row.minQuantity,
    }));
  }

  async summarize(input: { from: Date; to: Date }): Promise<InventorySummary> {
    const { db } = requireTransaction();

    // ⚠️ IKI AYRI SORGU: biri KALEMLERI sayar, digeri HAREKETLERI. Tek sorguda
    // birlestirmek (join) kalem sayisini hareket sayisi kadar TEKRARLARDI —
    // `summarizeByCurrency`/`summarizeByCategory` ayriminin ayni gerekcesi.
    const [items] = await db
      .select({
        activeItems: sql<number>`count(*)::int`,
        trackedItems: sql<number>`count(*) FILTER (WHERE ${inventoryItems.minQuantity} IS NOT NULL)::int`,
      })
      .from(inventoryItems)
      .where(isNull(inventoryItems.archivedAt));

    const [movements] = await db
      .select({
        movementsIn: sql<number>`count(*) FILTER (WHERE ${inventoryMovements.direction} = 'in')::int`,
        movementsOut: sql<number>`count(*) FILTER (WHERE ${inventoryMovements.direction} = 'out')::int`,
      })
      .from(inventoryMovements)
      .where(
        and(
          gte(inventoryMovements.occurredAt, input.from),
          lt(inventoryMovements.occurredAt, input.to),
        ),
      );

    return {
      activeItems: items?.activeItems ?? 0,
      trackedItems: items?.trackedItems ?? 0,
      movementsIn: movements?.movementsIn ?? 0,
      movementsOut: movements?.movementsOut ?? 0,
    };
  }
}

/** Satiri entity'ye cevirir. */
function toStockItem(row: {
  id: string;
  tenantId: string;
  name: string;
  sku: string | null;
  unit: string;
  minQuantity: string | null;
  note: string | null;
  archivedAt: Date | null;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): StockItem {
  return StockItem.fromPersistence({
    ...row,
    // ⚠️ Kolon NULLABLE ama entity zorunlu tutuyor. Ayrim kasitli: yazma yolu
    // kimligi HER ZAMAN doldurur ama kolon `platform.users`a FK VEREMEZ (Mutlak
    // Kural 5) ve ileride bir ithalat betigi bos birakabilir.
    createdByUserId: row.createdByUserId ?? '',
  });
}

/** Satiri + TURETILMIS miktari cikti satirina cevirir. */
function toStockItemRow(
  row: Parameters<typeof toStockItem>[0] & { quantity: string },
): StockItemRow {
  const { quantity, ...rest } = row;
  return { ...toStockItem(rest).toState(), quantity };
}

function toMovementState(row: {
  id: string;
  tenantId: string;
  itemId: string;
  direction: string;
  quantity: string;
  isCorrection: boolean;
  occurredAt: Date;
  note: string | null;
  createdByUserId: string | null;
  createdAt: Date;
}): StockMovementState {
  return StockMovement.fromPersistence({
    ...row,
    direction: toDirection(row.direction),
    createdByUserId: row.createdByUserId ?? '',
  }).toState();
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3): zorlamak, CHECK
 * kisiti bir gun degisirse bozuk bir degeri gecerli gosterirdi. Pratikte
 * ULASILMAZ — satir `movements_direction_valid` CHECK'inden gecmistir.
 */
function toDirection(value: string): MovementDirection {
  if (!isMovementDirection(value)) {
    throw new InvalidMovementDirectionError(value);
  }
  return value;
}
