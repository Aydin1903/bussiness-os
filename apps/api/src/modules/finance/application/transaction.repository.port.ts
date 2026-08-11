import { type FinanceDirection } from '../domain/category.entity';
import { type FinanceTransaction, type TransactionState } from '../domain/transaction.entity';
import { type ListPage } from './category.repository.port';

export const TRANSACTION_REPOSITORY = Symbol('FINANCE_TRANSACTION_REPOSITORY');

/**
 * Liste satiri — `TransactionState` + KATEGORI ADI.
 *
 * ============================================================================
 * AD KOLONDA SAKLANMAZ, HER OKUMADA COZULUR
 * ============================================================================
 * `crm.companies`/`projects.projects` icin verilen ayni karar, bu kez SEMA ICI
 * bir iliski uzerinde: kategori yeniden adlandirildiginda islem listesi ANINDA
 * yeni adi gosterir. Kopyalansaydi bayatlardi.
 *
 * Fark: bu iliski sema ICI oldugu icin `JOIN` ile cozulur — cross-modul
 * referanslardaki gibi bir public interface cagrisi gerekmez ve IZIN KAPISI DA
 * YOKTUR (`finance_category:read` ile `transaction:read` bugun ayni kumeyi
 * tasiyor; ayrisirlarsa buraya bir kapi gerekir).
 *
 * `null` = kategorisiz kayit. "Silinmis kategori" diye bir durum YOKTUR:
 * `ON DELETE RESTRICT` onu imkansiz kilar (`0024`).
 */
export interface TransactionListRow extends TransactionState {
  readonly categoryName: string | null;
}

/**
 * Kullaniciya donen satir — kategori adi + CROSS-MODUL adlar.
 *
 * ============================================================================
 * NEDEN IKI TIP: repository `companyName`/`projectName` URETEMEZ
 * ============================================================================
 * Adlar `crm.companies` ve `projects.projects`tadir; `finance` semasindan
 * okunamaz (Mutlak Kural 5). Repository kendi semasinin bildigi kadarini
 * dondurur (`TransactionListRow`); adlari use case, iki dizin uzerinden EKLER.
 *
 * Tek tip olsaydi repository imzasi dolduramayacagi alanlar vaat ederdi —
 * `ProjectCountsRow`/`ProjectListRow` ayriminin birebir aynisi.
 *
 * ⚠️ `null` UC anlama gelir ve UCU AYIRT EDILMEZ: kayit bagli degil, hedef
 * silinmis (sarkan isaretci), ya da cagiran ilgili izni tasimiyor. Arayuz
 * ucunde de ayni seyi gosterir ve bu KASITLIDIR.
 */
export interface TransactionEnrichedRow extends TransactionListRow {
  readonly companyName: string | null;
  readonly projectName: string | null;
}

/**
 * `finance.transactions` kaliciligi.
 *
 * HICBIR METOT `tenantId` ALMAZ — daraltmayi RLS yapar (migration `0024`).
 * Gerekce `category.repository.port.ts`'te; burada tekrarlanmaz.
 */
export interface TransactionRepository {
  /**
   * Ekler ya da gunceller.
   *
   * ⚠️ Bilesik FK ihlalini (`transactions_category_direction_fkey`) YAKALAR ve
   * `CategoryDirectionMismatchError`'a cevirir. Use case ayni kontrolu ONCEDEN
   * yapar ve daha iyi bir mesaj uretir; buradaki ceviri, o kontrolun
   * ATLANDIGI ya da yaris kosulunda gecersizlestigi durumda ham bir PostgreSQL
   * hatasinin 500 olarak sizmasini onler.
   */
  save(transaction: FinanceTransaction): Promise<void>;

  findById(id: string): Promise<FinanceTransaction | null>;

  /**
   * Sayfali liste — PROJEKSIYON doner, entity DEGIL.
   *
   * `categoryName` `FinanceTransaction` aggregate'ine ait bir alan degildir,
   * baska bir tablodan turer (`ProjectListRow` ile ayni ayrim).
   *
   * ⚠️ "Filtre yok" `null` ile ifade edilir, `undefined` ile DEGIL.
   * `from`/`to` DAHILDIR (`>=` / `<=`): bir kullanici "1–31 Mart" dediginde
   * 31 Mart'i kastediyordur.
   */
  list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    categoryId: string | null;
    from: string | null;
    to: string | null;
  }): Promise<ListPage<TransactionListRow>>;

  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;

  /**
   * NAKIT AKISI OZETI — PARA BIRIMI BASINA bir satir (ADR-0034 §5).
   *
   * ============================================================================
   * ⚠️ TOPLAMA SQL'DE YAPILIR, JS'TE DEGIL
   * ============================================================================
   * Donen degerler DIZEDIR ve oyle kalir. Toplamayi JS'e tasimak, `numeric`
   * degerleri `number`a cevirmek demektir — yani `money.ts`'in bastan sona
   * kacindigi yuvarlama hatasini, tam da EN COK ONEM TASIDIGI yerde (bir para
   * toplaminda) geri getirmek.
   *
   * `net` de SQL'de hesaplanir (`income` - `expense` degil, tek bir
   * `SUM(CASE ...)`): iki dizeyi JS'te cikarmak icin once sayiya cevirmek
   * gerekirdi.
   *
   * ============================================================================
   * BOS ARALIK BOS DIZI DONER — UYDURULMUS SIFIR SATIRI YOK
   * ============================================================================
   * Aralikta hic hareket yoksa dizi bostur. `{ currency: 'TRY', net: '0.00' }`
   * gibi bir satir UYDURULMAZ: hangi para biriminde sifir oldugunu bilmiyoruz
   * ve tenant'in hic TRY kullanmamis olmasi tumuyle mumkun.
   */
  summarizeByCurrency(input: {
    from: string | null;
    to: string | null;
  }): Promise<CurrencyTotalsRow[]>;

  /**
   * Kategori kirilimi — para birimi + kategori + yon basina bir satir.
   *
   * ⚠️ AYRI BIR SORGU, `summarizeByCurrency` ile BIRLESTIRILMEZ: ikisi farkli
   * GRUPLAMA GRANULARITESINDE calisir. Tek sorguda birlestirmek, para birimi
   * toplamlarini kategori sayisi kadar TEKRARLARDI ve okuyanin onlari
   * ayiklamasi gerekirdi (`findRiskyOpenProjects` / `findLastNoteActivity`
   * ayriminin ayni gerekcesi).
   *
   * ⚠️ KATEGORISIZ kayitlar `categoryId: null` olarak GORUNUR, elenmez —
   * ADR-0034 §3d: ozet bunu ACIKCA gosterir, gizlemez. Elenselerdi kategori
   * toplamlari para birimi toplamini tutmaz ve fark SESSIZ olurdu.
   */
  summarizeByCategory(input: {
    from: string | null;
    to: string | null;
  }): Promise<CategoryTotalsRow[]>;
}

/** Para birimi basina toplamlar; tum tutarlar KANONIK dize (`"1500.50"`). */
export interface CurrencyTotalsRow {
  readonly currency: string;
  readonly income: string;
  readonly expense: string;
  /** `income - expense`; NEGATIF olabilir ve bu normaldir. */
  readonly net: string;
}

/** Kategori kirilimi satiri. */
export interface CategoryTotalsRow {
  readonly currency: string;
  /** `null` = KATEGORISIZ (gizlenmez, ADR-0034 §3d). */
  readonly categoryId: string | null;
  readonly categoryName: string | null;
  readonly direction: FinanceDirection;
  readonly total: string;
}
