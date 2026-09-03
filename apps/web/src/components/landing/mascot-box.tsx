'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * OYNATILABİLİR MASKOT KUTUSU — sahne şeridinin ilki (ADR-0054).
 *
 * ============================================================================
 * ⚠️ VİDEO SAYFA AÇILIŞINDA TEK BAYT İNDİRMEZ
 * ============================================================================
 * `preload="none"` ve kaynak (`src`) YALNIZCA imleç kutuya girince atanır.
 * Varsayılan hâl yüksek çözünürlüklü durağan bir karedir (`mascot-wave.webp`,
 * 32 KB) — yani "pikselli" ve "kasıyor" şikâyetleri birlikte çözülür: sayfada
 * sürekli yazılımla çözülen bir video akışı YOKTUR.
 *
 * ⚠️ Kaynak seçimi `devicePixelRatio`ya bağlıdır: 1x (330 KB) ve 2x (585 KB).
 * Retina olmayan bir ekrana 2x göndermek, görünmeyen pikseller için 255 KB
 * fazladan bayt harcamak olurdu.
 *
 * ============================================================================
 * ⚠️ ÜÇ KAPI: HAREKET TERCİHİ · GENİŞLİK · İŞARETLEME AYGITI
 * ============================================================================
 * Üçü de AYNI ANDA sağlanmadıkça video HİÇ kurulmaz:
 *
 *   1. `prefers-reduced-motion: reduce` → otomatik oynayan bir döngü tam
 *      olarak o tercihin engellemek istediği şeydir.
 *   2. `< 760px` → dar ekranda bant zaten küçüktür; mobil veri harcamaz.
 *   3. `pointer: coarse` → dokunmatikte "üstüne gelme" diye bir olay yoktur;
 *      video kurulsa bile hiç oynamazdı.
 *
 * ⚠️ Üçüncüsü ipucu rozetini de bağlar: dokunmatikte "ÜSTÜNE GELİN" yazmak
 * YALAN olurdu. Rozet CSS'te `@media (hover: none)` ile gizlenir — yani iddia
 * ile davranış aynı koşuldan besleniyor, iki ayrı yerde ayrışamıyor.
 *
 * ============================================================================
 * ⚠️ SUNUCUDA HİÇBİR KOŞUL ÇALIŞTIRILMAZ
 * ============================================================================
 * `matchMedia` ve `devicePixelRatio` yalnızca olayın İÇİNDE okunur, render
 * sırasında değil. Render sırasında okunsaydı sunucu onları göremez, istemci
 * görürdü ve React her yüklemede bir HİDRASYON HATASI basardı — kök layout'un
 * `suppressHydrationWarning` için yazdığı aynı gürültü sorunu.
 */
export function MascotBox() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [live, setLive] = useState(false);
  const kuruldu = useRef(false);

  const onEnter = useCallback(() => {
    const video = videoRef.current;
    if (video === null) {
      return;
    }

    const uygun =
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches &&
      window.matchMedia('(min-width: 760px)').matches &&
      window.matchMedia('(pointer: fine)').matches;

    if (!uygun) {
      return;
    }

    if (!kuruldu.current) {
      kuruldu.current = true;
      video.src =
        window.devicePixelRatio > 1.3 ? '/brand/mascot-loop-2x.webm' : '/brand/mascot-loop-1x.webm';
      video.addEventListener('canplay', () => {
        setLive(true);
        // ⚠️ `void` + `catch`: otomatik oynatma tarayıcı politikası yüzünden
        // reddedilebilir ve o REDDEDİLME BİR HATA DEĞİLDİR — durağan kare
        // yerinde kalır. Yakalanmazsa konsola işlenmemiş bir promise hatası
        // düşer ve gerçek hatalar onun içinde kaybolur.
        video.play().catch(() => undefined);
      });
      video.load();
      return;
    }

    video.play().catch(() => undefined);
  }, []);

  const onLeave = useCallback(() => {
    const video = videoRef.current;
    if (video !== null && !video.paused) {
      video.pause();
    }
  }, []);

  return (
    <div className="sahne bot-kutu" onPointerEnter={onEnter} onPointerLeave={onLeave}>
      {/*
        ⚠️ `aria-hidden` + `tabIndex={-1}`: video tamamen DEKORATİFTİR ve
        altındaki durağan karenin `alt` metni sahneyi zaten anlatır. Ekran
        okuyucuya iki kez aynı şeyi söylemek gürültüdür.
      */}
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="none"
        aria-hidden
        tabIndex={-1}
        className={live ? 'live' : undefined}
      />
      <img
        src="/brand/mascot-wave.webp"
        alt="El sallayan KobiWise asistanı"
        loading="lazy"
        decoding="async"
        width={720}
        height={720}
      />
      <span className="bot-ip">ÜSTÜNE GELİN</span>
    </div>
  );
}
