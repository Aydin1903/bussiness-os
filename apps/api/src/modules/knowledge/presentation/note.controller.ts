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
import { CreateNoteUseCase } from '../application/create-note.use-case';
import { KNOWLEDGE_ASK, NOTE_CREATE } from '../knowledge.permissions';
import { askKnowledgeSchema, type AskKnowledgeBody } from './ask-knowledge.dto';
import { createNoteSchema, type CreateNoteBody } from './create-note.dto';
import { KnowledgeDomainExceptionFilter } from './knowledge-domain-exception.filter';

const CREATE_NOTE_DESCRIPTION =
  'Not kaydedilir, ~500 token luk parcalara bolunur ve her parca icin embedding ' +
  'uretilir (senkron). Tenant-scoped access token gerektirir; viewer rolu YAZAMAZ. ' +
  'Indeksleme basarisiz olursa not KORUNUR ve 502 doner.';

interface CreateNoteResponse {
  readonly noteId: string;
  /** Uretilen parca sayisi — indekslemenin gerceklestigini gosterir. */
  readonly chunkCount: number;
}

interface AskKnowledgeResponse {
  readonly answer: string;
  /** Cevabin dayandigi notlar — alaka sirasinda, tekillestirilmis. */
  readonly sourceNoteIds: readonly string[];
  /** Verilen ya da yeni acilan konusma. Istemci sonraki soruda bunu gonderir. */
  readonly conversationId: string;
}

const ASK_DESCRIPTION =
  'Soru embed edilir, tenant in notlarindan en yakin parcalar cekilir ve cevap ' +
  'YALNIZCA o baglamdan uretilir. `conversationId` verilirse son birkac mesaj ' +
  'gecmis olarak eklenir; verilmezse yeni konusma acilir ve id si yanitta doner. ' +
  'Tenant-scoped access token gerektirir; viewer rolu SORAMAZ.';

/**
 * `POST /api/v1/knowledge/notes` — kurumsal hafizaya not ekler (ADR-0029 §4).
 *
 * ============================================================================
 * ZINCIRIN TAMAMI BURADA CALISIR
 * ============================================================================
 *   access token -> tenant context (RLS) -> permission guard -> use case
 *
 * `MembershipController` bu zinciri OKUMA tarafinda ilk kez calistirmisti; bu,
 * YAZMA tarafindaki ilk uygulamasidir ve ayni zamanda `platform` disindaki ilk
 * is modulunun ilk uc noktasidir.
 * ============================================================================
 */
@ApiTags('Knowledge')
@Controller({ path: 'knowledge', version: '1' })
@UseFilters(KnowledgeDomainExceptionFilter)
export class NoteController {
  constructor(
    private readonly createNote: CreateNoteUseCase,
    private readonly askKnowledge: AskKnowledgeUseCase,
  ) {}

  /**
   * Not olusturur ve AI aramasi icin indeksler.
   *
   * `201` doner: kaynak OLUSTU ve kimligi yanittadir. Indeksleme de ayni istek
   * icinde SENKRON tamamlanir (ADR-0029 §4) — `202` yaniltici olurdu, cunku
   * asenkron bir is kuyruga alinmiyor.
   *
   * ============================================================================
   * YETKI KARARI BURADA DEGIL, GUARD'DA
   * ============================================================================
   * `@RequirePermission(NOTE_CREATE)` yalnizca gereksinimi DEKLARE eder. Karari
   * `PermissionGuard` handler'dan once verir: `viewer` rolu istek buraya HIC
   * ulasmadan 403 alir (ADR-0025 §10.1 — controller'da dagitik `if` yasak).
   * ============================================================================
   */
  @Post('notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(NOTE_CREATE)
  @ApiOperation({ summary: 'Kurumsal hafizaya not ekler', description: CREATE_NOTE_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Not olusturuldu ve indekslendi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description:
      'Kimliksiz istek, tenant secilmemis token veya note:create yetkisi olmayan rol. ' +
      'Ucu de 403 uretir: guard handler dan ONCE calisir (tum RBAC korumali uclarda ayni).',
  })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Not kaydedildi ancak indekslenemedi (embedding saglayicisi).',
  })
  async create(
    @Body(new ZodValidationPipe(createNoteSchema)) body: CreateNoteBody,
  ): Promise<CreateNoteResponse> {
    // `tenantId` ve `authorUserId` DOGRULANMIS token'dan gelir; govde ikisini de
    // KABUL ETMEZ (bkz. `create-note.dto.ts`).
    const principal = requireTenantPrincipal();

    const result = await this.createNote.execute({
      tenantId: principal.tenantId,
      authorUserId: principal.userId,
      title: body.title ?? null,
      body: body.body,
    });

    return { noteId: result.noteId, chunkCount: result.chunkCount };
  }

  /**
   * Kurumsal hafizaya soru sorar (ADR-0029 §4 okuma akisi).
   *
   * `200` doner, `201` DEGIL: yeni bir kaynak yaratilmiyor. Konusma ve mesajlar
   * yan etkidir, istegin URUNU degil — urun cevaptir.
   *
   * ⚠️ Bu, projenin EN PAHALI ucudur: her istek 1 embedding + 1 completion
   * cagrisidir. Oran siniri (ADR-0029 §5) AYRI bir slice'tir ve o gelene kadar
   * maliyet korumasi YOKTUR.
   */
  @Post('ask')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(KNOWLEDGE_ASK)
  @ApiOperation({ summary: 'Kurumsal hafizaya soru sorar', description: ASK_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cevap uretildi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'Kimliksiz istek, tenant secilmemis token veya knowledge:ask yetkisi yok.',
  })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
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
    };
  }
}

/**
 * TENANT-SCOPED kimligi dondurur.
 *
 * ⚠️ PRATIKTE ULASILMAZ — ve bu bilincli. `PermissionGuard` handler'dan ONCE
 * calisir ve hem kimliksiz istegi hem tenant secilmemis token'i 403 ile keser
 * (`rbac-memberships` testiyle kayitli davranis). Buradaki kontrol bir
 * SAVUNMA KATMANIDIR: guard bir gun kaldirilir veya `@RequirePermission`
 * unutulursa, `tenantId` null ile devam etmek `MissingTenantContextError` ile
 * 500 uretirdi. Sessiz bir 500 yerine acik bir 401 daha durusttur.
 */
function requireTenantPrincipal(): AuthenticatedPrincipal & { tenantId: string } {
  const principal = getPrincipal();

  // `?.tenantId == null`: hem principal yoklugunu hem tenant claim'inin
  // null'ligini TEK kontrolde kapsar (kimlik token'i tenant tasimaz, ADR-0020).
  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { ...principal, tenantId: principal.tenantId };
}
