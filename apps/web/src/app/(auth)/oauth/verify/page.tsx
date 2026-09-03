import { AuthScreen } from '@/components/auth/auth-screen';

import { OAuthVerifyForm } from './oauth-verify-form';

/** `?a=1&a=2` gibi çoklu değerlerde ilkini değil, TANIMSIZI döner — belirsiz girdi kabul edilmez. */
function single(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/**
 * `/oauth/verify` — **D3'ün kod ekranı** (ADR-0053 §1.3, §4.3).
 *
 * ⚠️ URL'de `(auth)` GRUBU GÖRÜNMEZ: rota grubu yolu etkilemez, yani bu dosya
 * gerçekten `/oauth/verify` adresini karşılar — sunucunun yönlendirdiği adresin
 * ta kendisi (`oauth.controller.ts`, `VERIFY_PATH`).
 *
 * ⚠️ `screen="verify-email"` — **YENİ BİR PANEL ANAHTARI AÇILMADI** ve bu bir
 * kısayol değil, ADR-0052 §1.2'nin kuralıdır: _"zincir tek iskelettir"_. Bu
 * ekran ayrı bir durak değil, **aynı sorunun** ikinci bir girişidir — kullanıcı
 * her iki halde de gelen kutusuna gidip 6 haneli bir kodla dönüyor. Sahneyi
 * akıştan **miras alır**; `AUTH_SCREEN_KEYS` yedi anahtarla bir testte kilitli
 * ve bu iş o kilide **dokunmaz**.
 *
 * ⚠️ Hata dalı YOKTUR ve bu `verify-email`den bilinçli bir sapmadır: orada
 * `?email=` eksikse form çizilemezdi. Burada formun **hiçbir sorgu parametresine
 * ihtiyacı yok** — taşıyıcı, imzalı `HttpOnly` çerezdir. Çerez yoksa hata
 * SUNUCUDA, kod gönderildiğinde ortaya çıkar (401) ve tek bir yerde gösterilir.
 *
 * Param okuma SUNUCUDA yapılır (Next 15'te `searchParams` bir Promise'tir);
 * iş yapan kısım Client Component'tır — `verify-email` ve `/oauth/complete`
 * ile aynı desen.
 */
export default async function OAuthVerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const params = await searchParams;

  return (
    <AuthScreen screen="verify-email">
      <OAuthVerifyForm next={single(params.next)} />
    </AuthScreen>
  );
}
