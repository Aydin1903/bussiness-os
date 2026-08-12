import { type PermissionChecker } from '../../../platform/authz/authz.public';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { CONTACT_READ } from '../crm.permissions';
import { type ContactDirectory, type FindContactNamesInput } from '../crm.public';
import { type ContactRepository } from './contact.repository.port';

/**
 * `ContactDirectory`'nin implementasyonu (ADR-0035 §4).
 *
 * `CompanyDirectoryQuery` / `ProjectDirectoryQuery` ile BIREBIR ayni sekil ve
 * ayni gerekce — kopya BILINCLIDIR (ADR-0034 §4.1: genellestirme izin kapisini
 * sahibinden alirdi). Genellesen sey kod degil SOZLESME SEKLIDIR.
 *
 * ⚠️ SIRKET IKIZIYLE TEK FARKI IZIN SABITIDIR (`CONTACT_READ`) ve bu, iki
 * dizinin neden BIRLESTIRILMEDIGINI de acikliyor: `company:read` tasiyip
 * `contact:read` tasimayan bir cagiran (bugun boyle bir rol yok ama
 * tenant-configurable roller geldiginde olabilir) sirket adini gormeli, kisi
 * adini GORMEMELIDIR. Tek bir arayuz bunu ifade edemezdi.
 *
 * Use case'lerle ayni desen: saf TypeScript, `@Injectable()` TASIMAZ, NestJS'i
 * bilmez (ARCHITECTURE 4). Bagimliliklari `crm.module.ts` factory ile verir.
 */
export interface ContactDirectoryDependencies {
  readonly repository: ContactRepository;
  readonly permissionChecker: PermissionChecker;
  readonly transactionManager: TransactionManager;
}

export class ContactDirectoryQuery implements ContactDirectory {
  constructor(private readonly deps: ContactDirectoryDependencies) {}

  async findNames(input: FindContactNamesInput): Promise<ReadonlyMap<string, string>> {
    // IZIN KAPISI — pahali istan ONCE ve arayuzun ICINDE (bkz. `crm.public.ts`).
    // Reddedilen cagiran icin sorgu HIC acilmaz ve sonuc, "kisi silinmis"
    // halinden AYIRT EDILEMEZ.
    if (!this.deps.permissionChecker.can(input.role, CONTACT_READ)) {
      return new Map();
    }

    // Bos dizide sorgu acmanin anlami yok; `IN ()` zaten gecersiz SQL'dir.
    if (input.ids.length === 0) {
      return new Map();
    }

    // Okuma tenant transaction'i icinde: daraltmayi RLS yapar, yani baska
    // tenant'in kisisi zaten haritaya GIREMEZ.
    return this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findNamesByIds(input.ids),
    );
  }
}
