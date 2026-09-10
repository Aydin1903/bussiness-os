import type { Metadata } from 'next';

import { Corridor } from '@/components/landing/corridor';
import { RoomHeader } from '@/components/landing/room-header';

export const metadata: Metadata = {
  title: 'Hakkında',
  description: 'Ürün bir özellik listesinden değil, üç sorudan doğdu. Değişmeyen dört karar.',
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

      <Corridor haric="hakkinda" />
    </>
  );
}
