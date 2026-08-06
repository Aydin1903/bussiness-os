import { type Company } from '../domain/company.entity';

export const COMPANY_REPOSITORY = Symbol('COMPANY_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * `crm.companies` kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0016`) ve cagiran zaten
 * tenant transaction'i icindedir. `DrizzleNoteChunkSearchRepository` ile ayni
 * gerekce: elle bir `WHERE tenant_id` eklemek (a) korumanin RLS'te oldugu
 * gercegini bulanikllastirir, (b) filtre bir gun unutulursa RLS'in hala
 * koruyor oldugu FARK EDILMEZ ve yanlis bir guven duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur
 * (`shared/README.md` — exception yalnizca BEKLENMEYEN durumlar icin).
 * ============================================================================
 */
export interface CompanyRepository {
  save(company: Company): Promise<void>;
  findById(id: string): Promise<Company | null>;
  list(input: { limit: number; offset: number }): Promise<ListPage<Company>>;
  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;
}
