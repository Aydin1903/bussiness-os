import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lte, sql, type SQL } from 'drizzle-orm';

import { PG_FOREIGN_KEY_VIOLATION, isPgError } from '../../../infrastructure/database/pg-error';
import { financeCategories, financeTransactions } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/category.repository.port';
import {
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
      // ⚠️ `companyId` / `projectId` SET listesinde YOK ve `values`ta DAIMA
      // `null`: kolonlar `0024`'te acildi ama API onlari Slice 3'e kadar kabul
      // etmiyor (gerekce migration'da). Slice 3 bu iki satiri ekleyecek.
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
