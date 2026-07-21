import type { Tenant } from '../domain/tenant.entity';
import type { TenantId } from '../domain/tenant-id.value-object';
import type { TenantSlug } from '../domain/tenant-slug.value-object';

/**
 * Tenant kaliciligi icin application port'u.
 *
 * ARCHITECTURE 4: port APPLICATION katmanina aittir, implementasyon
 * infrastructure'a. Use case yalnizca bu arayuzu bilir; Drizzle, SQL veya
 * baglanti havuzu diye bir sey oldugundan haberi yoktur.
 *
 * ============================================================================
 * NEDEN BU PORT §13.1'IN ISTISNASIDIR — okumadan gecmeyin
 * ============================================================================
 *
 * MULTI_TENANT_ARCHITECTURE 13.1: "Repository metot imzalarinda `tenantId`
 * parametresi bulunmaz." Gerekce: deger tenant context'inden gelir, boylece
 * yanlis deger gecmek IMKANSIZ olur.
 *
 * `TenantRepository` bu kurala uyamaz, cunku burasi tenant context'inin HENUZ
 * KURULMADIGI yerdir:
 *
 * - `findBySlug()` tenant resolution sirasinda calisir. Context'i kuracak olan
 *   sorgu, context'e dayanamaz (MULTI_TENANT_ARCHITECTURE 8.2).
 * - `save()` provisioning sirasinda calisir. Tenant henuz yaratiliyor; kendi
 *   context'i yok (ADR-0016).
 * - `existsBySlug()` kayit akisinda, kullanicinin hicbir tenant'i yokken
 *   calisir.
 *
 * Bu bir kural IHLALI degil, kuralin KAPSAMADIGI bir alandir: `platform.tenants`
 * zaten MULTI_TENANT_ARCHITECTURE 12.4'teki platform tablolari istisna
 * listesindedir ve standart `tenant_id = current_setting(...)` politikasina tabi
 * degildir.
 *
 * TELAFI EDICI KONTROL — implementasyon yazilirken zorunludur:
 * - Tablonun RLS politikasi `id = current_setting('app.current_tenant_id')`
 *   bicimindedir; yani context KURULDUKTAN sonra bir tenant yalnizca KENDI
 *   satirini gorur (12.4).
 * - Context'in olmadigi cagrilar (resolution, provisioning) DEVELOPMENT_RULES
 *   4.4 geregi adapter tarafinda acikca isaretlenir ve ayrica review edilir.
 * - Listeleme metodu YOKTUR ve eklenmemelidir: `findAll()` benzeri bir metot,
 *   tum tenant'lari donduren tek satirlik bir sizinti kapisidir.
 * ============================================================================
 */
export interface TenantRepository {
  /**
   * Kimlige gore tenant getirir; yoksa `null`.
   *
   * Bulunamamak bir HATA degildir — cagiran taraf bunu bir domain kararina
   * cevirir. Repository'nin exception firlatmasi, "yok" ile "erisilemedi"
   * durumlarini ayirt edilemez kilardi.
   */
  findById(id: TenantId): Promise<Tenant | null>;

  /**
   * Slug'a gore tenant getirir; yoksa `null`.
   *
   * Tenant resolution'in ilk adimidir (MULTI_TENANT_ARCHITECTURE 8.2). Donen
   * tenant bir IPUCUDUR, yetki kaynagi DEGILDIR: erisim karari daima
   * dogrulanmis JWT claim'i ile verilir (ADR-0015).
   */
  findBySlug(slug: TenantSlug): Promise<Tenant | null>;

  /**
   * Slug kullanimda mi?
   *
   * Bu, provisioning oncesi bir NEZAKET kontroludur — kullaniciya erken ve
   * anlamli geri bildirim vermek icindir. TEKILLIGI GARANTI ETMEZ: "once
   * kontrol et sonra yaz" bir yaris kosuludur. Gercek garanti veritabani
   * unique index'idir ve kisit ihlali 409'a cevrilir (ADR-0016).
   */
  existsBySlug(slug: TenantSlug): Promise<boolean>;

  /**
   * Tenant'i kalici hale getirir.
   *
   * Insert/update ayrimi YAPILMAZ: bu bir persistence detayidir ve port'un
   * bilmesi gereken bir sey degildir. Cagiran taraf "bu tenant'in son halini
   * sakla" der, nasil saklandigi adapter'in isidir.
   *
   * Transaction ACMAZ. Transaction siniri use case'tedir
   * (MULTI_TENANT_ARCHITECTURE 13.3 kural 2); repository kendi basina
   * transaction acarsa ic ice transaction ve kismi commit olusur.
   */
  save(tenant: Tenant): Promise<void>;
}
