import { SITE_URL } from './site-url';

/**
 * BLOG YAZILARI — tek doğruluk kaynağı (Product Owner, 2026-09-10).
 *
 * ============================================================================
 * ⚠️ LİSTE, DETAY SAYFASI, SITEMAP VE JSON-LD HEP BURADAN OKUR
 * ============================================================================
 * Bir yazının başlığı dört yerde görünür: blog listesindeki kart, detay
 * sayfasının H1'i, `<title>` ve Article şemasının `headline`ı. Dördü ayrı
 * yazılsaydı biri düzeltilip öteki unutulduğunda arama motoru bir başlık,
 * ziyaretçi başka bir başlık görürdü — ve hata SESSİZ olurdu.
 *
 * ⚠️ METİNLER PRODUCT OWNER'IN YAZDIĞI GİBİDİR, harfi harfine. Girişler için
 * açık talimat vardı ("değiştirme"); gövde de aynen alındı. Bir test girişin
 * detay sayfasında BİREBİR göründüğünü kilitler.
 *
 * ⚠️ ESKİ YEDİ KART KALDIRILDI: listede yer tutucu yazılar vardı — hiçbiri
 * gerçek bir makale değildi ve üzerlerinde UYDURMA yayın tarihleri vardı
 * ("2 EYLÜL 2026", "26 AĞUSTOS 2026" …). Açılamayan, tarihi uydurma yazıları
 * gerçeklerin yanında bırakmak okuru yanıltırdı.
 */

/**
 * Blog odasının imza rengi — liste (`/blog`) ve yazı sayfaları AYNI rengi
 * taşır; ikisi ayrı yazılsaydı biri değişince yazıya girildiğinde oda rengi
 * sessizce değişirdi.
 */
export const BLOG_RENGI = '#5c6cab';

export interface Bolum {
  /** Detay sayfasında H2. */
  readonly baslik: string;
  readonly paragraflar: readonly string[];
}

export interface Gorsel {
  /** `public/` altındaki yol — mevcut dört maskot sahnesinden biri. */
  readonly src: string;
  readonly alt: string;
  /** Geniş kadrajda maskotun kesilmemesi için odak noktası. */
  readonly konum: string;
}

export interface BlogYazisi {
  /** URL parçası — yalnızca küçük ASCII harf, rakam ve tire (bir test kilitler). */
  readonly slug: string;
  /** H1 · `<title>` · şemanın `headline`ı · kartın başlığı. */
  readonly baslik: string;
  readonly kategori: string;
  /** Yayın tarihi, ISO (YYYY-AA-GG) — şemanın `datePublished`ı. */
  readonly tarih: string;
  /** Giriş paragrafı — meta açıklama olarak da kullanılır (PO talimatı). */
  readonly giris: string;
  /**
   * Kart özeti — girişin KISALTILMIŞI (PO talimatı), yani girişin ilk
   * cümlesi. Bir test onun girişin ÖNEKİ olduğunu kilitler: özet ayrı bir
   * metin olarak yazılıp giriş değiştiğinde bayatlamasın.
   */
  readonly ozet: string;
  readonly bolumler: readonly Bolum[];
  readonly gorsel: Gorsel;
}

