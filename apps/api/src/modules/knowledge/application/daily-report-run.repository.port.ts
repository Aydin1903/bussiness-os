import { type TenantId } from '../domain/tenant-id.value-object';

/** DI token'i. */
export const DAILY_REPORT_RUN_REPOSITORY = Symbol('DAILY_REPORT_RUN_REPOSITORY');

/**
 * `knowledge.daily_report_runs` YAZMA yolu — "tembel seed" (ADR-0030 §2).
 *
 * ============================================================================
 * NEDEN YAZMA YOLU BURADA, OKUMA YOLU WORKER'DA
 * ============================================================================
 * Satiri, o gun ILK NOT eklendiginde bu use case yazar. Zamanlayici tenant
 * LISTESI ARAMAZ — ve tam bu yuzden `businessos_report_worker` rolu GERCEKTEN
 * tek tabloya yetkili kalabiliyor (`platform.tenants`'a erisimi yok, entegrasyon
 * testiyle kanitli).
 *
 * Yan fayda: hic not eklenmemis tenant icin satir HIC olusmaz, yani bos rapor
 * uretilmez (ADR-0030'un "bos rapor" sinirini kendiliginden cozer).
 * ============================================================================
 */
export interface DailyReportRunRepository {
  /**
   * O gun icin bekleyen bir kayit YOKSA olusturur; VARSA hicbir sey yapmaz.
   *
   * Idempotency `UNIQUE (tenant_id, report_date)` kisitina dayanir (migration
   * 0012): es zamanli iki not, ikinci satiri yaratmak yerine sessizce atlar.
   * "Once oku sonra yaz" yaklasimi iki istek arasinda yaris birakirdi.
   */
  ensureScheduled(input: {
    readonly id: string;
    readonly tenantId: TenantId;
    /** UTC gun (`YYYY-MM-DD`). Tenant bazli saat dilimi kapsam disi. */
    readonly reportDate: string;
  }): Promise<void>;
}
