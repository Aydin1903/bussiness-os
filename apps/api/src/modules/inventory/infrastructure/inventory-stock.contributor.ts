import { Injectable } from '@nestjs/common';

import {
  type ContextFragment,
  type RetrievalContributor,
} from '../../../platform/context/context.public';
import { type Clock } from '../../../shared/clock.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  type InventoryRepository,
  type InventorySummary,
  type LowStockItem,
} from '../application/inventory.repository.port';
import { isQuantityAtMost, isQuantityNegative } from '../domain/quantity';
import { STOCK_ITEM_READ } from '../inventory.permissions';

/** Koken etiketi — kaynak atfi ve `degradedSources` bunu tasir. */
export const INVENTORY_STOCK_SOURCE = 'inventory-stock';

/** Donem penceresi (gun): hareket sayilari bu araliktan gelir. */
const WINDOW_DAYS = 7;

/** Katkida gosterilecek EN FAZLA kalem — icerik SABIT ve KUCUK. */
const LOW_STOCK_LIMIT = 5;

/**
 * ============================================================================
 * SKOR RISKE GORE — DUZ SABIT SKOR YASAK (ADR-0039 §6.1)
 * ============================================================================
 * Randevu'nun (ADR-0035 §6.2) ve Finans'in politikasi burada da ILK GUNDEN
 * uygulanir. Aritmetik bunu her zamankinden cok zorunlu kiliyor:
 *
 *   global top-K = 8
 *   yapisal taban (ADR-0036) = ceil(8/3) = 3
 *   yapisal katkici sayisi = 5   ← BU MODULLE 4'TEN 5'E CIKTI
 *
 * ⚠️ ADR-0036'nin yeniden gozden gecirme esigi (tabanin IKI KATI = 6) artik
 * BIR ADIM UZAKTA. Bes yapisal kaynak uc garanti yuva icin siralanacak; sabit
 * skor veren bir katkici, digerlerini sistematik olarak disari iterdi.
 *
 *   esik ALTINDA veya NEGATIF kalem var -> 0.95  (gercek alarm)
 *   esige YAKIN kalem var                -> 0.90  (dikkat)
 *   saglikli / esik tanimlanmamis        -> 0.75  (bilgi; anlatisala yenilir)
 *
 * Sonuc kendi kendini duzenler: dolu bir depoda stok satirlari yuvalari
 * anlatisal icerige birakir, tukenmekte olan bir depoda one cikar.
 * ============================================================================
 */
const SCORE_BELOW_THRESHOLD = 0.95;
const SCORE_NEAR_THRESHOLD = 0.9;
const SCORE_HEALTHY = 0.75;

/**
 * Stok'un YAPISAL katkisi (ADR-0039 §6.1).
 *
 * ============================================================================
 * NEDEN YAPISAL KATKICI GEREKLI
 * ============================================================================
 * _"Neyimiz bitiyor?"_ sorusunun cevabi bir kalem notunda YAZMAZ; iki tablonun
 * ARITMETIGINDE yazar (`items.min_quantity` ile `movements`in toplami). Yalnizca
 * anlatisal veriyi gomseydik model bu soruyu bayat notlardan TAHMIN EDEREK
 * cevaplardi ve kendinden emin sekilde yanilirdi.
 *
 * ⚠️ BU KATKICI, CEVABI BIR TOPLAMDAN GELEN ILK KATKICIDIR. Onceki dordu
 * kolonlari OKUYORDU (durum, asama, tarih); bu, kolonlari TOPLUYOR. Sonucu
 * dogrudan ADR-0039 §2'ye baglidir: miktar bir kolonda saklansaydi bu katkici
 * SESSIZCE BAYAT bir sayiyi alarma cevirebilirdi.
 *
 * ============================================================================
 * ⚠️ ICERIK SABIT VE KUCUK — ve MIKTARLAR BIRIMIYLE YAZILIR
 * ============================================================================
 * En fazla `LOW_STOCK_LIMIT` kalem + tek satirlik donem ozeti. Kalem notu
 * BURAYA GIRMEZ: o ANLAMSAL katkicinin isidir (`inventory-notes`).
 *
 * ⚠️ Her miktar BIRIMIYLE birlikte yazilir (`"4 adet"`), ciplak sayi olarak
 * DEGIL — ADR-0039 §4.1'in dogrudan sonucu: birimsiz bir sayi, modelin farkli
 * kalemleri TOPLAYABILECEGINI ima ederdi ve "toplam stok" diye bir sey yoktur.
 */
@Injectable()
export class InventoryStockContributor implements RetrievalContributor {
  readonly source = INVENTORY_STOCK_SOURCE;
  /** ADR-0036: kolonlardan TURETILEN yapisal ozet — havuzda taban yuva hakki. */
  readonly contributionKind = 'structural' as const;
  readonly permission = STOCK_ITEM_READ;

  constructor(
    private readonly repository: InventoryRepository,
    private readonly transactionManager: TransactionManager,
    private readonly clock: Clock,
    /**
     * "Esige yakin" carpani (ornegin `1.25`). Config'ten gelir.
     *
     * ⚠️ WEB'DE BIR KARSILIGI OLURSA IKISI SENKRON KALMAK ZORUNDADIR —
     * `CRM_STALE_STAGE_DAYS` / `STALE_STAGE_DAYS` ayrismasinin UCUNCU tekrari.
     * Ayrisirlarsa hata sessizdir: ekran "yaklasti" der, katkici 0.75 verir.
     */
    private readonly nearRatio: number,
  ) {}

