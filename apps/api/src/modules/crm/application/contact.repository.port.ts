import { type Contact } from '../domain/contact.entity';
import { type ListPage } from './company.repository.port';

export const CONTACT_REPOSITORY = Symbol('CONTACT_REPOSITORY');

/** `crm.contacts` kaliciligi. Tenant daraltmasi icin bkz. `CompanyRepository`. */
export interface ContactRepository {
  save(contact: Contact): Promise<void>;
  findById(id: string): Promise<Contact | null>;
  /** `companyId` verilirse yalnizca o sirketin kisileri. */
  list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
  }): Promise<ListPage<Contact>>;
  deleteById(id: string): Promise<number>;

  /**
   * `id -> ad` haritasi — `ContactDirectory`nin (ADR-0035 §4) tek sorgusu.
   *
   * `CompanyRepository.findNamesByIds` ile BIREBIR ayni sekil ve ayni gerekce;
   * kopya bilinclidir (genellestirme ADR-0034 §4.1'de reddedildi).
   *
   * GORUNMEYEN id HARITAYA GIRMEZ: silinmis olabilir ya da baska tenant'in
   * (RLS). Cagiran ikisini ayirt etmez ve etmemelidir.
   *
   * IZIN KONTROLU BURADA DEGIL: repository veri dondurur, YETKI karari vermez
   * (karar `ContactDirectoryQuery`de).
   */
  findNamesByIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;
}
