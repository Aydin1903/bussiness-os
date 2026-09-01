import { isOAuthProviderKey, type OAuthProviderKey } from '../../../shared/oauth-provider.port';
import { UserId } from '../../../shared/user-id.value-object';
import { Email } from '../domain/email.value-object';
import { FederatedIdentity } from '../domain/federated-identity.entity';
import { FederatedIdentityId } from '../domain/federated-identity-id.value-object';
import { InvalidProviderSubjectError } from '../domain/identity.error';
import { ProviderSubject } from '../domain/provider-subject.value-object';

/** `platform.federated_identities` satirinin ham bicimi. */
export interface FederatedIdentityRow {
  readonly id: string;
  readonly userId: string;
  readonly provider: string;
  readonly providerSubject: string;
  readonly emailAtLink: string | null;
  readonly linkedAt: Date;
  readonly lastLoginAt: Date | null;
}

/**
 * Satiri entity'ye cevirir.
 *
 * ⚠️ `provider` SINIRDA DARALTILIR: kolon `text`tir ve veritabani CHECK'i
 * (`0040`) onu bagliyor olsa da, bir migration'in yanlis uygulandigi ya da
 * kisitin dusuruldugu bir dunyada bozuk bir deger entity'ye ULASMAMALIDIR.
 * Ayni disiplin `toCredential`in `PasswordHash.fromHash`i icin de gecerlidir.
 */
export function toFederatedIdentity(row: FederatedIdentityRow): FederatedIdentity {
  return FederatedIdentity.fromPersistence({
    id: FederatedIdentityId.create(row.id),
    userId: UserId.create(row.userId),
    provider: toProviderKey(row.provider),
    subject: ProviderSubject.create(row.providerSubject),
    emailAtLink: row.emailAtLink === null ? null : Email.create(row.emailAtLink),
    linkedAt: row.linkedAt,
    lastLoginAt: row.lastLoginAt,
  });
}

export function toFederatedIdentityRow(identity: FederatedIdentity): FederatedIdentityRow {
  return {
    id: identity.id.value,
    userId: identity.userId.value,
    provider: identity.provider,
    providerSubject: identity.subject.value,
    emailAtLink: identity.emailAtLink?.value ?? null,
    linkedAt: identity.linkedAt,
    lastLoginAt: identity.lastLoginAt,
  };
}

function toProviderKey(value: string): OAuthProviderKey {
  if (!isOAuthProviderKey(value)) {
    // ⚠️ DEGERI mesaja koymak burada GUVENLIDIR (bir `sub` degil, bir sozluk
    // degeri) ve teshis icin gereklidir: hangi yabanci degerin geldigini
    // bilmeden migration ile kod arasindaki ayrisma bulunamaz.
    throw new InvalidProviderSubjectError(`bilinmeyen saglayici: "${value}"`);
  }
  return value;
}