  /**
   * `embedding` KULLANILMAZ — imzada durur cunku port'un sozlesmesi odur.
   * Bu katki deterministiktir; soruya gore DEGISMEZ.
   */
  async contribute(): Promise<ContextFragment[]> {
    const now = this.clock.now();
    const windowStart = shiftDays(now, -WINDOW_DAYS);

    const { summary, lowStock } = await this.transactionManager.runInCurrentTenantTransaction(
      async () => {
        const period = await this.repository.summarize({ from: windowStart, to: now });
        const low = await this.repository.findLowStock({
          nearRatio: this.nearRatio,
          limit: LOW_STOCK_LIMIT,
        });

        return { summary: period, lowStock: low };
      },
    );

    // ⚠️ HICBIR SEY YOKSA HICBIR SEY GONDERILMEZ (ADR-0039 §6.1).
    //
    // Bu satir ADR-0036 §2'nin dogrudan gereksinimidir: yapisal TABAN yalnizca
    // "gercekten satir donduren" kaynaklara yuva ayirir. Bos bir envanterde
    // "0 kalem" demek, modele bilgi degil GURULTU tasir ve sekiz yuvadan birini
    // — hem de GARANTILI bir yuvayi — bosa harcardi.
    if (summary.activeItems === 0) {
      return [];
    }

    const score = classify(lowStock, this.nearRatio);

    return [
      summaryFragment(summary, score),
      ...lowStock.map((row) => lowStockFragment(row, score)),
    ];
  }
}

/**
 * Skoru belirleyen SINIFLANDIRMA (§6.1).
 *
 * ⚠️ SIRA ONEMLIDIR: negatif/esik alti, "esige yakin"dan ONCE bakilir. Bir kalem
 * bitmisken bir digerinin azaliyor olmasi, ALARMI seyreltmemelidir.
 *
 * ⚠️ Karsilastirma `quantity.ts` uzerinden — `Number`a CEVRILMEZ. SQL zaten
 * ayni yuklemle suzdu; buradaki siniflandirma DONEN satirlarin hangi bantta
 * oldugunu ayirt eder ve iki yerin ayni aritmetigi kullanmasi ZORUNLUDUR.
 */
function classify(lowStock: readonly LowStockItem[], nearRatio: number): number {
  if (lowStock.length === 0) {
    return SCORE_HEALTHY;
  }

  const critical = lowStock.some(
    (row) =>
      isQuantityNegative(row.quantity) ||
      (row.minQuantity !== null && isQuantityAtMost(row.quantity, row.minQuantity)),
  );

  if (critical) {
    return SCORE_BELOW_THRESHOLD;
  }

  // Buraya duşen satirlar SQL'in `nearRatio` bandindan gelmistir; `nearRatio`
  // imzada duruyor ki bandin sahibi bu fonksiyon olsun — ileride bant
  // degisirse iki yer birlikte okunur.
  void nearRatio;
  return SCORE_NEAR_THRESHOLD;
}

/** Donem ozeti — TEK SATIRLIK dogal dil, JSON ya da tablo DEGIL. */
function summaryFragment(summary: InventorySummary, score: number): ContextFragment {
  const parts = [
    'Stok ozeti',
    `${String(summary.activeItems)} aktif kalem`,
    `${String(summary.trackedItems)} tanesi esik takipli`,
    `son ${String(WINDOW_DAYS)} gunde ${String(summary.movementsIn)} giris / ${String(summary.movementsOut)} cikis hareketi`,
  ];

  return {
    content: parts.join(' · '),
    score,
    source: INVENTORY_STOCK_SOURCE,
    // ⚠️ `id` bir SATIR id'si DEGIL, pencerenin adidir — bu katkinin isaret
    // ettigi sey bir kayit degil bir DONEMDIR. Uydurulmus bir UUID dondurmek,
    // arayuzun acamayacagi bir baglanti vaat ederdi.
    reference: { kind: 'inventory-summary', id: `last-${String(WINDOW_DAYS)}-days` },
  };
}

/** Esik altindaki / negatif tek kalem. */
function lowStockFragment(row: LowStockItem, score: number): ContextFragment {
  // ⚠️ MIKTAR BIRIMIYLE YAZILIR (§4.1). Ciplak bir sayi, modelin farkli
  // kalemleri toplayabilecegini ima ederdi — "toplam stok" diye bir sey yoktur.
  const threshold = row.minQuantity === null ? 'esik tanimsiz' : `esik ${row.minQuantity}`;

  const state = isQuantityNegative(row.quantity)
    ? 'NEGATIF — kayit tutarsiz, fiziksel sayim gerekiyor'
    : row.minQuantity !== null && isQuantityAtMost(row.quantity, row.minQuantity)
      ? 'ESIK ALTINDA'
      : 'esige yaklasti';

  return {
    content: `Stok uyarisi: ${row.name} — ${row.quantity} ${row.unit} (${threshold}) · ${state}`,
    score,
    source: INVENTORY_STOCK_SOURCE,
    reference: { kind: 'stock-item', id: row.id },
  };
}

/** Gun kaydirma — `Date` aritmetigi TEK yerde. */
function shiftDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}
