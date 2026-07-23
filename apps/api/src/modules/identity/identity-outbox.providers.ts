import { type Provider } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../infrastructure/config/app.config';
import { CLOCK, type Clock } from '../../shared/clock.port';
import { EMAIL_PORT, type EmailPort } from '../../shared/email.port';
import { TRANSACTION_MANAGER, type TransactionManager } from '../../shared/transaction-manager.port';
import {
  IDENTITY_OUTBOX_REPOSITORY,
  type IdentityOutboxRepository,
} from './application/identity-outbox.repository.port';
import { PublishIdentityEventsUseCase } from './application/publish-identity-events.use-case';
import { IdentityOutboxRelay } from './infrastructure/identity-outbox-relay';

/**
 * Outbox TESLIMAT yolunun saglayicilari (ADR-0006).
 *
 * Use case saglayicilarindan AYRI: buradakiler bir HTTP istegine degil, arka
 * plan surecine hizmet eder ve tek yapilandirma kaynagi `outboxRelay` config'idir.
 * Ayrim ayrica `identity-use-case.providers.ts`'i 300 satir sinirinin altinda tutar.
 */
export const identityOutboxProviders: Provider[] = [
    {
      provide: PublishIdentityEventsUseCase,
      inject: [IDENTITY_OUTBOX_REPOSITORY, EMAIL_PORT, TRANSACTION_MANAGER, CLOCK, APP_CONFIG],
      // eslint-disable-next-line max-params
      useFactory: (
        outboxRepository: IdentityOutboxRepository,
        emailPort: EmailPort,
        transactionManager: TransactionManager,
        clock: Clock,
        config: AppConfig,
      ): PublishIdentityEventsUseCase =>
        new PublishIdentityEventsUseCase({
          outboxRepository,
          emailPort,
          transactionManager,
          clock,
          batchSize: config.outboxRelay.batchSize,
        }),
    },

    // --- Arka plan sureci ---------------------------------------------------
    {
      // Zamanlama config'ten gelir; relay'in kendisi yalnizca zamanlayicidir.
      provide: IdentityOutboxRelay,
      inject: [PublishIdentityEventsUseCase, APP_CONFIG],
      useFactory: (
        publishEvents: PublishIdentityEventsUseCase,
        config: AppConfig,
      ): IdentityOutboxRelay =>
        new IdentityOutboxRelay(publishEvents, {
          enabled: config.outboxRelay.enabled,
          intervalMs: config.outboxRelay.intervalMs,
        }),
    }
];
