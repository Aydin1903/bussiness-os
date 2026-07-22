import type { DomainEventPublisher } from '../../../shared/domain-event-publisher.port';

/**
 * Identity domain event yayin port'u.
 *
 * Sozlesme `DomainEventPublisher` ile AYNIDIR (transaction'in icine yazar,
 * "gonderildi" degil "kaydedildi" anlamina gelir) — ama HEDEF farklidir:
 * `platform.identity_outbox`, `platform.outbox` degil. Identity event'leri
 * tenant'sizdir (§15.1) ve tenant outbox'inin `tenant_id NOT NULL` kisitina
 * yazilamaz.
 *
 * Ayri bir DI token'i bu ayrimi acik kilar: use case hangi outbox'a yazdigini
 * token'dan bilir, adapter degistirmeden.
 */
/** DI token'i. */
export const IDENTITY_EVENT_PUBLISHER = Symbol('IDENTITY_EVENT_PUBLISHER');

export type IdentityEventPublisher = DomainEventPublisher;
