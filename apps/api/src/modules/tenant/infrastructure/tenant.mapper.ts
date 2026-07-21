import { parseTenantStatus } from '../domain/tenant-status.value-object';
import { Tenant } from '../domain/tenant.entity';
import { TenantId } from '../domain/tenant-id.value-object';
import { TenantSlug } from '../domain/tenant-slug.value-object';
import { UserId } from '../domain/user-id.value-object';

/** `platform.tenants` satirinin ham bicimi. */
export interface TenantRow {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly status: string;
  readonly ownerUserId: string;
  readonly createdAt: Date;
  readonly archivedAt: Date | null;
}

/**
 * Veritabani satirini domain nesnesine cevirir.
 *
 * Ham kolonlar value object'lere BURADA donusur — sinirda. Boylece bozuk bir
 * kolon degeri (elle duzenlenmis satir, eski bir migration'dan kalan veri)
 * entity'ye ulasmadan yakalanir; `Tenant.fromPersistence` ayrica tutarlilik
 * invariant'ini dogrular.
 */
export function toTenant(row: TenantRow): Tenant {
  return Tenant.fromPersistence({
    id: TenantId.create(row.id),
    slug: TenantSlug.create(row.slug),
    name: row.name,
    status: parseTenantStatus(row.status),
    ownerUserId: UserId.create(row.ownerUserId),
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  });
}

/**
 * Domain nesnesini yazilabilir satira cevirir.
 *
 * `updatedAt` BURADA uretilir, entity'de karsiligi yoktur: bu bir DENETIM
 * kolonudur, is kurali degil. Entity'ye eklenseydi her davranis metodunun onu
 * guncellemeyi hatirlamasi gerekirdi — ve biri unuturdu.
 */
export function toTenantRow(tenant: Tenant, now: Date): TenantRow & { updatedAt: Date } {
  return {
    id: tenant.id.value,
    slug: tenant.slug.value,
    name: tenant.name,
    status: tenant.status,
    ownerUserId: tenant.ownerUserId.value,
    createdAt: tenant.createdAt,
    archivedAt: tenant.archivedAt,
    updatedAt: now,
  };
}
