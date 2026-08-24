import { Controller, Get, HttpCode, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../authz/authz.public';
import { ListAuditEntriesUseCase } from '../application/list-audit-entries.use-case';
import { AUDIT_READ } from '../audit.permissions';
import { listAuditSchema, type ListAuditQueryDto } from './list-audit.dto';

interface AuditEntryResponse {
  readonly id: string;
  readonly occurredAt: string;
  /** ⚠️ `null` = sistem/worker; sahte bir kullanici uydurulmaz. */
  readonly actorUserId: string | null;
  readonly resourceType: string;
  readonly resourceId: string;
  readonly action: string;
  /** ⚠️ Degisen alanin ADI — DEGERI DEGIL (ADR-0043 §6.5). */
  readonly fieldName: string | null;
}

interface ListAuditResponse {
  readonly items: readonly AuditEntryResponse[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * Denetim kaydi okuma ucu (ADR-0043 §6.4).
 *
 * ============================================================================
 * ⚠️ BU CONTROLLER'DA YAZMA UCU YOKTUR VE OLMAYACAKTIR
 * ============================================================================
 * Denetim kaydini bir KULLANICI yazmaz, bir DEGISIKLIK yazar: yol
 * `shared/audit.port.ts` uzerinden, degisikligi yapan modulun KENDI
 * transaction'i icindedir (§6.4). Bir HTTP yazma ucu, denetim kaydini
 * degisiklikten AYIRIR — yani uydurulabilir yapar.
 *
 * ⚠️ `PATCH`/`DELETE` de yoktur: tablo degismezdir ve veritabani bunu IKI
 * KATMANDA zorlar (yetki + trigger). Uc yazilsaydi 500 alirdi.
 *
 * ============================================================================
 * BU MODULDE EXCEPTION FILTER YOKTUR — ve bu bilinclidir
 * ============================================================================
 * CLAUDE.md'nin kalici kurali (`EmbeddingFailedError`, `RateLimitExceededError`,
 * `CompletionFailedError` her modulun `@Catch` listesine BASTAN eklenir) bir
 * DOMAIN EXCEPTION FILTER'I OLAN modul varsayar ve gerekcesi kurucu kisittir:
 * _"her modul er ya da gec AI'a dokunur — MODULLER HAFIZADIR."_
 *
 * `platform/audit` bir hafiza modulu degil, platform altyapisidir; domain
 * hatasi YOKTUR (dogrulama Zod'da, degismezlik veritabaninda). Platform
 * konvansiyonu da bu yondedir: `health`, `session` ve `authz`in filtresi yok;
 * `context`in var cunku onun domain hatalari VAR.
 *
 * ⚠️ Kural IK MODULUNDE uygulanir (ADR-0043 §9, Slice 2): `HrDomainExceptionFilter`
 * uc AI tipini de ILK GUNDEN tasir. Sessiz bir atlama degil, kaydedilmis bir
 * kapsam karari.
 * ============================================================================
 */
@ApiTags('Audit')
@Controller({ path: 'audit', version: '1' })
export class AuditController {
  constructor(private readonly listAuditEntries: ListAuditEntriesUseCase) {}

  /**
   * Denetim kayitlarini listeler (sayfali, en yeni once).
   *
   * ⚠️ Tenant daraltmasi burada DEGIL, RLS'tedir: sorgu, istegin tenant
   * context'i altinda calisir (MT §11.3). RBAC "ne yapabilir", RLS "hangi
   * tenant" — iki ayri katman.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermission(AUDIT_READ)
  @ApiOperation({
    summary: 'Denetim kayitlarini dondurur (sayfali)',
    description:
      'YETKI: `audit:read` (owner + admin). member/viewer 403 alir. ' +
      'DEGER DONMEZ — yalnizca hangi alanin, ne zaman, kim tarafindan ' +
      'degistirildigi (ADR-0043 §6.5). `actorUserId: null` sistem/worker demektir.',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Denetim kaydi listesi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Yetki yok veya tenant secilmemis.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Sayfalama veya filtre parametreleri gecersiz.',
  })
  async list(
    @Query(new ZodValidationPipe(listAuditSchema)) query: ListAuditQueryDto,
  ): Promise<ListAuditResponse> {
    const page = await this.listAuditEntries.execute({
      resourceType: query.resourceType ?? null,
      resourceId: query.resourceId ?? null,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: page.items.map((item) => ({
        id: item.id,
        // Domain nesnesi ASLA serilestirilmez; Date -> ISO string sinirda cevrilir.
        occurredAt: item.occurredAt.toISOString(),
        actorUserId: item.actorUserId,
        resourceType: item.resourceType,
        resourceId: item.resourceId,
        action: item.action,
        fieldName: item.fieldName,
      })),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }
}
