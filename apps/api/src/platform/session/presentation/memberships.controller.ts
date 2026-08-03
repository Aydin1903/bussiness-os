import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { ListMyMembershipsUseCase } from '../application/list-my-memberships.use-case';
import { listMyMembershipsSchema, type ListMyMembershipsQueryDto } from './list-my-memberships.dto';

interface MyMembershipItemResponse {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly role: string;
  readonly status: string;
}

interface MyMembershipsResponse {
  readonly items: readonly MyMembershipItemResponse[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * `GET /api/v1/me/memberships` — kullanicinin erisebilecegi tenant'lar (ADR-0028).
 *
 * Uc nokta `/me/...` ama controller Identity'de veya Tenant'ta DEGIL: switch-tenant
 * gibi, kimlik oturumunun tenant secim adimini besleyen bir orkestrasyondur ve
 * `platform/session`'da yasar. Tenant verisini YALNIZCA public port'tan
 * (`UserMembershipsQuery`) alir.
 */
@ApiTags('Session')
@Controller({ path: 'me', version: '1' })
export class MembershipsController {
  constructor(private readonly listMyMemberships: ListMyMembershipsUseCase) {}

  /**
   * ============================================================================
   * KIMLIK BAGLAMDAN GELIR, GOVDEDEN/QUERY'DEN DEGIL
   * ============================================================================
   * `userId`, auth middleware'inin DOGRULADIGI kimlik token'indan gelen istek
   * baglamindan okunur. Baglam yoksa istek kimliksizdir -> 401. Bu, "kullanici
   * yalnizca KENDI uyeliklerini gorur" invariantinin uygulama tarafi (ADR-0028):
   * query/govde bir userId KABUL ETMEZ.
   *
   * KIMLIK token'i (tenant claim'siz) veya access token (tenant claim'li) FARK
   * ETMEZ: her ikisi de bir `userId` tasir. Bu uc nokta tenant context GEREKTIRMEZ.
   * ============================================================================
   */
  @Get('memberships')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Kullanicinin erisebilecegi tenant listesini dondurur (sayfali)',
    description:
      'Kimlik token i gerektirir. YALNIZCA switchable tenant lar doner: aktif uyelik ' +
      '+ aktif tenant. Kullanici yalnizca KENDI uyeliklerini gorur.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Uyelik listesi.' })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED, description: 'Kimlik dogrulanmadi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sayfalama parametreleri gecersiz.',
  })
  async list(
    @Query(new ZodValidationPipe(listMyMembershipsSchema)) query: ListMyMembershipsQueryDto,
  ): Promise<MyMembershipsResponse> {
    const principal = getPrincipal();
    if (principal === undefined) {
      throw new UnauthorizedException('Bu islem icin kimlik dogrulamasi gerekiyor.');
    }

    const page = await this.listMyMemberships.execute({
      userId: principal.userId,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: page.items.map(toItemResponse),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}

function toItemResponse(item: {
  readonly tenantId: string;
  readonly tenantName: string;
  readonly tenantSlug: string;
  readonly role: string;
  readonly status: string;
}): MyMembershipItemResponse {
  return {
    tenantId: item.tenantId,
    tenantName: item.tenantName,
    tenantSlug: item.tenantSlug,
    role: item.role,
    status: item.status,
  };
}
