import type { Metadata } from 'next';

import { Corridor } from '@/components/landing/corridor';
import { RoomHeader } from '@/components/landing/room-header';

export const metadata: Metadata = {
  title: 'Hakkında',
  description:
    'Ürün üç sorudan doğdu. Değişmeyen dört karar, asistanın bir soruyu nasıl cevapladığı, neyi bilerek yapmadığımız ve sırada ne olduğu.',
};

/**
 * `/hakkinda` — ürünün neden var olduğu (ADR-0054).
 *
 * ⚠️ "Değişmeyen dört karar" bölümü uydurulmuş bir pazarlama listesi DEĞİLDİR:
 * dördü de `CLAUDE.md`nin "Mutlak Kurallar"ından türer (AI merkezdedir · port
 * arkasında sağlayıcı bağımsızlığı · her sorgu tenant kapsamında · modüller
 * birbirinin şemasına dokunmaz). Bir gün o kurallardan biri değişirse bu sayfa
 * da değişmek zorundadır — ⚠️ ve bu bağ bugün YALNIZCA bu yorumla tutuluyor,
 * bir testle değil: metin serbest cümledir, makinece karşılaştırılabilir bir
 * karşılığı yok.
 *
 * ⚠️ DİL DEĞİŞTİ, EŞLEME DEĞİŞMEDİ (Product Owner, 2026-09-10). Bölüm bir
 * mühendise yazılmıştı ("port", "adaptör", "izolasyon", "şema", "merge") ve
 * hikâye anlatan sayfanın ortasında aniden ton kırıyordu. Dört kural artık
 * KOBİ sahibinin tarafından, yani FAYDASIYLA anlatılıyor — ana sayfadaki ölçü
 * şeridinin jargon temizliğiyle aynı mantık. Hangi cümlenin hangi kurala
 * karşılık geldiği her kartın yanında yazılı.
 *
 * ⚠️ ÇEVİRİDE İKİ İDDİA BİLİNÇLİ OLARAK YUMUŞATILMADI AMA GENİŞLETİLMEDİ DE:
 * · "istediğimiz AN değiştirebiliriz" YAZILMADI: embedding sağlayıcısı
 *   değişince saklanan vektörler yeniden üretilir (ADR-0029 §3) — anlık
 *   değildir. Doğru olan "kaybetmezsiniz"dir: kayıtlar bizim veritabanımızda.
 * · "bir hata olsa bile göremez" YAZILMADI: RLS her hatayı değil, KAPSAM
 *   FİLTRESİNİN UNUTULMASINI yakalar. Cümle tam olarak o garantiyi söylüyor.
 */
