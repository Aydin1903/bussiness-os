'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Projeler'in KENDİNE ÖZGÜ kabuk parçası.
 *
 * Başlık şeridi, gövde, düğmeler, boş durum ve sayfalayıcı `module-kit`ten
 * gelir — hiçbiri kopyalanmadı. Burada yalnızca bu modülün SÖZLÜĞÜ var: iki
 * bölüm adı ve iki rota.
 *
 * ============================================================================
 * SIDEBAR'A İKİ SATIR EKLENMEDİ
 * ============================================================================
 * Projeler · Yapılacaklar tek bir modülün iki görünümüdür, iki modül değil
 * (`CrmTabs`'ın aynı gerekçesi). Sekme şeridi hiyerarşiyi doğru gösterir:
 * sidebar'da "hangi modüldeyim", başlıkta "modülün neresindeyim".
 *
 * ============================================================================
 * ⚠️ "YAPILACAKLAR" SEKMESİ HENÜZ ÇİZİLMEDİ — VAAT ETMEMEK İÇİN
 * ============================================================================
 * `/app/projects/tasks` rotası bu slice'ta yazılmadı. Sekmeyi şimdi koymak,
 * olmayan bir sayfaya tıklanabilir görüntü vermek olurdu — `CrmTabs`'ın 8a'da
 * verdiği kararın aynısı ve `sidebar.tsx`'in "yakında" satırı için yazılmış
 * kuralın aynısı.
 *
 * Tek sekmeli bir şerit anlamsız olduğu için şerit BUGÜN HİÇ çizilmiyor;
 * `ProjectTabs` ikinci rota geldiğinde devreye girer.
 */
const TABS: readonly { href: string; label: string }[] = [
  { href: '/app/projects', label: 'Projeler' },
  { href: '/app/projects/tasks', label: 'Yapılacaklar' },
];

export function ProjectTabs() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Projeler bölümleri"
      className="inline-flex gap-0.5 rounded-full border border-border bg-sunken p-[3px]"
    >
      {TABS.map((tab) => {
        // TAM eşleşme: `/app/projects` her Projeler yolunun ÖNEKİDİR; önek
        // kontrolü proje detayında "Projeler"i de aktif gösterirdi. Detay
        // sayfası hiçbir sekmeye ait değildir ve hiçbiri yanmaz — orada
        // aktiflik iddiası yanlış olurdu (`CrmTabs` ile aynı karar).
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
