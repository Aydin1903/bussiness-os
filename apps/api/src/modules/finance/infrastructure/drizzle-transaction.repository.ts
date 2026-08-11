import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { PG_FOREIGN_KEY_VIOLATION, isPgError } from '../../../infrastructure/database/pg-error';
import { financeCategories, financeTransactions } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/category.repository.port';
import {
  type CategoryTotalsRow,
  type CurrencyTotalsRow,
  type TransactionListRow,
  type TransactionRepository,
} from '../application/transaction.repository.port';
import { isFinanceDirection, type FinanceDirection } from '../domain/category.entity';
import { CategoryDirectionMismatchError, InvalidDirectionError } from '../domain/finance.error';
import { FinanceTransaction } from '../domain/transaction.entity';

/**
 * Migration `0024`'un bilesik FK adi.
 *
 * ⚠️ DIZE OLARAK YAZILI VE MIGRATION'DAKI ADLA BIREBIR AYNI OLMAK ZORUNDA
 * (`NAME_UNIQUE_CONSTRAINT` ile ayni kirilganlik). Ayrisirsa ceviri SESSIZCE
 * calismaz ve ham PostgreSQL hatasi 500 olarak sizar.
 */
const CATEGORY_DIRECTION_CONSTRAINT = 'transactions_category_direction_fkey';

/**
 * `TransactionRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0024`).
 */