export default function AboutPage() {
  return (
    <>
      <RoomHeader renk="#b25628" etiket="ODA 01 · HAKKINDA" baslik="Uzun yolu tek başına yürümek.">
        Küçük ve orta ölçekli her şirket aynı yerde tökezliyor: iş büyüyor, bilgi dağılıyor. Biz de
        sorduk — bilgi neden insanlarda yaşıyor?
      </RoomHeader>

      <section className="kap">
        <div className="hero hero-sade">
          <div className="hero-foto">
            <img
              src="/brand/mascot-scene-path.webp"
              alt="Mars yüzeyinde, uzaktaki şehre uzanan yolun başında duran KobiWise asistanı"
              loading="lazy"
              decoding="async"
              width={1254}
              height={1254}
            />
          </div>
        </div>
      </section>

      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">01 — BAŞLANGIÇ</span>
          <h2 className="d2">Üç soru, üç yıl</h2>
          <p className="alt">
            Ürün bir özellik listesinden değil, üç sorudan doğdu. Üçü de gerçek şirketlerden geldi.
          </p>
        </div>

        <div className="uclu gir">
          <div className="tas">
            <span className="no">SORU 01</span>
            <h3>“Bu müşteriye ne söz vermiştik?”</h3>
            <p>
              Cevabı bilen tek kişi izne çıkınca şirket sözünü unutuyordu. Kayıt vardı, hafıza
              yoktu.
            </p>
          </div>
          <div className="tas">
            <span className="no">SORU 02</span>
            <h3>“Neden on ayrı program?”</h3>
            <p>
              Her araç kendi kutusunda doğru cevabı biliyor, hiçbiri diğerini duymuyordu. Bilgi
              bölünmüştü.
            </p>
          </div>
          <div className="tas">
            <span className="no">SORU 03</span>
            <h3>“Yapay zeka neden hiçbir şey bilmiyor?”</h3>
            <p>
              Genel bir sohbet motoru şirketin geçen çeyrekte ne yaşadığını bilmez. Eksik olan model
              değil, <b>bağlamdı</b>.
            </p>
          </div>
        </div>
      </section>

      <section className="kap aralik-ust">
        <div className="alinti gir">
          <q>Modüller ürün değildir. Modüller hafızadır.</q>
          <p className="kim">KOBIWISE KURUCU İLKESİ</p>
        </div>
      </section>

      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">02 — İLKELER</span>
          <h2 className="d2">Değişmeyen dört karar</h2>
          {/*
            ⚠️ KÖPRÜ: "üç soru sorduk" ile "dört karar aldık" arasında bağ yoktu
            ve okur "peki sonra ne yaptınız" sorusunda boşlukta kalıyordu. Giriş
            cümlesi artık önceki bölüme GERİ bakar. Eski ikinci cümle ("ihlali
            merge edilmeyen kısıtlar") aynı anlamla, yazılımcı sözlüğü olmadan
            duruyor.
          */}
          <p className="alt">
            Bu üç soruya cevap ararken, ürün ne kadar büyürse büyüsün dört şeyi hiç değiştirmemeye
            karar verdik. Bunlar bir pazarlama cümlesi değil; yazdığımız her satırın uymak zorunda
            olduğu kurallar.
          </p>
        </div>

        <div className="ikili gir">
          <div className="tas">
            <span className="no">01</span>
            <h3>Yapay zeka merkezdedir, modüller onun etrafında</h3>
            <p>
              Bir modül tasarlanırken sorulan soru “kullanıcı bu ekranda ne yapar” değil,{' '}
              <b>“bu modül asistana hangi bağlamı kazandırır”</b>dır.
            </p>
          </div>
          <div className="tas">
            <span className="no">02</span>
            {/* Kural: iş mantığı hiçbir LLM sağlayıcısına bağımlı olamaz (port/adaptör). */}
            <h3>Tek bir yapay zeka şirketine bağlı değiliz</h3>
            <p>
              Asistanın arkasındaki yapay zekayı, daha iyisi ya da daha uygunu çıktığında
              değiştirebiliriz. Kayıtlarınız, ekranlarınız, alışkanlıklarınız olduğu gibi kalır —{' '}
              <b>siz hiçbir şey kaybetmezsiniz</b>.
            </p>
          </div>
          <div className="tas">
            <span className="no">03</span>
            {/* Kural: her sorgu tenant kapsamında çalışır (RLS + FORCE, fail-closed). */}
            <h3>Başka hiçbir şirket verinizi göremez</h3>
            <p>
              Her şirketin kayıtları birbirinden ayrı kilitlenir — ve bu kilit programın içinde
              değil, <b>kayıtların saklandığı yerin kendisinde</b>. Programın bir yerinde bu kontrol
              unutulsa bile ne başkasının verisi size gelir, ne sizinki başkasına.
            </p>
          </div>
          <div className="tas">
            <span className="no">04</span>
            {/* Kural: modüller birbirinin şemasına/iç koduna erişemez. */}
            <h3>Modüller birbirine karışmaz</h3>
            <p>
              Müşteri, finans, stok — her modül kendi kayıtlarını kendi köşesinde tutar; hiçbiri
              diğerininkine doğrudan dokunamaz. Bir modülü kullanmasanız da diğerleri çalışır. Hepsi{' '}
              <b>yalnızca siz soru sorduğunuzda</b> bir araya gelir.
            </p>
          </div>
        </div>
      </section>

      {/*
        ============================================================================
        ⚠️ DÖRT YENİ BÖLÜM — "SAYFA DAHA DETAYLI OLMALI" (Product Owner, 2026-09-10)
        ============================================================================
        Bölüm listesi PO ile tek tek onaylandı. Her bölüm FARKLI bir kalıp
        kullanır (adımlar · satırlar · üçlü kart · ikili kart): dört ardışık
        kart yığını, uzun bir sayfayı tekdüze bir ızgaraya çevirirdi.

        ⚠️ HİÇBİR İDDİA UYDURULMADI. Bu sayfa şirket adına kamuya açık bir
        metindir; ekip üyesi, kuruluş hikâyesi, müşteri alıntısı ya da sayı
        eklenmedi. Her cümle koddaki ya da ADR'deki bir karara dayanır ve
        dayanağı cümlenin yanında yazılı — biri değişirse bu sayfa da değişmek
        zorundadır.
      */}

      {/* ===================== 03 — NASIL ÇALIŞIR ===================== */}
      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">03 — NASIL ÇALIŞIR</span>
          <h2 className="d2">Bir soru sorduğunuzda ne olur</h2>
          <p className="alt">
            Ana sayfada üç adımda anlattık; burada perdenin arkasını açıyoruz. Asistan tahmin etmez
            — yalnızca şirketinizin kayıtlarında ne varsa onunla konuşur.
          </p>
        </div>

        <div className="adimlar gir">
          {/* Dayanak: tek `POST /ask`, on sekiz katkıcı (ADR-0031 §2). */}
          <article className="adim">
            <div className="no">ADIM 01</div>
            <h3 className="d3">On sekiz kaynağa aynı anda bakar</h3>
            <p>
              Sorunuz müşteri notlarına, finans kayıtlarına, projelere, stoğa, randevulara — on iki
              modülün beslediği on sekiz hafıza kaynağının hepsine aynı anda gider. Hangi modülde
              olduğunu bilmeniz gerekmez.
            </p>
          </article>
          {/*
            Dayanak: top-K = 8 ve izin filtresi (ADR-0031 §5.3). ⚠️ "Bir kaynak
            olduğu bile belli olmaz" TESTLİ bir davranıştır: elenen kaynak
            `degradedSources`ta da görünmez (Finans kapanış denetimi).
          */}
          <article className="adim">
            <div className="no">ADIM 02</div>
            <h3 className="d3">Yalnızca görebildiklerinizi kullanır</h3>
            <p>
              Kaynaklardan en alakalı sekiz parça seçilir — ama yalnızca sizin görme yetkiniz
              olanlardan. Finansı göremeyen bir çalışan soru sorduğunda finans kayıtları cevaba hiç
              girmez; orada bir kaynak olduğu bile belli olmaz.
            </p>
          </article>
          <article className="adim">
            <div className="no">ADIM 03</div>
            <h3 className="d3">Kaynağını gösterir, bilmediğini söyler</h3>
            <p>
              Cevabın altında hangi kayıtlara dayandığı yazar. Yeterli kayıt yoksa bunu açıkça
              söyler — boşluğu tahminle doldurmaz.
            </p>
          </article>
        </div>
      </section>

      {/* ===================== 04 — SINIRLAR ===================== */}
      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">04 — SINIRLAR</span>
          <h2 className="d2">Neyi bilerek yapmıyoruz</h2>
          <p className="alt">
            Bir ürünü tanımanın en dürüst yolu, neyi yapmadığını bilmektir. Aşağıdakiler eksik
            değil; her birinin arkasında verilmiş bir karar var.
          </p>
        </div>

        <div className="satirlar gir">
          {/* Dayanak: ADR-0041 §1 — yasal e-fatura bir aşama değil bir SINIR. */}
          <div className="satir">
            <span className="no">01</span>
            <h3>Resmi e-fatura kesmiyoruz</h3>
            <div>
              <p className="soru">
                Teklif ve faturalarınızı PDF olarak hazırlarız — bu belge resmi e-fatura değildir ve
                üzerinde de bunu yazarız.
              </p>
              <p className="kucuk aciklama">
                Resmi e-fatura mevzuata bağlıdır; yarım yapılmış bir e-fatura sizi yasal olarak zor
                durumda bırakırdı. Kullandığınız e-fatura sistemi olduğu gibi devam eder.
              </p>
            </div>
            <span className="rol">MEVZUAT</span>
          </div>
          {/* Dayanak: ADR-0043 — bordro yok; ücret ekleme-yalnız bir geçmiştir. */}
          <div className="satir">
            <span className="no">02</span>
            <h3>Bordro hesaplamıyoruz</h3>
            <div>
              <p className="soru">Çalışanın sözleşme ücretini ve geçmişini kaydederiz.</p>
              <p className="kucuk aciklama">
                SGK, vergi dilimi ve kesintiler mevzuata bağlıdır ve sık değişir; bu hesabı
                muhasebenizin sistemine bırakıyoruz.
              </p>
            </div>
            <span className="rol">MEVZUAT</span>
          </div>
          {/* Dayanak: ADR-0043 §1 + ADR-0044 §2 — `sick` türü ve serbest not alanı YOK. */}
          <div className="satir">
            <span className="no">03</span>
            <h3>Sağlık bilgisi tutmuyoruz</h3>
            <div>
              <p className="soru">İzin türleri arasında “raporlu” bile yoktur.</p>
              <p className="kucuk aciklama">
                Rapor, hastalık izni, sağlık durumu yasada özel olarak korunan bilgilerdir. Serbest
                bir not kutusu da bırakmadık, çünkü oraya ilk yazılacak şey o olurdu.
              </p>
            </div>
            <span className="rol">KİŞİSEL VERİ</span>
          </div>
          {/*
            Dayanak: ADR-0043 §2 — maaş üç katmanla izole: ayrı tablo, ayrı
            izin (`compensation:read` yalnızca sahip/yönetici), SIFIR katkıcı;
            maaşa göre sıralama 422.
          */}
          <div className="satir">
            <span className="no">04</span>
            <h3>Maaşları asistana göstermiyoruz</h3>
            <div>
              <p className="soru">Ücreti yalnızca şirket sahibi ve yöneticiler görür.</p>
              <p className="kucuk aciklama">
                Asistan maaşları hiç okumaz; bir soruya cevap verirken hesaba katılmaz, çalışanları
                maaşa göre sıralamak bile mümkün değildir.
              </p>
            </div>
            <span className="rol">KİŞİSEL VERİ</span>
          </div>
        </div>
      </section>

      {/* ===================== 05 — KİMİN İÇİN ===================== */}
      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">05 — KİMİN İÇİN</span>
          <h2 className="d2">Kimin için yaptık</h2>
          <p className="alt">
            Bilgisi birkaç kişinin aklında ve birkaç ayrı programda dağılmış her küçük ve orta
            ölçekli işletme için.
          </p>
        </div>

        <div className="uclu gir">
          <div className="tas">
            <span className="no">TEK KİŞİDEN EKİBE</span>
            <h3>Tek başınıza da, ekiple de</h3>
            <p>
              Tek kişilik bir işletmede asistan sizin hafızanız olur; ekip büyüdüğünde herkesin
              yazdığı aynı hafızada birleşir. Randevuyla çalışan bir salon, stok tutan bir toptancı
              ya da proje yürüten bir ajans — her biri on iki modülden işine yarayanı kullanır.
            </p>
          </div>
          {/*
            Dayanak: ADR-0025 dört rol. Kapanış denetimlerinde ölçüldü: izleyici
            okur ama yazamaz (403), çalışan yazar ama silemez (403); Finans'ın
            dar kataloğu çalışanı ve izleyiciyi dışarıda tutar, maaş yalnızca
            sahip/yönetici.
          */}
          <div className="tas">
            <span className="no">YETKİLER</span>
            <h3>Herkes yalnızca işini görür</h3>
            <p>
              Dört rol var: sahip, yönetici, çalışan ve izleyici. İzleyici okur ama değiştiremez;
              çalışan kayıt girer ama silemez. Finans ve maaş gibi hassas bölümleri yalnızca sahip
              ve yönetici görür.
            </p>
          </div>
          {/* Dayanak: web uygulaması; yanıt dili prompt'larda "Sirketin kendi dilinde yaz". */}
          <div className="tas">
            <span className="no">BAŞLAMAK</span>
            <h3>Kurulum yok, kart yok</h3>
            <p>
              Tarayıcıdan açılır; bilgisayarınıza bir şey kurmanız gerekmez. Kayıt olurken kredi
              kartı istemiyoruz. Ekranlar Türkçedir; asistan da notlarınız hangi dildeyse o dilde
              cevap verir.
            </p>
          </div>
        </div>
      </section>

      {/* ===================== 06 — YOL ===================== */}
      {/*
        ⚠️ TARİH YOK — VE BU BİR TESTLE KİLİTLİ. Kamuya açık bir yol haritası
        bir SÖZDÜR; bir tarih yazıldığı an ürün o tarihe borçlanır. Maddeler
        ROADMAP.md'nin Faz 6 (abonelik/ödeme) · Faz 7 (mobil) · Faz 8 (giriş
        yolları) kalemlerinden ve Product Owner'ın "ileride global olacak"
        kararından gelir. ⚠️ Metin "üzerinde çalışıyoruz" DEMEZ, "önümüzdeki
        adımlar" der: ikinci dil için bugün kodda başlamış bir iş yok.
      */}
      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">06 — YOL</span>
          <h2 className="d2">Sırada ne var</h2>
          <p className="alt">
            Önümüzdeki adımlar bunlar. Tarih vermiyoruz — bir tarih bir sözdür ve tutamayacağımız
            sözü vermek istemiyoruz.
          </p>
        </div>

        <div className="ikili gir">
          <div className="tas">
            <span className="no">SIRADA 01</span>
            <h3>Açık fiyatlandırma</h3>
            <p>
              Planlar ve fiyatlar herkesin görebileceği tek bir sayfada. Hangi planda neyin olduğu,
              sürprizsiz.
            </p>
          </div>
          <div className="tas">
            <span className="no">SIRADA 02</span>
            <h3>Mobil uygulama</h3>
            <p>
              Telefonunuzdan not almak ve soru sormak için ayrı bir uygulama. Hesabınız ve hafızanız
              aynı kalır.
            </p>
          </div>
          <div className="tas">
            <span className="no">SIRADA 03</span>
            <h3>Daha fazla giriş yolu</h3>
            <p>
              Bugün Google ve LinkedIn hesabınızla girebilirsiniz; sırada Microsoft ve Facebook var.
            </p>
          </div>
          <div className="tas">
            <span className="no">SIRADA 04</span>
            <h3>İkinci bir dil</h3>
            <p>
              Ürünü Türkiye dışındaki işletmelere de açmak istiyoruz; ekranların ikinci bir dile
              çevrilmesi bu yolun ilk adımı.
            </p>
          </div>
        </div>
      </section>

      <Corridor haric="hakkinda" />
    </>
  );
}
