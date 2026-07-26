import 'reflect-metadata';

import { VersioningType } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';

import { AppModule } from './app.module';
import { APP_CONFIG, type AppConfig } from './infrastructure/config/app.config';
import { ProblemDetailsFilter } from './infrastructure/http/problem-details.filter';
import { SWAGGER_PATH, setupSwagger } from './infrastructure/http/swagger';
import { tenantResolutionMiddleware } from './infrastructure/http/tenant-resolution.middleware';
import { correlationIdMiddleware } from './infrastructure/logging/correlation-id.middleware';

async function bootstrap(): Promise<void> {
  // bufferLogs: Pino devreye girene kadar uretilen acilis loglari kaybolmaz.
  const app = await NestFactory.create(AppModule, { bufferLogs: true });

  app.useLogger(app.get(Logger));

  const config = app.get<AppConfig>(APP_CONFIG);

  // Korelasyon kimligi en once kurulur: bundan sonraki her log satiri ve her
  // hata cevabi ayni kimligi tasir.
  app.use(correlationIdMiddleware);
  app.use(securityHeaders());

  // Refresh token `HttpOnly` cookie ile tasinir (ADR-0026); okumak icin cookie
  // ayristirilmali. Yazma (`res.cookie`) Express'te yerlesiktir, okuma degil.
  app.use(cookieParser());

  // Host'tan tenant IPUCUSU cikarir. Tenant context KURMAZ ve hicbir erisim
  // acmaz — Host istemci kontrolundedir (MULTI_TENANT_ARCHITECTURE P1).
  // Zincirin yetkili adimlari kimlik dogrulamayla birlikte gelecek.
  app.use(tenantResolutionMiddleware);

  if (config.http.corsOrigins.length > 0) {
    app.enableCors({
      origin: [...config.http.corsOrigins],
      credentials: true,
    });
  }

  // ARCHITECTURE 2: API versiyonu URI path'te — /api/v1/...
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' });

  // Tek hata cikisi: her hata RFC 7807 bicimine cevrilir.
  app.useGlobalFilters(new ProblemDetailsFilter());

  if (config.swagger.enabled) {
    setupSwagger(app, config.version);
  }

  // SIGTERM alindiginda acik istekler tamamlanir, DB havuzu duzgun kapanir.
  // Bu olmadan rolling deploy sirasinda istek kaybi yasanir.
  app.enableShutdownHooks();

  await app.listen(config.port);
}

/**
 * Guvenlik basliklari.
 *
 * Swagger UI kendi baslatma script'ini satir ici enjekte eder; varsayilan CSP
 * bunu bloklar ve arayuz bos ekran acilir. Gevsetme YALNIZCA dokuman yoluna
 * uygulanir — API yollarinin politikasi hicbir sekilde degismez.
 */
function securityHeaders(): (req: Request, res: Response, next: NextFunction) => void {
  const strict = helmet();
  const docs = helmet({
    contentSecurityPolicy: {
      directives: {
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
      },
    },
  });

  const docsPrefix = `/${SWAGGER_PATH}`;

  return (req, res, next) => {
    if (req.path.startsWith(docsPrefix)) {
      docs(req, res, next);
      return;
    }
    strict(req, res, next);
  };
}

void bootstrap();
