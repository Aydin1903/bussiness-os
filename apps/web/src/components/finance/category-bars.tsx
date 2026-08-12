import { DIRECTION_LABELS, type CashflowCategoryTotal } from '@business-os/contracts';

import { Amount } from './marks';

/**
 * Kategori kırılımı — yatay çubuk.
 *
 * ============================================================================
 * NEDEN PASTA DEĞİL: METAFOR VERİYE OTURMUYOR
 * ============================================================================
 * Her kırılım satırı `direction` taşır, yani aynı para biriminde hem gelir hem
 * gider kategorileri vardır. Geliri ve gideri tek pastaya koymak anlamsızdır —
 * ortada "bütün" diye bir şey yoktur. Pasta ısrarı para birimi başına İKİ pasta
 * demek olurdu ve tek kategorili bir dönem "tek dilimlik pasta" gibi garip
 * görünürdü. Çubukta tek kategori garip değildir: sadece tam dolu bir çubuktur.
 *
 * ============================================================================
 * NEDEN GRAFİK KÜTÜPHANESİ YOK (Product Owner kararı, FRONTEND §4.10)
 * ============================================================================
 * İş bir `div` genişliğidir. Bir kütüphane karşılığında geçişli bağımlılıklar
 * (recharts 3.x: `@reduxjs/toolkit`, `react-redux`, `immer`, `reselect`) ve
 * para biçimlendirmesinin kütüphane içine kaçması gelirdi — oysa bu projede
 * para hiçbir noktada `number` olmaz.
 *
 * ⚠️ BURADAKİ TEK `Number()` ÇAĞRISI SADECE GENİŞLİK İÇİNDİR.
 * Parse edilen değer EKRANA HİÇ YAZILMAZ; etiketteki tutar sunucunun kanonik
 * dizesidir ve `Amount` onu olduğu gibi basar (`marks.tsx`'in kuralı). Yüzde
 * hesabında kayan nokta hatası görünmez (0.1%'lik sapma bir çubukta ölçülemez),
 * ama aynı hata bir TUTARDA görünürdü — ayrım bu yüzden korunuyor.
 */

/**
 * Grubun paydası — GRUBUN İLAN EDİLMİŞ TOPLAMI (`income` / `expense`).
 *
 * ============================================================================
 * ⚠️ KATEGORİ TOPLAMINA GÖRE NORMALİZE ETMİYORUZ — VE BU BİLİNÇLİ
 * ============================================================================
 * Kategorilerin kendi toplamına bölmek çubukları HER ZAMAN %100'e tamamlar,
 * yani kırılım özetin tamamını açıklamasa bile grafik kusursuz görünür.
 * Sunucunun ilan ettiği toplama bölmek ise eksiği GÖSTERİR: çubuklar %100'e
 * varmaz.
 *
 * ADR-0034 §3d "Kategorisiz" satırını tam olarak toplamın tutması için
 * kırılımda tutuyor. Bu payda o garantiyi GÖRÜNÜR kılar — bir gün tutmazsa
 * ekranda fark edilir, sessizce yeniden ölçeklenmez.
 *
 * Geri düşüş yalnızca ilan edilen toplam kullanılamazsa (0 ya da sayı değil):
 * o durumda kategori toplamı kullanılır, çünkü alternatif hiç çubuk çizmemek
 * olurdu ve satırlar yine de görünmek zorundadır.
 */
function groupDenominator(declared: string, rows: readonly CashflowCategoryTotal[]): number {
  const value = Number(declared);
  if (Number.isFinite(value) && value > 0) {
    return value;
  }

  return rows.reduce((sum, row) => {
    const parsed = Number(row.total);
    return Number.isFinite(parsed) && parsed > 0 ? sum + parsed : sum;
  }, 0);
}

function widthPercent(total: string, denominator: number): number {
  const value = Number(total);
  if (!Number.isFinite(value) || value <= 0 || denominator <= 0) {
    return 0;
  }

  // %100'de kırpılır: ilan edilen toplamdan büyük bir kategori bozuk veriyi
  // gösterir, taşan bir çubuk ise düzeni bozardı.
  return Math.min(100, (value / denominator) * 100);
}

