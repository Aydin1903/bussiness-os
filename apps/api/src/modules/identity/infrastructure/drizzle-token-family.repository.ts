import { Injectable } from '@nestjs/common';
import { and, eq, isNull, ne } from 'drizzle-orm';

import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { tokenFamilies } from '../../../infrastructure/database/schema';
import type { TokenFamilyRepository } from '../application/token-family.repository.port';
import type { TokenFamily } from '../domain/token-family.entity';
import type { TokenFamilyId } from '../domain/token-family-id.value-object';
import type { TokenFamilyRevocationReason } from '../domain/token-family-revocation-reason.value-object';
import type { UserId } from '../../../shared/user-id.value-object';
import { toTokenFamily, toTokenFamilyRow } from './token-family.mapper';

/** `TokenFamilyRepository`'nin Drizzle implementasyonu (ADR-0021). */
@Injectable()
export class DrizzleTokenFamilyRepository implements TokenFamilyRepository {
  async findById(id: TokenFamilyId): Promise<TokenFamily | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(tokenFamilies)
      .where(eq(tokenFamilies.id, id.value))
      .limit(1);
    const row = rows[0];

    return row === undefined ? null : toTokenFamily(row);
  }

  async revokeAllActiveByUserId(
    userId: UserId,
    reason: TokenFamilyRevocationReason,
    revokedAt: Date,
  ): Promise<number> {
    const { db } = requireTransaction();

    // TEK komut: okuma ile yazma arasinda yeni aile dogmasina pencere birakmaz
    // (bkz. port yorumu). `revoked_at IS NULL` kosulu, zaten iptal edilmis bir
    // ailenin ILK iptal nedenini ve zamanini korur — o bir denetim gercegidir.
    const rows = await db
      .update(tokenFamilies)
      .set({ revokedReason: reason, revokedAt })
      .where(and(eq(tokenFamilies.userId, userId.value), isNull(tokenFamilies.revokedAt)))
      .returning({ id: tokenFamilies.id });

    return rows.length;
  }

  // NestJS DI ile alakasiz: imza port sozlesmesidir (userId + haric tutulan aile
  // + neden + zaman). Dordu de birbirinden turetilemez.
  // eslint-disable-next-line max-params
  async revokeAllActiveByUserIdExcept(
    userId: UserId,
    exceptFamilyId: TokenFamilyId,
    reason: TokenFamilyRevocationReason,
    revokedAt: Date,
  ): Promise<number> {
    const { db } = requireTransaction();

    // `revokeAllActiveByUserId` ile AYNI tek-komut disiplini; tek fark, istegi
    // yapan oturumun ailesini disarida birakan `id <> $2` kosuludur. Aileyi
    // once okuyup sonra "digerlerini" yazmak, arada dogan yeni bir ailenin
    // iptalden kacmasina pencere birakirdi.
    const rows = await db
      .update(tokenFamilies)
      .set({ revokedReason: reason, revokedAt })
      .where(
        and(
          eq(tokenFamilies.userId, userId.value),
          ne(tokenFamilies.id, exceptFamilyId.value),
          isNull(tokenFamilies.revokedAt),
        ),
      )
      .returning({ id: tokenFamilies.id });

    return rows.length;
  }

  async save(family: TokenFamily): Promise<void> {
    const { db } = requireTransaction();
    const row = toTokenFamilyRow(family);

    // user_id ve created_at CONFLICT'te GUNCELLENMEZ; degisen yalnizca iptaldir.
    await db
      .insert(tokenFamilies)
      .values(row)
      .onConflictDoUpdate({
        target: tokenFamilies.id,
        set: { revokedReason: row.revokedReason, revokedAt: row.revokedAt },
      });
  }
}
