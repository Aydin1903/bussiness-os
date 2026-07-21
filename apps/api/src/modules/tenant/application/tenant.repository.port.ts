import type { TenantStatus } from '../domain/tenant-status.value-object';
import type { Tenant } from '../domain/tenant.entity';
import type { TenantId } from '../domain/tenant-id.value-object';
import type { TenantSlug } from '../domain/tenant-slug.value-object';

/** DI token'i. Symbol kullanildi: string token'lar sessizce cakisabilir. */
export const TENANT_REPOSITORY = Symbol('TENANT_REPOSITORY');

/**
 * Tenant resolution'in dondurdugu DAR kayit.
 *
 * Neden tam `Tenant` degil: cozumleme, tenant context'i KURULMADAN once
 * calisir ve `platform.resolve_tenant` fonksiyonu bilincli olarak yalnizca iki
 * alan dondurur (MULTI_TENANT_ARCHITECTURE 12.4.1). Ad, sahip veya olusturulma
 * zamani bu asamada OKUNAMAZ — okunabilseydi RLS asimi genislemis olurdu.
 *
 * Zaten resolution'in ihtiyaci da bu ikisidir: hangi tenant (8.2 capraz
 * kontrol) ve tenant aktif mi (8.2 adim 7).
 */
export interface TenantRef {
  readonly id: TenantId;
  readonly status: TenantStatus;
}

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
   * Slug'i tenant kimligine cevirir; yoksa `null`.
   *
   * Tenant resolution'in ilk adimidir (MULTI_TENANT_ARCHITECTURE 8.2) ve
   * TENANT CONTEXT'I OLMADAN calisir — context'i kuracak olan cagri budur.
   * Bu yuzden tam bir `Tenant` DEGIL, dar bir `TenantRef` doner (12.4.1).
   *
   * Donen kayit bir IPUCUDUR, yetki kaynagi DEGILDIR: erisim karari daima
   * dogrulanmis JWT claim'i ile verilir (ADR-0015).
   */
  resolveBySlug(slug: TenantSlug): Promise<TenantRef | null>;

  /**
   * Slug kullanimda mi?
   *
   * Bu, provisioning oncesi bir NEZAKET kontroludur — kullaniciya erken ve
   * anlamli geri bildirim vermek icindir. TEKILLIGI GARANTI ETMEZ: "once
   * kontrol et sonra yaz" bir yaris kosuludur. Gercek garanti veritabani
   * unique index'idir ve kisit ihlali ayni domain hatasina cevrilir (ADR-0016).
   *
   * NOT: bu kontrol RLS uzerinden YAPILAMAZ — baska bir tenant'in satiri zaten
   * gorunmez ve sorgu daima "kullanilmiyor" derdi. Bu yuzden resolveBySlug ile
   * ayni cozumleme fonksiyonu uzerinden calisir.
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
