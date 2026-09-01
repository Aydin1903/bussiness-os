import { Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { isPgError, PG_UNIQUE_VIOLATION } from '../../../infrastructure/database/pg-error';
import { federatedIdentities } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { type UserId } from '../../../shared/user-id.value-object';
import { type FederatedIdentityRepository } from '../application/federated-identity.repository.port';
import { type FederatedIdentity } from '../domain/federated-identity.entity';
import { FederatedIdentityConflictError } from '../domain/identity.error';
import { type ProviderSubject } from '../domain/provider-subject.value-object';
import { toFederatedIdentity, toFederatedIdentityRow } from './federated-identity.mapper';

/** `FederatedIdentityRepository`'nin Drizzle implementasyonu (ADR-0053 §2). */
@Injectable()
export class DrizzleFederatedIdentityRepository implements FederatedIdentityRepository {
  async findByProviderSubject(
    provider: OAuthProviderKey,
    subject: ProviderSubject,
  ): Promise<FederatedIdentity | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(federatedIdentities)
      .where(
        and(
          eq(federatedIdentities.provider, provider),
          eq(federatedIdentities.providerSubject, subject.value),
        ),
      )
      .limit(1);
    const row = rows[0];

    return row === undefined ? null : toFederatedIdentity(row);
  }

  async listByUserId(userId: UserId): Promise<readonly FederatedIdentity[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select()
      .from(federatedIdentities)
      .where(eq(federatedIdentities.userId, userId.value))
      .orderBy(asc(federatedIdentities.linkedAt));

    return rows.map(toFederatedIdentity);
  }

  /**
   * ⚠️ IKI TEKILLIK IHLALI DE AYNI DOMAIN HATASINA CEVRILIR.
   *
   * `federated_identities_provider_subject_key` ("bu saglayici hesabi baska bir
   * kullaniciya bagli") ile `federated_identities_user_provider_key`
   * ("bu kullanicinin bu saglayicida zaten bir hesabi var") AYRI durumlardir —
   * ama cagirana ikisi de **409** olarak doner.
   *
   * ⚠️ Ayirt etmemek bilinclidir: ikisini ayri mesajlarla bildirmek, callback'i
   * tetikleyebilen bir saldirgana _"bu Google hesabi sistemde kayitli"_
   * bilgisini verirdi (P2). Normal akista buraya HIC ULASILMAZ — D1 kontrolu
   * once kosar; bu yol yalnizca IKI ES ZAMANLI callback'in yaris durumudur.
   */
  async insert(identity: FederatedIdentity): Promise<void> {
    const { db } = requireTransaction();

    try {
      await db.insert(federatedIdentities).values(toFederatedIdentityRow(identity));
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION)) {
        throw new FederatedIdentityConflictError();
      }
      throw error;
    }
  }

  /**
   * ⚠️ YALNIZCA `last_login_at`.
   *
   * Genel bir `save` yazilsaydi kod, veritabaninin izin VERMEDIGI bir seyi
   * denerdi: `0040` bu tabloda `UPDATE`i kaldirir ve yalnizca
   * `GRANT UPDATE (last_login_at)` verir. Yani buradaki daralma bir uslup
   * tercihi degil, veritabani sozlesmesinin KODDAKI KARSILIGIDIR — ikisi
   * ayrisirsa calisma aninda `permission denied` alinirdi.
   */
  async recordLogin(identity: FederatedIdentity): Promise<void> {
    const { db } = requireTransaction();

    await db
      .update(federatedIdentities)
      .set({ lastLoginAt: identity.lastLoginAt })
      .where(eq(federatedIdentities.id, identity.id.value));
  }

  async deleteByUserAndProvider(userId: UserId, provider: OAuthProviderKey): Promise<number> {
    const { db } = requireTransaction();

    const deleted = await db
      .delete(federatedIdentities)
      .where(
        and(
          eq(federatedIdentities.userId, userId.value),
          eq(federatedIdentities.provider, provider),
        ),
      )
      .returning({ id: federatedIdentities.id });

    return deleted.length;
  }
}
