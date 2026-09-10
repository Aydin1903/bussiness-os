import type { MetadataRoute } from 'next';

import { BLOG_YAZILARI } from '@/components/landing/blog-posts';
import { DOORS } from '@/components/landing/corridor';
import { SITE_URL } from '@/components/landing/site-url';

/**
 * `/sitemap.xml` — Product Owner, 2026-09-10.
 *
 * ⚠️ BU DOSYA BU İŞTE İLK KEZ YAZILDI. Görev metni "önceki işte kurulan
 * robots.txt/sitemap altyapısı" diyordu; ölçüldüğünde ikisi de prod'da 404
 * idi ve repoda da git geçmişinde de hiç yazılmamıştı.
 *
 * ⚠️ HİÇBİR ADRES ELLE YAZILMAZ:
 * · oda sayfaları koridorun kapı listesinden (`DOORS`) gelir — yeni bir oda
 *   koridora eklendiği an sitemap'e de girer;
 * · yazılar `BLOG_YAZILARI`ndan gelir — yeni bir yazı eklendiği an girer.
 *
 * ⚠️ `lastModified` YALNIZCA yazılarda vardır, çünkü yalnızca onların
 * ÖLÇÜLMÜŞ bir tarihi var (yayın tarihi). Oda sayfalarına derleme zamanını
 * yazmak her deploy'da "bu sayfa değişti" demek olurdu — arama motoruna
 * doğru olmayan bir bilgi.
 *
 * `/app` ve kimlik akışları BURADA YOKTUR: onlar pazarlama sayfası değil;
 * `robots.ts` de onları taramadan çıkarır.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const odalar = DOORS.map((kapi) => ({ url: `${SITE_URL}${kapi.href}` }));
  const yazilar = BLOG_YAZILARI.map((yazi) => ({
    url: `${SITE_URL}/blog/${yazi.slug}`,
    lastModified: yazi.tarih,
  }));

  return [...odalar, ...yazilar];
}
