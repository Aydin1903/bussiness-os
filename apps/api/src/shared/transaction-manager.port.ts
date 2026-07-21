/**
 * Transaction sinirini yoneten port.
 *
 * MULTI_TENANT_ARCHITECTURE 13.3 kural 2: transaction siniri USE CASE'tedir.
 * Repository kendi basina transaction acmaz — acarsa ic ice transaction ve
 * kismi commit olusur.
 *
 * `shared/` altinda yasar cunku tenant'a ozgu degildir; her modulun use
 * case'leri ayni sozlesmeye ihtiyac duyar.
 */
/** DI token'i. */
export const TRANSACTION_MANAGER = Symbol('TRANSACTION_MANAGER');

export interface TransactionManager {
  /**
   * Verilen isi tek bir transaction icinde calistirir.
   *
   * `fn` hata firlatirsa transaction GERI ALINIR; basariyla donerse commit
   * edilir. Kismi commit diye bir sey yoktur.
   *
   * TENANT CONTEXT KURMAZ. Bu metot yalnizca context'in HENUZ olmadigi
   * akislar icindir — provisioning ve tenant resolution
   * (MULTI_TENANT_ARCHITECTURE 8.2). Tenant verisine dokunan her is icin
   * `runInTenantTransaction` kullanilir.
   */
  runInTransaction<T>(fn: () => Promise<T>): Promise<T>;

  /**
   * Verilen isi, tenant context'i KURULMUS bir transaction icinde calistirir.
   *
   * Transaction acildiktan sonra `SET LOCAL app.current_tenant_id` uygulanir;
   * RLS politikalari bundan sonra otomatik filtreler
   * (MULTI_TENANT_ARCHITECTURE 11.3).
   *
   * `SET LOCAL` kullanilir, `SET` DEGIL: transaction bitince deger otomatik
   * temizlenir ve havuza donen baglantida onceki tenant'in kimligi KALMAZ.
   * `SET` (LOCAL'siz) bu projede yasaktir — connection pooling ile
   * birlestiginde dogrudan tenant sizintisi uretir (DEVELOPMENT_RULES 4.3).
   *
   * ============================================================================
   * PROVISIONING ICIN NEDEN GEREKLI
   * ============================================================================
   * `platform.memberships` standart RLS'e tabidir
   * (MULTI_TENANT_ARCHITECTURE 12.4) — `platform.tenants`'tan farkli olarak.
   *
   * Provisioning sirasinda owner membership'i yazilirken tenant context'i
   * henuz yoktur ve `INSERT` RLS'e TAKILIR. Dogru cozum, tenant kaydi
   * olusturulduktan hemen sonra context'i YENI tenant'in id'siyle kurmak ve
   * membership yazimini onun icinde yapmaktir.
   *
   * Bu yuzden port iki metot tasir: biri context'siz (tenant kaydinin kendisi),
   * digeri context'li (tenant'a ait her sey).
   * ============================================================================
   */
  runInTenantTransaction<T>(tenantId: string, fn: () => Promise<T>): Promise<T>;
}
