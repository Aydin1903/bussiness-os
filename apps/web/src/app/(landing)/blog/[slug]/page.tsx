import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { BLOG_YAZILARI, sonDegisiklik, yaziBul } from '@/components/landing/blog-posts';
import { Makale } from '@/components/landing/makale';

/**
 * `/blog/[slug]` — blog yazısı (Product Owner, 2026-09-10).
 *
 * ⚠️ `dynamicParams = false`: listede olmayan bir slug 404 döner, boş bir
 * sayfa ya da uydurma bir yazı çizilmez. Yazıların tek kaynağı
 * `blog-posts.ts`tir.
 *
 * ⚠️ Next 15'te `params` bir PROMISE'tir; senkron okunsaydı derleme uyarır
 * ve bir sonraki ana sürümde sayfa kırılırdı.
 */
export const dynamicParams = false;

interface Parametre {
  readonly params: Promise<{ slug: string }>;
}

export function generateStaticParams(): { slug: string }[] {
  return BLOG_YAZILARI.map((yazi) => ({ slug: yazi.slug }));
}

/**
 * ⚠️ Açıklama = `metaAciklama`, giriş paragrafı DEĞİL (2026-09-10). İlk
 * yazımda giriş kullanılıyordu; girişler ~210–250 karakterdi ve Google ~155'ten
 * sonrasını keser. Sayfada görünen giriş değişmedi — arama sonucu için ayrı,
 * kısa bir metin yazıldı (gerekçe `blog-posts.ts`te).
 *
 * Kanonik adres göreli yazılır; `(landing)/layout.tsx`in `metadataBase`i onu
 * `SITE_URL`e mutlaklaştırır.
 */
export async function generateMetadata({ params }: Parametre): Promise<Metadata> {
  const { slug } = await params;
  const yazi = yaziBul(slug);

  if (yazi === undefined) {
    return {};
  }

  return {
    title: yazi.baslik,
    description: yazi.metaAciklama,
    alternates: { canonical: `/blog/${yazi.slug}` },
    openGraph: {
      type: 'article',
      title: yazi.baslik,
      description: yazi.metaAciklama,
      url: `/blog/${yazi.slug}`,
      siteName: 'KobiWise',
      locale: 'tr_TR',
      publishedTime: yazi.tarih,
      // Gerçek son değişiklik — editoryal olarak geçmişe atılmış yayın tarihinden ayrı.
      modifiedTime: sonDegisiklik(yazi),
      images: [{ url: yazi.gorsel.src, width: 1254, height: 1254, alt: yazi.gorsel.alt }],
    },
  };
}

export default async function BlogYazisiPage({ params }: Parametre) {
  const { slug } = await params;
  const yazi = yaziBul(slug);

  if (yazi === undefined) {
    notFound();
  }

  // Middleware'in isteğe yazdığı nonce — kök layout'la aynı kaynak (ADR-0053 EK-2).
  const nonce = (await headers()).get('x-nonce') ?? undefined;

  return <Makale yazi={yazi} nonce={nonce} />;
}
