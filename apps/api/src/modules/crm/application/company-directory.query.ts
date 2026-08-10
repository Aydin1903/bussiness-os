import { type PermissionChecker } from '../../../platform/authz/authz.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { COMPANY_READ } from '../crm.permissions';
import { type CompanyDirectory, type FindCompanyNamesInput } from '../crm.public';
import { type CompanyRepository } from './company.repository.port';

/**
 * `CompanyDirectory`'nin implementasyonu (ADR-0033 §2).
 *
 * Use case'lerle ayni desen: saf TypeScript, `@Injectable()` TASIMAZ, NestJS'i
 * bilmez (ARCHITECTURE 4). Bagimliliklari `crm.module.ts` factory ile verir —
 * `ResolveTenantAccessQuery` ile birebir ayni yerlesim.
 */
export interface CompanyDirectoryDependencies {
  readonly repository: CompanyRepository;
  readonly permissionChecker: PermissionChecker;
  readonly transactionManager: TransactionManager;
}

export class CompanyDirectoryQuery implements CompanyDirectory {
  constructor(private readonly deps: CompanyDirectoryDependencies) {}

  async findNames(input: FindCompanyNamesInput): Promise<ReadonlyMap<string, string>> {
    // IZIN KAPISI — pahali istan ONCE ve arayuzun ICINDE (bkz. `crm.public.ts`).
    // Reddedilen cagiran icin sorgu HIC acilmaz ve sonuc, "sirket silinmis"
    // halinden AYIRT EDILEMEZ.
    if (!this.deps.permissionChecker.can(input.role, COMPANY_READ)) {
      return new Map();
    }

    // Bos dizide sorgu acmanin anlami yok; `IN ()` zaten gecersiz SQL'dir.
    if (input.ids.length === 0) {
      return new Map();
    }

    // Okuma tenant transaction'i icinde: daraltmayi RLS yapar, yani baska
    // tenant'in sirketi zaten haritaya GIREMEZ.
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findNamesByIds(input.ids),
    );
  }
}
