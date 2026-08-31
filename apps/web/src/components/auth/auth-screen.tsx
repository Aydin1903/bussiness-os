import type { ReactNode } from 'react';

import { KobiWiseWordmark } from '@/components/brand';

import { AUTH_PANELS, type AuthScreenKey } from './auth-panels';

/**
 * SPLIT-SCREEN AUTH İSKELETİ — ADR-0052.
 *
 * ============================================================================
 * TEK İSKELET, ÜÇ KADEME
 * ============================================================================
 * Yedi ekranın yedisi de bu bileşeni kullanır. "Yalnızca login/register split
 * olsun, kalan beşi ortalanmış kart kalsın" REDDEDİLDİ ve gerekçe akışsaldır:
 *
 *   register → verify-email → login → create-tenant → /app
 *
 * Bu bir zincirdir; ikinci adım birincinin DEVAMIDIR. Split ekrandan
 * ortalanmış karta geçmek, kullanıcının BAŞKA BİR SİTEYE düştüğü hissini
 * verir — ve tam olarak en kırılgan anda: e-postasını doğrulamak için gelen
 * kutusuna gidip geri döndüğünde.
 *
 * İkinci gerekçe daha somut: iki ayrı düzen iki ayrı iskelettir. ADR-0038
 * bunun bedelini ODA sisteminde bir kez ödedi (elle yazılan `max-w`'lar iki
 * ayrı ızgara üretmişti); aynı hatayı auth tarafında bilerek yapmayız.
 *
 * ============================================================================
 * ⚠️ DOM SIRASI: ÖNCE FORM, SONRA PANEL
 * ============================================================================
 * Panel görsel olarak SOLDA ama DOM'da SONRADIR (`order-first` onu görsel
 * olarak öne alır). Sebep erişilebilirliktir: panel dekoratif bir zemin + iki
 * cümledir; klavye ve ekran okuyucu doğrudan forma düşmelidir. Tab sırası DOM
 * sırasını izler.
 *
 * ============================================================================
 * ⚠️ DUYARLI DAVRANIŞ — ve UYGULAMADA DEĞİŞEN BİR KARAR
 * ============================================================================
 * | Genişlik   | Panel                                                      |
 * | ---------- | ---------------------------------------------------------- |
 * | < 768      | YOK. Yazılı logo formun üstüne döner.                      |
 * | 768–1023   | Üstte kısa şerit — ⚠️ FOTOĞRAFSIZ, Mars zemini + logo      |
 * | ≥ 1024     | Sol sütun, tam yükseklik, fotoğraf (Kademe A/C)            |
 *
 * ⚠️ ADR-0052 §4.1 md şeridinde "fotoğraf kırpılır" diyordu; uygulamada
 * ÖLÇÜLDÜ ve tutmadığı görüldü. Kaynak 1:1 karedir ve maskot çerçevenin
 * ~%40'ı kadar yer kaplar; 1024×200'lük bir şeritte `cover` kırpması maskotun
 * başını KESER — yani §4.4'ün "maskotun tamamı görünür" kabul ölçütü md'de
 * yapısal olarak sağlanamaz. Bandı ~420 px yapmak tabletin yarısını yerdi.
 *
 * Karar: md'de panel Kademe B'nin panelidir (gradyan + logo + slogan).
 * Kural böylece basitleşir ve GÜÇLENİR: **maskot göründüğü her yerde tamamı
 * görünür.** Yan kazanç — fotoğraf artık yalnızca ≥1024'te istenir, yani
 * tablet de baytı ödemez.
 */
