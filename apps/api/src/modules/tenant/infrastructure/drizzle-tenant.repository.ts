import { Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { PG_UNIQUE_VIOLATION, isPgError } from '../../../infrastructure/database/pg-error';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { tenants } from '../../../infrastructure/database/schema';
import type { TenantRef, TenantRepository } from '../application/tenant.repository.port';
import { parseTenantStatus } from '../domain/tenant-status.value-object';
import type { Tenant } from '../domain/tenant.entity';
import { TenantId } from '../domain/tenant-id.value-object';
import type { TenantSlug } from '../domain/tenant-slug.value-object';
import { TenantSlugAlreadyTakenError } from '../domain/tenant.error';
import { toTenant, toTenantRow } from './tenant.mapper';

const SLUG_UNIQUE_CONSTRAINT = 'tenants_slug_key';

@Injectable()
export class DrizzleTenantRepository implements TenantRepository {
  async findById(id: TenantId): Promise<Tenant | null> {
    const { db } = requireTransaction();

    // Sorguda `WHERE tenant_id = ?` benzeri bir tenant filtresi YAZILMAZ:
    // RLS zaten filtreler (13.3 kural 8). Elle yazmak, RLS bozuldugunda
    // hatayi maskeler ve testler yesil kalir.
    const rows = await db.select().from(tenants).where(eq(tenants.id, id.value)).limit(1);
    const row = rows[0];

    return row === undefined ? null : toTenant(row);
  }

  /**
   * Slug'i tenant kimligine cevirir — TENANT CONTEXT'I OLMADAN.
   *
   * `platform.tenants` uzerinden dogrudan okumak IMKANSIZDIR: RLS politikasi
   * `id = current_setting(...)` ister ama bu cagrinin amaci tam olarak o id'yi
   * BULMAKTIR (12.4.1). Bu yuzden kontrollu asim fonksiyonu kullanilir; o
   * fonksiyon yalnizca iki alan doner ve listeleme yapamaz.
   */
  async resolveBySlug(slug: TenantSlug): Promise<TenantRef | null> {
    const { db } = requireTransaction();

    const result = await db.execute<{ tenant_id: string; tenant_status: string }>(
      sql`SELECT tenant_id, tenant_status FROM platform.resolve_tenant(${slug.value})`,
    );

    const row = result.rows[0];
    if (row === undefined) {
      return null;
    }

    return {
      id: TenantId.create(row.tenant_id),
      status: parseTenantStatus(row.tenant_status),
    };
  }

  /**
   * Ayni cozumleme fonksiyonu uzerinden calisir.
   *
   * Tabloyu dogrudan sorgulamak YANLIS SONUC verirdi: baska bir tenant'in
   * satiri RLS yuzunden gorunmez, dolayisiyla sorgu her zaman "slug bos" derdi
   * ve nezaket kontrolu hicbir sey yakalamazdi.
   */
  async existsBySlug(slug: TenantSlug): Promise<boolean> {
    return (await this.resolveBySlug(slug)) !== null;
  }

  /**
   * Tenant'i kalici hale getirir.
   *
   * Insert/update ayrimi YAPILMAZ (port sozlesmesi): cagiran taraf "son hali
   * sakla" der. `ON CONFLICT DO UPDATE`, ayni use case'in tekrar calismasi
   * durumunda da dogru sonucu verir — provisioning handler'lari at-least-once
   * calisir ve idempotent olmak zorundadir (ADR-0006).
   */
  async save(tenant: Tenant): Promise<void> {
    const { db } = requireTransaction();
    const row = toTenantRow(tenant, new Date());

    try {
      await db
        .insert(tenants)
        .values(row)
        .onConflictDoUpdate({
          target: tenants.id,
          set: {
            slug: row.slug,
            name: row.name,
            status: row.status,
            archivedAt: row.archivedAt,
            updatedAt: row.updatedAt,
          },
        });
    } catch (error: unknown) {
      throw translateSlugConflict(error, tenant.slug.value);
    }
  }
}

/**
 * Unique index ihlalini domain hatasina cevirir.
 *
 * Slug tekilliginin GERCEK garantisi veritabani index'idir; `existsBySlug`
 * yalnizca nezaket kontroludur ve iki es zamanli istek onu birlikte gecebilir
 * (ADR-0016). Yaris kosulunun kaybeden tarafi burada, cagiran icin anlamli bir
 * hataya donusur — ham bir PostgreSQL hatasi olarak yukari sizmaz.
 */
function translateSlugConflict(error: unknown, slug: string): unknown {
  return isPgError(error, PG_UNIQUE_VIOLATION, SLUG_UNIQUE_CONSTRAINT)
    ? new TenantSlugAlreadyTakenError(slug)
    : error;
}
