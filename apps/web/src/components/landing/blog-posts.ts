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
 * ⚠️ İLK ÜÇ YAZININ METNİ PRODUCT OWNER'IN YAZDIĞI GİBİDİR, harfi harfine.
 * Girişler için açık talimat vardı ("değiştirme"); gövde de aynen alındı. Bir
 * test girişin detay sayfasında BİREBİR göründüğünü kilitler. Sonraki üç yazı
 * (2026-09-10) Lead Engineer tarafından yazıldı; ürün hakkındaki her cümlesi
 * sayfanın /hakkinda'da zaten onaylı iddialarıyla sınırlıdır.
 *
 * ============================================================================
 * ⚠️ SONRAKİ ÜÇ YAZININ YAYIN TARİHİ GERÇEK DEĞİL — PRODUCT OWNER KARARI
 * ============================================================================
 * Üçü de 2026-09-10'da yazıldı. Product Owner "tarihler karışık olsun" dedi;
 * seçenekler (ileri tarihli yayın · bugünün tarihi · geçmiş tarih) risk
 * notuyla birlikte sunuldu ve GEÇMİŞ TARİH seçildi. Bu yüzden `tarih` o
 * yazılar için EDİTORYAL bir tarihtir, yazılış tarihi değil — bu dosyayı
 * okuyan biri onu gerçek bir yayın geçmişi sanmasın diye buraya yazıldı.
 *
 * Alınan tek önlem: `guncelleme` alanı GERÇEK tarihi taşır ve şemanın
 * `dateModified`ı ile sitemap'in `lastmod`u onu kullanır — yani arama
 * motoruna verilen "son değişiklik" bilgisi doğrudur.
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
  /**
   * Gerçek son değişiklik tarihi — `tarih` editoryal olarak geçmişe atıldıysa
   * (bkz. dosya başı) doludur. Şemanın `dateModified`ı ve sitemap'in `lastmod`u
   * bunu kullanır; boşsa `tarih` geçerlidir.
   */
  readonly guncelleme?: string;
  /**
   * Sayfada görünen giriş paragrafı. İlk üç yazıda Product Owner'ın metnidir ve
   * DEĞİŞTİRİLMEZ ("değiştirme" talimatı); sonraki üçünü Lead Engineer yazdı.
   */
  readonly giris: string;
  /**
   * ⚠️ ARAMA SONUCU İÇİN AYRI, KISA ÖZET — `<meta name="description">` ve
   * `og:description` (Product Owner, 2026-09-10).
   *
   * İlk yazımda meta açıklama olarak girişin kendisi kullanılıyordu ve ölçüldü:
   * girişler ~210–250 karakterdi, Google ise ~155 karakterden sonrasını KESER —
   * arama sonucunda cümle ortasında "…" ile biten bir özet görünürdü. Giriş
   * sayfada okura yazılmıştır ve kısaltılmaz; arama sonucu için ayrı bir metin
   * yazılır. Bir test uzunluğunu (≤ 155) ve girişten FARKLI olduğunu kilitler.
   */
  readonly metaAciklama: string;
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
    metaAciklama:
      'Bilgi neden hep bir kişide kalıyor? Araçlar birbirini görmüyor, tek bağlantı insan oluyor. Sorunun kaynağını ve tek hafızanın ne demek olduğunu yazdık.',
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
    metaAciklama:
      'Bilmediğini söylemeyen yapay zeka uydurur ve hata müşteriye kadar gider. Güvenilir bir asistan kaynağını gösterir, yeterli veri yoksa bunu açıkça söyler.',
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
    metaAciklama:
      "Dijitalleşme büyük bir yatırımla değil, tek bir alışkanlıkla başlar. Nerede olduğunuzu görün, küçük başlayın: KOBİ'ler için dört adımda nereden başlamalı?",
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

  /*
   * ==========================================================================
   * SONRAKİ ÜÇ YAZI — ⚠️ `tarih` EDİTORYALDİR (dosya başındaki not)
   * ==========================================================================
   * Ürün hakkındaki her cümle /hakkinda'nın onaylı iddialarına dayanır:
   * şirketler arası kilit kayıtların saklandığı yerde · dört rol · tek bir
   * yapay zeka firmasına bağlı değil · görüşmeler müşterinin altında ·
   * gecikmiş takip yapısal katkıda en yüksek skoru alır · finans geliri ve
   * gideri ayrı tutar, para birimlerini toplamaz, yalnızca sahip/yönetici görür.
   */
  {
    slug: 'verileriniz-kimin-yazilim-secerken-sorulacak-uc-soru',
    baslik: 'Verileriniz kimin? Bir yazılım seçerken sorulacak üç soru',
    kategori: 'VERİ GÜVENLİĞİ',
    tarih: '2026-08-14',
    guncelleme: '2026-09-10',
    giris:
      'Bir iş yazılımına müşterilerinizi, paranızı ve ekibinizi emanet ediyorsunuz. Seçmeden önce özelliklere değil, verinizin nerede durduğuna, kimin görebildiğine ve yarın ne olacağına bakın. Üç soru yeterli.',
    metaAciklama:
      'Bir iş yazılımı seçmeden önce verinize bakın: nerede duruyor, ekibinizde kim görebiliyor, yarın ne değişirse ne olur? Sormanız gereken üç soru.',
    ozet: 'Bir iş yazılımına müşterilerinizi, paranızı ve ekibinizi emanet ediyorsunuz.',
    bolumler: [
      {
        baslik: 'Soru 1: Verim başka bir şirketinkiyle nasıl ayrılıyor?',
        paragraflar: [
          'Bulut yazılımların çoğunda yüzlerce şirketin kaydı aynı sistemde durur. Bu tek başına bir sorun değil; sorun, ayrımın nasıl yapıldığıdır. Ayrım yalnızca programın içindeki bir kontrole bırakılmışsa, o kontrolde yapılacak tek bir hata başka bir şirketin kaydını ekranınıza getirebilir.',
          'Sağlayıcıya şunu sorun: "Programda bir kontrol unutulsa bile başka bir şirketin verisi bana gelebilir mi?" Cevap net değilse, sormaya devam edin.',
        ],
      },
      {
        baslik: 'Soru 2: Ekibimde kim neyi görebiliyor?',
        paragraflar: [
          'Ekip büyüdükçe herkesin her şeyi görmesi rahatsız edici olmaya başlar. Yeni başlayan bir çalışanın maaş bilgisini, satış temsilcisinin şirketin nakit durumunu görmesi gerekmez. Bu ayrım sonradan eklenen bir lüks değil, ilk günden gereken bir temeldir.',
          'Sorulacak şey basit: "Okuyabilen, kayıt girebilen ve silebilen kişileri birbirinden ayırabiliyor muyum?" Bu yetkiler ayrılamıyorsa, en az yetkiye ihtiyacı olan kişi bile en çoğunu alır.',
        ],
      },
      {
        baslik: 'Soru 3: Yarın bir şey değişirse ne olur?',
        paragraflar: [
          'Yapay zeka araçları hızla değişiyor: bugün en iyi olan model yarın pahalanabilir ya da geride kalabilir. Tek bir yapay zeka firmasına sıkı sıkıya bağlı bir yazılım, o firmanın her kararını size de yansıtır.',
          'Sorun: "Kullandığınız yapay zeka değişirse benim kayıtlarım ve alışkanlıklarım ne olur?" Doğru cevap, hiçbir şeyin kaybolmamasıdır.',
          "KobiWise'da her şirketin kayıtları birbirinden ayrı kilitlenir ve bu kilit kayıtların saklandığı yerin kendisindedir; ekipte sahip, yönetici, çalışan ve izleyici ayrı yetkiler taşır; ürün de tek bir yapay zeka firmasına bağlı değildir. Üç sorunun cevabını baştan verdik.",
        ],
      },
    ],
    gorsel: {
      src: '/brand/mascot-scene-orbit.webp',
      alt: 'Yörüngede, aşağıda Dünya varken duran KobiWise asistanı',
      konum: '66% 48%',
    },
  },
  {
    slug: 'musteri-takibi-excelle-ne-zamana-kadar-yeter',
    baslik: "Müşteri takibi Excel'le ne zamana kadar yeter?",
    kategori: 'MÜŞTERİ',
    tarih: '2026-08-27',
    guncelleme: '2026-09-10',
    giris:
      'Excel müşteri listesini tutmakta iyidir; zorlandığı yer, her müşterinin bir geçmişi olduğu andır. Kiminle ne konuşuldu, ne söz verildi, bir sonraki adım ne? Tablo bir listeyi tutar, bir hikayeyi tutamaz.',
    metaAciklama:
      'Excel müşteri listesini iyi tutar; zorlandığı yer geçmiş ve takiptir. Tablonun nerede yettiğini, nerede kırıldığını ve geçişte ne kazanıldığını yazdık.',
    ozet: 'Excel müşteri listesini tutmakta iyidir; zorlandığı yer, her müşterinin bir geçmişi olduğu andır.',
    bolumler: [
      {
        baslik: 'Tablo nerede yetiyor',
        paragraflar: [
          'Müşteri azken bir tablo gayet iş görür: ad, telefon, son sipariş. Herkes aynı dosyayı açar, bir satır ekler, kapatır. Burada bir sorun yok ve bunu değiştirmek için acele etmeye de gerek yok.',
        ],
      },
      {
        baslik: 'Nerede kırılıyor',
        paragraflar: [
          'Kırılma, bilgi bir hücreye sığmadığında başlar. Bir görüşmenin notu "Aradı, fiyat istedi" diye tek satıra sıkışır; üç ay sonra kimse o fiyatın ne olduğunu, kimin verdiğini hatırlamaz. Aynı dosyanın iki kopyası dolaşmaya başlar ve hangisinin doğru olduğu tartışılır.',
          'İkinci kırılma takiptir. Tablo size bu hafta kimi aramanız gerektiğini söylemez; bunu her seferinde sizin hatırlamanız gerekir. Unutulan tek bir geri dönüş, kaybedilen bir satış olabilir.',
        ],
      },
      {
        baslik: 'Geçerken ne kazanılır',
        paragraflar: [
          'Bir müşteri kaydı bir satır değil, bir zaman çizelgesi olmalıdır: her görüşme, her teklif, her takip o müşterinin altında birikir. Böylece yeni gelen bir çalışan da "bu müşteriyle ne konuşmuştuk" sorusunun cevabını kimseye sormadan bulur.',
          'KobiWise\'ın müşteri modülünde görüşmeler ve takipler müşterinin altında birikir; asistana "bu hafta kimi aramalıyım" diye sorduğunuzda gecikmiş takipler öne çıkar. Başlamak için tablonuzu atmanız gerekmez — yeni görüşmeleri buraya yazmak yeterli.',
        ],
      },
    ],
    gorsel: {
      src: '/brand/mascot-scene-path.webp',
      alt: 'Mars yüzeyinde, uzaktaki şehre uzanan yolun başında duran KobiWise asistanı',
      konum: '62% 58%',
    },
  },
  {
    slug: 'nakit-akisini-ne-siklikla-gormelisiniz',
    baslik: 'Nakit akışını ne sıklıkla görmelisiniz?',
    kategori: 'FİNANS',
    tarih: '2026-09-03',
    guncelleme: '2026-09-10',
    giris:
      'En az haftada bir — çünkü ay sonunda bakılan nakit akışı size yalnızca ne olduğunu söyler. Haftalık bakılan nakit akışı ne olacağını söyler. Küçük bir işletmede bu fark, bir ödemeyi zamanında yapmakla ertelemek arasındaki farktır.',
    metaAciklama:
      'Nakit akışına ay sonunu beklemeden, haftada bir bakın. Haftalık bakışta neye bakılır, gelir ve gider neden ayrı tutulur, para birimleri neden toplanmaz?',
    ozet: 'En az haftada bir — çünkü ay sonunda bakılan nakit akışı size yalnızca ne olduğunu söyler.',
    bolumler: [
      {
        baslik: 'Aylık bakmak neden geç kalmaktır',
        paragraflar: [
          'Ay sonunda hesabı kapattığınızda gördüğünüz tablo bir fotoğraftır: geçmişte ne olduğunu anlatır ama artık değiştiremezsiniz. Ayın ortasında gelmeyen bir tahsilat ya da beklenmedik bir gider, ancak ay kapandığında fark edilir — o gün iş işten geçmiş olabilir.',
        ],
      },
      {
        baslik: 'Haftalık bakışta neye bakılır',
        paragraflar: [
          'Üç şey yeterli: bu hafta ne girdi, ne çıktı ve önümüzdeki hafta hangi ödemeler var. Geliri ve gideri ayrı tutun; aynı sütunda artı ve eksi olarak yazmak, işareti unutulan tek bir satırda gideri gelir gibi gösterir.',
          'Birden fazla para birimiyle çalışıyorsanız onları toplamayın. Doları ve lirayı tek bir rakamda birleştirmek, kurun değiştiği her gün yanlış bir tablo üretir.',
        ],
      },
      {
        baslik: 'Alışkanlığı kolaylaştırmak',
        paragraflar: [
          'Haftalık bakış ancak zahmetsizse sürer. Rakamlar üç ayrı yerden toplanıyorsa bu iş bir süre sonra atlanır. Kayıt işin yapıldığı anda girilirse, pazartesi sabahı bakmak birkaç dakika sürer.',
          "KobiWise'ın finans modülü geliri ve gideri ayrı tutar, nakit akışını her para birimi için ayrı gösterir ve farklı para birimlerini tek bir rakamda toplamaz. Finansı yalnızca şirket sahibi ve yöneticiler görür.",
        ],
      },
    ],
    gorsel: {
      src: '/brand/mascot-scene-stage.webp',
      alt: 'Podyumda, veri grafiklerinin yanında duran KobiWise asistanı',
      konum: '58% 50%',
    },
  },
];

export function yaziBul(slug: string): BlogYazisi | undefined {
  return BLOG_YAZILARI.find((yazi) => yazi.slug === slug);
}

/** Şemanın `dateModified`ı ve sitemap'in `lastmod`u — gerçek son değişiklik. */
export function sonDegisiklik(yazi: BlogYazisi): string {
  return yazi.guncelleme ?? yazi.tarih;
}

/**
 * Liste sırası: yeniden eskiye. ⚠️ Dizi sırasına GÜVENİLMEZ — yazılar
 * eklendikçe sıra karışır ve "öne çıkan" (ilk kart) sessizce eski bir yazı
 * olurdu. Aynı tarihli yazılarda dizideki sıra korunur (`sort` kararlıdır).
 */
export const YAZILAR_YENIDEN_ESKIYE: readonly BlogYazisi[] = [...BLOG_YAZILARI].sort((a, b) =>
  b.tarih.localeCompare(a.tarih),
);

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
    dateModified: sonDegisiklik(yazi),
    author: kurum,
    publisher: {
      ...kurum,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/brand/wordmark.webp` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': adres },
    inLanguage: 'tr-TR',
  };
}
