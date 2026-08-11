import { type Category, type FinanceDirection } from '../domain/category.entity';

export const CATEGORY_REPOSITORY = Symbol('CATEGORY_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * `finance.categories` kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0023`) ve cagiran zaten
 * tenant transaction'i icindedir. `ProjectRepository` / `CompanyRepository` ile
 * ayni gerekce: elle bir `WHERE tenant_id` eklemek (a) korumanin RLS'te oldugu
 * gercegini bulaniklastirir, (b) filtre bir gun unutulursa RLS'in hala koruyor
 * oldugu FARK EDILMEZ ve yanlis bir guven duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur
 * (`shared/README.md` — exception yalnizca BEKLENMEYEN durumlar icin).
 * ============================================================================
 */
export interface CategoryRepository {
  /**
   * Ekler ya da gunceller.
   *
   * ⚠️ Unique ihlalini (`categories_tenant_name_direction_idx`) YAKALAR ve
   * `DuplicateCategoryError`'a cevirir — ham PostgreSQL hatasi disari sizmaz.
   * Kontrolun "once SELECT ile bak, sonra yaz" seklinde yapilmamasi bilincli:
   * o desen es zamanli iki istekte YARIS KOSULU birakir ve veritabani zaten
   * dogru cevabi atomik olarak veriyor.
   */
  save(category: Category): Promise<void>;

  findById(id: string): Promise<Category | null>;

  /**
   * Sayfali liste.
   *
   * `direction` verilirse yalnizca o yondekiler; `null` ise ikisi de.
   * `includeArchived` FALSE ise arsivlenmisler DISARIDA kalir — varsayilan
   * budur, cunku kategori listesinin birincil tuketicisi "yeni kayitta hangi
   * kategoriyi secebilirim" sorusudur.
   *
   * ⚠️ "Filtre yok" `null` ile ifade edilir, `undefined` ile DEGIL:
   * `exactOptionalPropertyTypes` altinda opsiyonel bir ANAHTAR ile "anahtar
   * var, degeri `undefined`" ayri tiplerdir ve Zod'un `.optional()` ciktisi
   * ikincisidir (controller'da `?? null`).
   */
  list(input: {
    limit: number;
    offset: number;
    direction: FinanceDirection | null;
    includeArchived: boolean;
  }): Promise<ListPage<Category>>;

  /**
   * Siler.
   *
   * @returns silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   *
   * ⚠️ FK ihlalini (`0024`'ten itibaren mumkun) `CategoryInUseError`'a cevirir.
   * Bugun tetiklenemez — gerekce `CategoryInUseError`'in yorumunda.
   */
  deleteById(id: string): Promise<number>;
}
