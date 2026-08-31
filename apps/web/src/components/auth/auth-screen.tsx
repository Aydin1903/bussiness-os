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
 * olarak öne alır). Sebep erişilebilirliktir: panel dekoratif bir zemin + tek
 * bir cümledir; klavye ve ekran okuyucu doğrudan forma düşmelidir. Tab sırası
 * DOM sırasını izler.
 *
 * ============================================================================
 * ⚠️ DUYARLI DAVRANIŞ — ve UYGULAMADA DEĞİŞEN BİR KARAR
 * ============================================================================
 * | Genişlik   | Panel                                                      |
 * | ---------- | ---------------------------------------------------------- |
 * | < 768      | YOK.                                                       |
 * | 768–1023   | Üstte kısa şerit — ⚠️ FOTOĞRAFSIZ, Mars zemini             |
 * | ≥ 1024     | Sol sütun, tam yükseklik, fotoğraf (Kademe A/C)            |
 *
 * ⚠️ ADR-0052 §4.1 md şeridinde "fotoğraf kırpılır" diyordu; uygulamada
 * ÖLÇÜLDÜ ve tutmadığı görüldü. Kaynak 1:1 karedir ve maskot çerçevenin
 * ~%40'ı kadar yer kaplar; 1024×208'lik bir şeritte `cover` kırpması maskotun
 * başını KESER — yani §4.4'ün "maskotun tamamı görünür" kabul ölçütü md'de
 * yapısal olarak sağlanamaz. Bandı ~420 px yapmak tabletin yarısını yerdi.
 *
 * Karar: md'de panel Kademe B'nin panelidir (gradyan + slogan). Kural böylece
 * basitleşir ve GÜÇLENİR: **maskot göründüğü her yerde tamamı görünür.**
 * Yan kazanç — fotoğraf artık yalnızca ≥1024'te istenir, yani tablet de baytı
 * ödemez.
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

      {/* FORM SÜTUNU — DOM'da önce (yukarıdaki erişilebilirlik notu). */}
      <div className="auth-form-col px-6 py-10 sm:px-10">
        {/*
          ⚠️ YAZILI LOGO ARTIK BURADA — ADR-0052 §5.2'nin KARARI TERSİNE
          ÇEVRİLDİ (Product Owner, 2026-08-31).

          Önceki karar logoyu SOL PANELE, fotoğrafın üzerine koyuyordu ve
          gerekçesi "panel zaten marka beyanıdır" idi. Gerçek ekranda referansla
          karşılaştırılınca iki sorun görüldü:

            1. Logo fotoğrafın ÜZERİNDE duruyordu — yani okunurluğu sahnenin
               o köşesindeki piksellere bağlıydı. Sahne değişirse logo sessizce
               zayıflar; bu, §3.7'nin metin için kurduğu scrim kuralının
               logoda KARŞILIĞI OLMAYAN hâliydi.
            2. Marka ile ürünün başlangıcı EKRANIN İKİ AYRI YARISINDA duruyordu.
               Referansta logo formun üstündedir: kullanıcı adı ve giriş
               alanını TEK bir dikey eksende okur.

          Yeni yer: sağ sütunun ÜSTÜ, ORTALANMIŞ. Gerekçenin kendisi değişmedi
          — "kullanıcı henüz içeride değil, marka kendini burada tanıtır" —
          değişen yalnızca hangi yarıda tanıttığıdır.

          ⚠️ Yan kazanç: artık TEK bir logo var. Önceki yazımda panelde bir,
          `<768px`'te formun üstünde bir tane olmak üzere iki ayrı örnek vardı
          ve ikisi ayrı kurallarla (`md:hidden` + panel içi token override)
          yaşıyordu. Şimdi genişlikten bağımsız tek bir yerde duruyor.

          ⚠️ "BUSINESS OS" alt satırı KORUNDU (ADR-0038 §7.2): kullanıcı hâlâ
          içeride değil. K işareti yine KULLANILMAZ — ad zaten yazılıyken
          yanına baş harfini koymak aynı şeyi iki kez söylemektir.

          ⚠️ Maskot logonun yerine GEÇMEZ: maskot markanın KARAKTERİDİR, ADI
          değildir — kullanıcı maskotu görüp ürünün adını öğrenemez.
        */}
        <div className="flex shrink-0 justify-center pb-10">
          <KobiWiseWordmark size={30} descriptor />
        </div>

        {/*
          ⚠️ İçerik 380 px'te kapanır. ≥1536 px'te panel büyür ama bu sınır
          SABİT kalır; aksi halde 27 inçlik bir ekranda 900 px genişliğinde bir
          e-posta alanı olurdu — bugün `max-w-sm` ile önlenen şeyin iki sütunlu
          düzendeki karşılığı.
        */}
        <div className="auth-form-body">
          <div className="w-full max-w-[380px]">{children}</div>
        </div>
      </div>

      {/*
        PANEL — görsel olarak solda (`order-first`), DOM'da sonra.

        `hidden md:flex`: <768'de hiç render edilmez. Fotoğraf zaten
        `@media (min-width: 1024px)` içinde tanımlıdır, yani dar ekranda
        indirilmez de — iki bağımsız koruma (ADR-0052 §4.2).

        ⚠️ `justify-start`: panelin TEK çocuğu slogandır ve o, panelin
        ÜSTÜNDE durur (Product Owner, 2026-08-31 — metin fotoğrafın altından
        üstüne alındı).
      */}
      <aside
        className="auth-panel order-first hidden flex-col justify-start p-8 md:flex md:h-[208px] lg:h-auto lg:p-12"
        data-scene={scene}
      >
        {/*
          ⚠️ METİN PANELİN ÜST KISMINDADIR ve bu bir hizalama tercihi değil bir
          KONTRAST koşuludur: scrim ORADA yoğundur (`auth-surface.css`).

          ⚠️ Metin yukarı taşınırken scrim'in de yönü çevrildi. Yalnızca metni
          taşımak, onu panelin EN AÇIK bölgesine (gün batımı gökyüzü, ufuk
          ışığı) korumasız bırakırdı ve hata SESSİZ olurdu: ekran çalışır,
          yalnızca beyaz metin açık turuncunun üzerinde okunmaz. İkisi
          BİRLİKTE taşınır.

          `text-balance`: iki yarımlı bir cümlede satır sonu eğik çizginin
          yanlış tarafına düşmesin diye satırlar dengelenir.
        */}
        <p
          className="max-w-[22ch] text-[27px] leading-[1.16] font-semibold tracking-[-0.02em] text-balance lg:text-[34px]"
          style={{ color: 'var(--mars-ink)' }}
        >
          {panel.slogan}
        </p>
      </aside>
    </main>
  );
}
