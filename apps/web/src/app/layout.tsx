import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google';
import type { ReactNode } from 'react';

import { THEME_NO_FLASH_SCRIPT } from '@/lib/theme/theme';
import { Providers } from './providers';
import './globals.css';

/**
 * Fontlar BUILD ANINDA indirilir ve kendi origin'imizden servis edilir.
 *
 * ============================================================================
 * NEDEN `next/font`, NEDEN `<link>` DEĞİL
 * ============================================================================
 * Google Fonts'a `<link>` vermek üç borç doğururdu: (1) her ziyaretçi üçüncü
 * bir tarafa istek atar — gizlilik yüzeyi, (2) ek DNS + TLS el sıkışması,
 * (3) font geç gelirse metin ya görünmez ya da yeniden akar. `next/font`
 * dosyaları derleme sırasında alır, kendi origin'imize koyar ve fallback
 * ölçüsünü `size-adjust` ile eşitleyerek düzen kaymasını (CLS) sıfırlar.
 *
 * ⚠️ `latin-ext` ZORUNLU: Türkçe'nin ş/ğ/ı/İ/ç/ö/ü karakterleri `latin`
 * altkümesinde YOKTUR. Yalnızca `latin` ile bu harfler fallback fonttan gelir
 * ve kelimenin ortasında font değişir.
 */
const inter = Inter({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-inter',
  display: 'swap',
  /*
   * ⚠️ `italic` AÇIKÇA İSTENİR — yoksa tarayıcı SAHTE İTALİK üretir.
   *
   * `next/font/google` varsayılan olarak yalnızca `normal` stilini indirir.
   * `font-style: italic` yazıldığında italik dosya yoksa tarayıcı dik
   * harfleri mekanik olarak EĞER (synthetic oblique): harf biçimleri
   * değişmez, yalnızca yamultulur — `a`/`f` gibi italikte yeniden çizilen
   * harfler dik hâllerinin eğik kopyası olarak kalır ve büyük puntoda bu
   * açıkça görünür.
   *
   * ⚠️ Hata SESSİZDİR: ekran çalışır, yazı "italik görünür", yalnızca
   * kötüdür — ne lint ne test yakalar.
   *
   * Bedeli dürüstçe: uygulamanın tamamına ikinci bir font dosyası girer.
   * Bugün italiği yalnızca auth paneli kullanıyor (kod tabanında başka
   * `italic` kullanımı YOK — arandı). Kabul edildi: alternatif, marka
   * yüzeyinde sahte italik göstermekti.
   */
  style: ['normal', 'italic'],
});

/**
 * AI'ın sesi. `opsz` ekseni AÇIKÇA istenir: `next/font` değişken fontlarda
 * varsayılan olarak yalnızca `wght` eksenini getirir ve
 * `font-variation-settings: 'opsz' …` sessizce etkisiz kalırdı.
 */
const newsreader = Newsreader({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-newsreader',
  display: 'swap',
  axes: ['opsz'],
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin', 'latin-ext'],
  variable: '--font-jetbrains',
  display: 'swap',
});

/**
 * ⚠️ Ürün adı KobiWise (2026-08-14). `@business-os/contracts` gibi PAKET adları
 * bilinçli olarak değişmedi: onlar iç isimlendirmedir, kullanıcı görmez ve
 * yeniden adlandırmak monorepo çapında bir kırıcı değişiklik olurdu. Burada
 * değişen şey kullanıcının GÖRDÜĞÜ addır.
 */
export const metadata: Metadata = {
  title: 'KobiWise',
  description: 'İşletmeniz için yapay zekâ işletim sistemi',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    /*
     * ⚠️ `suppressHydrationWarning` — TEMA SCRIPT'İNİN ZORUNLU EŞLİKÇİSİ.
     *
     * Aşağıdaki inline script `<html>`e `data-theme` yazar ve bunu React
     * hidrasyondan ÖNCE yapar (FOUC'un tek çaresi bu). Sunucunun ürettiği HTML
     * ise o attribute'u taşımaz — sunucu kullanıcının tercihini bilemez, çünkü
     * tercih `localStorage`'da.
     *
     * Sonuç React için bir uyuşmazlıktır ve her yüklemede konsola bir HATA
     * yazar. Görünür bir bozulma YOK (React attribute'a dokunmaz, tema doğru
     * kalır) ama bedeli daha sinsi: gerçek bir hidrasyon hatası bu gürültünün
     * içinde KAYBOLUR.
     *
     * ⚠️ Bayrak YALNIZCA bu öğeye ve YALNIZCA bir seviye derinliğe uygulanır;
     * ağacın geri kalanı normal şekilde denetlenmeye devam eder. Gövdeye ya da
     * daha aşağı taşımak, gerçek hataları susturmak olurdu.
     */
    <html
      lang="tr"
      suppressHydrationWarning
      className={`${inter.variable} ${newsreader.variable} ${jetbrains.variable}`}
    >
      <head>
        {/*
          TEMA — İLK BOYAMADAN ÖNCE (ADR-0038 Dilim 1).

          React ağacı hidrasyondan sonra çalışır; o ana kadar belge
          attribute'suzdur ve koyu tema seçmiş bir kullanıcı bir kare boyunca
          BEYAZ ekran görür. `<head>` içindeki senkron bir script bunu kapatan
          tek yoldur — `next/script` bile yeterince erken değildir.

          ⚠️ Script gövdesi ELLE YAZILMADI: `theme.ts`'in sabitlerinden üretilir
          (`THEME_NO_FLASH_SCRIPT`). Elle yazılsaydı depolama anahtarı iki yerde
          durur ve biri değişince hata SESSİZ olurdu — tema kaydedilir ama
          açılışta okunmazdı.
        */}
        <script dangerouslySetInnerHTML={{ __html: THEME_NO_FLASH_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
