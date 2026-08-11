import { type PermissionChecker } from '../../../platform/authz/authz.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { PROJECT_READ } from '../projects.permissions';
import { type FindProjectNamesInput, type ProjectDirectory } from '../projects.public';
import { type ProjectRepository } from './project.repository.port';

/**
 * `ProjectDirectory`'nin implementasyonu (ADR-0034 §4).
 *
 * `CompanyDirectoryQuery` ile birebir ayni sekil ve ayni gerekce — kopya
 * BILINCLIDIR (gerekce `projects.public.ts`'te: genellestirme izin kapisini
 * sahibinden alirdi).
 *
 * Use case'lerle ayni desen: saf TypeScript, `@Injectable()` TASIMAZ, NestJS'i
 * bilmez (ARCHITECTURE 4). Bagimliliklari `projects.module.ts` factory ile
 * verir.
 */
export interface ProjectDirectoryDependencies {
  readonly repository: ProjectRepository;
  readonly permissionChecker: PermissionChecker;
  readonly transactionManager: TransactionManager;
}

export class ProjectDirectoryQuery implements ProjectDirectory {
  constructor(private readonly deps: ProjectDirectoryDependencies) {}

  async findNames(input: FindProjectNamesInput): Promise<ReadonlyMap<string, string>> {
    // IZIN KAPISI — pahali istan ONCE ve arayuzun ICINDE (bkz.
    // `projects.public.ts`). Reddedilen cagiran icin sorgu HIC acilmaz ve
    // sonuc, "proje silinmis" halinden AYIRT EDILEMEZ.
    if (!this.deps.permissionChecker.can(input.role, PROJECT_READ)) {
      return new Map();
    }

    // Bos dizide sorgu acmanin anlami yok; `IN ()` zaten gecersiz SQL'dir.
    if (input.ids.length === 0) {
      return new Map();
    }

    // Okuma tenant transaction'i icinde: daraltmayi RLS yapar, yani baska
    // tenant'in projesi zaten haritaya GIREMEZ.
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findNamesByIds(input.ids),
    );
  }
}
