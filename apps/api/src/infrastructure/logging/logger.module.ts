import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { uuidv7 } from 'uuidv7';

import { APP_CONFIG, type AppConfig } from '../config/app.config';
import { getCorrelationId } from './request-context';
import { REDACTED_PATHS, REDACTION_PLACEHOLDER } from './redaction';

/** Health endpoint'i orchestrator tarafindan saniyede birden fazla cagrilir. */
const HEALTH_PATH = '/api/v1/health';

/**
 * Yapilandirilmis (structured) loglama.
 *
 * ARCHITECTURE 2: gozlemlenebilirlik OpenTelemetry + Pino. Faz 1'de Pino kurulur;
 * OTel Faz 2'de eklenecek. Log alanlari simdiden OTel ile uyumlu adlandirildi ki
 * trace baglandiginda log formati DEGISMESIN.
 */
@Module({
  imports: [
    LoggerModule.forRootAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        pinoHttp: {
          level: config.logging.level,

          // Korelasyon kimligi middleware tarafindan zaten uretildi; pino ayni
          // degeri kullanir ki HTTP log'u ile uygulama log'u eslesebilsin.
          genReqId: (): string => getCorrelationId() ?? uuidv7(),

          customProps: (): Record<string, string> => {
            const correlationId = getCorrelationId();
            return correlationId === undefined ? {} : { correlationId };
          },

          redact: {
            paths: [...REDACTED_PATHS],
            censor: REDACTION_PLACEHOLDER,
          },

          // Saglik yoklamalari loglanmaz: dakikada onlarca kayit uretip gercek
          // olaylari bogar ve log maliyetini bos yere buyutur.
          autoLogging: {
            ignore: (req): boolean => req.url === HEALTH_PATH,
          },

          // Pretty cikti YALNIZCA gelistirmede. Production JSON uretir; log
          // toplayicilar bicimlendirilmis metni degil yapilandirilmis veriyi okur.
          ...(config.logging.pretty
            ? {
                transport: {
                  target: 'pino-pretty',
                  options: { singleLine: true, translateTime: 'SYS:HH:MM:ss.l' },
                },
              }
            : {}),
        },
      }),
    }),
  ],
})
export class AppLoggerModule {}
