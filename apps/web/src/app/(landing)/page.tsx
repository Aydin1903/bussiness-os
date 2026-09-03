import type { Metadata } from 'next';
import Link from 'next/link';

import { accentStyle } from '@/components/landing/accent-style';
import { MascotBox } from '@/components/landing/mascot-box';
import { LANDING_MODULES, moduleNo } from '@/components/landing/modules';

/**
 * `/` — LANDING PAGE (ADR-0054).
 *
 * ============================================================================
 * ⚠️ BU ROTA ÖNCE BİR SAĞLIK KARTIYDI, SONRA BİR YÖNLENDİRME OLDU
 * ============================================================================
 * Kök rota Faz 1'den beri bir altyapı doğrulama kartı çiziyordu — servis adı,
 * sürüm, **ortam**, **uptime**, **veritabanı gecikmesi** — ve `middleware.ts`in
 * auth kapsamı DIŞINDA olduğu için kimliksiz herkese açıktı. 2026-08-27'de
 * GEÇİCİ olarak `/login`e yönlendirildi ve o yönlendirme bilerek **307**
 * seçilmişti: 308'i tarayıcılar KALICI olarak önbelleğe alır ve landing page
 * yayına alındığı gün siteye daha önce girmiş her tarayıcı hâlâ `/login`e
 * giderdi — hata SESSİZ olurdu.
 *
 * ⚠️ O karar bugün KARŞILIĞINI VERDİ: yönlendirme kaldırıldı ve hiçbir
 * tarayıcının önbelleğini temizlemesi gerekmiyor. `page.spec.tsx`in
 * yönlendirmeyi kilitleyen testi silinmedi, TERSİNE ÇEVRİLDİ — ama iddiasının
 * ASIL YARISI korundu: bu sayfa hiçbir sağlık/ortam verisi ÇİZMEZ.
 *
 * ============================================================================
 * ⚠️ KİMLİK KONTROLÜ YOK — VE BU DOĞRU
 * ============================================================================
 * Oturumu açık bir kullanıcı da bu sayfayı görür. `bo_session_hint` çerezine
 * bakıp `/app`e dallanmak MÜMKÜNDÜR ama o çerez bir GÜVENLİK SINIRI DEĞİLDİR
 * (FRONTEND §3.2) ve daha önemlisi: bir pazarlama sayfasının müşteriye
 * kapanması için bir sebep yok. Kullanıcı zaten üst çubuktaki "GİRİŞ" ile
 * içeri girer.
 */
export const metadata: Metadata = {
  title: { absolute: 'KobiWise — Şirketiniz artık unutmuyor' },
  description:
    'On iki modül tek bir hafızada birleşir. Sorduğunuzda cevap tahminden değil, kendi kayıtlarınızdan gelir.',
};

