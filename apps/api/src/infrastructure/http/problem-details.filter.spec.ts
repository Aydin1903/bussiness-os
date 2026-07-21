import {
  type ArgumentsHost,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ProblemDetails } from '@business-os/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ProblemDetailsFilter } from './problem-details.filter';

interface CapturedResponse {
  readonly status: number;
  readonly contentType: string;
  readonly body: ProblemDetails;
}

function handle(exception: unknown): CapturedResponse {
  let status = 0;
  let contentType = '';
  let body: ProblemDetails | undefined;

  const response = {
    status: (code: number) => {
      status = code;
      return response;
    },
    type: (value: string) => {
      contentType = value;
      return response;
    },
    json: (payload: ProblemDetails) => {
      body = payload;
      return response;
    },
  };

  const host = {
    switchToHttp: () => ({
      getRequest: () => ({ originalUrl: '/api/v1/test' }),
      getResponse: () => response,
    }),
  };

  new ProblemDetailsFilter().catch(exception, host as unknown as ArgumentsHost);

  if (body === undefined) {
    throw new Error('Filtre bir cevap uretmedi');
  }

  return { status, contentType, body };
}

describe('ProblemDetailsFilter', () => {
  beforeEach(() => {
    // Beklenen hata loglari test ciktisini kirletmesin.
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  it('RFC 7807 icerik tipiyle cevap verir', () => {
    const result = handle(new NotFoundException('Kayit bulunamadi'));

    expect(result.contentType).toBe('application/problem+json');
  });

  describe('sunucu hatalari (5xx) — ic detay sizdirmaz', () => {
    // DEVELOPMENT_RULES 7.2. Bu testlerin varlik sebebi somut bir hatadir:
    // HttpException dali statuye bakmadan exception.message'i cevaba tasiyordu.
    const SENSITIVE =
      'connect ECONNREFUSED postgres://app:SUPER_SECRET@db-prod-01:5432/business_os';

    it('InternalServerErrorException mesajini istemciye tasimaz', () => {
      const result = handle(new InternalServerErrorException(SENSITIVE));

      const serialized = JSON.stringify(result.body);
      expect(serialized).not.toContain('SUPER_SECRET');
      expect(serialized).not.toContain('postgres://');
      expect(serialized).not.toContain('db-prod-01');
    });

    it('genel bir baslik ve detay dondurur', () => {
      const result = handle(new InternalServerErrorException(SENSITIVE));

      expect(result.body.title).toBe('Internal server error');
      expect(result.body.detail).toBe('Beklenmeyen bir hata olustu.');
      expect(result.status).toBe(500);
    });

    it('5xx statusunu korur ama govdeyi yine de genellestirir', () => {
      const result = handle(new ServiceUnavailableException(SENSITIVE));

      expect(result.status).toBe(503);
      expect(result.body.status).toBe(503);
      expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
    });

    it('HttpException olmayan hatalarda da detay sizdirmaz', () => {
      const result = handle(new Error(SENSITIVE));

      expect(result.status).toBe(500);
      expect(JSON.stringify(result.body)).not.toContain('SUPER_SECRET');
    });

    it('detayi log a yazar — bilgi kaybolmaz, yalnizca yer degistirir', () => {
      const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      handle(new InternalServerErrorException(SENSITIVE));

      expect(logSpy).toHaveBeenCalledOnce();
    });
  });

  describe('istemci hatalari (4xx) — mesaj korunur', () => {
    // 4xx mesajlari istemcinin kendi hatasini duzeltmesi icindir; bunlari
    // genellestirmek API yi kullanilamaz hale getirir.
    it('404 mesajini korur', () => {
      const result = handle(new NotFoundException('Fatura bulunamadi'));

      expect(result.status).toBe(404);
      expect(result.body.title).toBe('Fatura bulunamadi');
    });

    it('403 icin anlamli bir tip URI si uretir', () => {
      const result = handle(new ForbiddenException());

      expect(result.status).toBe(403);
      expect(result.body.type).toContain('forbidden');
    });

    it('400 mesajini detay alanina koyar', () => {
      const result = handle(new BadRequestException('sayfa parametresi pozitif olmalidir'));

      expect(result.body.detail).toBe('sayfa parametresi pozitif olmalidir');
    });

    it('sunucu hatalarini loglar ama istemci hatalarini loglamaz', () => {
      const logSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

      handle(new NotFoundException('yok'));

      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  describe('dogrulama hatalari', () => {
    function zodError(): unknown {
      const schema = z.object({ email: z.email(), age: z.number().int().min(18) });
      const result = schema.safeParse({ email: 'gecersiz', age: 12 });
      return result.success ? undefined : result.error;
    }

    it('422 dondurur', () => {
      const result = handle(zodError());

      expect(result.status).toBe(422);
      expect(result.body.type).toContain('validation-failed');
    });

    it('alan bazli hatalari listeler', () => {
      const result = handle(zodError());

      const paths = result.body.errors?.map((error) => error.path);
      expect(paths).toContain('email');
      expect(paths).toContain('age');
    });
  });

  it('istek yolunu instance alanina yazar', () => {
    const result = handle(new NotFoundException());

    expect(result.body.instance).toBe('/api/v1/test');
  });
});
