import type { Metadata } from 'next';

import { Corridor } from '@/components/landing/corridor';
import { RoomHeader } from '@/components/landing/room-header';

export const metadata: Metadata = {
  title: 'Blog',
  description: 'Kurumsal hafıza, yapay zekâ ve küçük şirketlerin gerçek sorunları üzerine yazılar.',
};

/**
 * `/blog` — yazı listesi (ADR-0054).
 *
 * ============================================================================
 * ⚠️ KARTLAR BAĞLANTI DEĞİLDİR — VE BU BİLİNÇLİ, GEÇİCİ BİR DURUMDUR
 * ============================================================================
 * Yazı DETAY sayfası henüz yazılmadı (bu işin kapsamı dışında, Product Owner
 * kararı). Prototipte kartlar `<a href="#">` idi; üretimde ölü bir bağlantı
 * tıklandığında sayfayı BAŞA ATAR ve kullanıcı bunu bir ARIZA olarak okur.
 *
 * Bu yüzden kartlar `<article>`dır: görsel tasarım birebir aynı kalır (aynı
 * sınıflar), ama tıklanabilir bir şey vaat edilmez.
 *
 * ⚠️ `.yazi:hover` kuralı da `landing-surface.css`ten ÇIKARILDI. Bırakılsaydı
 * imleç üzerine gelince kart rengi değişir, kullanıcı tıklanabilir sanır ve
 * tıklar — hiçbir şey olmaz. Görsel bir vaat, bir vaattir.
 *
 * ⚠️ Öne çıkan yazının künye satırından "YAZIYI OKU →" ÇIKARILDI (prototipte
 * vardı): var olmayan bir sayfaya davet eden tek cümle oydu.
 *
 * ⚠️ Detay sayfası yazıldığı gün üçü birden geri gelir: `<article>` → `<Link>`,
 * hover kuralı, ve künye satırındaki davet. Bir test kartların bugün bağlantı
 * OLMADIĞINI kilitler — böylece "yarısı yapıldı" hâli sessizce yaşamaz.
 */

interface Yazi {
  readonly baslik: string;
  readonly kategori: string;
  readonly sure: string;
  readonly ozet: string;
  readonly kunye: string;
  /** Öne çıkan yazı: koyu, iki sütun genişliğinde. */
  readonly one?: boolean;
}

const YAZILAR: readonly Yazi[] = [
  {
    baslik: 'Şirketin hafızası neden bir kişinin izin gününde kayboluyor?',
    kategori: 'KURUMSAL HAFIZA',
    sure: '8 DK',
    ozet: 'Bilgi bir yerde durmaz; insanlarda yaşar. Bu yazıda “kurumsal hafıza”yı bir slogan olmaktan çıkarıp ölçülebilir bir şeye çeviriyoruz: hangi soruların cevabı bugün kimde, ve o kişi olmadığında ne oluyor?',
    kunye: '2 EYLÜL 2026 · KOBIWISE EKİBİ',
    one: true,
  },
  {
    baslik: '“Yapay zekâ kullanıyoruz” demek neden bir şey anlatmıyor?',
    kategori: 'YAPAY ZEKÂ',
    sure: '6 DK',
    ozet: 'Aynı modeli herkes çağırabilir. Farkı yaratan model değil, modele verilen bağlamdır — ve bağlam sizin verinizdir.',
    kunye: '26 AĞUSTOS 2026',
  },
  {
    baslik: 'Satır bazlı güvenlik: izolasyonu uygulamaya bırakmamak',
    kategori: 'VERİ GÜVENLİĞİ',
    sure: '9 DK',
    ozet: 'Çok kiracılı bir sistemde en tehlikeli hata sessiz olanıdır. İzolasyonu neden veritabanının kendisinde zorluyoruz?',
    kunye: '19 AĞUSTOS 2026',
  },
  {
    baslik: 'On iki modülü tek tek değil, hafıza olarak tasarlamak',
    kategori: 'ÜRÜN',
    sure: '7 DK',
    ozet: 'Bir modül tasarlarken sorduğumuz soru “kullanıcı burada ne yapar” değil, “bu modül asistana hangi bağlamı kazandırır”dır.',
    kunye: '12 AĞUSTOS 2026',
  },
  {
    baslik: 'Küçük işletmenin en pahalı gideri: iki kez sorulan soru',
    kategori: 'KOBİ',
    sure: '5 DK',
    ozet: 'Aynı bilgiyi ikinci kez aramak bir dakikadır. Yılda kaç dakika olduğunu hesaplayınca ortaya çıkan sayı şaşırtıyor.',
    kunye: '5 AĞUSTOS 2026',
  },
  {
    baslik: 'Sağlayıcı bağımsızlığı: model değişir, ürün değişmez',
    kategori: 'MÜHENDİSLİK',
    sure: '8 DK',
    ozet: 'İş mantığını bir porta bağlamak ilk gün pahalı görünür. Sağlayıcı fiyat değiştirdiğinde bedelini ödemeyen tek karar odur.',
    kunye: '29 TEMMUZ 2026',
  },
  {
    baslik: 'Her modüle bir renk vermek neden bir ürün kararıdır?',
    kategori: 'TASARIM',
    sure: '6 DK',
    ozet: 'Renk süs değil yön duygusudur. On iki odanın her birine imza rengi verirken neyi kaybetmemeye çalıştık?',
    kunye: '22 TEMMUZ 2026',
  },
];

export default function BlogPage() {
  return (
    <>
      <RoomHeader renk="#5c6cab" etiket="ODA 03 · BLOG" baslik="Yukarıdan bakınca.">
        Kurumsal hafıza, yapay zekâ ve küçük şirketlerin gerçek sorunları üzerine yazılar. Ürün
        duyurusu değil — işin kendisi üzerine.
      </RoomHeader>

      <section className="kap">
        <div className="bolum-bas bolum-bas-sik">
          <span className="etiket">ÖNE ÇIKAN</span>
          <h2 className="d2">Bu ay ne yazdık?</h2>
          <p className="alt">Ayda iki yazı. Abone olanlara e-postayla gider, kimseye satılmaz.</p>
        </div>

        <div className="yazilar gir">
          {YAZILAR.map((yazi) => (
            <article className={yazi.one === true ? 'yazi yazi-one' : 'yazi'} key={yazi.baslik}>
              <span className="ust-sat">
                <span>{yazi.kategori}</span>
                <span>{yazi.sure}</span>
              </span>
              <h3>{yazi.baslik}</h3>
              <p>{yazi.ozet}</p>
              <span className="dip">{yazi.kunye}</span>
            </article>
          ))}
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
