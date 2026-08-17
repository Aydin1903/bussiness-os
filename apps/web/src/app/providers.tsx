'use client';

import type { ReactNode } from 'react';

import { SessionProvider } from '@/lib/session/session-provider';
import { ThemeProvider } from '@/lib/theme/theme-provider';

/**
 * İstemci tarafı sağlayıcıların tek toplandığı yer.
 *
 * Root layout bir Server Component'tır; oturum durumu ise memory'de ve istemciye
 * özgüdür (§2). Bu bileşen o istemci sınırını kurar.
 *
 * ⚠️ SIRA ÖNEMSİZ ama tema DIŞTA: tema oturuma bağlı değildir ve giriş
 * yapmamış kullanıcı da (login, kayıt, parola sıfırlama) seçtiği temayı görür.
 * İçe koymak, tema anahtarını yalnızca `/app` altında çalışır kılardı.
 */
export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <ThemeProvider>
      <SessionProvider>{children}</SessionProvider>
    </ThemeProvider>
  );
}
