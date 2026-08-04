import {
  Body,
  Controller,
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
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { AskKnowledgeUseCase } from '../application/ask-knowledge.use-case';
import { KNOWLEDGE_ASK } from '../knowledge.permissions';
import { askKnowledgeSchema, type AskKnowledgeBody } from './ask-knowledge.dto';
import { KnowledgeDomainExceptionFilter } from './knowledge-domain-exception.filter';

interface AskKnowledgeResponse {
  readonly answer: string;
  /** Cevabin dayandigi notlar — alaka sirasinda, tekillestirilmis. */
  readonly sourceNoteIds: readonly string[];
  /** Verilen ya da yeni acilan konusma. Istemci sonraki soruda bunu gonderir. */
  readonly conversationId: string;
  /** Modelin onerdigi takip sorulari; bos olabilir. */
  readonly followUps: readonly string[];
}

const ASK_DESCRIPTION =
  'Soru embed edilir, tenant in notlarindan en yakin parcalar cekilir ve cevap ' +
  'YALNIZCA o baglamdan uretilir. `conversationId` verilirse son birkac mesaj ' +
  'gecmis olarak eklenir; verilmezse yeni konusma acilir ve id si yanitta doner. ' +
  'Tenant-scoped access token gerektirir; viewer rolu SORAMAZ.';

const FORBIDDEN_DESCRIPTION =
  'Kimliksiz istek, tenant secilmemis token veya knowledge:ask yetkisi yok.';

const RATE_LIMITED_DESCRIPTION =
  'Saatlik soru payi tukendi (ADR-0029 §5). `Retry-After` basligi, pencerenin ' +
  'bitisine kalan saniyeyi tasir. 403 DEGIL: yetki var, pay yok.';

/**
 * Kurumsal hafizaya soru sorma ucu (ADR-0029 §4, ADR-0030 §1).
 *
 * ============================================================================
 * NEDEN `NoteController`'DA DEGIL
 * ============================================================================
 * Kaynak farkli: bu uc bir NOT olusturmaz ya da okumaz, bir KONUSMA yurutur
 * (`conversations` + `messages`) ve farkli bir permission tasir
 * (`knowledge:ask`, `note:*` degil).
 *
 * Ayrilma sinyali somuttu: liste ucu eklenince `NoteController` dorduncu use
 * case'i aldi ve constructor sinirini asti — sinifin iki isi birden yaptiginin
 * isareti. `DailyReportController` ile ayni gerekce ve ayni cozum. Geride kalan
 * `NoteController` uc NOT islemiyle tutarli bir butun.
 *
 * Ayni `@Controller({ path: 'knowledge' })` altinda kalir: modul siniri
 * degismez, yalnizca sinif bolunur.
 * ============================================================================
 */
@ApiTags('knowledge')
@Controller({ path: 'knowledge', version: '1' })
@UseFilters(KnowledgeDomainExceptionFilter)
export class AskController {
  constructor(private readonly askKnowledge: AskKnowledgeUseCase) {}

  /**
   * `200` doner, `201` DEGIL: bir konusma ve iki mesaj yazilsa da bunlar YAN
   * ETKIDIR, istegin URUNU degil — urun cevaptir.
   *
   * ⚠️ Projenin en pahali uclarindan biri: her istek 1 embedding + 1 completion
   * cagrisidir. Maliyet korumasi T0'da saatlik sayac (ADR-0029 §5); asilirsa
   * `429` ve embedding'e HIC gidilmez.
   */
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(KNOWLEDGE_ASK)
  @ApiOperation({ summary: 'Kurumsal hafizaya soru sorar', description: ASK_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cevap uretildi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: RATE_LIMITED_DESCRIPTION })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Embedding veya completion saglayicisi cevap veremedi.',
  })
  async ask(
    @Body(new ZodValidationPipe(askKnowledgeSchema)) body: AskKnowledgeBody,
  ): Promise<AskKnowledgeResponse> {
    const principal = requireTenantPrincipal();

    const result = await this.askKnowledge.execute({
      tenantId: principal.tenantId,
      userId: principal.userId,
      question: body.question,
      conversationId: body.conversationId ?? null,
    });

    return {
      answer: result.answer,
      sourceNoteIds: result.sourceNoteIds,
      conversationId: result.conversationId,
      followUps: result.followUps,
    };
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i 403 ile keser. Buradaki
 * kontrol bir SAVUNMA KATMANIDIR (`NoteController`'daki ikiziyle ayni gerekce).
 */
function requireTenantPrincipal(): AuthenticatedPrincipal & { tenantId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { ...principal, tenantId: principal.tenantId };
}
