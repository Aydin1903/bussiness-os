import { Module } from '@nestjs/common';

import { AI_USAGE_RECORDER } from '../../shared/ai-usage-recorder.port';
import { AppLoggerModule } from '../logging/logger.module';
import { LoggingAiUsageRecorder } from './logging-ai-usage-recorder';

/**
 * AI cagrilarinin maliyet kaydi (ROADMAP §8.1).
 *
 * Bir IS modulu DEGIL, cross-cutting bir altyapi parcasidir — bu yuzden
 * `modules/` altinda degil `infrastructure/` altindadir (CLAUDE.md dizin
 * kurallari).
 *
 * AI kullanan her modul bunu import eder. Bugun tek tuketici Knowledge; ADR-0031
 * ile CRM ikinci olacak.
 */
@Module({
  imports: [AppLoggerModule],
  providers: [
    LoggingAiUsageRecorder,
    { provide: AI_USAGE_RECORDER, useExisting: LoggingAiUsageRecorder },
  ],
  exports: [AI_USAGE_RECORDER],
})
export class AiObservabilityModule {}
