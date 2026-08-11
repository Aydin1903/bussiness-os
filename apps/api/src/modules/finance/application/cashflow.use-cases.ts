import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { type FinanceDirection } from '../domain/category.entity';
import { type CategoryTotalsRow, type TransactionRepository } from './transaction.repository.port';

/**
 * Nakit akisi ozeti (ADR-0034 §5).
 *
 * ============================================================================
 * TURETILIR — TOPLAM TABLOSU YOK, `balance` KOLONU YOK
 * ============================================================================
 * Bu, projede ALTINCI kez verilen ayni karardir (`daily_report_runs.status`in
 * reddi · yeniden indeksleme is listesi · yetim not tespiti · `follow_ups`
 * tablosunun reddi · `last_activity_at`in reddi). Turetilebilir bilgiyi
 * kaliciya yazmak IKINCI BIR DOGRULUK KAYNAGI yaratir ve bir tazeleme yolu
 * unutuldugunda hata SESSIZDIR — burada ciktisi bir PARA RAKAMI oldugu icin
 * digerlerinden daha da agirdir.
 *
 * Tenant basina islem sayisi binlerle olculur ve `(tenant_id, occurred_on)`
 * index'i sorguyu ucuz tutar. Olculebilir bir darbogaz cikarsa cozum kolon
 * degil MATERIALIZE EDILMIS GORUNUMDUR — o zaman tazeleme yolu tektir ve
 * unutulamaz.
 *
 * ============================================================================
 * ⚠️ FARKLI PARA BIRIMLERI TOPLANMAZ
 * ============================================================================
 * Bu sinif TEK BIR "net" rakami DONDURMEZ ve donduremez. 2000 TRY ile
 * 2000 USD'yi toplayan bir sayi, kullanicinin GOREMEYECEGI bir yanlis olurdu:
 * hatali oldugu belli olmayan bir rakamdir.
 *
 * Cevrim kapsam disidir (ADR-0034 §11) ve ucuzlatilamaz — dogru cevrim bir
 * KUR KAYNAGI, bir KUR TARIHI (islem gunu mu bugun mu) ve tarihsel kur saklama
 * gerektirir; ucu de ayri kararlardir.
 *
 * Bedeli acikca: tek para birimi kullanan bir tenant'ta bile arayuz tek
 * elemanli bir liste gosterir.
 */
export interface CashflowDependencies {
  readonly repository: TransactionRepository;
  readonly transactionManager: TransactionManager;
}

/** Kirilim satiri — `null` kategori KATEGORISIZ demektir, gizlenmez. */
export interface CategoryTotal {
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly direction: FinanceDirection;
  readonly total: string;
}

export interface CurrencySummary {
  readonly currency: string;
  readonly income: string;
  readonly expense: string;
  /** NEGATIF olabilir ve bu normaldir — gideri gelirinden fazla bir donem. */
  readonly net: string;
  /**
   * ⚠️ `null` = ISTENMEDI, bos dizi = ISTENDI AMA KAYIT YOK.
   *
   * Ikisi ayni sey degildir ve tek bir bos diziyle temsil edilselerdi arayuz
   * "kirilim bos" ile "kirilim sorulmadi" arasindaki farki kaybederdi.
   */
  readonly categories: readonly CategoryTotal[] | null;
}

export interface CashflowSummary {
  readonly from: string | null;
  readonly to: string | null;
  readonly currencies: readonly CurrencySummary[];
}

export class CashflowUseCases {
  constructor(private readonly deps: CashflowDependencies) {}

  /**
   * Verilen aralik icin para birimi basina ozet.
   *
   * ⚠️ Aralik verilmezse TUM GECMIS toplanir. Bu bilincli bir varsayilandir:
   * "hic filtre yoksa hicbir sey dondurme" davranisi, uctan veri almanin
   * kosulunu gizli bir kurala baglardi. Ekran her zaman bir aralik gonderir.
   *
   * IKI sorgu TEK transaction'da calisir — yani ikisi de AYNI anlik goruntuyu
   * gorur. Ayri transaction'larda olsalardi araya giren bir yazma, kategori
   * kiriliminin para birimi toplamini TUTMAMASINA yol acabilirdi.
   */
  async summarize(input: {
    from: string | null;
    to: string | null;
    includeCategories: boolean;
  }): Promise<CashflowSummary> {
    const { totals, breakdown } = await this.deps.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const currencyTotals = await this.deps.repository.summarizeByCurrency(input);

        // Kirilim istenmediyse ikinci sorgu HIC ACILMAZ.
        const categoryTotals = input.includeCategories
          ? await this.deps.repository.summarizeByCategory(input)
          : null;

        return { totals: currencyTotals, breakdown: categoryTotals };
      },
    );

    const byCurrency = groupByCurrency(breakdown);

    return {
      from: input.from,
      to: input.to,
      currencies: totals.map((row) => ({
        currency: row.currency,
        income: row.income,
        expense: row.expense,
        net: row.net,
        // ⚠️ Haritada yoksa BOS DIZI, `null` DEGIL: kirilim istenmisti ve o
        // para biriminde kategori satiri cikmadi. `null` "istenmedi" demektir
        // ve ikisi karistirilamaz.
        categories: breakdown === null ? null : (byCurrency.get(row.currency) ?? []),
      })),
    };
  }
}

/**
 * Kirilim satirlarini para birimine gore gruplar.
 *
 * ⚠️ Repository'nin SIRASI KORUNUR (tutara gore azalan): `Map` ekleme sirasini
 * korur ve `push` sirayi bozmaz. Burada yeniden siralamak, siralama kararini
 * IKI yere bolerdi.
 */
function groupByCurrency(
  rows: readonly CategoryTotalsRow[] | null,
): ReadonlyMap<string, CategoryTotal[]> {
  const map = new Map<string, CategoryTotal[]>();
  if (rows === null) {
    return map;
  }

  for (const row of rows) {
    const bucket = map.get(row.currency) ?? [];
    bucket.push({
      categoryId: row.categoryId,
      categoryName: row.categoryName,
      direction: row.direction,
      total: row.total,
    });
    map.set(row.currency, bucket);
  }

  return map;
}