export default function LandingPage() {
  return (
    <>
      {/* ===================== HERO ===================== */}
      <section className="kap">
        <div className="hero">
          <div className="hero-foto">
            {/*
              ⚠️ `fetchPriority="high"` + `loading` YAZILMAZ: bu görsel sayfanın
              LCP'sidir. `loading="lazy"` yazmak onu tam olarak geciktirmek
              istemediğimiz yerde geciktirirdi.

              ⚠️ Sahne `<img>`dir, CSS zemini DEĞİL — auth panelinin tersi
              (ADR-0052 §4.2 orada `background-image` seçmişti ki dar ekranda
              HİÇ indirilmesin). Burada gerekçe tersine döner: dar ekranda
              fotoğraf gizlenmez, düzenin ÜST YARISI olur (bkz.
              `landing-surface.css`in 860px kuralı) — yani her genişlikte
              indirilir ve tarayıcının onu erken keşfetmesi İSTENİR.
            */}
            <img
              src="/brand/mascot-scene-path.webp"
              alt="Mars yüzeyinde, uzaktaki şehre uzanan yolun başında duran KobiWise asistanı"
              fetchPriority="high"
              decoding="async"
              width={1254}
              height={1254}
            />
          </div>

          <div className="hero-ic">
            <span className="etiket">YAPAY ZEKÂ İŞLETİM SİSTEMİ</span>
            <h1 className="d1">
              Şirketiniz artık unutmuyor. <i>Sorduğunuzda hatırlıyor.</i>
            </h1>
            <p className="alt">
              Müşteriniz, paranız, ekibiniz, belgeleriniz — on iki modül tek bir hafızada birleşir.
              Cevap tahminden değil, kendi kayıtlarınızdan gelir.
            </p>
            <div className="hero-dg">
              <Link className="dg dg-nane" href="/register">
                ÜCRETSİZ BAŞLA <b>↗</b>
              </Link>
              <a className="dg dg-ac" href="#odalar">
                ON İKİ MODÜL
              </a>
            </div>
            <p className="hero-not">KURULUM YOK · KART YOK · İKİ DAKİKADA İLK KAYDINIZ</p>
          </div>
        </div>

        <div className="serit">
          <span>
            <b>12</b> MODÜL
          </span>
          <span>
            <b>18</b> HAFIZA KAYNAĞI
          </span>
          <span>
            <b>13</b> ŞEMADA SATIR BAZLI İZOLASYON
          </span>
          <span>
            <b>0</b> SAĞLAYICI KİLİDİ
          </span>
        </div>
      </section>

      {/* ===================== BENTO ===================== */}
      <section className="kap">
        <div className="bento gir">
          <div className="kart k-foto">
            <img
              src="/brand/mascot-scene-stage.webp"
              alt=""
              loading="lazy"
              decoding="async"
              width={1254}
              height={1254}
            />
            <div className="ic">
              <div className="rakam">12</div>
              <p>Müşteriden faturaya, randevudan stoğa — on iki modülün hepsi ilk günden açık.</p>
            </div>
          </div>

          <div className="kart k-gri">
            <div className="rakam">18</div>
            <p>
              Tek bir soru sorulduğunda on sekiz hafıza kaynağı aynı anda taranır; en alakalı
              olanlar cevaba girer ve <b>hangi kaynaktan geldiği yazılır</b>.
            </p>
            <p className="dip">10 ANLATISAL &nbsp;·&nbsp; 8 YAPISAL</p>
          </div>

          <div className="yigin">
            <div className="kart k-nane">
              <div className="rakam">13</div>
              <p>
                Şemanın on üçünde de satır bazlı izolasyon. Her sorgu şirket kapsamında çalışır —
                sınır uygulamada değil, veritabanında.
              </p>
            </div>
            <div className="kart k-koyu k-satir">
              <span className="ad">Sağlayıcı kilidi</span>
              <span className="rakam">0</span>
            </div>
          </div>
        </div>
      </section>

      {/* ===================== ODALAR ===================== */}
      <section className="bolum kap" id="odalar">
        <div className="bolum-bas">
          <span className="etiket">MODÜLLER</span>
          <h2 className="d2">Her modül bir hafıza, her kapı bir soru</h2>
          <p className="alt">
            Bir modülü kullanmasanız da diğerleri çalışır; kullandığınız her modül asistanın bildiği
            alanı genişletir.
          </p>
        </div>

        <div className="odalar gir">
          {LANDING_MODULES.map((modul, index) => (
            <Link className="oda" key={modul.key} href="/moduller" style={accentStyle(modul.renk)}>
              <span className="ad">
                <span className="nokta" />
                {modul.ad}
              </span>
              <p>{modul.soru}</p>
              <span className="no">{moduleNo(index)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ===================== NASIL ÇALIŞIR ===================== */}
      <section className="bolum kap" id="nasil">
        <div className="bolum-bas">
          <span className="etiket">NASIL ÇALIŞIR</span>
          <h2 className="d2">Ayrı bir “veri girişi” aşaması yok</h2>
          <p className="alt">
            Hafıza, işin yapıldığı yerde birikir. Sonra tek bir soruyla geri gelir.
          </p>
        </div>

        <div className="adimlar gir">
          <article className="adim">
            <div className="no">01</div>
            <h3 className="d3">Yazarsınız</h3>
            <p>
              Bir görüşme notu, bir teklif, bir gider kaydı. Zaten yaptığınız işi yazdığınız yer
              hafızanın kendisi.
            </p>
          </article>
          <article className="adim">
            <div className="no">02</div>
            <h3 className="d3">Birikir</h3>
            <p>
              On iki modülün her biri kendi hafızasını besler. Hiçbiri diğerinin verisine dokunmaz;
              birleşme yalnızca cevap anında olur.
            </p>
          </article>
          <article className="adim">
            <div className="no">03</div>
            <h3 className="d3">Sorarsınız</h3>
            <p>Cevap uydurulmaz. Ne bulduysa onu söyler, bulamadığında da bunu söyler.</p>
          </article>
        </div>
      </section>

      {/* ===================== CEVAP ===================== */}
      <section className="bolum kap" id="cevap">
        <div className="bolum-bas">
          <span className="etiket">GERÇEK BİR CEVAP</span>
          <h2 className="d2">Uydurmaz. Bulamazsa bunu da söyler.</h2>
        </div>

        <div className="cevap gir">
          <span className="soru">“SON ALTI AYIMIZI ANALİZ ET”</span>
          <p className="metin">
            “Son 30 günde 15 randevunun 8&apos;i tamamlandı, 4&apos;ü gelmedi — gelmeme oranı %33
            ile yüksek. Sonbahar indirimi beklentinin üzerinde dönüş getirdi; en çok pazar günü.
            Altı aylık bir analiz için elimde yeterli veri yok.”
          </p>
          <p className="kaynak">
            <em>8 KAYDA DAYANIYOR</em>
            <i>randevu</i>
            <i>kampanya</i>
            <i>geri bildirim</i>
            <i>finans</i>
          </p>
        </div>
      </section>

      {/* ===================== KARŞITLIK ===================== */}
      <section className="bolum kap" id="fark">
        <div className="bolum-bas">
          <span className="etiket">FARK</span>
          <h2 className="d2">İçinde yapay zekâ olan bir yazılım değil</h2>
          <p className="alt">
            Aynı modeli herkes çağırabilir. Farkı yaratan model değil, modele verilen bağlamdır — ve
            o bağlam sizin verinizdir.
          </p>
        </div>

        <div className="karsit gir">
          <div className="hayir">
            <span className="bas">BİR SOHBET ASİSTANI</span>
            <h3>Soruyu bir metin olarak görür</h3>
            <ul>
              <li>
                Şirketinizin geçen çeyrekte ne yaşadığını <b>bilmez</b>.
              </li>
              <li>
                Cevabı genel bilgiden üretir; kaynağını <b>gösteremez</b>.
              </li>
              <li>
                Bilmediğini fark etmez — <b>boşluğu doldurur</b>.
              </li>
              <li>
                Her konuşma sıfırdan başlar; dün konuşulan <b>kaybolur</b>.
              </li>
            </ul>
          </div>
          <div className="evet">
            <span className="bas">KOBIWISE</span>
            <h3>Soruyu şirketin kayıtlarında arar</h3>
            <ul>
              <li>
                Randevu, finans, kampanya ve geri bildirime <b>aynı anda bakar</b>.
              </li>
              <li>
                Cevabın altında <b>hangi kayıtlardan geldiği yazar</b>.
              </li>
              <li>
                Yeterli veri yoksa <b>bunu söyler</b>, uydurmaz.
              </li>
              <li>
                Hafıza işin yapıldığı yerde birikir; <b>silinmez</b>.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* ===================== SAHNELER ===================== */}
      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">MARKA</span>
          <h2 className="d2">Yanınızda yürüyen bir hafıza</h2>
          <p className="alt">
            Ekranın köşesinde duran bir sohbet balonu değil; işin içinde yürüyen bir asistan.
          </p>
        </div>

        <div className="sahneler gir">
          <MascotBox />
          <div className="sahne">
            <img
              src="/brand/mascot-scene-stage.webp"
              alt="Podyumda veri grafikleriyle maskot"
              loading="lazy"
              decoding="async"
              width={1254}
              height={1254}
              style={{ objectPosition: '58% 47%' }}
            />
          </div>
          <div className="sahne">
            <img
              src="/brand/mascot-scene-orbit.webp"
              alt="Yörüngede, aşağıda Dünya"
              loading="lazy"
              decoding="async"
              width={1254}
              height={1254}
              style={{ objectPosition: '66% 44%' }}
            />
          </div>
        </div>
      </section>

      {/* ===================== KAPANIŞ ===================== */}
      <section className="kap" id="basla">
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
    </>
  );
}
