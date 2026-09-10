import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/components/landing/site-url';

/**
 * `/robots.txt` — Product Owner, 2026-09-10 (bu işte İLK KEZ yazıldı; önceden
 * prod'da 404 idi — bkz. `sitemap.ts`).
 *
 * ⚠️ VARSAYILAN "HER ŞEY AÇIK", YALNIZCA TARANMAMASI GEREKENLER KAPALI:
 * · `/app` — kimlik isteyen uygulamanın kendisi; tarayıcı zaten girişe
 *   yönlendirilir, taramaya çalışması bir yönlendirme zinciri üretmekten
 *   başka bir şey yapmaz.
 * · doğrulama/sıfırlama/tenant seçme/OAuth dönüş sayfaları — tek kullanımlık
 *   akış adımlarıdır; arama sonucunda çıkmaları kullanıcıyı yarım bir akışın
 *   ortasına bırakırdı.
 *
 * ⚠️ `/login` ve `/register` KAPATILMADI: ikisi de bir ziyaretçinin aradığı
 * sayfalardır ("kobiwise giriş"). Kapatmak onları arama sonucundan silerdi.
 *
 * ⚠️ `/blog` HİÇBİR KURALLA KAPANMAZ — ve bir test bunu PREFIX eşleşmesiyle
 * kilitler: robots.txt kuralları önektir, yani "/b" gibi masum görünen bir
 * satır blogun tamamını kapatırdı.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/app',
          '/oauth',
          '/verify-email',
          '/reset-password',
          '/forgot-password',
          '/create-tenant',
          '/select-tenant',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
