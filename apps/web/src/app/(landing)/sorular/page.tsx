import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Corridor } from '@/components/landing/corridor';
import { RoomHeader } from '@/components/landing/room-header';

export const metadata: Metadata = {
  title: 'Sorular',
  description:
    'Veri izolasyonu, sağlayıcı bağımsızlığı, uydurmama ve modül seçimi üzerine en çok sorulanlar.',
};

/**
 * `/sorular` — sık sorulanlar (ADR-0054).
 *
 * ============================================================================
 * ⚠️ AÇILIR KAPANIR YAPI İÇİN JS YOK — `<details>`/`<summary>` YERLİSİ
 * ============================================================================
 * Klavye, ekran okuyucu ve sayfa içi arama (Ctrl+F) kendiliğinden çalışır.
 * Elle yazılmış bir akordeon üçünü de ayrı ayrı üstlenmek zorunda kalırdı ve
 * bu sayfayı bir Client Component'a çevirirdi — FRONTEND §3.1'in pazarlama
 * sayfaları için verdiği kararın (Server Component, statik) tam tersi.
 *
 * ⚠️ Ctrl+F kazancı görünenden büyüktür: kapalı bir `<details>`in içindeki
 * metni tarayıcı BULUR ve paneli kendisi AÇAR. Elle yazılmış bir akordeonda o
 * metin DOM'da olsa bile `display: none` altındadır ve bulunamaz.
 */

interface Soru {
  readonly soru: string;
  readonly cevap: ReactNode;
}

const SORULAR: readonly Soru[] = [
  {
    soru: 'Verilerim başka şirketlerin verisiyle karışır mı?',
    cevap: (
      <>
        Hayır. On üç şemanın on üçünde de <b>satır bazlı izolasyon</b> açık ve sınır uygulama
        kodunda değil <b>veritabanının kendisinde</b>. Şirket kapsamı olmadan gelen bir sorgu
        sessizce boş dönmez — <b>hata verir</b>. Aradaki fark önemlidir: sessiz boşluk fark edilmez,
        hata fark edilir.
      </>
    ),
  },
  {
    soru: 'Hangi yapay zekâ modelini kullanıyorsunuz?',
    cevap: (
      <>
        Tek bir sağlayıcıya bağlı değiliz ve bu bir pazarlama cümlesi değil, mimari bir kısıt: iş
        mantığı modelle doğrudan konuşmaz, bir <b>port</b> üzerinden konuşur. Yeni bir sağlayıcı
        eklemek yalnızca yeni bir adaptör yazmayı gerektirir — iş mantığında tek satır değişmez.
        Sağlayıcı fiyat değiştirdiğinde ya da kapandığında bedelini ödemeyen tek karar budur.
      </>
    ),
  },
  {
    soru: 'Asistan bilmediği bir şeyi uydurur mu?',
    cevap: (
      <>
        Cevap yalnızca <b>sizin kayıtlarınızdan</b> üretilir ve hangi kaynaklardan geldiği cevabın
        altında yazar. Elindeki veri soruyu karşılamıyorsa asistan bunu <b>açıkça söyler</b>;
        boşluğu doldurmaz. Ana sayfadaki örnek cevap tam olarak bu durumu gösteriyor: otuz günü
        anlatıyor, altı ay için veri olmadığını söylüyor.
      </>
    ),
  },
  {
    soru: 'On iki modülün hepsini kullanmak zorunda mıyım?',
    cevap: (
      <>
        Hayır. Her modül tek başına çalışır; kullanmadığınız modül hiçbir şeyi bozmaz. Ama{' '}
        <b>ekledikçe cevaplar keskinleşir</b> — çünkü modüller birer ürün değil, asistanın
        hafızasıdır. Randevu ve finans birlikte varsa “bu kampanya gerçekten kazandırdı mı” sorusu
        cevaplanabilir; yalnız biri varsa cevaplanamaz.
      </>
    ),
  },
  {
    soru: 'Verilerimi dışarı alabilir miyim?',
    cevap: (
      <>
        Kayıtlarınız sizindir. Bir modülü bırakmak ya da tümüyle ayrılmak istediğinizde veri sizde
        kalır. <b>Bunun aksini savunan bir mimari kurmadık</b>: modüller birbirinin şemasına
        dokunmaz, yani bir modülün verisi başka bir modülün içine gömülü değildir.
      </>
    ),
  },
  {
    soru: 'Kurulum ne kadar sürüyor?',
    cevap: (
      <>
        Sunucu kurmuyorsunuz, ajan indirmiyorsunuz. Şirketinizi oluşturuyor, ilk kaydınızı
        giriyorsunuz — <b>hafıza aynı gün birikmeye başlıyor</b>. Ayrı bir “veri girişi” aşaması
        yok; hafıza işin yapıldığı yerde oluşur.
      </>
    ),
  },
];

export default function QuestionsPage() {
  return (
    <>
      <RoomHeader renk="#307d54" etiket="ODA 04 · SORULAR" baslik="Önce şunu sorun.">
        Bir yazılımı denemeden önce cevabını bilmek istediğiniz şeyler. Kısa tutmadık —{' '}
        <b>kısa cevap çoğu zaman eksik cevaptır</b>.
      </RoomHeader>

      <section className="kap">
        <div className="sorular gir">
          {SORULAR.map((madde) => (
            <details className="sss" key={madde.soru}>
              <summary>{madde.soru}</summary>
              <p className="cv">{madde.cevap}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="bolum kap">
        <div className="bolum-bas">
          <span className="etiket">BAŞKA BİR ŞEY</span>
          <h2 className="d2">Cevabı burada olmayan bir soru</h2>
          <p className="alt">
            Yazın, gerçekten okuyoruz. Cevabı bu sayfaya eklenmeye değerse ekliyoruz.
          </p>
          <p className="eylem">
            <a className="dg dg-koyu" href="mailto:merhaba@kobiwise.com">
              merhaba@kobiwise.com
            </a>
          </p>
        </div>
      </section>

      <Corridor haric="sorular" />
    </>
  );
}
