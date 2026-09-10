import type { Metadata } from 'next';
import Link from 'next/link';

import {
  BLOG_RENGI,
  BLOG_YAZILARI,
  okumaSuresi,
  tarihEtiketi,
} from '@/components/landing/blog-posts';
import { Corridor } from '@/components/landing/corridor';
import { RoomHeader } from '@/components/landing/room-header';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Kurumsal hafıza, yapay zeka ve küçük şirketlerin gerçek sorunları üzerine yazılar.',
  alternates: { canonical: '/blog' },
};

/**
 * `/blog` — yazı listesi (ADR-0054).
 *
 * ============================================================================
 * ⚠️ KARTLAR ARTIK BAĞLANTIDIR — DETAY SAYFASI YAZILDI (Product Owner, 2026-09-10)
 * ============================================================================
 * Bu dosyanın eski yorumu bugünü öngörmüştü: kartlar `<article>`dı, çünkü
 * detay sayfası yoktu ve ölü bir bağlantı tıklandığında sayfayı başa atardı.
 * _"Detay sayfası yazıldığı gün üçü birden geri gelir: `<article>` →
 * `<Link>`, hover kuralı, ve künye satırındaki davet."_ Üçü de geri geldi.
 *
 * ⚠️ ESKİ YEDİ KART KALDIRILDI: hiçbiri gerçek bir yazı değildi ve üzerlerinde
 * UYDURMA tarih ve okuma süreleri vardı. Liste artık yalnızca
 * `blog-posts.ts`teki gerçek yazılardan üretilir; bir kart var olmayan bir
 * sayfaya işaret edemez (bir test kilitler).
 *
 * ⚠️ Kart özeti girişin KISALTILMIŞIDIR, süre kelime sayısından TÜRETİLİR —
 * ikisi de elle yazılmaz.
 */
export default function BlogPage() {
  return (
    <>
      <RoomHeader renk={BLOG_RENGI} etiket="ODA 03 · BLOG" baslik="Yukarıdan bakınca.">
        Kurumsal hafıza, yapay zeka ve küçük şirketlerin gerçek sorunları üzerine yazılar. Ürün
        duyurusu değil — işin kendisi üzerine.
      </RoomHeader>

      <section className="kap">
        <div className="bolum-bas bolum-bas-sik">
          <span className="etiket">ÖNE ÇIKAN</span>
          <h2 className="d2">Bu ay ne yazdık?</h2>
          <p className="alt">Ayda iki yazı. Abone olanlara e-postayla gider, kimseye satılmaz.</p>
        </div>

        <div className="yazilar gir">
          {BLOG_YAZILARI.map((yazi, sira) => {
            /* İlk yazı öne çıkar: koyu yüzey + "YAZIYI OKU →" daveti. */
            const one = sira === 0;

            return (
              <Link
                className={one ? 'yazi yazi-one' : 'yazi'}
                href={`/blog/${yazi.slug}`}
                key={yazi.slug}
              >
                <span className="ust-sat">
                  <span>{yazi.kategori}</span>
                  <span>{okumaSuresi(yazi)} DK</span>
                </span>
                <h3>{yazi.baslik}</h3>
                <p>{yazi.ozet}</p>
                <span className="dip">
                  <time dateTime={yazi.tarih}>{tarihEtiketi(yazi.tarih)}</time>
                  {one ? ' · YAZIYI OKU →' : ''}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="bolum kap">
        <div className="kapanis gir">
          <span className="etiket">AYDA İKİ YAZI</span>
          <h2 className="d2">Hafızaya bir şey eklemek ister misiniz?</h2>
          <p className="alt">
            Yeni yazılar çıktığında haber veriyoruz. Reklam yok, tek tıkla çıkarsınız.
          </p>
          <p>
            <a className="dg dg-koyu" href="mailto:merhaba@kobiwise.com">
              ABONE OL
            </a>
          </p>
        </div>
      </section>

      <Corridor haric="blog" />
    </>
  );
}
