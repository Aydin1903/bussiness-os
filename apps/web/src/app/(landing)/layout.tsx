import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import type { ReactNode } from 'react';

import { Reveal } from '@/components/landing/reveal';
import { SiteFooter } from '@/components/landing/site-footer';
import { SiteHeader } from '@/components/landing/site-header';

import '../landing-surface.css';

/**
 * LANDING (pazarlama) yüzeyinin ortak kökü — ADR-0054.
 *
 * ============================================================================
 * ⚠️ BU LAYOUT'UN İŞİ: KAPSAM AÇMAK + FONT + KABUK
 * ============================================================================
 * `(auth)/layout.tsx` yalnızca kapsam açar çünkü orada düzeni `AuthScreen`
 * kurar ve her ekran kendi kimliğini deklare eder. Burada durum farklıdır:
 * beş sayfanın beşi de AYNI üst çubuğu ve AYNI alt bilgiyi taşır ve ikisi de
 * sayfanın kimliğine göre değişmez — yani onları buraya koymak bir harita
 * tutmak DEĞİLDİR, tekrarı kaldırmaktır.
 *
 * ⚠️ Sayfaya özgü olan tek şey üst çubuktaki AKTİF sekmedir ve o bir harita
 * ile değil `usePathname` ile çözülür (`site-header.tsx`) — beşinci sayfa
 * eklendiğinde bu dosya değişmez.
 *
 * ============================================================================
 * ⚠️ FONT NEDEN BURADA, NEDEN KÖK LAYOUT'TA DEĞİL
 * ============================================================================
 * `next/font` yüklendiği layout'un ALTINDAKİ rotalar için font dosyalarını
 * preload eder. Plus Jakarta Sans kök layout'a yazılsaydı `/app`'in on iki
 * odası ve yedi auth ekranı da HİÇ KULLANMADIKLARI bir fontu indirirdi ve
 * hata SESSİZ olurdu — hiçbir şey bozulmaz, yalnızca her sayfa daha yavaş
 * açılır.
 *
 * ⚠️ `latin-ext` ZORUNLU: Türkçe'nin ş/ğ/ı/İ/ç/ö/ü karakterleri `latin`
 * altkümesinde YOKTUR (kök layout'un aynı notu). Yalnızca `latin` ile bu
 * harfler fallback fonttan gelir ve kelimenin ORTASINDA font değişir.
 *
 * ⚠️ `weight` YAZILMAZ: Plus Jakarta Sans değişken bir fonttur ve ağırlık
 * belirtilmediğinde `next/font` tek bir değişken dosya indirir. Tasarım
 * 300–700 bandının tamamını kullanıyor (rakamlar 300, gövde 400, başlık 500,
 * alt başlık 600); ağırlıkları tek tek saymak beş ayrı dosya indirmek olurdu.
 *
 * ⚠️ `italic` İSTENMEZ ve bu bilinçlidir: kök layout Inter için onu AÇIKÇA
 * ister (auth panelinin sloganı italiktir) ama landing'de italik kullanan tek
 * öğe `.hero h1 i`dir ve o `font-style: normal` ile EZİLİR — orada `<i>` bir
 * kesim değil, SÖNÜK KELİME için bir kancadır.
 *
 * ============================================================================
 * ⚠️ `data-surface="landing"` UNUTULURSA HATA SESSİZDİR
 * ============================================================================
 * Sayfa çalışmaya devam eder: HTML doğru, metinler yerinde. Kaybolan şey
 * `landing-surface.css`in TAMAMIDIR — sayfa Tailwind preflight'ının çıplak
 * hâlinde çizilir ve `--accent` terracottaya döner. `data-module`ün bilinen
 * sınırının aynısı (FRONTEND §4.8); bir test attribute'un varlığını kilitler.
 */
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jakarta',
  display: 'swap',
});

/**
 * ⚠️ `metadataBase` — göreli OG/twitter görsel yollarının mutlaklaşması için.
 * Yazılmazsa Next derleme sırasında uyarır ve paylaşım kartları kırık kalır.
 * Değer ortamdan okunmaz: pazarlama sayfasının kanonik adresi TEK'tir ve bir
 * yapılandırma kazasıyla önizleme adresine düşmemelidir.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://app.kobiwise.com'),
  title: {
    default: 'KobiWise',
    template: '%s — KobiWise',
  },
};

export default function LandingLayout({ children }: { children: ReactNode }) {
  return (
    <div data-surface="landing" className={jakarta.variable}>
      {/*
        ⚠️ JS'SİZ GERİ DÜŞÜŞ — VE BU BİR SÜS DEĞİL.

        `.gir` öğeleri `opacity: 0` başlar; onları açan tek şey `Reveal`in
        IntersectionObserver'ıdır. JS çalışmazsa (kapalı, engellendi, hata
        verdi) içerik HTML'de DURUR — tarayıcı ve arama motoru onu görür — ama
        ekranda GÖRÜNMEZ. Yani sayfa "boş" açılır ve sebebi hiçbir yerde
        yazmaz.

        ⚠️ `<noscript>` içindeki bir `<style>` bunu kapatır ve CSP'ye UYAR:
        ADR-0053 EK-2 `style-src 'self' 'unsafe-inline'` yazıyor — dar ve
        yazılı bir istisna (enjekte edilen bir stil en fazla görünümü bozar).
        `script-src`te böyle bir istisna YOKTUR ve bu satır oraya taşınamaz.
      */}
      <noscript>
        <style
          dangerouslySetInnerHTML={{
            __html: '[data-surface="landing"] .gir{opacity:1;transform:none}',
          }}
        />
      </noscript>

      <Reveal />
      <SiteHeader />
      <main>{children}</main>
      <SiteFooter />
    </div>
  );
}
