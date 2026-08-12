import { Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';

import { contacts } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type ListPage } from '../application/company.repository.port';
import { type ContactRepository } from '../application/contact.repository.port';
import { Contact } from '../domain/contact.entity';

/** `ContactRepository`'nin Drizzle implementasyonu. RLS notu: bkz. sirket ikizi. */
@Injectable()
export class DrizzleContactRepository implements ContactRepository {
  async save(contact: Contact): Promise<void> {
    const { db } = requireTransaction();
    const state = contact.toState();

    await db
      .insert(contacts)
      .values(state)
      .onConflictDoUpdate({
        target: contacts.id,
        set: {
          fullName: state.fullName,
          title: state.title,
          email: state.email,
          phone: state.phone,
          updatedAt: state.updatedAt,
        },
      });
  }

  async findById(id: string): Promise<Contact | null> {
    const { db } = requireTransaction();
    const rows = await db.select().from(contacts).where(eq(contacts.id, id)).limit(1);
    const row = rows[0];
    return row === undefined ? null : Contact.fromPersistence(row);
  }

  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
  }): Promise<ListPage<Contact>> {
    const { db } = requireTransaction();

    // `companyId` filtresi bir IS filtresidir (tenant filtresi DEGIL) — bu
    // yuzden elle yazilir. Tenant daraltmasi yine RLS'in isidir.
    const where: SQL | undefined =
      input.companyId === null ? undefined : and(eq(contacts.companyId, input.companyId));

    const rows = await db
      .select()
      .from(contacts)
      .where(where)
      .orderBy(desc(contacts.createdAt), desc(contacts.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(contacts)
      .where(where);

    return { items: rows.map((row) => Contact.fromPersistence(row)), total: counted?.total ?? 0 };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db.delete(contacts).where(eq(contacts.id, id)).returning({
      id: contacts.id,
    });
    return deleted.length;
  }

  /**
   * `DrizzleCompanyRepository.findNamesByIds` ile BIREBIR ayni sekil.
   *
   * ⚠️ `WHERE tenant_id` YOK — daraltmayi RLS yapar. Yani baska tenant'in
   * kisisi, id'si dogru bilinse bile haritaya GIREMEZ.
   */
  async findNamesByIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>> {
    if (ids.length === 0) {
      return new Map();
    }

    const { db } = requireTransaction();
    const rows = await db
      .select({ id: contacts.id, fullName: contacts.fullName })
      .from(contacts)
      .where(inArray(contacts.id, [...ids]));

    return new Map(rows.map((row) => [row.id, row.fullName]));
  }
}
