import type { CashflowSummary } from '@business-os/contracts';

import { Hero, HeroFigure, Satellite, Satellites, Wall } from '@/components/room/room';
import { Rise } from '@/components/panel/stream';
import { ROOM_RISE } from '@/components/room/room';
import { formatMoney } from '@/lib/format/money';
import { percentChange, type Period } from '@/lib/format/period';

/**
 * FİNANS ODASININ DUVARI — üç rotanın PAYLAŞTIĞI tek yüzey.
 *
 * ============================================================================
 * GENEL KURAL: BİR MODÜLÜN DUVARI ORTAKTIR, TEZGAHI DEĞİŞİR
 * ============================================================================
 * Bir modülün birden çok rotası olduğunda her rota ayrı bir oda DEĞİLDİR —
 * hepsi AYNI odanın farklı çalışma yüzeyleridir. Duvar (odanın durumu) sabit
 * kalır, tezgah (o an bakılan kalemler) değişir:
 *
 *   /finance           → duvar: dönem neti · tezgah: işlem listesi
 *   /finance/cashflow  → duvar: dönem neti · tezgah: kategori kırılımı + yorumlar
 *
 * Gerekçe kullanıcı modelidir: sekmeler arasında gezerken "hangi dönemdeyim,
 * durum ne" sorusunun cevabı GÖZDEN KAYBOLMAMALI. Her sekmeye farklı bir
 * kahraman koymak, aynı odada üç ayrı gerçeklik üretirdi.
 *
 * ⚠️ Bu kural on iki modülün tamamı için geçerlidir ve yeni modül yazan kişiyi
 * bağlar (Product Owner talimatı, 2026-08-17).
 *
 * ⚠️ İSTİSNA: rotanın sorusu gerçekten farklıysa duvarı da farklı olur.
 * Kategoriler sözlük yönetir, dönem finansı değil — orada dönem neti göstermek
 * ilgisiz bir dev rakam olurdu ve o rota kendi hafif duvarını kurar.
 *
 * ============================================================================
 * BU BİLEŞEN VERİ ÇEKMEZ
 * ============================================================================
 * Sunum bileşenidir; iki dönem özetini çağıran taraf getirir. Kendi içinde
 * çekseydi, kırılıma da ihtiyaç duyan Nakit akışı ekranı AYNI özeti iki kez
 * isterdi — sunucuya bedava bir çağrı daha.
 */

/**
 * Kahraman para birimi — EN BÜYÜK HACİMLİ olan.
 *
 * Duvar tek bir rakam ister; `currencies` ise bir LİSTEDİR ve toplanması
 * ADR-0034 §5.1'de yasaktır. İki kötü çözüm vardı: sunucunun döndürdüğü ilk
 * satırı almak (keyfî — sıralama sözleşmede yok) ve toplamak (yalan).
 *
 * Seçilen ölçüt HACİMDİR (gelir + gider): "şirketin işini hangi para biriminde
 * yaptığı" sorusunun cevabı. Net'e göre seçmek yanıltıcı olurdu — büyük hacimli
 * ama başabaş bir para birimi, küçük ama kârlı olana yenilirdi.
 */
export function leadCurrency(
  summary: CashflowSummary | null,
): CashflowSummary['currencies'][number] | null {
  if (summary === null || summary.currencies.length === 0) {
    return null;
  }

  return summary.currencies.reduce((best, row) => (volume(row) > volume(best) ? row : best));
}

function volume(row: CashflowSummary['currencies'][number]): number {
  const income = Number(row.income);
  const expense = Number(row.expense);
  return (Number.isFinite(income) ? income : 0) + (Number.isFinite(expense) ? expense : 0);
}

