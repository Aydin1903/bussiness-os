import { describe, expect, it } from 'vitest';

import { type PermissionRegistry, type PermissionRule } from '../authz.public';
import { InMemoryPermissionRegistry } from './in-memory-permission-registry';
import { PolicyEngine } from './policy-engine';

function engineWith(rules: readonly PermissionRule[]): PolicyEngine {
  const registry: PermissionRegistry = new InMemoryPermissionRegistry();
  registry.register(rules);
  return new PolicyEngine(registry);
}

const MEMBER_READ = 'member:read';

describe('PolicyEngine — izin verir', () => {
  it('rol permission in izinli kumesindeyse true doner', () => {
    const engine = engineWith([{ permission: MEMBER_READ, roles: ['owner', 'admin'] }]);

    expect(engine.can('owner', MEMBER_READ)).toBe(true);
    expect(engine.can('admin', MEMBER_READ)).toBe(true);
  });
});

describe('PolicyEngine — DENY-BY-DEFAULT', () => {
  it('rol kumede degilse false doner', () => {
    const engine = engineWith([{ permission: MEMBER_READ, roles: ['owner', 'admin'] }]);

    expect(engine.can('member', MEMBER_READ)).toBe(false);
    expect(engine.can('viewer', MEMBER_READ)).toBe(false);
  });

  it('KAYITLI OLMAYAN permission icin false doner', () => {
    const engine = engineWith([{ permission: MEMBER_READ, roles: ['owner'] }]);

    // §10.1: izin acikca verilmemisse cevap deny. Kodda karsiligi olmayan bir
    // permission sessizce her seyi acmaz.
    expect(engine.can('owner', 'invoice:approve')).toBe(false);
  });

  it('bilinmeyen rol icin false doner', () => {
    const engine = engineWith([{ permission: MEMBER_READ, roles: ['owner'] }]);

    expect(engine.can('superuser', MEMBER_READ)).toBe(false);
  });

  it('bos katalogda her sey reddedilir', () => {
    const engine = engineWith([]);

    expect(engine.can('owner', MEMBER_READ)).toBe(false);
  });
});

describe('InMemoryPermissionRegistry', () => {
  it('kayitli permission in rollerini dondurur', () => {
    const registry = new InMemoryPermissionRegistry();
    registry.register([{ permission: MEMBER_READ, roles: ['owner', 'admin'] }]);

    expect(registry.rolesFor(MEMBER_READ)).toEqual(['owner', 'admin']);
  });

  it('kayitli olmayan permission icin undefined doner', () => {
    const registry = new InMemoryPermissionRegistry();

    expect(registry.rolesFor(MEMBER_READ)).toBeUndefined();
  });

  it('AYNI permission in iki kez kaydini REDDEDER', () => {
    const registry = new InMemoryPermissionRegistry();
    registry.register([{ permission: MEMBER_READ, roles: ['owner'] }]);

    // Iki modul ayni kaynagi sahiplenemez; sessizce ustune yazmak yetki
    // haritasini ongorulemez kilardi.
    expect(() => {
      registry.register([{ permission: MEMBER_READ, roles: ['admin'] }]);
    }).toThrow(/zaten kayitli/);
  });

  it('farkli modullerin kataloglarini birlestirir', () => {
    const registry = new InMemoryPermissionRegistry();
    registry.register([{ permission: MEMBER_READ, roles: ['owner'] }]);
    registry.register([{ permission: 'invoice:approve', roles: ['admin'] }]);

    expect(registry.rolesFor(MEMBER_READ)).toEqual(['owner']);
    expect(registry.rolesFor('invoice:approve')).toEqual(['admin']);
  });
});
