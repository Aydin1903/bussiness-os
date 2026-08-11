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
}