export const BLOG_YAZILARI: readonly BlogYazisi[] = [
  {
    slug: 'sirketinizin-bilgisi-neden-bir-kiside-kaliyor',
    baslik: 'Şirketinizin bilgisi neden hep bir kişide kalıyor?',
    kategori: 'KURUMSAL HAFIZA',
    tarih: '2026-09-10',
    giris:
      "Çünkü her araç kendi kutusunda çalışıyor — CRM'de müşteri notu, Excel'de fiyat, WhatsApp'ta teslimat detayı. Hiçbiri diğerini görmüyor, tek bağlantı noktası hafızanızdaki insan oluyor. O kişi izne çıkınca ya da işten ayrılınca, bilgi de onunla gidiyor.",
    ozet: "Çünkü her araç kendi kutusunda çalışıyor — CRM'de müşteri notu, Excel'de fiyat, WhatsApp'ta teslimat detayı.",
    bolumler: [
      {
        baslik: 'Sorun nerede başlıyor',
        paragraflar: [
          'On kişilik bir şirket düşünün. Satış WhatsApp\'tan yürüyor, teklifler Word\'de, ödemeler bir deftere yazılıyor, randevular takvimde. Her araç kendi işini iyi yapıyor. Sorun aralarında: bir müşteri "geçen ay ne konuşmuştuk" diye sorduğunda, cevap üç farklı yerde, üç farklı formatta duruyor — ya da hiç durmuyor, birinin hafızasında yaşıyor.',
          'Bu, küçük şirketlere özgü bir kusur değil. Büyük şirketler bunu departmanlar arasında yaşıyor; küçük şirketler aynı sorunu kişiler arasında yaşıyor. Fark yalnızca ölçek.',
        ],
      },
      {
        baslik: 'Neden "bir araç daha eklemek" çözmüyor',
        paragraflar: [
          'Sezgisel çözüm yeni bir program almak gibi görünür — daha iyi bir CRM, daha iyi bir muhasebe programı. Ama bu, sorunu büyütür: artık on bir program var, on iki değil. Her yeni araç kendi adasını kurar, hiçbiri komşusuyla konuşmaz.',
          'Gerçek soru "hangi programı kullanıyoruz" değil, "bir bilgiyi bir kez yazdığımızda, o bilgi nerede yaşıyor ve kim erişebiliyor" sorusudur.',
        ],
      },
      {
        baslik: 'Tek hafıza ne demek',
        paragraflar: [
          'Çözüm, tek bir devasa program değil — her modülün (müşteri, finans, stok, randevu) kendi işini yapması ama hepsinin aynı hafızaya yazması. Bir satış temsilcisinin müşteriyle yaptığı görüşme notu, finans ekibinin o müşterinin ödeme geçmişini görürken de erişebildiği aynı kayıttır. Kimse "git ona sor" demek zorunda kalmaz.',
          "Bu, KobiWise'ın kurulma sebebidir: modüller ürün değil, hafızadır.",
        ],
      },
    ],
    gorsel: {
      src: '/brand/mascot-scene-walk.webp',
      alt: 'Mars fırtınasında tek başına yürüyen KobiWise asistanı',
      konum: '42% 62%',
    },
  },
  {
    slug: 'yapay-zeka-bilmiyorum-diyebilmeli',
    baslik: 'Yapay zeka "bilmiyorum" diyebilmeli — işte nedeni',
    kategori: 'YAPAY ZEKA',
    tarih: '2026-09-10',
    giris:
      "Çünkü bilmediğini söylemeyen bir yapay zeka, bilmediği bir şeyi uydurur — ve iş kararı bu uydurmaya dayanırsa, hata müşteriye kadar gider. Bir asistanın en değerli özelliği bazen 'elimde yeterli veri yok' diyebilmesidir.",
    ozet: 'Çünkü bilmediğini söylemeyen bir yapay zeka, bilmediği bir şeyi uydurur — ve iş kararı bu uydurmaya dayanırsa, hata müşteriye kadar gider.',
    bolumler: [
      {
        baslik: 'Genel bir sohbet motoru neden risklidir',
        paragraflar: [
          'Genel amaçlı bir yapay zeka asistanına "geçen ay satışlarımız nasıldı" diye sorduğunuzda, o sizin satış verinizi görmez. Ama yine de bir cevap üretmeye çalışır — çünkü eğitildiği davranış budur: soruya cevap vermek, "bilmiyorum" demek değil. Cevap makul görünür, akıcı yazılmıştır, ve tamamen uydurmadır.',
          'Bu, kötü niyetli bir hata değil — sistemin doğası. Genel bir dil modeli sizin şirketinizin geçen çeyrekte ne yaşadığını bilemez, çünkü o veriye hiç erişimi yoktur.',
        ],
      },
      {
        baslik: 'Doğru davranış: kaynağı göster, yoksa söyle',
        paragraflar: [
          'Bir asistanın güvenilir olması için iki şey gerekir: cevabının hangi kayda dayandığını göstermesi, ve yeterli veri olmadığında bunu açıkça söylemesi. İkisi de aynı ilkeden gelir — asistan bir şey uydurmak yerine sınırını kabul etmelidir.',
          'Örnek: "Son altı ayımızı analiz et" sorusuna doğru cevap, elinizde üç aylık veri varsa "üç aylık veriye dayanarak şunu söyleyebilirim, ama altı aylık bir analiz için yeterli kaydım yok" olmalıdır — üç aylık veriyi altı aya genelleyip kesin bir rakam söylemek değil.',
        ],
      },
      {
        baslik: 'Bu neden bir iş kararı meselesi',
        paragraflar: [
          'Bir asistanın ürettiği yanlış bir rakama dayanarak fiyat belirlerseniz, stok siparişi verirseniz, ya da bir müşteriye yanlış bir söz verirseniz, hata sizin şirketinizde kalır — asistanın "emin değildim" diyememiş olması, sonucu değiştirmez.',
          "KobiWise'ın her cevabı, hangi kayıtlara dayandığını gösterir ve yeterli veri yoksa bunu söyler. Bu bir nezaket değil, tasarım kararı.",
        ],
      },
    ],
    gorsel: {
      src: '/brand/mascot-scene-stage.webp',
      alt: 'Podyumda, veri grafiklerinin yanında duran KobiWise asistanı',
      konum: '58% 50%',
    },
  },
  {
    slug: 'kobiler-icin-dijitallesme-nereden-baslamali',
    baslik: "KOBİ'ler için dijitalleşme: nereden başlamalı?",
    kategori: 'KOBİ',
    tarih: '2026-09-10',
    giris:
      'Dijitalleşme büyük bir yatırımla değil, tek bir alışkanlıkla başlar: her şeyi yazılı hale getirmek. Hangi aracı seçtiğiniz ikinci soru; önce nereye yazdığınızın tutarlı olması gerekir.',
    ozet: 'Dijitalleşme büyük bir yatırımla değil, tek bir alışkanlıkla başlar: her şeyi yazılı hale getirmek.',
    bolumler: [
      {
        baslik: 'Adım 1: Nerede olduğunuzu görün',
        paragraflar: [
          'Önce bir liste çıkarın: satış nerede takip ediliyor, ödemeler nerede kayıtlı, müşteri iletişimi nereden yürüyor. Çoğu KOBİ\'de cevap "üç dört farklı yerde, bazısı kağıtta" olur. Bu liste utanç verici değil — başlangıç noktanızdır.',
        ],
      },
      {
        baslik: 'Adım 2: Tek bir alışkanlık seçin',
        paragraflar: [
          'Her şeyi bir günde değiştirmeye çalışmayın. En sık tekrar eden bir işlemi seçin — örneğin her müşteri görüşmesinden sonra tek satırlık bir not yazmak — ve onu tutarlı hale getirin. Araç ikinci sırada gelir; önemli olan alışkanlığın kendisidir.',
        ],
      },
      {
        baslik: 'Adım 3: Küçük başlayın, genişletin',
        paragraflar: [
          'Bir modülle (örneğin müşteri kayıtları) başlayıp iyi işlediğini görünce finans ya da stok gibi bir sonrakine geçmek, hepsini aynı anda kurmaya çalışmaktan daha sağlıklıdır. Ekibiniz yeni alışkanlığa alışırken sistem de birlikte büyür.',
        ],
      },
      {
        baslik: 'Adım 4: "Bulunabilir" olsun, "arşivlenmiş" değil',
        paragraflar: [
          'Bir bilgiyi kaydetmek yetmez — altı ay sonra tekrar bulabilmeniz gerekir. Bu yüzden arama/soru-cevap özelliği olan araçlar, yalnızca depolama yapan araçlardan daha değerlidir. Yazdığınız notun bir gün size geri "hatırlatabilmesi" asıl hedef olmalı.',
          'KobiWise, bu dört adımı tek bir hafızada birleştirir — on iki modül, tek soru-cevap arayüzü, kurulum derdi olmadan.',
        ],
      },
    ],
    gorsel: {
      src: '/brand/mascot-scene-path.webp',
      alt: 'Mars yüzeyinde, uzaktaki şehre uzanan yolun başında duran KobiWise asistanı',
      konum: '62% 58%',
    },
  },
];

