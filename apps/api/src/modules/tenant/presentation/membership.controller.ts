import { Controller, Get, HttpCode, HttpStatus, Query, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { ListMembershipsUseCase } from '../application/list-memberships.use-case';
import { MEMBER_READ } from '../tenant.permissions';
import { listMembershipsSchema, type ListMembershipsQueryDto } from './list-memberships.dto';
import { TenantDomainExceptionFilter } from './tenant-domain-exception.filter';

interface MembershipItemResponse {
  readonly userId: string;
  readonly role: string;
  readonly status: string;
  readonly joinedAt: string | null;
}

interface ListMembershipsResponse {
  readonly items: readonly MembershipItemResponse[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Tenant uyelik listesi — ilk RBAC korumali uc nokta (ADR-0025).
 *
 * Zincirin TAMAMINI ilk kez bir HTTP tuketicisiyle calistirir:
 *   access token -> tenant context (RLS) -> yetki guard -> sorgu.
 */
@ApiTags('Memberships')
@Controller({ path: 'memberships', version: '1' })
@UseFilters(TenantDomainExceptionFilter)
export class MembershipController {
  constructor(private readonly listMemberships: ListMembershipsUseCase) {}

  /**
   * Mevcut tenant'in uye listesi (sayfali).
   *
   * ============================================================================
   * YETKI KARARI BURADA DEGIL, GUARD'DA
   * ============================================================================
   * `@RequirePermission(MEMBER_READ)` yalnizca gereksinimi DEKLARE eder. Karari
   * `PermissionGuard` handler'dan once verir: rol `member:read` tasimiyorsa
   * (member/viewer) istek buraya HIC ulasmaz, 403 alir. Controller'da `if
   * (role...)` YAZILMAZ (§10.1).
   *
   * Tenant hangi tenant oldugu da burada belirlenmez: RLS, tenant context'ten
   * gelen `tenantId` ile listeyi zaten daraltir (MT §11.3). RBAC "ne yapabilir",
   * RLS "hangi tenant" — iki ayri katman.
   * ============================================================================
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission(MEMBER_READ)
  @ApiOperation({
    summary: 'Tenant uye listesini dondurur (sayfali)',
    description:
      'YETKI: `member:read` (owner + admin). member/viewer 403 alir. ' +
      'Liste, oturumun tenant context i ile RLS tarafindan daraltilir.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Uye listesi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Yetki yok veya tenant secilmemis.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sayfalama parametreleri gecersiz.',
  })
  async list(
    @Query(new ZodValidationPipe(listMembershipsSchema)) query: ListMembershipsQueryDto,
  ): Promise<ListMembershipsResponse> {
    const result = await this.listMemberships.execute({ limit: query.limit, offset: query.offset });

    return {
      items: result.items.map((item) => ({
        userId: item.userId,
        role: item.role,
        status: item.status,
        // Domain nesnesi ASLA serilestirilmez; Date -> ISO string sinirda cevrilir.
        joinedAt: item.joinedAt === null ? null : item.joinedAt.toISOString(),
      })),
      total: result.total,
      limit: result.limit,
      offset: result.offset,
    };
  }
}
