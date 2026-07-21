import type { NextFunction, Request, Response } from 'express';
import { uuidv7 } from 'uuidv7';

import { runWithRequestContext } from './request-context';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/** Istemciden gelen kimlikte izin verilen bicim. */
const SAFE_CORRELATION_ID = /^[A-Za-z0-9._-]{8,128}$/;

/**
 * Her istege bir korelasyon kimligi atar ve istek baglamini kurar.
 *
 * Kimlik istemciden gelebilir (dagitik izleme icin gereklidir) ancak DOGRULANIR:
 * ham header degeri log'a yazilirsa saldirgan satir sonu enjekte ederek sahte log
 * kaydi uretebilir. Bicime uymayan deger sessizce reddedilir ve yenisi uretilir.
 *
 * Express seviyesinde (app.use) kaydedilir; boylece NestJS modul middleware'lerinden
 * ve pino-http'den ONCE calismasi garanti altina alinir.
 */
export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const correlationId = readIncomingId(req) ?? uuidv7();

  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  runWithRequestContext({ correlationId }, () => {
    next();
  });
}

function readIncomingId(req: Request): string | undefined {
  const raw = req.headers[CORRELATION_ID_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;

  if (candidate === undefined || !SAFE_CORRELATION_ID.test(candidate)) {
    return undefined;
  }

  return candidate;
}
