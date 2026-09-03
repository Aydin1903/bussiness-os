'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * GİRİŞ ANİMASYONU — `.gir` öğelerini görünür alana girdiklerinde açar.
 *
 * ============================================================================
 * ⚠️ NEDEN TEK BİR GÖZLEMCİ, NEDEN HER BLOK İÇİN BİR CLIENT COMPONENT DEĞİL
 * ============================================================================
 * Alternatif, animasyonlu her bloğu bir `<Reveal>` sarmalayıcısına koymaktı.
 * Reddedildi: pazarlama sayfası tanımı gereği Server Component'tır (FRONTEND
 * §3.1) ve o sarmalayıcı, on iki oda kartını ve altı SSS satırını istemci
 * ağacına ÇEKERDİ — sayfanın tamamı JS paketine girerdi.
 *
 * Bu bileşen hiçbir şey RENDER ETMEZ (`null` döner); yalnızca bir yan etki
 * kurar. Sunucunun ürettiği HTML'e tek bayt eklemez.
 *
 * ============================================================================
 * ⚠️ `unobserve` — bir kez açılan bir daha gözlenmez
 * ============================================================================
 * Gözlemci bırakılsaydı kullanıcı yukarı kaydırdığında öğe TEKRAR görünür
 * alandan çıkar, sonra tekrar girer ve animasyon her seferinde yeniden
 * oynardı. Bir giriş animasyonu bir kez oynar; ikincisi tik'tir.
 *
 * ⚠️ `prefers-reduced-motion` ve `IntersectionObserver` desteği olmayan
 * durumda öğeler DOĞRUDAN açılır — hiçbir koşulda görünmez kalmazlar. JS'in
 * hiç çalışmadığı durumun karşılığı ise burada değil, `layout.tsx`teki
 * `<noscript>` stilindedir; ikisi ayrı arızalardır ve ayrı ayrı kapatılır.
 */
export function Reveal(): null {
  /*
   * ⚠️ ROTA BAĞIMLILIĞI — VE BU BİR KUSURDAN SONRA BÖYLE.
   *
   * İlk yazımda bağımlılık dizisi BOŞTU (`[]`). Bu layout beş rotanın
   * ORTAK kökü olduğu için rotalar arası gezinmede YENİDEN MOUNT EDİLMEZ:
   * kullanıcı `/`den `/moduller`e geçtiğinde efekt bir daha koşmaz, yeni
   * sayfanın `.gir` öğeleri hiç gözlenmez ve `opacity: 0` KALIR.
   *
   * ⚠️ Kusur ilk yüklemede GÖRÜNMEZ — yalnızca istemci tarafı gezinmede
   * çıkar; sayfa yenilenince kendiliğinden düzelir. Yani "bir kere olmuş"
   * diye elenmesi çok kolay bir arıza sınıfı.
   */
  const pathname = usePathname();

  useEffect(() => {
    const targets = document.querySelectorAll('.gir');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce || !('IntersectionObserver' in window)) {
      for (const el of targets) {
        el.classList.add('ic');
      }
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('ic');
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.06, rootMargin: '0px 0px -8% 0px' },
    );

    for (const el of targets) {
      observer.observe(el);
    }

    return () => {
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
