import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { UserId } from '../../../shared/user-id.value-object';
import { InvalidUserIdError } from '../../../shared/user-id.value-object';
import { type IdentityUserQuery, type IdentityUserSnapshot } from '../identity.public';
import { type UserRepository } from './user.repository.port';

/**
 * `IdentityUserQuery`'nin implementasyonu — Tenant'in onkosul kontrolunu besler.
 *
 * Use case'lerle ayni desen: saf TypeScript, @Injectable() TASIMAZ, NestJS'i
 * bilmez (ARCHITECTURE 4). Bagimliliklari `identity.module.ts` factory ile verir.
 *
 * Identity akislari tenant context'siz calisir (MT §12.4.3); okuma context'siz
 * transaction icinde yapilir.
 */
export interface IdentityUserQueryDependencies {
  readonly userRepository: UserRepository;
  readonly transactionManager: TransactionManager;
}

export class IdentityUserQueryService implements IdentityUserQuery {
  constructor(private readonly deps: IdentityUserQueryDependencies) {}

  async findById(userId: string): Promise<IdentityUserSnapshot | null> {
    let id: UserId;
    try {
      id = UserId.create(userId);
    } catch (error) {
      if (error instanceof InvalidUserIdError) {
        // Bicimsel olarak bozuk id "bulunamadi" ile aynidir: cagiran taraf
        // zaten onkosulu karsilanmamis sayar (fail closed).
        return null;
      }
      throw error;
    }

    return this.deps.transactionManager.runInTransaction(async () => {
      const user = await this.deps.userRepository.findById(id);

      // Yalnizca onkosul icin gereken alan disari cikar — e-posta/durum DEGIL.
      return user === null ? null : { userId: user.id.value, emailVerified: user.emailVerified };
    });
  }
}
