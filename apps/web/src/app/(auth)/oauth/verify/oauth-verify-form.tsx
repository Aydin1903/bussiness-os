'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { errorMessage } from '@/lib/api/error-message';
import { verifyOAuthEmail } from '@/lib/api/oauth';

/**
 * Açık yönlendirmeyi önler: yalnızca site-içi göreli yollar.
 *
 * ⚠️ `//evil.example` protokole göreli bir MUTLAK adrestir ve
 * `startsWith('/')` testini geçer. Sunucu da ayrıca eler (`safeNext`,
 * `oauth.controller.ts`) — ⚠️ ikisi AYRI tanımlardır ve senkron kalmalıdır.
 */
function safeNext(next: string | undefined): string | null {
  if (next !== undefined && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return null;
}

/**
 * **D3'ün ikinci adımı** — sosyal giriş için 6 haneli kod (ADR-0053 §1.3).
 *
 * ============================================================================
 * ⚠️ BU EKRAN NEDEN VAR — VE YOKLUĞU BUGÜN PROD'DA BİR 404'TÜ
 * ============================================================================
 * Sağlayıcının e-posta hükmü `false` geldiğinde (Facebook **her zaman**,
 * Microsoft `xms_edov` açılmamışsa, LinkedIn `email_verified` gelmezse, Google
 * `email_verified: false` dönerse) callback **hiçbir oturum açmaz**: kendi 6
 * haneli kodumuzu gönderir ve kullanıcıyı buraya yollar.
 *
 * ⚠️ Sunucu tarafı (`oauth.controller.ts`, `lib/api/oauth.ts`) bu adrese
 * **zaten yönlendiriyordu**; sayfa yoktu. Yani bugün `email_verified: false`
 * dönen bir Google girişi kullanıcıyı **404'e** düşürürdü — ADR-0054 öncesi
 * `/oauth/complete` kusurunun **birebir aynısı**: başarıyla ilerleyen bir
 * akış, başarısızlık gibi görünürdü.
 *
 * ============================================================================
 * ⚠️ YENİ BİR DOĞRULAMA SİSTEMİ İCAT EDİLMEDİ
 * ============================================================================
 * Kod üretimi, hash'i (HMAC + pepper), ömrü ve deneme sayacı **ADR-0019'un**
 * mevcut mekanizmasıdır; bu ekran onun ikinci bir **tüketicisidir**, ikinci
 * bir sistemi değil. Görsel olarak da `verify-email` ile aynı kalıptır —
 * kullanıcı için bunlar **aynı iştir**.
 *
 * ============================================================================
 * ⚠️ E-POSTA ADRESİ EKRANDA YAZMAZ — VE BU BİLİNÇLİDİR
 * ============================================================================
 * `verify-email` adresi gösterir (`/register`'dan `?email=` ile taşınır);
 * burada **taşınmaz**. İki sebep:
 *
 *   1. ⚠️ Adres yalnızca **imzalı, `HttpOnly` bekleyen-bağlama çerezindedir**
 *      ve istemci onu hiç görmez. URL'e yazmak, `email_at_link`i (bir **teşhis**
 *      kolonu, ADR-0053 §2.1) API yüzeyine çıkarmanın ilk adımı olurdu.
 *   2. Adres URL'e yazılsaydı tarayıcı geçmişine ve olası `Referer`
 *      başlıklarına girerdi — sır olmasa da gereksiz.
 *
 * ⚠️ Bedeli dürüstçe: kullanıcı **hangi** gelen kutusuna bakacağını ekrandan
 * okuyamaz; metin bu yüzden "az önce kullandığınız hesabın adresi" der.
 *
 * ============================================================================
 * ⚠️ "KODU YENİDEN GÖNDER" YOK — VE BU BİR EKSİKTİR, GİZLENMİYOR
 * ============================================================================
 * `verify-email`in `resendVerification` ucunun buradaki karşılığı **yoktur**
 * (ADR-0053 §4.1 dört uç tanımlar, yeniden gönderme yok). Kod düşerse
 * kullanıcının yolu **akışı baştan başlatmaktır** — aşağıdaki bağlantı tam
 * olarak bunu söyler. Sahte bir düğme koymak, ADR-0052 §6.1'in reddettiği
 * _"tıklandığında hiçbir şey yapmayan düğme"_ olurdu.
 */
export function OAuthVerifyForm({ next }: { readonly next: string | undefined }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setLoading(true);

    try {
      await verifyOAuthEmail(code);
    } catch (caught) {
      /*
       * ⚠️ SUNUCU TÜM REDLERİ AYNI 401'E İNDİRİR — "kod yanlış", "süresi
       * dolmuş", "deneme hakkı bitti", "çerez yok" ve "hesap kilitli"
       * AYIRT EDİLEMEZ (P2: yanıtlar hesabın varlığını sızdırmaz). Ekran
       * hangisinin gerçekleştiğini bilmez ve **bilmemelidir**; yalnızca
       * gösterir.
       */
      setError(errorMessage(caught, 'Kod doğrulanamadı.'));
      setLoading(false);
      return;
    }

    /*
     * ⚠️ YANITTAKİ `identityToken` BİLİNÇLİ OLARAK KULLANILMIYOR.
     *
     * Sunucu bu istekte refresh çerezini de yazdı; `/oauth/complete` açılınca
     * `POST /auth/refresh` ile kimlik token'ını kendisi alır. Yani ADR-0028'in
     * yönlendirme kuralı (0 üyelik → `/create-tenant` · 1 → otomatik geçiş ·
     * 2+ → `/select-tenant`) **TEK YERDE** kalır.
     *
     * ⚠️ Bedeli bir fazladan ağ turudur; kazancı, ikinci bir yönlendirme
     * mantığının bir gün birincisinden **ayrışmamasıdır**. `submitGoogleOneTap`
     * de aynı sebeple aynı şeyi yapar.
     *
     * ⚠️ `router.push` DEĞİL `location.assign`: `/oauth/complete` oturumu
     * sıfırdan kurar ve istemci tarafı bir geçiş, yenilenmiş çerezle eski bir
     * React ağacını karıştırırdı.
     */
    const target = safeNext(next);
    window.location.assign(
      target === null
        ? '/oauth/complete?status=ok'
        : `/oauth/complete?status=ok&next=${encodeURIComponent(target)}`,
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-5"
      noValidate
    >
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Son bir adım</h1>
        <p className="text-sm text-fg-muted">
          Az önce kullandığınız hesabın e-posta adresine 6 haneli bir kod gönderdik. Hesabınızı
          bağlamak için kodu girin.
        </p>
      </header>

      <FormError message={error} />

      <Field label="Doğrulama kodu" htmlFor="code">
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          placeholder="000000"
          value={code}
          onChange={(event) => {
            // Yalnızca rakam; kullanıcı boşluk/harf yapıştırsa da temizlenir.
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
          }}
          className="text-center tracking-[0.4em]"
          required
        />
      </Field>

      <Button type="submit" loading={loading}>
        Doğrula ve devam et
      </Button>

      {/*
        ⚠️ "Yeniden gönder" YERİNE "baştan başla" (sınıf yorumu): bu akışta bir
        yeniden gönderme ucu YOKTUR ve olmayan bir eylemi vaat etmeyiz.
      */}
      <Link
        href="/login"
        className="text-center text-sm text-fg-muted underline-offset-2 hover:text-fg hover:underline"
      >
        Kod gelmedi mi? Giriş ekranından tekrar deneyin →
      </Link>
    </form>
  );
}