export function yaziBul(slug: string): BlogYazisi | undefined {
  return BLOG_YAZILARI.find((yazi) => yazi.slug === slug);
}

/**
 * Okuma süresi — ⚠️ TÜRETİLİR, elle yazılmaz. Eski yer tutucu kartlarda
 * "8 DK", "9 DK" gibi uydurma süreler vardı; gerçek bir metnin süresi onun
 * kelime sayısından hesaplanır (dakikada ~200 kelime, yukarı yuvarlanır).
 */
export function okumaSuresi(yazi: BlogYazisi): number {
  const metin = [yazi.giris, ...yazi.bolumler.flatMap((b) => b.paragraflar)].join(' ');
  const kelime = metin.split(/\s+/u).filter(Boolean).length;
  return Math.max(1, Math.ceil(kelime / 200));
}

/**
 * "10 EYLÜL 2026" — ⚠️ `timeZone: 'UTC'` ŞART: `new Date('2026-09-10')` UTC
 * gece yarısıdır ve UTC'nin gerisindeki bir sunucu saatiyle biçimlenseydi
 * tarih bir gün geri kayardı ("9 EYLÜL"). Hata yalnızca o sunucuda görünürdü.
 */
export function tarihEtiketi(iso: string): string {
  return new Date(iso)
    .toLocaleDateString('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    })
    .toLocaleUpperCase('tr-TR');
}

/**
 * Article JSON-LD (schema.org) — Google'ın Article rich result alanları:
 * `headline` · `image` · `datePublished` · `author` (+ önerilen `publisher`,
 * `dateModified`, `mainEntityOfPage`).
 *
 * ⚠️ Görsel adresleri MUTLAKTIR: şema göreli yol kabul etmez; göreli yazılsaydı
 * doğrulayıcı hata vermez ama görsel sessizce yok sayılırdı.
 * ⚠️ Yazar bir kişi değil kurumdur (PO talimatı: "author (KobiWise)") — bir
 * kişi adı UYDURULMADI.
 */
export function makaleSemasi(yazi: BlogYazisi): Record<string, unknown> {
  const adres = `${SITE_URL}/blog/${yazi.slug}`;
  const kurum = { '@type': 'Organization', name: 'KobiWise', url: SITE_URL };

  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: yazi.baslik,
    description: yazi.giris,
    image: [`${SITE_URL}${yazi.gorsel.src}`],
    datePublished: yazi.tarih,
    dateModified: yazi.tarih,
    author: kurum,
    publisher: {
      ...kurum,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/wordmark.webp` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': adres },
    inLanguage: 'tr-TR',
  };
}
