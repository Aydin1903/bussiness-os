import { Injectable } from '@nestjs/common';
import { and, asc, eq, sql, type SQL } from 'drizzle-orm';

import {
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isPgError,
} from '../../../infrastructure/database/pg-error';
import { financeCategories } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type CategoryRepository, type ListPage } from '../application/category.repository.port';
import { Category, isFinanceDirection, type FinanceDirection } from '../domain/category.entity';
import {
  CategoryInUseError,
  DuplicateCategoryError,
  InvalidDirectionError,
} from '../domain/finance.error';

/**
 * Migration `0023`'un unique index adi.
 *
 * ⚠️ DIZE OLARAK YAZILI VE MIGRATION'DAKI ADLA BIREBIR AYNI OLMAK ZORUNDA.
 * Ayrisirlarsa ceviri SESSIZCE calismaz: ham PostgreSQL hatasi kullaniciya
 * 500 olarak doner. `DrizzleTenantRepository`'nin `SLUG_UNIQUE_CONSTRAINT`
 * satiriyla ayni desen ve ayni kirilganlik — entegrasyon testi bunu KANITLAR.
 */
const NAME_UNIQUE_CONSTRAINT = 'categories_tenant_name_direction_idx';

/**
 * `CategoryRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0023`).
 * Gerekce port dosyasindadir; burada tekrarlanmaz. Bunun gercekten calistigi
 * entegrasyon testiyle KANITLANIR.
 */
@Injectable()
export class DrizzleCategoryRepository implements CategoryRepository {
  async save(category: Category): Promise<void> {
    const { db } = requireTransaction();
    const state = category.toState();

    try {
      // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
      //
      // ⚠️ `direction` SET listesinde YOKTUR ve bu bilinclidir: yon
      // degistirilemez (gerekce `Category` sinif yorumunda). Entity onu zaten
      // `update()` imzasina almiyor; burada da yazilmamasi ikinci bir kapidir.
      await db
        .insert(financeCategories)
        .values(state)
        .onConflictDoUpdate({
          target: financeCategories.id,
          set: {
            name: state.name,
            isArchived: state.isArchived,
            updatedAt: state.updatedAt,
          },
        });
    } catch (error) {
      // "Once SELECT ile bak, sonra yaz" YAPILMADI: o desen es zamanli iki
      // istekte yaris kosulu birakir. Veritabani dogru cevabi ATOMIK veriyor;
      // is yalnizca onu ceviridir.
      if (isPgError(error, PG_UNIQUE_VIOLATION, NAME_UNIQUE_CONSTRAINT)) {
        throw new DuplicateCategoryError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<Category | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select()
      .from(financeCategories)
      .where(eq(financeCategories.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toCategory(row);
  }

  async list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    includeArchived: boolean;
  }): Promise<ListPage<Category>> {
    const { db } = requireTransaction();

    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir. Yalnizca sayfaya
    // uygulansaydi `total` filtrelenmemis toplami dondururdu ve arayuzun
    // sayfalayicisi var olmayan sayfalar gosterirdi — sessiz ve fark edilmesi
    // zor bir hata (`DrizzleProjectRepository.list`te ogrenilen ayni ders).
    const conditions: SQL[] = [];
    if (input.direction !== null) {
      conditions.push(eq(financeCategories.direction, input.direction));
    }
    if (!input.includeArchived) {
      conditions.push(eq(financeCategories.isArchived, false));
    }
    const filter = conditions.length === 0 ? undefined : and(...conditions);

    // Siralama ADA gore: kategori listesi bir SECIM listesidir, kronolojik bir
    // akis degil. `id` TIE-BREAKER'dir — ayni ada sahip iki satir olamaz
    // (unique index) ama yon farkliysa olabilir, ve kararsiz siralama
    // sayfalamada bir kaydin iki kez ya da HIC gorunmesi demektir.
    const rows = await db
      .select()
      .from(financeCategories)
      .where(filter)
      .orderBy(asc(financeCategories.name), asc(financeCategories.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(financeCategories)
      .where(filter);

    return { items: rows.map(toCategory), total: counted?.total ?? 0 };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();

    try {
      const deleted = await db
        .delete(financeCategories)
        .where(eq(financeCategories.id, id))
        .returning({ id: financeCategories.id });

      return deleted.length;
    } catch (error) {
      // ⚠️ BUGUN TETIKLENEMEZ: `finance.categories`'e isaret eden hicbir FK
      // henuz yok (`0024` onu aciyor). Ceviri yine de SIMDI yaziliyor —
      // gerekce `CategoryInUseError`'in yorumunda. Kisit ADI verilmiyor cunku
      // henuz yoktur; bu tabloda silmeyi engelleyebilecek TEK FK sinifi odur.
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new CategoryInUseError();
      }
      throw error;
    }
  }
}

/** Satiri entity'ye cevirir; `direction` daraltmasi tek yerde yapilir. */
function toCategory(row: typeof financeCategories.$inferSelect): Category {
  return Category.fromPersistence({ ...row, direction: toDirection(row.direction) });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3): zorlamak, CHECK
 * kisiti bir gun degisirse bozuk bir degeri gecerli gosterirdi. Yuklem
 * kullanilir ve uymayan deger domain hatasi firlatir.
 *
 * Pratikte ULASILMAZ: satir migration `0023`'un `categories_direction_valid`
 * CHECK kisitindan gecmistir. Savunma katmani — `toStatus` / `toStage` ile
 * birebir ayni desen.
 */
function toDirection(value: string): FinanceDirection {
  if (!isFinanceDirection(value)) {
    throw new InvalidDirectionError(value);
  }
  return value;
}
