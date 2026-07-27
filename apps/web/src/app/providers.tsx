'use client';

import type { ReactNode } from 'react';

import { SessionProvider } from '@/lib/session/session-provider';

/**
 * İstemci tarafı sağlayıcıların tek toplandığı yer.
 *
 * Root layout bir Server Component'tır; oturum durumu ise memory'de ve istemciye
 * özgüdür (§2). Bu bileşen o istemci sınırını kurar ve tüm ağacı `SessionProvider`
 * ile sarar. İleride tema/i18n gibi başka istemci sağlayıcıları da buraya girer.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  return <SessionProvider>{children}</SessionProvider>;
}
