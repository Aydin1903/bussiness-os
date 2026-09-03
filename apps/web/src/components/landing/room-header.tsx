import Link from 'next/link';
import type { ReactNode } from 'react';

import { accentStyle } from './accent-style';

/**
 * ODA BAŞLIĞI — dört alt sayfanın ortak girişi (ADR-0054).
 *
 * ============================================================================
 * ⚠️ BİR ODA, ANA SAYFANIN KÜÇÜLTÜLMÜŞ HÂLİ DEĞİLDİR
 * ============================================================================
 * Ana sayfanın hero'su bir İDDİA taşır (dev fotoğraf, iki kademeli başlık, iki
 * düğme); odanın başlığı bir KONUM bildirir — "buradasın". Bu yüzden oda
 * başlığı fotoğrafsızdır ve sola yaslıdır: koridorda nerede olduğunuzu
 * söylemek gösteriş istemez.
 *
 * ⚠️ İmza rengi TEK BAŞINA bilgi taşımaz (renk körlüğü — FRONTEND §4.8):
 * başlığın altındaki çizgi rengi verir, ama etiket ayrıca odanın ADINI ve
 * NUMARASINI yazar. Rengi göremeyen kullanıcı hiçbir şey kaybetmez.
 */
export function RoomHeader({
  renk,
  etiket,
  baslik,
  children,
}: {
  readonly renk: string;
  readonly etiket: string;
  readonly baslik: string;
  /** Başlığın altındaki tek paragraf. */
  readonly children: ReactNode;
}) {
  return (
    <section className="kap oda-bas" style={accentStyle(renk)}>
      {/*
        ⚠️ "KORİDORA DÖN" ana sayfaya gider, tarayıcı geçmişine DEĞİL.
        `history.back()` yazılabilirdi ve daha "akıllı" görünürdü; reddedildi:
        kullanıcı bu sayfaya bir arama sonucundan girmiş olabilir ve o zaman
        düğme onu SİTEDEN ÇIKARIRDI. Bir bağlantı nereye gittiğini söylemelidir.
      */}
      <Link className="geri" href="/">
        ← KORİDORA DÖN
      </Link>
      <span className="etiket">{etiket}</span>
      <h1 className="d1">{baslik}</h1>
      <p className="alt">{children}</p>
    </section>
  );
}
