import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Newsreader } from 'next/font/google';
import type { ReactNode } from 'react';

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

export const metadata: Metadata = {
  title: 'Business OS',
  description: 'AI destekli, cok kiracili SaaS Business Operating System',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${newsreader.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-bg font-sans text-fg antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
