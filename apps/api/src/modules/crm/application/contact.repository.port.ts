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
}
