import type { Metadata } from 'next';
import Link from 'next/link';

import {
  BLOG_RENGI,
  YAZILAR_YENIDEN_ESKIYE,
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
          {/*
            ⚠️ BAŞLIK "BU AY NE YAZDIK?" İDİ — ağustos tarihli yazılar listeye
            girince doğru olmaktan çıktı ve bir takvim iddiası olarak
            yanlışlaşırdı. Tarihten bağımsız bir başlık seçildi.
          */}
          <span className="etiket">YAZILAR</span>
          <h2 className="d2">Son yazılar</h2>
          {/*
            ⚠️ BÜLTEN VAADİ KALDIRILDI (Product Owner, 2026-09-10). Burada "Ayda
            iki yazı. Abone olanlara e-postayla gider, kimseye satılmaz."
            yazıyordu — ama gerçek bir bülten sistemi YOK ve "ayda iki yazı"
            tutulmamış bir takvimdi. Sayfanın altındaki "ABONE OL" bloğu da
            aynı sebeple kaldırıldı (bkz. aşağı). Bir test bu vaatlerin geri
            gelmesini engeller.
          */}
        </div>

        <div className="yazilar gir">
          {YAZILAR_YENIDEN_ESKIYE.map((yazi, sira) => {
            /* En yeni yazı öne çıkar: koyu yüzey + "YAZIYI OKU →" daveti. */
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

      {/*
        ⚠️ "ABONE OL" BLOĞU KALDIRILDI — ÇEVRİLMEDİ (Product Owner, 2026-09-10).
        Blok "Yeni yazılar çıktığında haber veriyoruz" diyordu ve düğmesi
        yalnızca bir `mailto:` açıyordu: bir abonelik listesi, bir gönderim
        sistemi, bir "tek tıkla çık" bağlantısı YOKTU. Tutulamayan bir vaat,
        kaldırılır.

        ⚠️ "Sorunuz mu var?" diye `merhaba@kobiwise.com`a bağlı bir bloğa
        ÇEVRİLMEDİ: aynı adres her sayfanın alt bilgisinde zaten "İletişim"
        olarak duruyor; aynı sayfada ikinci kez vermek yalnızca tekrar olurdu.
      */}
      <Corridor haric="blog" />
    </>
  );
}
