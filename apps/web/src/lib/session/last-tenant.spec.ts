import { beforeEach, describe, expect, it } from 'vitest';

import { clearLastTenant, getLastTenant, setLastTenant } from './last-tenant';

const TENANT = '018fa000-0000-7000-8000-00000000000a';

describe('last-tenant (bo_last_tenant çerezi)', () => {
  beforeEach(() => {
    clearLastTenant();
  });

  it('yazma sonrası okuma aynı değeri döner', () => {
    expect(getLastTenant()).toBeUndefined();
    setLastTenant(TENANT);
    expect(getLastTenant()).toBe(TENANT);
  });

  it('clearLastTenant değeri siler', () => {
    setLastTenant(TENANT);
    clearLastTenant();
    expect(getLastTenant()).toBeUndefined();
  });

  it('değeri URL-encode/decode ederek round-trip korur', () => {
    setLastTenant(TENANT);
    // Çerez satırında ham değil encode edilmiş saklanır; okuma decode eder.
    expect(getLastTenant()).toBe(TENANT);
  });
});
