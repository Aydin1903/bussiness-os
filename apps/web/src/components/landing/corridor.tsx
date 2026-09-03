import Link from 'next/link';

import { accentStyle } from './accent-style';

/**
 * KORİDOR — "Diğer odalar" (ADR-0054).
 *
 * ============================================================================
 * ⚠️ KAPI SAYISI SABİTTİR: DÖRT ODA + BAŞLA = BEŞ
 * ============================================================================
 * `landing-surface.css`in ızgarası bu sayıya göre yazıldı ve yorumu bunu
 * açıkça söylüyor: _"dört sütun beşinciyi tek başına alt satıra düşürüyordu;
 * sütun sayısı içerikten türetilir, alışkanlıktan değil"_.
 *
 * ⚠️ Yani bir kapı EKLEMEK ya da ÇIKARMAK bir CSS kararıdır, yalnızca bir veri
 * değişikliği değil. Altıncı bir oda geldiğinde (ör. Fiyatlandırma) ızgara
 * yeniden ölçülmelidir; bir test kapı sayısını kilitler.
 *
 * ============================================================================
 * BULUNULAN ODA KENDİ KORİDORUNDA GÖRÜNMEZ
 * ============================================================================
 * `haric` ile o sayfanın kendi kapısı elenir — "buradasın" diyen bir kapı,
 * kullanıcıyı olduğu yere göndermekten başka bir şey yapmaz.
 */

interface Door {
  readonly key: string;
  readonly href: string;
  readonly baslik: string;
  readonly ozet: string;
  /** Odanın imza rengi — koridordaki tek görsel ayrım. */
  readonly renk: string;
}

/**
 * ⚠️ "Hakkında" kapısının rengi TERRACOTTADIR (`#b25628`) ve bu, projedeki tek
 * meşru landing terracottasıdır. Bir çelişki DEĞİL: FRONTEND §4.8'in koruduğu
 * şey "terracotta = AI'ın sesi" eşlemesidir ve o eşleme `/app` içinde
 * geçerlidir. Landing'de AI konuşmaz; burada renk yalnızca dört kapıyı
 * birbirinden ayırır ve TEK bilgi taşıyıcısı değildir — her kapının ayrıca
 * başlığı ve özeti vardır.
 */
const DOORS: readonly Door[] = [
  {
    key: 'ana',
    href: '/',
    baslik: 'Ana sayfa',
    ozet: 'Ürünün tamamı bir bakışta.',
    renk: '#7be0b4',
  },
  {
    key: 'moduller',
    href: '/moduller',
    baslik: 'Modüller',
    ozet: 'On iki oda, on iki hafıza.',
    renk: '#3173af',
  },
  {
    key: 'hakkinda',
    href: '/hakkinda',
    baslik: 'Hakkında',
    ozet: 'Neden bir işletim sistemi kurduk?',
    renk: '#b25628',
  },
  {
    key: 'blog',
    href: '/blog',
    baslik: 'Blog',
    ozet: 'Kurumsal hafıza üzerine yazılar.',
    renk: '#5c6cab',
  },
  {
    key: 'sorular',
    href: '/sorular',
    baslik: 'Sorular',
    ozet: 'En çok merak edilen başlıklar.',
    renk: '#307d54',
  },
];

export function Corridor({ haric }: { readonly haric: string }) {
  const doors = DOORS.filter((door) => door.key !== haric);

  return (
    <section className="bolum kap">
      <div className="bolum-bas">
        <span className="etiket">KORİDOR</span>
        <h2 className="d2">Diğer odalar</h2>
      </div>

      <div className="koridor gir">
        {doors.map((door) => (
          <Link className="kapi" key={door.key} href={door.href} style={accentStyle(door.renk)}>
            <h3>{door.baslik}</h3>
            <p>{door.ozet}</p>
            <span className="git">ODAYA GİR →</span>
          </Link>
        ))}

        {/*
          ⚠️ BEŞİNCİ KAPI HER ZAMAN "BAŞLA"DIR ve elenmez: dört odanın hangisinde
          olursanız olun, koridorun sonunda ürüne giren kapı durur. Nane dolgu
          onu diğer dörtten ayırır — koridordaki tek BİRİNCİL eylem odur.
        */}
        <Link className="kapi kapi-nane" href="/register">
          <h3>Başla</h3>
          <p>İki dakikada ilk kaydınız.</p>
          <span className="git">ÜCRETSİZ BAŞLA →</span>
        </Link>
      </div>
    </section>
  );
}
