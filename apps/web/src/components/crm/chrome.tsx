'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * CRM'in KENDİNE ÖZGÜ kabuk parçası.
 *
 * Başlık şeridi, gövde, düğmeler, boş durum ve sayfalayıcı BURADAN TAŞINDI:
 * `components/module-kit/chrome.tsx`. Hiçbiri CRM'e özgü değildi ve Projeler
 * (ADR-0033 Slice 5) ikinci tüketici olunca bu kanıtlandı.
 *
 * Geride yalnızca `CrmTabs` kaldı — üç bölüm adı ve üç rota CRM'in sözlüğüdür;
 * modül kitine girmesi "Müşteriler/Fırsatlar/Takipler"i her modüle dayatmak
 * olurdu.
 */

/**
 * Bölüm sekmeleri — `composer.tsx`'in segment kontrolü, gezinme hâlinde.
 *
 * ============================================================================
 * ⚠️ VERİ MODELİ "company" DER, ARAYÜZ "Müşteri" DER — bu bilinçli
 * ============================================================================
 * Tablo `crm.companies`, tip `Company`, uç `/crm/companies`. Ekranda ise
 * "Müşteri" yazar ve öyle kalmalı. İki gerekçe:
 *
 * 1. DÜKKÂNCI TESTİ — hiç CRM kullanmamış biri "şirket kaydı" değil "müşteri"
 *    arar. Ürünün dili kullanıcının dili olmalı, şemanın dili değil.
 * 2. ÇAKIŞMAYI ÇÖZER — "Şirket" bu üründe ZATEN doludur: tenant seçici
 *    kullanıcının KENDİ şirketini öyle adlandırıyor ("Şirket seç"). CRM'in
 *    müşterisine de "şirket" demek, aynı ekranda aynı kelimeyi iki farklı
 *    şeye kullanmaktı.
 *
 * Kodda ve yorumlarda "şirket/company" DEĞİŞTİRİLMEDİ: orada kastedilen şey
 * gerçekten tablodur. Ayrım kasıtlıdır, tutarsızlık değildir — birini diğerine
 * uydurmak isteyen bir sonraki okuyucu önce bunu okusun.
 *
 * ============================================================================
 * SIDEBAR'A ÜÇ SATIR EKLENMEDİ
 * ============================================================================
 * Müşteriler · Fırsatlar · Takipler tek bir modülün üç görünümüdür, üç modül
 * değil.
 * Sol menüye üç satır koymak, CRM'i Finans ve Projeler'le aynı ağırlıkta üç
 * kaleme bölerdi. Sekme şeridi hiyerarşiyi doğru gösterir: sidebar'da "hangi
 * modüldeyim", başlıkta "modülün neresindeyim".
 *
 * ============================================================================
 * 8a'DA ÇİZİLMEDİ — VAAT ETMEMEK İÇİN
 * ============================================================================
 * Fırsatlar ve Takipler rotaları 8b'de doğdu. Sekmeleri 8a'da koymak, olmayan
 * iki sayfaya tıklanabilir görüntü vermek olurdu (`sidebar.tsx`'in "yakında"
 * satırı için yazılmış kuralın aynısı).
 */
const TABS: readonly { href: string; label: string }[] = [
  { href: '/app/crm', label: 'Müşteriler' },
  { href: '/app/crm/pipeline', label: 'Fırsatlar' },
  { href: '/app/crm/follow-ups', label: 'Takipler' },
];

export function CrmTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="CRM bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {TABS.map((tab) => {
        // TAM eşleşme: `/app/crm` her CRM yolunun ÖNEKİDİR; önek kontrolü
        // müşteri detayında "Müşteriler"i de "Fırsatlar"ı da aktif gösterirdi.
        // Detay sayfası zaten hiçbir sekmeye ait değildir ve hiçbiri yanmaz —
        // orada aktiflik iddiası yanlış olurdu.
        const active = pathname === tab.href;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            {...(active ? { 'aria-current': 'page' } : {})}
            className={[
              'rounded-full px-[17px] py-[7px] text-[12.5px] font-semibold tracking-[-0.008em]',
              'transition-[background-color,color] duration-[260ms] ease-rise',
              active ? 'bg-accent text-accent-fg shadow-card' : 'text-fg-3 hover:text-fg-2',
            ].join(' ')}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