@Injectable()
export class DrizzleTransactionRepository implements TransactionRepository {
  async save(transaction: FinanceTransaction): Promise<void> {
    const { db } = requireTransaction();
    const state = transaction.toState();

    try {
      // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
      //
      // ⚠️ `companyId` / `projectId` SLICE 4'TE SET LISTESINE GIRDI. Slice 2-3
      // boyunca disarida durmuslardi cunku API onlari kabul etmiyordu;
      // `projects.public.ts` geldigi icin artik yaziliyorlar.
      // `undefined` = dokunma / `null` = temizle ayrimi entity'de cozulur,
      // buraya gelen deger ZATEN nihai durumdur.
      await db
        .insert(financeTransactions)
        .values(state)
        .onConflictDoUpdate({
          target: financeTransactions.id,
          set: {
            direction: state.direction,
            amount: state.amount,
            currency: state.currency,
            occurredOn: state.occurredOn,
            description: state.description,
            categoryId: state.categoryId,
            companyId: state.companyId,
            projectId: state.projectId,
            updatedAt: state.updatedAt,
          },
        });
    } catch (error) {
      // ⚠️ SAVUNMA KATMANI, BIRINCIL KONTROL DEGIL. Use case ayni kosulu
      // ONCEDEN dogrular ve daha iyi bir mesaj uretir; bu ceviri, o kontrolun
      // atlandigi ya da yaris kosulunda gecersizlestigi durumda ham bir
      // PostgreSQL hatasinin 500 olarak sizmasini onler.
      //
      // Bu FK'nin ihlal edilebilecegi IKI durum vardir ve ikisi de ayni kodu
      // verir: kategori yok, ya da yonu uyusmuyor. Ayirt edilemedigi icin daha
      // ACIKLAYICI olani secilir — kategori yoklugunu use case zaten yakalar.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION, CATEGORY_DIRECTION_CONSTRAINT)) {
        throw new CategoryDirectionMismatchError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<FinanceTransaction | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select()
      .from(financeTransactions)
      .where(eq(financeTransactions.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toTransaction(row);
  }

  async list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    categoryId: string | null;
    from: string | null;
    to: string | null;
  }): Promise<ListPage<TransactionListRow>> {
    const { db } = requireTransaction();

    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir; yalnizca sayfaya
    // uygulansaydi `total` filtrelenmemis toplami dondururdu ve sayfalayici
    // var olmayan sayfalar gosterirdi.
    const conditions: SQL[] = [];
    if (input.direction !== null) {
      conditions.push(eq(financeTransactions.direction, input.direction));
    }
    if (input.categoryId !== null) {
      conditions.push(eq(financeTransactions.categoryId, input.categoryId));
    }
    // DAHIL sinirlar: kullanici "1-31 Mart" dediginde 31 Mart'i kastediyordur.
    if (input.from !== null) {
      conditions.push(gte(financeTransactions.occurredOn, input.from));
    }
    if (input.to !== null) {
      conditions.push(lte(financeTransactions.occurredOn, input.to));
    }
    const filter = conditions.length === 0 ? undefined : and(...conditions);

    // ⚠️ `LEFT JOIN` ZORUNLU: `INNER` olsaydi KATEGORISIZ islemler listeden
    // DUSERDI — ve kategorisiz kayit bu modulde mesru bir durumdur.
    //
    // Siralama once TARIHE (en yeni once), sonra `id` TIE-BREAKER: ayni gune
    // dusen iki kayitta kararsiz siralama, sayfalamada bir kaydin iki kez ya da
    // HIC gorunmesi demektir.
    const rows = await db
      .select({
        transaction: financeTransactions,
        categoryName: financeCategories.name,
      })
      .from(financeTransactions)
      .leftJoin(financeCategories, eq(financeCategories.id, financeTransactions.categoryId))
      .where(filter)
      .orderBy(desc(financeTransactions.occurredOn), asc(financeTransactions.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(financeTransactions)
      .where(filter);

    return {
      items: rows.map((row) => ({
        ...toTransaction(row.transaction).toState(),
        categoryName: row.categoryName,
      })),
      total: counted?.total ?? 0,
    };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db
      .delete(financeTransactions)
      .where(eq(financeTransactions.id, id))
      .returning({ id: financeTransactions.id });

    return deleted.length;
  }

  async summarizeByCurrency(input: {
    from: string | null;
    to: string | null;
  }): Promise<CurrencyTotalsRow[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        currency: financeTransactions.currency,
        income: money(sql`SUM(${financeTransactions.amount}) FILTER (WHERE ${INCOME})`),
        expense: money(sql`SUM(${financeTransactions.amount}) FILTER (WHERE ${EXPENSE})`),
        // ⚠️ `income - expense` DEGIL, TEK bir toplam: iki dizeyi JS'te
        // cikarmak icin once `number`a cevirmek gerekirdi ve bu, `money.ts`'in
        // bastan sona kacindigi hatayi bir PARA TOPLAMINDA geri getirirdi.
        net: money(
          sql`SUM(CASE WHEN ${INCOME} THEN ${financeTransactions.amount} ELSE -${financeTransactions.amount} END)`,
        ),
      })
      .from(financeTransactions)
      .where(dateRange(input))
      .groupBy(financeTransactions.currency)
      .orderBy(asc(financeTransactions.currency));

    return rows;
  }

  async summarizeByCategory(input: {
    from: string | null;
    to: string | null;
  }): Promise<CategoryTotalsRow[]> {
    const { db } = requireTransaction();

    // ⚠️ `LEFT JOIN` ZORUNLU: `INNER` olsaydi KATEGORISIZ kayitlar kirilimdan
    // duserdi ve kategori toplamlari para birimi toplamini TUTMAZDI — fark
    // sessiz olurdu (ADR-0034 §3d).
    //
    // ⚠️ Gruplamada `transactions.direction` kullaniliyor, KATEGORININ yonu
    // degil: kategorisiz satirlarin kategorisi yoktur ama yonu vardir.
    // Kategorili satirlarda ikisi ZATEN esittir — bilesik FK bunu garanti
    // ediyor (`0024`).
    const rows = await db
      .select({
        currency: financeTransactions.currency,
        categoryId: financeTransactions.categoryId,
        categoryName: financeCategories.name,
        direction: financeTransactions.direction,
        total: money(sql`SUM(${financeTransactions.amount})`),
      })
      .from(financeTransactions)
      .leftJoin(financeCategories, eq(financeCategories.id, financeTransactions.categoryId))
      .where(dateRange(input))
      .groupBy(
        financeTransactions.currency,
        financeTransactions.categoryId,
        financeCategories.name,
        financeTransactions.direction,
      )
      // Buyukten kucuge: "en cok nereye harciyoruz" sorusunun cevabi ustte
      // olsun. `categoryId` TIE-BREAKER — kararsiz siralama, ayni soruya iki
      // farkli cevap demektir.
      .orderBy(
        asc(financeTransactions.currency),
        asc(financeTransactions.direction),
        desc(sql`SUM(${financeTransactions.amount})`),
        asc(financeTransactions.categoryId),
      );

    return rows.map((row) => ({ ...row, direction: toDirection(row.direction) }));
  }
}

/** `direction = 'income'` yuklemi — tek tanim, uc yerde kullaniliyor. */
const INCOME = sql`${financeTransactions.direction} = 'income'`;
const EXPENSE = sql`${financeTransactions.direction} = 'expense'`;

/**
 * Bir toplami KANONIK para dizesine cevirir.
 *
 * ============================================================================
 * ⚠️ `COALESCE` VE `numeric(20,2)` BIRLIKTE GEREKLI
 * ============================================================================
 * - `COALESCE(..., 0)`: `FILTER` hicbir satiri tutmazsa `SUM` `NULL` doner.
 *   Ornegin yalnizca gideri olan bir para biriminde `income` NULL olurdu ve
 *   istemci `null` ile `"0.00"`i ayirt etmek zorunda kalirdi.
 * - `::numeric(20,2)`: olceksiz bir `0`, `"0"` olarak render edilirdi —
 *   digerleri `"1500.50"` iken. Olcek verilmesi TUM degerleri ayni kanonik
 *   bicime sokar. 20 hane secildi cunku TOPLAM, tek bir kaydin `numeric(14,2)`
 *   sinirini asabilir; `numeric(14,2)`ye cast etmek buyuk tenant'larda
 *   TASMA HATASI verirdi.
 * - `::text`: surucunun `numeric`i zaten dize dondurmesine guvenilmez;
 *   acikca istenmesi niyeti belgeler.
 */
function money(expression: SQL): SQL<string> {
  return sql<string>`COALESCE(${expression}, 0)::numeric(20,2)::text`;
}

/** `from`/`to` DAHIL sinirlar; ikisi de yoksa filtre YOK (tum gecmis). */
function dateRange(input: { from: string | null; to: string | null }): SQL | undefined {
  const conditions: SQL[] = [];
  if (input.from !== null) {
    conditions.push(gte(financeTransactions.occurredOn, input.from));
  }
  if (input.to !== null) {
    conditions.push(lte(financeTransactions.occurredOn, input.to));
  }
  return conditions.length === 0 ? undefined : and(...conditions);
}

/** Satiri entity'ye cevirir; `direction` daraltmasi tek yerde yapilir. */
function toTransaction(row: typeof financeTransactions.$inferSelect): FinanceTransaction {
  return FinanceTransaction.fromPersistence({ ...row, direction: toDirection(row.direction) });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3). Pratikte ULASILMAZ:
 * satir `transactions_direction_valid` CHECK kisitindan gecmistir.
 */
function toDirection(value: string): FinanceDirection {
  if (!isFinanceDirection(value)) {
    throw new InvalidDirectionError(value);
  }
  return value;
}
