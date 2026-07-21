/**
 * Tum domain event'lerinin ortak sozlesmesi
 * (ARCHITECTURE 7.2, MULTI_TENANT_ARCHITECTURE 15.1).
 *
 * `shared/` altinda yasar cunku her modul kendi event'lerini uretir ama hepsi
 * ayni zarfi tasir; outbox ve event bus bu zarfa gore calisir, modulleri
 * bilmez.
 *
 * Framework'suzdur: burada NestJS event emitter'i, kuyruk kutuphanesi veya
 * serilestirme detayi YOKTUR. Bunlar adapter'in isidir.
 */
export interface DomainEvent {
  /** Event'in kendi kimligi (UUIDv7). Idempotent handler'lar bunu kullanir. */
  readonly eventId: string;

  /** Nokta ile ayrilmis, gecmis zaman: `tenant.provisioning_requested`. */
  readonly eventType: string;

  /**
   * Sema surumu. Event'ler IMMUTABLE'dir; sema degisirse surum artar ve eski
   * surumu tuketen handler'lar calismaya devam eder.
   */
  readonly eventVersion: number;

  /**
   * Event'i doguran tenant.
   *
   * MULTI_TENANT_ARCHITECTURE 15.1: tenant'a atfedilemeyen event yayinlanamaz.
   * Tek istisna, tenant'in henuz var OLMADIGI Identity event'leridir
   * (`UserRegistered`, `UserEmailVerified`) — onlar `null` tasir ve yalnizca
   * Identity modulunde tuketilir.
   */
  readonly tenantId: string | null;

  readonly occurredAt: Date;

  /** Istegi/isi uctan uca izlemeye yarar; HTTP sinirindan gelir. */
  readonly correlationId: string;

  readonly payload: Readonly<Record<string, unknown>>;
}
