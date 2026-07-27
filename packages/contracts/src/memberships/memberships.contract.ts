import { z } from 'zod';

/**
 * `GET /api/v1/me/memberships` — kullanicinin erisebilecegi tenant'lar.
 *
 * Login sonrasi (yalnizca identity token varken) tenant secim ekranini besler
 * (ADR-0020, ADR-0028). Yalnizca SWITCHABLE tenant'lar doner: aktif uyelik +
 * aktif tenant. Bu yuzden `role` daima gecerli bir rol, `status` daima `active`
 * olur — ama alan, gelecekte filtre gevserse diye acikca tasinir.
 */

/** Rol kumesi domain ile ayni (MT §7.5). */
export const membershipRoleSchema = z.enum(['owner', 'admin', 'member', 'viewer']);
export type MembershipRoleName = z.infer<typeof membershipRoleSchema>;

export const myMembershipItemSchema = z.object({
  tenantId: z.string(),
  tenantName: z.string(),
  tenantSlug: z.string(),
  role: membershipRoleSchema,
  /** Uyelik durumu. Liste yalnizca switchable'lari icerdigi icin V1'de `active`. */
  status: z.string(),
});
export type MyMembershipItem = z.infer<typeof myMembershipItemSchema>;

export const myMembershipsResponseSchema = z.object({
  items: z.array(myMembershipItemSchema),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
});
export type MyMembershipsResponse = z.infer<typeof myMembershipsResponseSchema>;
