import { Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';

import { companies } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type CompanyRepository, type ListPage } from '../application/company.repository.port';
import { Company } from '../domain/company.entity';

/**
 * `CompanyRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0016`).
 * Gerekce port dosyasindadir; burada tekrarlanmaz. Bunun gercekten calistigi
 * entegrasyon testiyle KANITLANIR.
 */
@Injectable()
export class DrizzleCompanyRepository implements CompanyRepository {
  async save(company: Company): Promise<void> {
    const { db } = requireTransaction();
    const state = company.toState();

    // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
    await db
      .insert(companies)
      .values(state)
      .onConflictDoUpdate({
        target: companies.id,
        set: {
          name: state.name,
          industry: state.industry,
          email: state.email,
          phone: state.phone,
          website: state.website,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Company | null> {
    const { db } = requireTransaction();
    const rows = await db.select().from(companies).where(eq(companies.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : Company.fromPersistence(row);
  }

  async list(input: { limit: number; offset: number }): Promise<ListPage<Company>> {
    const { db } = requireTransaction();

    // Siralamada `id` TIE-BREAKER'dir: ayni milisaniyede olusan iki kayitta
    // kararsiz siralama, sayfalamada bir kaydin iki kez ya da hic gorunmesi
    // demektir (ADR-0029'un liste ucunda ogrenilen ders).
    const rows = await db
      .select()
      .from(companies)
      .orderBy(desc(companies.createdAt), desc(companies.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db.select({ total: sql<number>`count(*)::int` }).from(companies);

    return { items: rows.map((row) => Company.fromPersistence(row)), total: counted?.total ?? 0 };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db.delete(companies).where(eq(companies.id, id)).returning({
      id: companies.id,
    });
    return deleted.length;
  }
}
