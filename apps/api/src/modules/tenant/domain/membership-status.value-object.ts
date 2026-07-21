import {
  InvalidMembershipStatusError,
  InvalidMembershipStatusTransitionError,
} from './membership.error';

/**
 * Uyelik yasam dongusu durumlari (MULTI_TENANT_ARCHITECTURE 7.2).
 *
 * KRITIK: yalnizca `active` erisim verir. `invited`, `suspended` ve `revoked`
 * erisim acisindan ESDEGERDIR — ucunde de erisim sifirdir.
 */
export const MEMBERSHIP_STATUSES = ['invited', 'active', 'suspended', 'revoked'] as const;

export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

/**
 * Izin verilen gecisler — MULTI_TENANT_ARCHITECTURE 7.2 state diagram'inin
 * karsiligi.
 *
 * `revoked -> invited` (dogrudan `active` DEGIL): uyeligi iptal edilmis biri
 * yeniden davet edildiginde daveti KABUL ETMEK zorundadir. Dogrudan
 * aktiflestirmek, kullanicinin onayi olmadan ona erisim vermek olurdu ve
 * DEVELOPMENT_RULES 8'in "erisim acikca verilir" ilkesini ihlal ederdi.
 *
 * `invited -> revoked`: davet suresi doldugunda veya iptal edildiginde. Kayit
 * SILINMEZ — denetim izi korunur (7.2).
 */
const ALLOWED_TRANSITIONS: Readonly<Record<MembershipStatus, readonly MembershipStatus[]>> = {
  invited: ['active', 'revoked'],
  active: ['suspended', 'revoked'],
  suspended: ['active', 'revoked'],
  revoked: ['invited'],
};

export function parseMembershipStatus(value: string): MembershipStatus {
  const match = MEMBERSHIP_STATUSES.find((status) => status === value);
  if (match === undefined) {
    throw new InvalidMembershipStatusError(value);
  }
  return match;
}

/** Yalnizca `active` uyelik veri erisimine izin verir. */
export function grantsAccess(status: MembershipStatus): boolean {
  return status === 'active';
}

export function canTransition(from: MembershipStatus, to: MembershipStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: MembershipStatus, to: MembershipStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidMembershipStatusTransitionError(from, to);
  }
}

export function allowedTransitionsFrom(from: MembershipStatus): readonly MembershipStatus[] {
  return ALLOWED_TRANSITIONS[from];
}
