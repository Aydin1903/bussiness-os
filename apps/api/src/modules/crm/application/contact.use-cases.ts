import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  Contact,
  type ContactFields,
  type ContactPatch,
  type ContactState,
} from '../domain/contact.entity';
import { ContactCompanyNotFoundError, ContactNotFoundError } from '../domain/crm.error';
import { type CompanyRepository, type ListPage } from './company.repository.port';
import { type ContactRepository } from './contact.repository.port';

/** Kisi yasam dongusu. Dosya birlestirme gerekcesi: bkz. `CompanyUseCases`. */
export interface ContactDependencies {
  readonly repository: ContactRepository;
  readonly companyRepository: CompanyRepository;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

export class ContactUseCases {
  constructor(private readonly deps: ContactDependencies) {}

  /**
   * Kisi olusturur.
   *
   * ============================================================================
   * SIRKETIN VARLIGI ONCE DOGRULANIR — FK'ye BIRAKILMAZ
   * ============================================================================
   * Veritabani FK'si zaten ihlali engellerdi, ama uretecegi hata bir
   * `foreign key violation`'dir ve istemciye 500 olarak doner. Burada kontrol
   * edilince 404 doner ve mesaj anlamlidir.
   *
   * Ayrica RLS sayesinde BASKA tenant'in sirketi de "bulunamadi" sayilir:
   * baska bir tenant'in sirketine kisi baglama denemesi, o sirketin VARLIGINI
   * sizdirmadan reddedilir.
   * ============================================================================
   */
  async create(input: {
    tenantId: string;
    companyId: string;
    fields: ContactFields;
  }): Promise<ContactState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const company = await this.deps.companyRepository.findById(input.companyId);
      if (company === null) {
        throw new ContactCompanyNotFoundError();
      }

      const contact = Contact.create({
        id: this.deps.idGenerator.nextId(),
        tenantId: input.tenantId,
        companyId: input.companyId,
        fields: input.fields,
        now: this.deps.clock.now(),
      });

      await this.deps.repository.save(contact);
      return contact.toState();
    });
  }

  async list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
  }): Promise<ListPage<ContactState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((contact) => contact.toState()), total: page.total };
  }

  async get(id: string): Promise<ContactState> {
    const contact = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(id),
    );

    if (contact === null) {
      throw new ContactNotFoundError();
    }

    return contact.toState();
  }

  async update(input: { id: string; changes: ContactPatch }): Promise<ContactState> {
    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new ContactNotFoundError();
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      await this.deps.repository.save(updated);
      return updated.toState();
    });
  }

  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new ContactNotFoundError();
    }
  }
}
