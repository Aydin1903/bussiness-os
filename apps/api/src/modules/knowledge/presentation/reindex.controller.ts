import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import {
  getPrincipal,
  type AuthenticatedPrincipal,
} from '../../../infrastructure/auth/auth-context';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { CountUnindexedNotesUseCase } from '../application/count-unindexed-notes.use-case';
import { ReindexNotesUseCase } from '../application/reindex-notes.use-case';
import { NOTE_CREATE, NOTE_READ } from '../knowledge.permissions';
import { KnowledgeDomainExceptionFilter } from './knowledge-domain-exception.filter';

interface UnindexedNotesResponse {
  readonly count: number;
}

interface ReindexNotesResponse {
  readonly repaired: number;
  readonly failed: number;
  /** Onarimdan SONRA hala chunk siz kalan not sayisi. */
  readonly remaining: number;
}

const UNINDEXED_DESCRIPTION =
  'Kac notun ARANAMAZ durumda oldugu (ADR-0029 bilinen sinir): embedding cokerse ' +
  'not kaydedilir ama chunk siz kalir ve AI onu HIC BULAMAZ. Ucuz bir LEFT JOIN ' +
  'sayimi; oran sinirina tabi DEGIL.';

const REINDEX_DESCRIPTION =
  'Chunk siz notlari yeniden indeksler. Tek cagri en fazla ' +
  'KNOWLEDGE_REINDEX_BATCH_SIZE not onarir; `remaining` ile devam edilir. ' +
  'YETKI `note:create`: yazar ve PARA harcar (her not bir veya daha fazla ' +
  'embedding cagrisi). Oran siniri `create_note` kovasini PAYLASIR — ayri bir ' +
  'kova, onarimi butcesiz bir yan kapiya cevirirdi.';

const FORBIDDEN_DESCRIPTION = 'Kimliksiz istek, tenant secilmemis token veya yetkisiz rol.';

const RATE_LIMITED_DESCRIPTION =
  'Saatlik not payi tukendi (ADR-0029 §5). Onarim, not olusturmayla AYNI kovayi kullanir.';

/**
 * Yeniden indeksleme (ADR-0029 bilinen sinir: "chunk siz not").
 *
 * ============================================================================
 * TENANT-SCOPED — 6. DAR ROL YOK
 * ============================================================================
 * Hem tespit hem onarim aktif tenant in verisi uzerindedir; RLS ve
 * `businessos_app` yeter. Tenant lar ARASI otomatik bir supurucu 6. bir dar rol
 * gerektirirdi ve ADR-0030 §2.4 un "ertelenemez genellestirme" kuralini
 * tetiklerdi. Supurucu BILEREK yapilmadi: genellestirme kendi basina bir istir
 * ve bu isin icine gizlenmemeli.
 * ============================================================================
 */
@ApiTags('knowledge')
@Controller({ path: 'knowledge', version: '1' })
@UseFilters(KnowledgeDomainExceptionFilter)
export class ReindexController {
  constructor(
    private readonly countUnindexed: CountUnindexedNotesUseCase,
    private readonly reindexNotes: ReindexNotesUseCase,
  ) {}

  @Get('notes/unindexed')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(NOTE_READ)
  @ApiOperation({ summary: 'Aranamaz not sayisi', description: UNINDEXED_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Sayi dondu.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  async unindexed(): Promise<UnindexedNotesResponse> {
    requireTenantPrincipal();

    return this.countUnindexed.execute();
  }

  /**
   * `200`, `201` DEGIL: yeni bir kaynak olusmuyor, var olan notlar ONARILIYOR.
   * Urun, isin SONUCUDUR (kac onarildi, kac kaldi).
   */
  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(NOTE_CREATE)
  @ApiOperation({
    summary: 'Chunk siz notlari yeniden indeksler',
    description: REINDEX_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim turu tamamlandi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: RATE_LIMITED_DESCRIPTION })
  async reindex(): Promise<ReindexNotesResponse> {
    const principal = requireTenantPrincipal();

    return this.reindexNotes.execute({
      tenantId: principal.tenantId,
      userId: principal.userId,
    });
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler dan ONCE calisir.
 * Savunma katmani (`NoteController` daki ikiziyle ayni gerekce).
 */
function requireTenantPrincipal(): AuthenticatedPrincipal & { tenantId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { ...principal, tenantId: principal.tenantId };
}