export function AuthScreen({
  screen,
  children,
}: {
  readonly screen: AuthScreenKey;
  readonly children: ReactNode;
}) {
  const panel = AUTH_PANELS[screen];
  // Kademe B'de `scene` yoktur; `data-scene` hiç yazılmaz, fotoğraf katmanı
  // kurulmaz. `undefined` bir attribute React tarafından atlanır.
  const scene = 'scene' in panel ? panel.scene : undefined;
  // `=== true` YAZILMAZ: tabloda `preload` yalnızca `true` literal'i olarak
  // geçtiği için karşılaştırma her zaman doğrudur ve lint onu hata sayar.
  const preload = 'preload' in panel;

  return (
    <main className="grid min-h-dvh grid-cols-1 lg:grid-cols-2">
      {/*
        ⚠️ SAHNE BİR CSS ZEMİNİDİR — yani tarayıcı onu ancak stil sayfasını
        çözüp düzeni kurduktan SONRA keşfeder. `preload` o keşfi öne çeker.

        Üç niteliğin üçü de gereklidir ve hiçbiri süs değildir:
          `media`  → `<1024px`'te link HİÇ ateşlenmez; CSS kuralıyla aynı eşik.
                     Olmasaydı preload, §4.2'nin "mobilde indirilmez"
                     garantisini SESSİZCE delerdi.
          `type`   → AVIF desteklemeyen tarayıcı dosyayı hiç istemez ve WebP'yi
                     `image-set` üzerinden alır.
          `href`   → `image-set`'in birinci tercihiyle birebir aynı olmalı;
                     ayrışırsa preload boşa gider ve hata SESSİZDİR (yalnızca
                     konsolda "preloaded but not used" uyarısı).
      */}
      {preload && scene !== undefined ? (
        <link
          rel="preload"
          as="image"
          type="image/avif"
          media="(min-width: 1024px)"
          href={`/brand/mascot-scene-${scene}.avif`}
        />
      ) : null}
      {/*
        FORM SÜTUNU — DOM'da önce (yukarıdaki erişilebilirlik notu).

        ⚠️ İçerik 380 px'te kapanır. ≥1536 px'te panel büyür ama bu sınır
        SABİT kalır; aksi halde 27 inçlik bir ekranda 900 px genişliğinde bir
        e-posta alanı olurdu — bugün `max-w-sm` ile önlenen şeyin iki sütunlu
        düzendeki karşılığı.
      */}
      <div className="auth-form-col px-6 py-12 sm:px-10">
        <div className="w-full max-w-[380px]">
          {/*
            YAZILI LOGO — KONUM DEĞİŞTİ, GEREKÇE DEĞİŞMEDİ (ADR-0052 §5.2).

            Kural (Product Owner, 2026-08-17) şuydu: "Giriş ekranı kullanıcının
            HENÜZ İÇERİDE OLMADIĞI yüzeydir; markanın kendini tam olarak
            tanıttığı tek yer burasıdır" — bu yüzden "BUSINESS OS" alt satırı
            yalnızca burada açılır. O gerekçe aynen geçerlidir.

            Değişen KONUMDUR: ≥768'de panel zaten marka beyanıdır ve logoyu
            sağda tekrar etmek markayı iki kez söylemek olurdu. Panelin
            olmadığı tek genişlikte (<768) logo buraya DÖNER, çünkü orada tek
            marka taşıyıcısı odur.

            ⚠️ K işareti burada yine KULLANILMAZ (ADR-0038 §7.2): ad zaten
            yazılıyken yanına baş harfini koymak aynı şeyi iki kez söylemektir.

            ⚠️ Maskot logonun YERİNE geçmez: maskot markanın KARAKTERİDİR,
            ADI değildir — kullanıcı maskotu görüp ürünün adını öğrenemez.
          */}
          <div className="mb-8 flex justify-center md:hidden">
            <KobiWiseWordmark size={30} descriptor />
          </div>
          {children}
        </div>
      </div>

      {/*
        PANEL — görsel olarak solda (`order-first`), DOM'da sonra.

        `hidden md:flex`: <768'de hiç render edilmez. Fotoğraf zaten
        `@media (min-width: 1024px)` içinde tanımlıdır, yani dar ekranda
        indirilmez de — iki bağımsız koruma (ADR-0052 §4.2).
      */}
      <aside
        className="auth-panel order-first hidden flex-col justify-between p-8 md:flex md:h-[208px] lg:h-auto lg:p-12"
        data-scene={scene}
      >
        <div className="auth-panel-brand">
          <KobiWiseWordmark size={26} descriptor />
        </div>

        {/*
          ⚠️ METİN BLOĞU PANELİN ALT KISMINDADIR ve bu bir hizalama tercihi
          değil bir KONTRAST koşuludur: scrim orada ≥0.72 opaklıktadır
          (`auth-surface.css`). Yukarı taşınırsa fotoğrafın açık pikselleri
          üzerinde okunmaz hâle gelir ve hata SESSİZDİR.
        */}
        <div className="max-w-[30ch]">
          <p
            className="text-[26px] leading-[1.18] font-semibold tracking-[-0.02em] lg:text-[32px]"
            style={{ color: 'var(--mars-ink)' }}
          >
            {panel.slogan}
          </p>
          <p className="mt-3 text-sm leading-relaxed" style={{ color: 'var(--mars-ink-2)' }}>
            {panel.support}
          </p>
        </div>
      </aside>
    </main>
  );
}
