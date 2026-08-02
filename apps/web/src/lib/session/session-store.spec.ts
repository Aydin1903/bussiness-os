import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearSession,
  getAccessToken,
  getCurrentTenantId,
  getIdentityToken,
  getServerSnapshot,
  getSnapshot,
  setSession,
  subscribe,
} from './session-store';

describe('session-store', () => {
  beforeEach(() => {
    clearSession();
  });

  it('boş durumla başlar / clearSession sıfırlar', () => {
    setSession({ accessToken: 'a', identityToken: 'i', currentTenantId: 't' });
    clearSession();

    expect(getAccessToken()).toBeUndefined();
    expect(getIdentityToken()).toBeUndefined();
    expect(getCurrentTenantId()).toBeUndefined();
  });

  it('setSession alanları KISMEN günceller (verilmeyeni korur)', () => {
    setSession({ identityToken: 'id-1' });
    setSession({ accessToken: 'acc-1' });

    expect(getIdentityToken()).toBe('id-1'); // korundu
    expect(getAccessToken()).toBe('acc-1');
  });

  it('getSnapshot referansı set edilene kadar STABİLDİR (useSyncExternalStore sözleşmesi)', () => {
    const first = getSnapshot();
    expect(getSnapshot()).toBe(first); // aynı referans

    setSession({ accessToken: 'x' });
    expect(getSnapshot()).not.toBe(first); // her set YENİ nesne
  });

  it('getServerSnapshot her zaman boş döner (token istemciye özgü)', () => {
    setSession({ accessToken: 'x' });
    expect(getServerSnapshot().accessToken).toBeUndefined();
  });

  it('subscribe her set/clear değişiminde çağrılır; unsubscribe durdurur', () => {
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);

    setSession({ accessToken: 'a' });
    clearSession();
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
    setSession({ accessToken: 'b' });
    expect(listener).toHaveBeenCalledTimes(2); // artık çağrılmaz
  });
});
