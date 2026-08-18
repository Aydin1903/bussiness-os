import { DIRECTION_LABELS, type FinanceDirection } from '@business-os/contracts';

import { formatMoney } from '@/lib/format/money';

/**
 * Finans'ın KENDİNE ÖZGÜ kart işaretleri.
 *
 * Genel olan `Mark` ve `CountMark` `module-kit`ten gelir; buradakiler bu
 * modülün sözlüğünü taşır (yön, tutar) ve orada yeri yok.
 */

/**
 * Yön rozeti — `StatusPill`'in Finans karşılığı.
 *
 * ⚠️ RENK TEK BAŞINA BİLGİ TAŞIMAZ (FRONTEND §4.8'in renk körlüğü kuralı):
 * rozetin İÇİNDE "Gelir"/"Gider" yazar. Gelir imza rengiyle (uyanık), gider
 * sessiz çizilir — çünkü bir işletmede dikkat çekmesi gereken şey paranın
 * GİRDİĞİ yerdir; gider zaten beklenen akıştır.
 */
export function DirectionPill({ direction }: { direction: FinanceDirection }) {
  const income = direction === 'income';

  return (
    <span
      className={[
        'inline-flex shrink-0 items-center rounded-full px-[10px] py-[3px]',
        'font-mono text-[9.5px] font-semibold tracking-[0.09em] uppercase',
        income ? 'bg-tint text-ink' : 'bg-fill text-fg-3',
      ].join(' ')}
    >
      {DIRECTION_LABELS[direction]}
    </span>
  );
}

/**
 * Tutar + para birimi.
 *
 * ============================================================================
 * ⚠️ SUNUCUNUN DİZESİ OLDUĞU GİBİ YAZILIR — YEREL BİÇİMLENDİRME YOK
 * ============================================================================
 * `Intl.NumberFormat` cazipti ve REDDEDİLDİ: dizeyi `Number`a çevirmek
 * gerekirdi ve para bu projede hiçbir noktada `number` olmuyor (`money.ts`).
 * Sunucu zaten KANONİK biçimde gönderiyor (`"1500.50"`), yani ekranda
 * yapılacak tek iş onu göstermektir.
 *
 * ⚠️ BİNLİK AYRACI ARTIK VAR (2026-08-17). Bu paragraf bir dönem "bilinen
 * sınır" diyor ve çözümü şöyle tarif ediyordu: _"dizeyi PARÇALAYAN bir
 * biçimlendirici olurdu (sayıya çevirmeyen), ve o ayrı bir iştir"_. O iş
 * yapıldı: `lib/format/money.ts`. Tutar hâlâ hiçbir noktada `number` olmuyor
 * ve `Intl` reddi de aynen duruyor.
 *
 * `tabular` ZORUNLU: rakamlar alt alta hizalanmazsa iki tutarı gözle
 * karşılaştırmak imkânsızlaşır.
 */
export function Amount({
  value,
  currency,
  direction,
}: {
  value: string;
  currency: string;
  /** Verilirse gider için `−` öneki yazılır. */
  direction?: FinanceDirection;
}) {
  const sign = direction === 'expense' ? '−' : '';

  return (
    <span className="shrink-0 text-[13.5px] font-semibold tracking-[-0.01em] text-fg tabular">
      {sign}
      {formatMoney(value)} <span className="text-[11px] font-medium text-fg-3">{currency}</span>
    </span>
  );
}

/**
 * Net tutar — İŞARETİ KENDİ TAŞIR.
 *
 * Negatif net bir HATA değil, bir dönem gerçeğidir; `--danger` kullanılmaz
 * (`DueMark`'ın aynı kuralı). Uyanık renk yalnızca negatifte verilir: pozitif
 * net beklenen durumdur ve her ekranda vurgulanırsa vurgu anlamını yitirir.
 */
export function NetAmount({ value, currency }: { value: string; currency: string }) {
  const negative = value.startsWith('-');

  return (
    <span
      className={[
        'shrink-0 text-[15px] font-semibold tracking-[-0.012em] tabular',
        negative ? 'text-ink' : 'text-fg',
      ].join(' ')}
    >
      {/*
        ⚠️ Tipografik eksiyi `formatMoney` KOYAR; burada elle eklemek çift
        işaret üretirdi. `negative` yalnızca RENK için okunuyor.
      */}
      {formatMoney(value)} <span className="text-[11px] font-medium text-fg-3">{currency}</span>
    </span>
  );
}
