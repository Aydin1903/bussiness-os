import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';

import { PERMISSION_REGISTRY, type PermissionRegistry } from './authz.public';
import { InMemoryPermissionRegistry } from './application/in-memory-permission-registry';
import { PolicyEngine } from './application/policy-engine';
import { PermissionGuard } from './presentation/permission.guard';

/**
 * Authorization modulu — merkezi policy engine (ADR-0025, ARCHITECTURE 6.2/10.1).
 *
 * ============================================================================
 * NEDEN @Global
 * ============================================================================
 * Config gibi, yetkilendirme catrasiz bir cross-cutting concern'dur: her tenant
 * kaynagini sunan modul guard'a ve registry'ye ihtiyac duyar. Global olmasi,
 * bu modullerin `AuthzModule`'u tek tek import etmesini gereksiz kilar VE
 * Authorization'in onlari import etmemesini korur — bagimlilik yonu daima
 * "is modulu -> authz"dir, tersi asla (§10.1: Authorization is modullerini
 * bilmez).
 *
 * `PERMISSION_REGISTRY` disa acilir ki moduller kendi kataloglarini KAYDEDEBILSIN
 * (init'te, `registry.register(...)`). Guard `APP_GUARD` olarak tum route'lara
 * baglanir ama yalnizca `@RequirePermission` isaretli olanlarda karar verir.
 * ============================================================================
 */
@Global()
@Module({
  providers: [
    { provide: PERMISSION_REGISTRY, useClass: InMemoryPermissionRegistry },
    {
      provide: PolicyEngine,
      inject: [PERMISSION_REGISTRY],
      useFactory: (registry: PermissionRegistry): PolicyEngine => new PolicyEngine(registry),
    },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
  exports: [PERMISSION_REGISTRY],
})
export class AuthzModule {}
