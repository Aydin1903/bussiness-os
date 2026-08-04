'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';

import { notesExist } from '@/lib/api/knowledge';
import { isOnboardingCompleted, markOnboardingCompleted } from '@/lib/onboarding/completed';
import { getCurrentTenantId } from '@/lib/session/session-store';

type Phase = 'checking' | 'ready' | 'redirect';

/**
 * Dashboard'u onboarding kontrolünün ARKASINA alır (ADR-0030 §3).
 *
 * ============================================================================
 * NEDEN DASHBOARD BEKLETİLİYOR
 * ============================================================================
 * Alternatif dashboard'u hemen çizip kontrol dönünce yönlendirmekti — yani
 * kullanıcıya bir ekran gösterip elinden almak. İlk deneyimde bu daha kötü.
 *
 * Bedeli soğuk açılışta TEK ek istek, o da yalnızca bayrak yokken: bayrak
 * varsa (kullanıcı wizard'ı geçmiş ya da tenant'ın zaten notu olduğu
 * görülmüş) ağa HİÇ çıkılmaz ve dashboard doğrudan çizilir.
 *
 * ============================================================================
 * HATA DURUMUNDA DASHBOARD GÖSTERİLİR — wizard DEĞİL
 * ============================================================================
 * Kontrol başarısız olursa (ağ, 5xx, oturum) kullanıcı panele alınır. Fail
 * closed'un tersi gibi görünür ama burada doğru olan budur: bu bir YETKİ kapısı
 * değil, bir KARŞILAMA kapısıdır. Şüphede kalınca birine kurulum sihirbazını
 * dayatmak, notu olan bir şirkete "hadi baştan tanışalım" demek olurdu.
 * ============================================================================
 */
export function OnboardingGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>('checking');

  useEffect(() => {
    const tenantId = getCurrentTenantId();

    // Tenant henüz yoksa kontrol edilecek bir hafıza da yok; AppShell zaten
    // oturum/tenant yönlendirmesini yapıyor.
    if (tenantId === undefined || isOnboardingCompleted(tenantId)) {
      setPhase('ready');
      return;
    }

    let active = true;
    void notesExist()
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.hasNotes) {
          // Bir daha sorma: bu tenant'ın hafızası artık boş değil.
          markOnboardingCompleted(tenantId);
          setPhase('ready');
          return;
        }
        setPhase('redirect');
        router.replace('/app/onboarding');
      })
      .catch((error: unknown) => {
        // ⚠️ SESSIZ KALMAZ. Fail-open davranışı KORUNUR (aşağıdaki gerekçe),
        // ama hata GÖRÜNÜR olur.
        //
        // Bu satır bir teşhis sırasında yazıldı: uç bir sebeple cevap
        // vermediğinde (eski API süreci, 5xx, ağ) kullanıcı wizard'a
        // yönlendirilmiyor, hiçbir hata da görünmüyordu — "koruma çalıştı" ile
        // "koruma çöktü" birbirinden AYIRT EDİLEMİYORDU.
        //
        // Kullanıcıya gösterilmez (onun ilgilenmesi gereken bir şey değil),
        // konsola yazılır: bakan biri için tek ipucu budur.
        // eslint-disable-next-line no-console
        console.warn('[OnboardingGate] Not varlık kontrolü başarısız; panel gösteriliyor.', error);

        if (active) {
          setPhase('ready');
        }
      });

    return () => {
      active = false;
    };
  }, [router]);

  if (phase === 'checking') {
    return <p className="text-sm text-fg-muted">Yükleniyor…</p>;
  }

  // Yönlendirme sürerken dashboard ÇİZİLMEZ: bir an görünüp kaybolması,
  // bu bileşenin var olma sebebini ortadan kaldırırdı.
  if (phase === 'redirect') {
    return null;
  }

  return <>{children}</>;
}