export function FinanceWall({
  period,
  summary,
  previous,
  loading,
}: {
  period: Period;
  summary: CashflowSummary | null;
  previous: CashflowSummary | null;
  loading: boolean;
}) {
  const lead = leadCurrency(summary);

  return (
    <Wall>
      <Rise delay={ROOM_RISE.wall}>
        {loading ? (
          <HeroSkeleton />
        ) : lead === null ? (
          <Hero label={`Net · ${period.label}`}>
            <HeroFigure>—</HeroFigure>
            <p className="mt-2 max-w-[42ch] text-[12.5px] leading-[1.6] text-fg-2">
              Bu dönemde hareket yok. Gelir ve gider kaydı girdikçe dönem toplamınız burada görünür.
            </p>
          </Hero>
        ) : (
          <Hero
            label={`Net · ${period.label} · ${lead.currency}`}
            delta={<DeltaLine current={lead} previous={previous} />}
          >
            {/*
              ⚠️ 64 px'lik kahraman rakam da BİÇİMLENDİRİLİR. Binlik ayracı
              küçük puntoda göze batmıyordu; bu boyutta "1284500.00" okunaksız
              bir rakam dizisidir. Tipografik eksiyi de `formatMoney` koyar.
            */}
            <HeroFigure>{formatMoney(lead.net)}</HeroFigure>
          </Hero>
        )}
      </Rise>

      {loading || lead === null ? null : (
        <Rise delay={ROOM_RISE.ai}>
          <Satellites>
            <Satellite label={`Gelir · ${lead.currency}`} value={formatMoney(lead.income)} />
            <Satellite label={`Gider · ${lead.currency}`} value={formatMoney(lead.expense)} />
            {/*
              ⚠️ DİĞER PARA BİRİMLERİ SAYI OLARAK DEĞİL, SAYIM OLARAK.
              Toplamak ADR-0034 §5.1'in yasakladığı şeydir; kahraman tek bir
              para biriminin rakamıdır ve etiketi bunu açıkça söyler.
            */}
            {summary !== null && summary.currencies.length > 1 ? (
              <Satellite
                label="Diğer para birimi"
                value={summary.currencies.length - 1}
                note="aşağıda ayrı ayrı"
                tone="accent"
              />
            ) : null}
          </Satellites>
        </Rise>
      )}
    </Wall>
  );
}

/**
 * Kahramanın altındaki karşılaştırma satırı.
 *
 * ⚠️ ÖNCEKİ DÖNEMDE AYNI PARA BİRİMİ YOKSA HİÇBİR ORAN ÇİZİLMEZ. "%100 artış"
 * yazmak matematiksel olarak da yanlış olurdu (sıfırdan artış tanımsızdır) ama
 * asıl sorun anlamdır: geçen ay o para biriminde iş yapılmamış olması bir
 * artış değil, farklı bir durumdur.
 */
function DeltaLine({
  current,
  previous,
}: {
  current: CashflowSummary['currencies'][number];
  previous: CashflowSummary | null;
}) {
  const before = previous?.currencies.find((row) => row.currency === current.currency);
  const change = before === undefined ? null : percentChange(current.net, before.net);

  if (change === null) {
    return <span className="text-fg-3">önceki dönemle karşılaştırılamıyor</span>;
  }

  return (
    <>
      <span>geçen aya göre</span>
      <b className="tabular font-semibold text-ink">
        {change > 0 ? '+' : ''}
        {change}%
      </b>
    </>
  );
}

/**
 * Duvarın yükleniyor hâli — ODANIN KENDİ ŞEKLİNİ taşır (ADR-0038 bulgu 5).
 *
 * Ölçüler gerçek kahramanla aynı: etiket, dev rakam, delta satırı. Eskiden
 * burada `Yükleniyor…` yazıyordu ve içerik gelince ekran ZIPLIYORDU.
 */
function HeroSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <span className="block h-[9px] w-[140px] rounded bg-fill-2" />
      <span className="block h-[52px] w-[74%] rounded-[10px] bg-fill-2" />
      <span className="block h-[11px] w-[120px] rounded bg-fill-2" />
    </div>
  );
}
