'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { SocialSignIn } from '@/components/auth/social-sign-in';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/field';
import { FormError } from '@/components/ui/form-error';
import { Input } from '@/components/ui/input';
import { loginUser } from '@/lib/api/auth';
import { errorMessage } from '@/lib/api/error-message';
import { ApiError } from '@/lib/api/problem';
import { listMyMemberships } from '@/lib/api/tenants';
import { selectTenant } from '@/lib/session/select-tenant';
import { setSessionHint } from '@/lib/session/session-hint';
import { useSession } from '@/lib/session/session-provider';

/** Açık yönlendirmeyi önle: yalnızca site-içi göreli yollar kabul edilir. */
function safeNext(next: string | undefined): string {
  if (next !== undefined && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/app';
}

/**
 * Giriş formu.
 *
 * Başarıda: `bo_session_hint` set edilir (middleware UX geçişi) ve `identityToken`
 * memory session store'a yazılır. Tüm redler (geçersiz kimlik / kilit / pasif)
 * backend'de AYNI 401'i üretir; ekran bunları ayırt etmez.
 */
export function LoginForm({
  next,
  justVerified,
  justReset,
}: {
  next: string | undefined;
  justVerified: boolean;
  justReset: boolean;
}) {
  const router = useRouter();
  const session = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * Login sonrası yönlendirme (ADR-0028 iki aşamalı model):
   *   0 üyelik → /create-tenant · 1 → otomatik switch-tenant + hedef · 2+ → /select-tenant.
   */
  async function routeAfterLogin(): Promise<void> {
    const memberships = await listMyMemberships();
    const only = memberships.items[0];

    if (memberships.total === 0) {
      router.push('/create-tenant');
    } else if (memberships.total === 1 && only !== undefined) {
      await selectTenant(only.tenantId);
      router.push(safeNext(next));
    } else {
      router.push('/select-tenant');
    }
  }

  async function submit(): Promise<void> {
    setError(null);
    setNeedsVerification(false);
    setLoading(true);
    try {
      const result = await loginUser({ email, password });

      // Refresh token zaten HttpOnly cookie'de (istemci görmez). Kısa ömürlü
      // kimlik token'ı memory'ye; hint middleware için set edilir.
      session.setIdentityToken(result.identityToken);
      setSessionHint();

      await routeAfterLogin();
    } catch (caught) {
      // Durum koduna göre metin; 403 (e-posta doğrulanmamış) ise ayrıca
      // doğrulama bağlantısı gösterilir (AUTH §9: 403 ayırt edilebilir).
      setError(
        errorMessage(caught, 'Giriş yapılamadı.', {
          401: 'E-posta veya parola hatalı.',
          403: 'E-posta adresiniz henüz doğrulanmamış.',
          429: 'Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.',
        }),
      );
      setNeedsVerification(caught instanceof ApiError && caught.status === 403);
      setLoading(false);
    }
  }

  /*
   * ⚠️ BOŞLUK RİTMİ: 6 · 16 · 24 — ve bu üç sayı bir GRUPLAMA anlatır.
   *
   * Eski hâl ölçüldü: her şey `gap-5` (20px) ile EŞİT aralıklıydı — başlık ile
   * ilk alan arası, iki alan arası, alan ile düğme arası, düğme ile sosyal
   * satır arası, hepsi aynı. ⚠️ Eşit aralık hiçbir şeyin bir arada olmadığını
   * söyler: göz beş ayrı parça görür, bir form görmez.
   *
   *   24 → GRUPLAR arası   (başlık | alanlar+eylem | sosyal | alt satır)
   *   16 → grup İÇİNDE     (alan ↔ alan)
   *    6 → BAĞLI parçalar  (etiket ↔ alan — `Field`in kendi aralığı)
   *
   * ⚠️ 6'nın 8'lik ölçeğin dışında kalması bilinçlidir: etiket alana AİTTİR
   * ve ondan "bir adım" uzakta durmamalıdır. Sub-ölçek burada anlam taşır.
   */
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      className="flex flex-col gap-6"
      noValidate
    >
      <header className="flex flex-col gap-1.5">
        <h1>Giriş yap</h1>
        <p>Hesabınıza erişmek için giriş yapın.</p>
      </header>

      {justVerified ? (
        <p className="rounded-lg border border-border bg-fill px-3.5 py-2.5 text-sm text-fg-muted">
          E-postanız doğrulandı. Şimdi giriş yapabilirsiniz.
        </p>
      ) : null}

      {justReset ? (
        <p className="rounded-lg border border-border bg-fill px-3.5 py-2.5 text-sm text-fg-muted">
          Parolanız sıfırlandı. Yeni parolanızla giriş yapabilirsiniz.
        </p>
      ) : null}

      <FormError message={error} />

      {needsVerification ? (
        <Link
          href={`/verify-email?email=${encodeURIComponent(email)}`}
          className="text-sm font-medium text-fg underline-offset-2 hover:underline"
        >
          E-postanı doğrula →
        </Link>
      ) : null}

      {/*
        ⚠️ ALANLAR VE BİRİNCİL EYLEM TEK GRUPTUR (16px içeride, 24px dışarıda).
        Düğme alanlardan KOPARILMADI: kullanıcının burada yapacağı tam olarak
        bir şey vardır ve o şey alanları doldurup basmaktır.
      */}
      <div className="flex flex-col gap-4">
        <Field label="E-posta" htmlFor="email">
          <Input
            id="email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
            }}
            required
          />
        </Field>

        {/*
          ⚠️ "Şifreni mi unuttun?" PAROLA ALANININ ALTINA TAŞINDI — ve bu bir
          yer değişikliğinden fazlasıdır, hiyerarşinin kendisidir.

          Eski hâlde iki bağlantı formun EN ALTINDA, alt alta, ikisi de 14px
          ve ortalanmış duruyordu: göz onları EŞİT ÖNEMDE bir çift olarak
          okuyordu. Oysa ikisi aynı sınıfta değil:
            · "Hesap oluştur" → BAŞKA BİR AKIŞA geçiştir (ikincil eylem)
            · "Şifreni mi unuttun?" → BU alanın onarım yoludur (üçüncül,
              BAĞLAMSAL)
          Bağlamsal bir bağlantının doğru yeri, ait olduğu alanın yanıdır.

          ⚠️ Sonuç üç kademeli bir hiyerarşidir: birincil düğme (15/600, dolgu)
          › "Hesap oluştur" (14/500, mürekkep) › "Şifreni mi unuttun?"
          (12/400, soluk). Artık hangisinin önce okunacağı SÖYLENİYOR.
        */}
        <div className="flex flex-col gap-2">
          <Field label="Parola" htmlFor="password">
            <Input
              id="password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
              }}
              required
            />
          </Field>

          <Link
            href="/forgot-password"
            className="self-end text-xs text-fg-3 underline-offset-2 transition-colors hover:text-fg hover:underline"
          >
            Şifreni mi unuttun?
          </Link>
        </div>

        <Button type="submit" loading={loading}>
          Giriş yap
        </Button>
      </div>

      {/*
        ⚠️ SOSYAL GİRİŞ E-POSTA FORMUNUN ALTINDA (ADR-0052 §6.2, ADR-0053 §9.3).
        Üste konsaydı ekranın ilk görünen şeyi BAŞKA ŞİRKETLERİN logosu olurdu;
        ayrıca birincil yol e-postadır ve görsel olarak da birincil olmalıdır.

        ⚠️ Bu satırın eklenmesiyle form BİR KEZ AŞAĞI KAYAR — ADR-0052 §6.1'in
        önceden kabul ettiği, bir kerelik ve geri alınmayacak görsel değişiklik.
      */}
      <SocialSignIn next={next} />

      {/*
        ⚠️ ALT SATIR ARTIK TEK BİR CÜMLE — "Şifreni mi unuttun?" yukarı,
        parola alanının yanına taşındı. Formun kapanışı böylece TEK bir
        ikincil eylem söyler; iki eşit ağırlıklı bağlantı arasında seçim
        yapmak zorunda kalmaz.
      */}
      <p className="text-center text-sm text-fg-3">
        Hesabın yok mu?{' '}
        <Link
          href="/register"
          className="font-medium text-fg underline-offset-2 transition-colors hover:underline"
        >
          Hesap oluştur
        </Link>
      </p>
    </form>
  );
}
