import Link from 'next/link';

import { BLOG_RENGI, type BlogYazisi, makaleSemasi, okumaSuresi, tarihEtiketi } from './blog-posts';
import { Corridor } from './corridor';
import { RoomHeader } from './room-header';

/**
 * BLOG YAZISI — `/blog/[slug]`in gövdesi (Product Owner, 2026-09-10).
 *
 * ============================================================================
 * ⚠️ NEDEN `page.tsx`TE DEĞİL, AYRI BİR BİLEŞEN
 * ============================================================================
 * Sayfa `async`tir (Next 15'te `params` bir Promise'tir ve CSP nonce'u
 * `headers()`tan okunur); jsdom ve Testing Library async bir Server
 * Component'ı render edemez. Sayfa yalnızca veriyi çözer, çizimi bu SENKRON
 * bileşen yapar — testler de doğrudan bunu render eder. Ayrıca `page.tsx`
 * yalnızca Next'in tanıdığı adları dışa aktarabilir; ek bir export derlemeyi
 * kırardı.
 *
 * ============================================================================
 * BAŞLIK HİYERARŞİSİ — tek H1, bölümler H2
 * ============================================================================
 * H1 = yazının başlığı (`RoomHeader`), H2'ler = Product Owner'ın bölüm
 * başlıkları. Sayfanın geri kalan iki H2'si (kapanış ve koridor) makalenin
 * DIŞINDADIR — `<article>` yalnızca yazının kendisini sarar.
 */
export function Makale({
  yazi,
  nonce,
}: {
  readonly yazi: BlogYazisi;
  /** `exactOptionalPropertyTypes` açık: nonce başlığı yoksa sayfa AÇIKÇA `undefined` geçer. */
  readonly nonce?: string | undefined;
}) {
  /*
   * ⚠️ `<` KAÇIRILIR: JSON bir `<script>` etiketinin içine yazılıyor ve metinde
   * bir gün "</script>" geçerse etiket orada kapanır, kalan metin HTML olarak
   * okunurdu. Bugünkü metinlerde yok — ama veri değişir, bu satır değişmez.
   */
  const sema = JSON.stringify(makaleSemasi(yazi)).replace(/</gu, '\\u003c');

  return (
    <>
      {/*
        ⚠️ JSON-LD bir VERİ bloğudur, çalıştırılan bir script değil; CSP'nin
        `script-src`i onu engellemez. Nonce yine de verilir: ADR-0053 EK-2'nin
        "sayfadaki her script etiketi nonce taşır" kuralının istisnası olmasın
        ve bir gün birisi "script'lerde nonce var mı" diye tarasın.

        ⚠️ `suppressHydrationWarning` ZORUNLU ve TAM OLARAK BU ÖĞEYE konur — kök
        layout'taki tema script'inin aynı dersi. Gerçek tarayıcıda ölçüldü:
        tarayıcı `nonce` içerik attribute'unu ayrıştırmadan hemen sonra
        BOŞALTIR (değer bir CSS seçicisiyle sızdırılamasın diye); sunucu
        `nonce="…"` yazar, istemci `nonce=""` görür ve React her yüklemede bir
        hidrasyon HATASI basar. Bedeli görünür bir bozulma değil gürültüdür —
        ama gerçek bir hidrasyon hatası o gürültünün içinde KAYBOLUR. Bayrak
        daha yukarı taşınsaydı o gerçek hataları da susturmuş olurdu.
      */}
      <script
        type="application/ld+json"
        nonce={nonce}
        suppressHydrationWarning
        dangerouslySetInnerHTML={{ __html: sema }}
      />

      <RoomHeader
        renk={BLOG_RENGI}
        etiket={`BLOG · ${yazi.kategori}`}
        baslik={yazi.baslik}
        geri={{ href: '/blog', etiket: '← BLOG' }}
      >
        {yazi.giris}
      </RoomHeader>

      <article className="kap makale">
        {/* Metin ELLE büyük harf yazılır — `text-transform` bu belgede "i"yi "I" yapardı. */}
        <p className="makale-kunye">
          <time dateTime={yazi.tarih}>{tarihEtiketi(yazi.tarih)}</time>
          <span>{okumaSuresi(yazi)} DK OKUMA</span>
          <span>KOBIWISE</span>
        </p>

        {/*
          ⚠️ `loading="lazy"` YAZILMAZ: görsel başlığın hemen altında, masaüstünde
          ilk ekranın içinde. Tembel yükleme tam da geciktirmek istemediğimiz
          yerde geciktirirdi.
        */}
        <figure className="makale-gorsel">
          <img
            src={yazi.gorsel.src}
            alt={yazi.gorsel.alt}
            decoding="async"
            width={1254}
            height={1254}
            style={{ objectPosition: yazi.gorsel.konum }}
          />
        </figure>

        {yazi.bolumler.map((bolum) => (
          <section className="makale-bolum" key={bolum.baslik}>
            <h2>{bolum.baslik}</h2>
            {bolum.paragraflar.map((paragraf) => (
              <p key={paragraf}>{paragraf}</p>
            ))}
          </section>
        ))}
      </article>

      {/*
        ⚠️ KAPANIŞ ANA SAYFANINKİYLE BİREBİR AYNIDIR — yeni bir vaat yazılmadı.
        Product Owner her yazının sonunda "Ücretsiz Başla" istedi; blok ve
        cümleleri ana sayfada zaten onaylıydı.
      */}
      <section className="kap">
        <div className="kapanis gir">
          <span className="etiket">BAŞLAMAK</span>
          <h2 className="d2">Bugün yazdığınız not, yarın sorduğunuz sorunun cevabı</h2>
          <p className="alt">
            Şirketinizi oluşturun, ilk kaydınızı girin. Hafıza aynı gün birikmeye başlar.
          </p>
          <p>
            <Link className="dg dg-koyu" href="/register">
              ÜCRETSİZ BAŞLA
            </Link>
          </p>
          <p className="kucuk">Kredi kartı istemiyoruz · İstediğiniz an bırakırsınız</p>
        </div>
      </section>

      <Corridor />
    </>
  );
}
