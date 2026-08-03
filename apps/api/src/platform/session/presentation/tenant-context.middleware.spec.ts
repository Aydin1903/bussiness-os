import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it } from 'vitest';

import { runWithPrincipal } from '../../../infrastructure/auth/auth-context';
import {
  getTenantContext,
  type TenantContext,
} from '../../../infrastructure/tenant/tenant-context';
import {
  type ResolveMemberAccessInput,
  type TenantAccessQuery,
  type TenantAccessResult,
} from '../../../modules/tenant/tenant.public';
import { TenantContextMiddleware } from './tenant-context.middleware';

/** Elle yazilmis FAKE'ler — mock kutuphanesi yok (DEVELOPMENT_RULES 5.3). */

const USER_ID = '018f3a2b-7c4d-7e1f-9b3c-4d5e6f7a8b9c';
const SESSION_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_ID = '018f3a2b-7c4d-7e1f-8a2b-0000000000a1';

class FakeTenantAccessQuery implements TenantAccessQuery {
  result: TenantAccessResult = { granted: true, tenantId: TENANT_ID, role: 'admin' };
  readonly calls: ResolveMemberAccessInput[] = [];

  resolveMemberAccess(input: ResolveMemberAccessInput): Promise<TenantAccessResult> {
    this.calls.push(input);
    return Promise.resolve(this.result);
  }
}

const request = {} as Request;
const response = {} as Response;

interface RunOutcome {
  readonly capturedContext: TenantContext | undefined;
  readonly nextCalls: number;
  readonly nextError: unknown;
}

/**
 * Middleware'i calistirir ve `next()` ICINDE gorunen context'i yakalar.
 *
 * Context yalnizca callback icinde yasar (ALS); disaridan bakmak her zaman
 * `undefined` verirdi — bu yuzden olcum noktasi `next`'in kendisidir.
 */
async function run(
  middleware: TenantContextMiddleware,
  principal: { userId: string; sessionId: string; tenantId: string | null } | null,
): Promise<RunOutcome> {
  let capturedContext: TenantContext | undefined;
  let nextCalls = 0;
  let nextError: unknown;

  const next: NextFunction = (error?: unknown) => {
    nextCalls += 1;
    nextError = error;
    capturedContext = getTenantContext();
  };

  if (principal === null) {
    await middleware.use(request, response, next);
  } else {
    await runWithPrincipal(principal, () => middleware.use(request, response, next));
  }

  return { capturedContext, nextCalls, nextError };
}

function createMiddleware(): {
  middleware: TenantContextMiddleware;
  accessQuery: FakeTenantAccessQuery;
} {
  const accessQuery = new FakeTenantAccessQuery();
  return { middleware: new TenantContextMiddleware(accessQuery), accessQuery };
}

describe('TenantContextMiddleware — tenant claim i OLMAYAN istekler', () => {
  it('anonim istekte context KURMAZ ve gecer', async () => {
    const { middleware, accessQuery } = createMiddleware();

    const outcome = await run(middleware, null);

    // Kayit/giris tanimi geregi tenant'sizdir; burada reddetmek onlari
    // kullanilamaz kilardi.
    expect(outcome.capturedContext).toBeUndefined();
    expect(outcome.nextCalls).toBe(1);
    expect(outcome.nextError).toBeUndefined();
    expect(accessQuery.calls).toHaveLength(0);
  });

  it('KIMLIK token inda (tenant claim i null) context KURMAZ', async () => {
    const { middleware, accessQuery } = createMiddleware();

    const outcome = await run(middleware, {
      userId: USER_ID,
      sessionId: SESSION_ID,
      tenantId: null,
    });

    // switch-tenant ve logout bu yolda calisir; uyelik sorgusu bile yapilmaz.
    expect(outcome.capturedContext).toBeUndefined();
    expect(accessQuery.calls).toHaveLength(0);
  });
});

describe('TenantContextMiddleware — tenant-scoped access token', () => {
  const accessPrincipal = { userId: USER_ID, sessionId: SESSION_ID, tenantId: TENANT_ID };

  it('context i kurar ve rolu MEMBERSHIP ten doldurur', async () => {
    const { middleware } = createMiddleware();

    const outcome = await run(middleware, accessPrincipal);

    // Rol token'da YOKTUR (§10.3); tek kaynagi membership sorgusudur.
    expect(outcome.capturedContext).toEqual({
      tenantId: TENANT_ID,
      userId: USER_ID,
      role: 'admin',
      correlationId: 'unknown',
      source: 'http',
    });
  });

  it('uyeligi HER ISTEKTE yeniden dogrular', async () => {
    const { middleware, accessQuery } = createMiddleware();

    await run(middleware, accessPrincipal);
    await run(middleware, accessPrincipal);

    // Token'a guvenip atlamak, iptal edilen uyeligin 15 dk daha gecerli
    // kalmasi demekti (§14.1 T4).
    expect(accessQuery.calls).toEqual([
      { userId: USER_ID, tenantId: TENANT_ID },
      { userId: USER_ID, tenantId: TENANT_ID },
    ]);
  });

  it('tenant id yi DOGRULANMIS claim den alir', async () => {
    const { middleware, accessQuery } = createMiddleware();

    await run(middleware, accessPrincipal);

    expect(accessQuery.calls[0]).toEqual({ userId: USER_ID, tenantId: TENANT_ID });
  });

  it('Tenant in onayladigi rol degisirse context o rolu tasir', async () => {
    const { middleware, accessQuery } = createMiddleware();
    accessQuery.result = { granted: true, tenantId: TENANT_ID, role: 'viewer' };

    const outcome = await run(middleware, accessPrincipal);

    expect(outcome.capturedContext?.role).toBe('viewer');
  });
});

describe('TenantContextMiddleware — erisim reddi', () => {
  const accessPrincipal = { userId: USER_ID, sessionId: SESSION_ID, tenantId: TENANT_ID };

  it.each([['no-membership'], ['membership-inactive'], ['tenant-inactive']] as const)(
    '%s icin context KURMAZ ve 403 uretir',
    async (reason) => {
      const { middleware, accessQuery } = createMiddleware();
      accessQuery.result = { granted: false, reason };

      const outcome = await run(middleware, accessPrincipal);

      // Hata `next(error)` ile verilir: async middleware'de firlatmak istegi
      // yanitsiz asili birakirdi.
      expect(outcome.nextError).toBeInstanceOf(ForbiddenException);
      expect(outcome.capturedContext).toBeUndefined();
    },
  );

  it('token GECERLI olsa da erisim ANLIK kaybedilebilir', async () => {
    const { middleware, accessQuery } = createMiddleware();

    const before = await run(middleware, accessPrincipal);
    expect(before.capturedContext?.role).toBe('admin');

    // Uyelik istek arasinda iptal edildi.
    accessQuery.result = { granted: false, reason: 'membership-inactive' };
    const after = await run(middleware, accessPrincipal);

    // Iptalin GERCEKTEN islemesi budur: token hala imzali ve suresi dolmamis.
    expect(after.nextError).toBeInstanceOf(ForbiddenException);
    expect(after.capturedContext).toBeUndefined();
  });
});
