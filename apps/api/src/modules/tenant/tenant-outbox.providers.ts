import { type Provider } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { CLOCK, type Clock } from '../../shared/clock.port';
import {
  TRANSACTION_MANAGER,
  type TransactionManager,
} from '../../shared/transaction-manager.port';
import { PublishTenantEventsUseCase } from './application/publish-tenant-events.use-case';
import {
  TENANT_OUTBOX_REPOSITORY,
  type TenantOutboxRepository,
} from './application/tenant-outbox.repository.port';
import { DrizzleTenantOutboxRepository } from './infrastructure/drizzle-tenant-outbox.repository';
import { TenantOutboxRelay } from './infrastructure/tenant-outbox-relay';

/**
 * Tenant outbox TUKETIM yolunun saglayicilari (ADR-0006).
 *
 * `tenant.module.ts`'ten AYRI: buradakiler bir HTTP istegine degil, arka plan
 * surecine hizmet eder. `identity-outbox.providers.ts` ile birebir ayni ayrim
 * ve ayni gerekce.
 *
 * ============================================================================
 * CONFIG PAYLASILIR — `outboxRelay`, Identity ile ORTAK
 * ============================================================================
 * `OUTBOX_RELAY_ENABLED / INTERVAL_MS / BATCH_SIZE` iki relay'i birden surer.
 * Ayri `TENANT_OUTBOX_RELAY_*` anahtarlari EKLENMEDI: bugun ikisini farkli
 * hizda calistirmak veya birini digerinden bagimsiz kapatmak icin somut bir
 * sebep yok, ve olmayan bir ihtiyac icin dort yeni ortam degiskeni eklemek
 * yapilandirma yuzeyini bosuna buyutur. Gercek bir operasyon ihtiyaci
 * dogdugunda ayirmak tek dosyalik bir istir.
 * ============================================================================
 */
export const tenantOutboxProviders: Provider[] = [
  { provide: TENANT_OUTBOX_REPOSITORY, useClass: DrizzleTenantOutboxRepository },

  {
    provide: PublishTenantEventsUseCase,
    inject: [TENANT_OUTBOX_REPOSITORY, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
    // NestJS useFactory imzasi `inject` dizisiyle BIREBIR eslesmek zorundadir;
    // use case'in KENDI imzasi zaten tek parametrelidir (DEVELOPMENT_RULES 2.5).
    // eslint-disable-next-line max-params
    useFactory: (
      outboxRepository: TenantOutboxRepository,
      transactionManager: TransactionManager,
      clock: Clock,
      config: AppConfig,
    ): PublishTenantEventsUseCase =>
      new PublishTenantEventsUseCase({
        outboxRepository,
        transactionManager,
        clock,
        batchSize: config.outboxRelay.batchSize,
      }),
  },

  // --- Arka plan sureci -----------------------------------------------------
  {
    // Zamanlama config'ten gelir; relay'in kendisi yalnizca zamanlayicidir.
    provide: TenantOutboxRelay,
    inject: [PublishTenantEventsUseCase, APP_CONFIG],
    useFactory: (publishEvents: PublishTenantEventsUseCase, config: AppConfig): TenantOutboxRelay =>
      new TenantOutboxRelay(publishEvents, {
        enabled: config.outboxRelay.enabled,
        intervalMs: config.outboxRelay.intervalMs,
      }),
  },
];