export function CategoryBars({
  categories,
  income,
  expense,
}: {
  categories: readonly CashflowCategoryTotal[];
  /** Grubun ilan edilmiş toplamı — payda (yukarıdaki gerekçe). */
  income: string;
  expense: string;
}) {
  const groups = (['income', 'expense'] as const)
    .map((direction) => ({
      direction,
      declared: direction === 'income' ? income : expense,
      rows: categories.filter((row) => row.direction === direction),
    }))
    // Boş grup BAŞLIĞIYLA çizilmez: içi boş bir "GİDER" başlığı, gider olmadığı
    // bilgisini vermez, ekranda yarım kalmış bir bölüm gibi görünür.
    .filter((group) => group.rows.length > 0);

  if (groups.length === 0) {
    return null;
  }

  return (
    <div className="mt-3.5 flex flex-col gap-4 border-t border-border pt-3.5">
      {groups.map((group) => {
        const denominator = groupDenominator(group.declared, group.rows);

        return (
          <div key={group.direction} className="flex flex-col gap-2">
            {/*
              ⚠️ GELİR/GİDER AYRIMINI BU BAŞLIK TAŞIR, RENK DEĞİL.
              FRONTEND §4.8'in renk körlüğü kuralı: renk tek ayırt edici
              olamaz. Etiket `DIRECTION_LABELS`ten gelir — veri modeli
              İngilizce, arayüz Türkçe.
            */}
            <p className="font-mono text-[9px] font-semibold tracking-[0.18em] text-fg-3 uppercase">
              {DIRECTION_LABELS[group.direction]}
            </p>

            <ul className="flex flex-col gap-1.5">
              {group.rows.map((row) => (
                <li
                  key={`${row.direction}-${row.categoryId ?? 'none'}`}
                  /*
                    Sabit etiket kolonu ÇUBUKLARI HİZALAR. Esnek bırakılsaydı
                    her çubuk farklı x'te başlar ve uzunlukları gözle
                    karşılaştırılamazdı — grafiğin tek işi tam olarak o.
                    Kırılma noktası yok: üç kolon 320px'e kadar sığar.
                  */
                  className="grid grid-cols-[minmax(76px,124px)_minmax(0,1fr)_auto] items-center gap-x-3"
                >
                  <span className="min-w-0 truncate text-[12px] text-fg-2">
                    {/*
                      ⚠️ "Kategorisiz" YAZILIR, satır ELENMEZ (ADR-0034 §3d).
                      Elenirse kırılım toplamı para birimi toplamını tutmaz ve
                      fark sessiz olurdu.
                    */}
                    {row.categoryName ?? 'Kategorisiz'}
                  </span>

                  <Bar
                    percent={widthPercent(row.total, denominator)}
                    income={row.direction === 'income'}
                  />

                  <Amount value={row.total} currency="" direction={row.direction} />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Çubuğun kendisi.
 *
 * ============================================================================
 * ⚠️ RENK KURALI `DirectionPill`DEN DEVRALINDI — İKİ YEŞİL TON DEĞİL
 * ============================================================================
 * `marks.tsx` bu modülün kuralını zaten kurmuş: **gelir imza rengiyle (uyanık),
 * gider sessiz çizilir** — çünkü bir işletmede dikkat çekmesi gereken şey
 * paranın GİRDİĞİ yerdir; gider zaten beklenen akıştır. Aynı ekranda rozet bir
 * kural, çubuk başka bir kural izlerse kullanıcı ikisini ayrı şey sanar.
 *
 * `--danger` KULLANILMAZ: gider bir hata değil, dönem gerçeğidir
 * (`NetAmount`'ın aynı kararı).
 *
 * `aria-hidden`: çubuk bilginin İKİNCİ kanalıdır. Etiket ve tutar zaten gerçek
 * metindir, ekran okuyucu onları okur; çubuğu ayrıca duyurmak aynı sayıyı iki
 * kez söylemek olurdu.
 */
function Bar({ percent, income }: { percent: number; income: boolean }) {
  return (
    <span aria-hidden className="h-[6px] w-full overflow-hidden rounded-full bg-fill">
      <span
        className={[
          'block h-full rounded-full',
          'transition-[width] duration-[260ms] ease-rise',
          income ? 'bg-accent' : 'bg-fg-4',
          // Sıfır olmayan ama çok küçük bir pay görünmez kalırdı ve çubuk
          // "bozuk" gibi okunurdu. Sıfır ise sliver DE verilmez — sıfır
          // gerçekten sıfırdır.
          percent > 0 ? 'min-w-[2px]' : '',
        ].join(' ')}
        style={{ width: `${String(percent)}%` }}
      />
    </span>
  );
}
