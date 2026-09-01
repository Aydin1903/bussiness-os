import { AuthScreen } from '@/components/auth/auth-screen';

import { OAuthCompleteClient } from './oauth-complete-client';

/** `?a=1&a=2` gibi çoklu değerlerde ilkini değil, TANIMSIZI döner — belirsiz girdi kabul edilmez. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `/oauth/complete` — sosyal giriş callback'inin indiği sayfa (ADR-0053 §5).
 *
 * ⚠️ URL'de `(auth)` GRUBU GÖRÜNMEZ: rota grubu yolu etkilemez, yani bu dosya
 * gerçekten `/oauth/complete` adresini karşılar — sunucunun yönlendirdiği
 * adresin ta kendisi (`oauth.controller.ts`, `COMPLETE_PATH`).
 *
 * ⚠️ `screen="login"` — YENİ BİR PANEL ANAHTARI AÇILMADI. Bu ekran ayrı bir
 * durak değil, giriş akışının içindeki geçici bir adımdır; ADR-0052 §1.2'nin
 * "zincir tek iskelettir" kuralı gereği aynı paneli taşır. Ayrıca
 * `AUTH_SCREEN_KEYS` yedi anahtarla bir testte kilitlidir ve o kilit ADR-0052'nin
 * kararıdır — bu iş onu değiştirmez.
 *
 * Param okuma SUNUCUDA yapılır (Next 15'te `searchParams` bir Promise'tir);
 * iş yapan kısım Client Component'tır — `verify-email` ile aynı desen.
 */
export default async function OAuthCompletePage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string | string[];
    error?: string | string[];
    next?: string | string[];
  }>;
}) {
  const params = await searchParams;

  return (
    <AuthScreen screen="login">
      <OAuthCompleteClient
        status={single(params.status)}
        error={single(params.error)}
        next={single(params.next)}
      />
    </AuthScreen>
  );
}
