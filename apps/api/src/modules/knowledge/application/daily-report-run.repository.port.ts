import { type TenantId } from '../domain/tenant-id.value-object';

/** DI token'i. */
export const DAILY_REPORT_RUN_REPOSITORY = Symbol('DAILY_REPORT_RUN_REPOSITORY');

/** Claim edilmis, henuz uretilmemis bir rapor kaydi. */
export interface ClaimedReportRun {
  readonly id: string;
  readonly tenantId: string;
  /** UTC gun (`YYYY-MM-DD`). */
  readonly reportDate: string;
  /** BU denemeden ONCEKI sayac — yeniden deneme karari bunu kullanir. */
  readonly attemptCount: number;
}

/** Dashboard'un okudugu, URETILMIS rapor. */
export interface GeneratedReport {
  readonly reportDate: string;
  readonly summary: string;
  readonly generatedAt: Date;
}

/** Ozetlenecek not — yalnizca metin; id/yazar rapora GIRMEZ. */
export interface ReportNote {
  readonly title: string | null;
  readonly body: string;
}

/**
 * `knowledge.daily_report_runs` (ADR-0030 §2).
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

  /**
   * Uretilmeyi bekleyen kayitlari KILITLEYEREK alir (`FOR UPDATE SKIP LOCKED`).
   *
   * ⚠️ TENANT CONTEXT'I YOKTUR ve olamaz: bu, tenant'lar ARASI bir okumadir.
   * `SECURITY DEFINER` fonksiyona delege edilir (migration 0012); asim
   * `businessos_report_worker`'in dar yuzeyinde toplanmistir.
   *
   * `today`: hangi gune kadarki raporlarin vadesi geldigi. Karar UYGULAMADADIR
   * (config'teki UTC saati), SQL'e gomulmez.
   */
  claimPending(input: {
    readonly limit: number;
    readonly now: Date;
    readonly today: string;
  }): Promise<ClaimedReportRun[]>;

  /**
   * Uretilen ozeti yazar ve kaydi kapatir.
   *
   * Fonksiyon `generated_at IS NULL` kosuluyla idempotenttir: iki instance ayni
   * kaydi uretirse ILK ozet korunur, ikincisi sessizce etkisiz kalir.
   */
  markGenerated(input: {
    readonly id: string;
    readonly summary: string;
    readonly generatedAt: Date;
  }): Promise<void>;

  /**
   * Basarisizligi, yeni sayaci ve backoff'u yazar.
   *
   * BASARISIZLIK DA YAZILMAK ZORUNDADIR: yazilmasaydi sayac artmaz, backoff
   * uygulanmaz ve kayit her turda yeniden denenirdi (migration 0010'un dersi).
   */
  recordFailure(input: {
    readonly id: string;
    readonly attemptCount: number;
    readonly lastError: string;
    readonly nextAttemptAt: Date | null;
    readonly deadLetteredAt: Date | null;
  }): Promise<void>;

  /**
   * Verilen andan SONRA eklenen notlari doner.
   *
   * ⚠️ Bu metot, digerlerinin AKSINE, TENANT CONTEXT'I ALTINDA cagrilir ve
   * normal RLS ile calisir — `businessos_report_worker`'a "notlari oku"
   * yetkisi VERILMEDI ve verilmeyecek (ADR-0030 §2.4'un sozlesmesi, Constraint
   * 2 esdegeri testiyle kanitli). Bu yuzden worker, claim'den sonra HER tenant
   * icin ayri bir tenant transaction'i acar.
   */
  listNotesSince(since: Date): Promise<ReportNote[]>;

  /**
   * Aktif tenant'in EN SON URETILMIS raporu; yoksa `null`.
   *
   * ⚠️ TENANT CONTEXT'I altinda cagrilir (dashboard okumasi); daraltmayi RLS
   * yapar. `listNotesSince` ile ayni yetki modeli — dar rol devrede DEGIL.
   *
   * `generated_at IS NOT NULL` filtresi: bekleyen ya da olu mektuba dusmus bir
   * satir "rapor" degildir, ozeti yoktur.
   */
  findLatestGenerated(): Promise<GeneratedReport | null>;
}
