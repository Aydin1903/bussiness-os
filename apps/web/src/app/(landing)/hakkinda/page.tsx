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
            <h3>“Yapay zekâ neden hiçbir şey bilmiyor?”</h3>
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
          <p className="alt">
            Bunlar pazarlama cümlesi değil; koda yazılmış, ihlali merge edilmeyen kısıtlar.
          </p>
        </div>

        <div className="ikili gir">
          <div className="tas">
            <span className="no">01</span>
            <h3>Yapay zekâ merkezdedir, modüller onun etrafında</h3>
            <p>
              Bir modül tasarlanırken sorulan soru “kullanıcı bu ekranda ne yapar” değil,{' '}
              <b>“bu modül asistana hangi bağlamı kazandırır”</b>dır.
            </p>
          </div>
          <div className="tas">
            <span className="no">02</span>
            <h3>Hiçbir sağlayıcıya bağlanmayız</h3>
            <p>
              İş mantığı bir port üzerinden konuşur. Sağlayıcı değişir, adaptör değişir;{' '}
              <b>ürün tek satır değişmez</b>.
            </p>
          </div>
          <div className="tas">
            <span className="no">03</span>
            <h3>Her sorgu şirket kapsamında çalışır</h3>
            <p>
              İzolasyon uygulamada değil <b>veritabanının kendisinde</b> zorlanır. Kapsamsız veri
              erişimi yazılamaz.
            </p>
          </div>
          <div className="tas">
            <span className="no">04</span>
            <h3>Modüller birbirinin verisine dokunamaz</h3>
            <p>
              Her modülün kendi şeması vardır. Haberleşme yalnızca açık arayüz ya da olay üzerinden
              olur — <b>birleşme yalnızca cevap anında</b>.
            </p>
          </div>
        </div>
      </section>

      <Corridor haric="hakkinda" />
    </>
  );
}
