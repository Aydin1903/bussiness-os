'use client';

import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';

import {
  clearSession,
  getServerSnapshot,
  getSnapshot,
  setSession,
  subscribe,
  type SessionState,
  type TenantId,
} from './session-store';

/**
 * Oturum durumunu React'e taşıyan ince katman.
 *
 * Gerçek durum `session-store.ts`'te (React DIŞI modül) yaşar; burası yalnızca
 * onu `useSyncExternalStore` ile gözlemler ve bir hook olarak sunar. Böylece
 * fetch katmanı ile React aynı tek kaynağı paylaşır (§5).
 *
 * Token'ları DOĞRUDAN buradan set etmek F1'de gerekmiyor (gerçek auth akışı
 * F2); yine de değiştiriciler açıkça sunulur ki F2 formları store'a bu tek
 * arayüzden yazsın.
 */
interface SessionContextValue extends SessionState {
  readonly setIdentityToken: (token: string | undefined) => void;
  readonly setAccessToken: (token: string | undefined) => void;
  readonly setCurrentTenantId: (tenantId: TenantId | undefined) => void;
  readonly clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }): ReactNode {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Değiştiriciler durumdan bağımsızdır; store referanslarına sarılır ve
  // gereksiz yeniden oluşturmayı önlemek için memoize edilir.
  const value = useMemo<SessionContextValue>(
    () => ({
      ...state,
      setIdentityToken: (token) => {
        setSession({ identityToken: token });
      },
      setAccessToken: (token) => {
        setSession({ accessToken: token });
      },
      setCurrentTenantId: (tenantId) => {
        setSession({ currentTenantId: tenantId });
      },
      clear: clearSession,
    }),
    [state],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Oturum durumunu ve değiştiricilerini okur. Provider dışında çağrılırsa hata verir. */
export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (value === null) {
    throw new Error('useSession, <SessionProvider> içinde kullanılmalıdır.');
  }
  return value;
}
