import {
  type UserMembershipsPage,
  type UserMembershipsQuery,
} from '../../../modules/tenant/tenant.public';

/**
 * "Hangi tenant'lara uyeyim" — kimlik oturumunun tenant secim adimini besler
 * (ADR-0028, ADR-0020 iki asamali token).
 *
 * switch-tenant ile ayni yerde (platform/session) yasar ve ayni desendedir:
 * Tenant'i YALNIZCA public port'undan (`UserMembershipsQuery`) tuketir; ic
 * import yoktur. Use case INCEDIR — karar (hangi uyelikler switchable) Tenant'a
 * aittir; burasi yalnizca dogrulanmis `userId`'yi gecirir.
 *
 * `userId` istek govdesinden DEGIL, auth middleware'inin dogruladigi kimlik
 * token'indan gelir (controller) — kullanici yalnizca KENDI uyeliklerini gorur.
 */
export interface ListMyMembershipsInput {
  readonly userId: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ListMyMembershipsDependencies {
  readonly userMembershipsQuery: UserMembershipsQuery;
}

export class ListMyMembershipsUseCase {
  constructor(private readonly deps: ListMyMembershipsDependencies) {}

  async execute(input: ListMyMembershipsInput): Promise<UserMembershipsPage> {
    return this.deps.userMembershipsQuery.listForUser({
      userId: input.userId,
      limit: input.limit,
      offset: input.offset,
    });
  }
}
