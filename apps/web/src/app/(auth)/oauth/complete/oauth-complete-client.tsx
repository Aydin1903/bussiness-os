'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { refreshIdentityToken } from '@/lib/api/refresh';
import { listMyMemberships } from '@/lib/api/tenants';
import { selectTenant } from '@/lib/session/select-tenant';
import { setSessionHint } from '@/lib/session/session-hint';

/**
 * Callback'in taşıdığı kaba taneli hata kodları (ADR-0053 §5).
 *
 * ⚠️ Sağlayıcının HAM hatası buraya hiç gelmez — sunucu onu bu beş koddan
 * birine indirger. Bilinmeyen bir kod da `unavailable`a düşer.
 */
/**
 * ⚠️ Bu ikisi AYRI SABIT olarak durur, sözlükten okunmaz: `noUncheckedIndexedAccess`
 * altında bir `Record` araması `string | undefined` verir ve ikisi de kod
 * yolunda KESİN bir değer olmak zorundadır. Sözlükte de aynı metinlerle
 * bulunurlar — ayrışmamaları için tek kaynaktan beslenirler.
 */
const STATE_MESSAGE = 'Giriş oturumu doğrulanamadı. Lütfen tekrar deneyin.';
const FALLBACK_MESSAGE = 'Sağlayıcı ile iletişim kurulamadı. Lütfen tekrar deneyin.';

const ERROR_MESSAGES: Readonly<Record<string, string>> = {
  state: STATE_MESSAGE,
  provider: 'Bu sağlayıcı ile giriş şu anda kullanılamıyor.',
  cancelled: 'Giriş iptal edildi.',
  email_required:
    'Sağlayıcı bir e-posta adresi paylaşmadı. Sağlayıcıda e-posta paylaşımına izin verin ya da e-posta ve parolayla kaydolun.',
  unavailable: FALLBACK_MESSAGE,
};

/** Bilinmeyen ya da eksik bir kod sessizce yutulmaz; genel mesaja düşer. */
function messageFor(code: string | undefined): string {
  return code === undefined ? FALLBACK_MESSAGE : (ERROR_MESSAGES[code] ?? FALLBACK_MESSAGE);
}

/** Açık yönlendirmeyi önle: yalnızca site-içi göreli yollar (login-form ile aynı kural). */
function safeNext(next: string | undefined): string {
  if (next !== undefined && next.startsWith('/') && !next.startsWith('//')) {
    return next;
  }
  return '/app';
}

/**
 * `/oauth/complete` — sosyal giriş callback'inin indiği sayfa (ADR-0053 §5).
 *
 * ============================================================================
 * ⚠️ BU SAYFA NEDEN VAR — VE NEDEN YOKLUĞU BİR KUSUR ÜRETTİ
 * ============================================================================
 * Callback bir GİRİŞTİR: sunucu refresh cookie'sini yazar ve buraya
 * yönlendirir; kimlik token'ı URL'de TAŞINMAZ (ADR-0026'nın "token DOM'a ve
 * disk'e değmez" ilkesi). Yani oturumu görünür kılan tek adım budur.
 *
 * ⚠️ Bu sayfa yazılmadan yapılan ilk gerçek denemede (2026-09-01 13:08) akış
 * **BAŞARILI OLDU** — prod log'u `?status=ok`, veritabanı da bağlantı satırını
 * gösteriyor — ama kullanıcı **404 gördü**. Doğal refleksle geri/yenile yaptı,
 * tarayıcı aynı callback URL'ini yeniden gönderdi ve ⚠️ state çerezi TEK
 * KULLANIMLIK olduğu için (tekrar koruması) sunucu haklı olarak
 * `?error=state` döndü. Sonuç: **başarı, başarısızlık gibi göründü.**
 *
 * ============================================================================
 * ⚠️ `error=state` GELDİĞİNDE ÖNCE KURTARMA DENENİR
 * ============================================================================
 * Tam olarak yukarıdaki senaryo yüzünden: `state` hatası "giriş olmadı"
 * demek DEĞİLDİR, "bu callback ikinci kez kullanıldı" demektir. Kullanıcı
 * zaten girmiş olabilir ve refresh cookie'si elindedir.
 *
 * Bu yüzden `state` hatasında sessizce bir kimlik tazelemesi denenir:
 *   - başarılıysa → kullanıcı ZATEN giriş yapmıştır, içeri alınır;
 *   - başarısızsa → gerçekten girememiştir, hata gösterilir.
 *
 * ⚠️ Kurtarma YALNIZCA `state` için yapılır. `cancelled` ya da
 * `email_required` gelen bir kullanıcıyı eski bir çerezle içeri almak,
 * onun BİLİNÇLİ tercihini görmezden gelmek olurdu.
 *
 * ⚠️ Ve kurtarma bir güvenlik gevşemesi DEĞİLDİR: yetkiyi veren şey refresh
 * cookie'sidir, bu sayfanın kararı değil. Geçerli bir çerezi olmayan hiç
 * kimse bu yoldan içeri giremez.
 * ============================================================================
 */
