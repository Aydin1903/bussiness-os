import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';

import { runWithPrincipal } from '../../../infrastructure/auth/auth-context';
import { runWithTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { PERMISSION_METADATA_KEY } from '../authz.public';
import { InMemoryPermissionRegistry } from '../application/in-memory-permission-registry';
import { PolicyEngine } from '../application/policy-engine';
import { PermissionGuard } from './permission.guard';

const MEMBER_READ = 'member:read';

function guardWith(): PermissionGuard {
  const registry = new InMemoryPermissionRegistry();
  registry.register([{ permission: MEMBER_READ, roles: ['owner', 'admin'] }]);
  return new PermissionGuard(new Reflector(), new PolicyEngine(registry));
}

/** Verilen permission'i (veya hicbirini) deklare eden bir ExecutionContext taklidi. */
function contextRequiring(permission: string | undefined): ExecutionContext {
  const handler = (): void => undefined;
  if (permission !== undefined) {
    Reflect.defineMetadata(PERMISSION_METADATA_KEY, permission, handler);
  }

  function NoopController(): void {
    return undefined;
  }
  return {
    getHandler: () => handler,
    getClass: () => NoopController,
  } as unknown as ExecutionContext;
}

function contextFor(role: string) {
  return { tenantId: 't-1', userId: 'u-1', role, correlationId: 'c-1', source: 'http' as const };
}

describe('PermissionGuard — isaretsiz endpoint', () => {
  it('permission deklare edilmemisse GECIRIR (guard in isi degil)', () => {
    const guard = guardWith();

    // Kayit/giris gibi kaynak-disi uc noktalar kapsam disidir.
    expect(guard.canActivate(contextRequiring(undefined))).toBe(true);
  });
});

describe('PermissionGuard — yetki karari', () => {
  it('rol permission i tasiyorsa gecirir', () => {
    const guard = guardWith();

    const allowed = runWithTenantContext(contextFor('owner'), () =>
      guard.canActivate(contextRequiring(MEMBER_READ)),
    );

    expect(allowed).toBe(true);
  });

  it('rol permission i TASIMIYORSA 403 firlatir', () => {
    const guard = guardWith();

    expect(() =>
      runWithTenantContext(contextFor('viewer'), () =>
        guard.canActivate(contextRequiring(MEMBER_READ)),
      ),
    ).toThrow(ForbiddenException);
  });

  it('member rolu de reddedilir (owner+admin disi)', () => {
    const guard = guardWith();

    expect(() =>
      runWithTenantContext(contextFor('member'), () =>
        guard.canActivate(contextRequiring(MEMBER_READ)),
      ),
    ).toThrow(ForbiddenException);
  });
});

describe('PermissionGuard — tenant context YOK: 401 ile 403 AYRI', () => {
  it('KIMLIKSIZ istek 401 alir — 403 DEGIL', () => {
    const guard = guardWith();

    // Token yok/bozuk/suresi dolmus. Istemci acisindan bu tazeleme ya da
    // yeniden giris tetikleyen bir durumdur; 403 tetiklememeli.
    expect(() => guard.canActivate(contextRequiring(MEMBER_READ))).toThrow(UnauthorizedException);
  });

  it('KIMLIGI OLAN ama tenant secmemis istek 403 alir', () => {
    const guard = guardWith();

    // Kimlik token'iyla gelinmis: kim oldugu biliniyor, tenant kaynagina
    // yetkisi yok. Yeniden giris bunu DEGISTIRMEZ, o yuzden 401 yanlis olurdu.
    expect(() =>
      runWithPrincipal({ userId: 'u-1', sessionId: 's-1', tenantId: null }, () =>
        guard.canActivate(contextRequiring(MEMBER_READ)),
      ),
    ).toThrow(ForbiddenException);
  });

  it('sebep sizmaz — mesaj rol/permission ayrintisi vermez', () => {
    const guard = guardWith();

    try {
      runWithTenantContext(contextFor('viewer'), () =>
        guard.canActivate(contextRequiring(MEMBER_READ)),
      );
      expect.unreachable();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('viewer');
      expect(message).not.toContain(MEMBER_READ);
    }
  });
});
