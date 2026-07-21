import type { DomainEvent } from './domain-event';

/**
 * Domain event yayin port'u.
 *
 * ============================================================================
 * BU BIR KUYRUK DEGILDIR — OUTBOX'IN ONUDUR
 * ============================================================================
 *
 * ADR-0006 ve ARCHITECTURE 7.1: bir domain event, onu doguran veri
 * degisikligiyle AYNI TRANSACTION'da kaydedilmelidir.
 *
 * Adapter bu yuzden event'i mesaj kuyruguna DEGIL, `platform.outbox`
 * tablosuna `INSERT` eder — cagiran use case'in acmis oldugu transaction'in
 * icinde. Ayri bir publisher process outbox'i okuyup event bus'a tasir.
 *
 * Neden boyle: dogrudan kuyruga yazan bir implementasyon su hatayi uretir —
 * veritabani commit olur, sonra process coker, event HIC yayinlanmaz ve sistem
 * kalici olarak tutarsiz kalir. Bu, dagitik sistemlerin en yaygin SESSIZ
 * hatasidir.
 *
 * Sonuc olarak `publish()` "gonderildi" anlamina gelmez, "ayni transaction'da
 * kaydedildi, teslimi garanti altina alindi" anlamina gelir.
 *
 * Handler'lar AT-LEAST-ONCE teslimat varsayarak idempotent yazilir
 * (ARCHITECTURE 7.2).
 * ============================================================================
 */
/** DI token'i. */
export const DOMAIN_EVENT_PUBLISHER = Symbol('DOMAIN_EVENT_PUBLISHER');

export interface DomainEventPublisher {
  /**
   * Event'i, cagiran transaction'in icinde yayina kaydeder.
   *
   * Kendi transaction'ini ACMAZ. Transaction siniri use case'tedir
   * (MULTI_TENANT_ARCHITECTURE 13.3 kural 2).
   */
  publish(event: DomainEvent): Promise<void>;
}