export function OAuthCompleteClient({
  status,
  error,
  next,
}: {
  readonly status: string | undefined;
  readonly error: string | undefined;
  readonly next: string | undefined;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);

  /*
   * ⚠️ React 18 StrictMode geliştirmede effect'leri İKİ KEZ çalıştırır ve bu
   * akış idempotent DEĞİLDİR: `refreshIdentityToken` refresh token'ı ROTASYONA
   * sokar (ADR-0021). İki eşzamanlı yenileme aynı çerezi iki kez sunar,
   * backend'in YENİDEN KULLANIM TESPİTİ tüm aileyi iptal eder ve kullanıcı
   * sebepsiz düşer. Bu bayrak onu keser.
   *
   * (`refresh.ts` zaten single-flight; bu ikinci savunma, effect'in iki ayrı
   * turda — yani ilk promise çözüldükten SONRA — tekrar tetiklenmesine karşı.)
   */
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;

    async function routeAfterSignIn(): Promise<void> {
      // Kimlik token'ı memory'ye yazılır; refresh cookie zaten tarayıcıda.
      await refreshIdentityToken();
      setSessionHint();

      // ADR-0028'in iki aşamalı modeli — parola girişiyle AYNI kural:
      // 0 üyelik → /create-tenant · 1 → otomatik switch + hedef · 2+ → /select-tenant
      const memberships = await listMyMemberships();
      const only = memberships.items[0];

      if (memberships.total === 0) {
        router.replace('/create-tenant');
      } else if (memberships.total === 1 && only !== undefined) {
        await selectTenant(only.tenantId);
        router.replace(safeNext(next));
      } else {
        router.replace('/select-tenant');
      }
    }

    async function run(): Promise<void> {
      // Başarı yolu — ya da `state` hatasında SESSİZ KURTARMA (sınıf yorumu).
      if (status === 'ok' || error === 'state') {
        try {
          await routeAfterSignIn();
          return;
        } catch {
          // Kurtarma tutmadı: gerçekten giriş yapılmamış.
          setMessage(status === 'ok' ? FALLBACK_MESSAGE : STATE_MESSAGE);
          return;
        }
      }

      setMessage(messageFor(error));
    }

    void run();
  }, [status, error, next, router]);

  /*
   * ⚠️ BEKLERKEN "HATA" GÖSTERİLMEZ. Bu sayfa açıldığı anda henüz hiçbir şey
   * bilinmiyor; yönlendirme bir ağ turu sürer. Boş ya da olumsuz bir ekran,
   * başarılı bir girişi yine başarısız gibi gösterirdi — bu sayfanın var olma
   * sebebinin tam tersi.
   */
  if (message === null) {
    return (
      <div className="flex flex-col gap-2" aria-live="polite" aria-busy="true">
        <h1 className="text-lg font-semibold">Giriş tamamlanıyor…</h1>
        <p className="text-sm text-fg-muted">Bir saniye, oturumunuz hazırlanıyor.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Giriş tamamlanamadı</h1>
        <p className="text-sm text-fg-muted">{message}</p>
      </header>

      <Link
        href="/login"
        className="text-sm font-medium text-fg underline-offset-2 hover:underline"
      >
        Giriş ekranına dön →
      </Link>
    </div>
  );
}
