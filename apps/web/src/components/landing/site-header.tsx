'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * LANDING ÜST ÇUBUĞU — üç kademe, üç farklı muamele (ADR-0054).
 *
 * ============================================================================
 * ⚠️ NEDEN CLIENT COMPONENT — VE BEDELİ NE KADAR
 * ============================================================================
 * Tek sebep aktif sekmedir: `aria-current="page"` hangi sayfada olduğumuzu
 * bilmeyi gerektirir ve bunu bilen tek şey `usePathname`dir. Alternatif, her
 * sayfanın kendi anahtarını `<SiteHeader screen="…">` diye deklare etmesiydi
 * (ADR-0052'nin `AuthScreen` deseni) ve REDDEDİLDİ: orada sayfa başına
 * DEĞİŞEN bir panel vardı, burada değişen tek şey bir attribute'tur — beş
 * sayfaya beş deklarasyon yazmak, unutulduğunda sessizce yanlış sekmeyi
 * işaretlerdi.
 *
 * Bedel ölçülüdür: yalnızca üst çubuk istemci ağacındadır. Sayfa gövdeleri
 * (on iki oda kartı, altı SSS, yedi yazı kartı) Server Component kalır.
 *
 * ============================================================================
 * ⚠️ "NASIL ÇALIŞIR" BİR SAYFA DEĞİL, ANA SAYFADA BİR ÇAPA
 * ============================================================================
 * Bu yüzden aktiflik testi yolun BAŞLANGICINA bakmaz, TAM EŞİTLİĞE bakar:
 * `/` üzerindeyken hem "Nasıl çalışır" hem başka bir şey aktif görünemez.
 * Çapa (`/#nasil`) hiçbir zaman aktif işaretlenmez — bir bölüme kaydırmak
 * "başka bir sayfadayım" demek değildir.
 */

interface NavItem {
  readonly href: string;
  readonly etiket: string;
  /** `false` ise bu bağlantı hiçbir zaman aktif işaretlenmez (çapa). */
  readonly rota: boolean;
}

const NAV: readonly NavItem[] = [
  { href: '/moduller', etiket: 'Modüller', rota: true },
  { href: '/#nasil', etiket: 'Nasıl çalışır', rota: false },
  { href: '/sorular', etiket: 'Sorular', rota: true },
  { href: '/hakkinda', etiket: 'Hakkında', rota: true },
  { href: '/blog', etiket: 'Blog', rota: true },
];

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="ust">
      <div className="kap ust-in">
        <Link className="ust-logo" href="/">
          {/*
            ⚠️ YAZILI LOGO BURADA BİR GÖRSELDİR, `KobiWiseWordmark` DEĞİL.

            İkisi de "yazılı logo"yu çizer ama farklı şeylerdir: `brand.tsx`
            markanın adını kalın Inter ile DİZER (ADR-0038 §7'nin kaydettiği
            gibi, "Product Owner kelime logosunun vektörüne gerek olmadığını
            bildirdi" — çünkü kabukta kullanılmıyordu); buradaki ise markanın
            GERÇEK çizilmiş logosudur.

            ADR-0038 §7.3 yazılı logoyu zaten "giriş ekranı, e-posta ve
            PAZARLAMA" için ayırmıştı; pazarlama yüzeyi ilk kez var olduğuna
            göre gerçek varlığın kullanılacağı yer burasıdır.

            ⚠️ İki uygulamanın yan yana yaşadığı KAYITLIDIR (ADR-0054): auth
            metni, landing görseli kullanır. Biri değişirse diğeri sessizce
            ayrışır — bugün kabul edilen, ölçülmüş bir borçtur.

            ⚠️ `width`/`height` GERÇEK piksel oranıdır (880×246), CSS boyutu
            değil: tarayıcı yer ayırmak için orana bakar, `height: 44px`
            kuralını CSS verir. Oran yanlış yazılsaydı yükleme sırasında düzen
            KAYARDI (CLS) ve hata yalnızca yavaş bağlantıda görünürdü.
          */}
          <img src="/brand/wordmark.webp" alt="KobiWise — ana sayfa" width={880} height={246} />
        </Link>

        <nav className="ust-nav" aria-label="Ana gezinme">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              {...(item.rota && pathname === item.href ? { 'aria-current': 'page' } : {})}
            >
              {item.etiket}
            </Link>
          ))}
        </nav>

        <div className="ust-act">
          {/*
            ⚠️ İKİ EYLEM, İKİ GERÇEK ROTA. Prototipte ikisi de `href="#"` idi
            (kayıt/giriş ekranları o dosyada yoktu). Üretimde asıl iş budur:
            kimliksiz ziyaretçinin ürüne girdiği kapı ilk kez AÇIK.
          */}
          <Link className="dg dg-s dg-cizgi" href="/login">
            GİRİŞ
          </Link>
          <Link className="dg dg-nane dg-s" href="/register">
            <span className="uzun">ÜCRETSİZ </span>BAŞLA <b>↗</b>
          </Link>
        </div>
      </div>
    </header>
  );
}
