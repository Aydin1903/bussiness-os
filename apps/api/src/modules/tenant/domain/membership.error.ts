import { TenantDomainError } from './tenant.error';

/**
 * Membership domain hatalari.
 *
 * `TenantDomainError` tabanini paylasirlar cunku Membership, Tenant modulunun
 * icindeki bir kavramdir (ADR-0014: uyelik tenant-scoped'tur).
 */

export class InvalidMembershipIdError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_ID_INVALID';

  constructor(value: string) {
    super(`Membership id'si gecerli bir UUIDv7 degil: "${value}"`);
  }
}

export class InvalidMembershipRoleError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_ROLE_INVALID';

  constructor(value: string) {
    super(`"${value}" gecerli bir uyelik rolu degil.`);
  }
}

export class InvalidMembershipStatusError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_STATUS_INVALID';

  constructor(value: string) {
    super(`"${value}" gecerli bir uyelik durumu degil.`);
  }
}

export class InvalidMembershipStatusTransitionError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_STATUS_TRANSITION_INVALID';

  constructor(
    readonly from: string,
    readonly to: string,
  ) {
    super(
      `Uyelik durumu "${from}" -> "${to}" gecisi tanimli degil ` +
        '(MULTI_TENANT_ARCHITECTURE 7.2).',
    );
  }
}

/**
 * `owner` sistem rolune dokunulmaya calisildi.
 *
 * ADR-0014 ve MULTI_TENANT_ARCHITECTURE 7.5: `owner` bir invariant olarak
 * korunur — yalnizca bir DB kisiti degil, VO/entity seviyesinde bir IS
 * KURALIDIR ve veritabanina ulasmadan once uygulanir.
 */
export class OwnerMembershipProtectedError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_OWNER_PROTECTED';

  constructor(operation: string) {
    super(
      `owner rolundeki uyelik uzerinde "${operation}" islemi yapilamaz: ` +
        'tenant sahipsiz kalirdi (ADR-0016). Sahiplik devri ayri ve acik bir islemdir.',
    );
  }
}

export class InconsistentMembershipStateError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_STATE_INCONSISTENT';

  constructor(reason: string) {
    super(`Kalici kayittaki uyelik durumu tutarsiz: ${reason}`);
  }
}

export class InvalidJoinedAtError extends TenantDomainError {
  readonly code = 'MEMBERSHIP_JOINED_AT_INVALID';

  constructor(reason: string) {
    super(`Uyelige katilma zamani gecersiz: ${reason}`);
  }
}
