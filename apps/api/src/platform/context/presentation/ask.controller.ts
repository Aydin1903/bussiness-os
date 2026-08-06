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
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { RequirePermission } from '../../authz/authz.public';
import { AskUseCase, type AnswerSource } from '../application/ask.use-case';
import { CONTEXT_ASK } from '../context.permissions';
import { askSchema, type AskBody } from './ask.dto';
import { ContextDomainExceptionFilter } from './context-domain-exception.filter';

interface AskResponse {
  readonly answer: string;
  /**
   * Cevabin dayandigi kaynaklar — alaka sirasinda, tekillestirilmis.
   *
   * `sourceNoteIds` DEGIL (ADR-0031 §5.1): uc artik platformundur ve gelen
   * referans bir not olmak zorunda degil.
   */
  readonly sources: readonly AnswerSource[];
  /** Verilen ya da yeni acilan konusma. Istemci sonraki soruda bunu gonderir. */
  readonly conversationId: string;
  /** Modelin onerdigi takip sorulari; bos olabilir. */
  readonly followUps: readonly string[];
  /**
   * Cagrilip HATA VEREN kaynaklar. Izni olmadigi icin ELENEN kaynak buraya
   * GIRMEZ (ADR-0031 §5.5) — "alamadik" ile "goremezsin" ayri seylerdir.
   */
  readonly degradedSources: readonly string[];
}

const ASK_DESCRIPTION =
  'Soru BIR KEZ embed edilir, kayitli TUM katkicilara (bugun: knowledge) sorulur ve cevap ' +
  'YALNIZCA birlesik baglamdan uretilir. Katkicilar cagiranin IZINLERINE gore elenir. ' +
  'gecmis olarak eklenir; verilmezse yeni konusma acilir ve id si yanitta doner. ' +
  'Tenant-scoped access token gerektirir; viewer rolu SORAMAZ.';

const FORBIDDEN_DESCRIPTION =
  'Kimliksiz istek, tenant secilmemis token veya context:ask yetkisi yok.';

const RATE_LIMITED_DESCRIPTION =
  'Saatlik soru payi tukendi (ADR-0029 §5). `Retry-After` basligi, pencerenin ' +
  'bitisine kalan saniyeyi tasir. 403 DEGIL: yetki var, pay yok.';

/**
 * Kurumsal hafizaya soru sorma ucu — TEK uc, TUM moduller (ADR-0031 §5.2).
 *
 * ============================================================================
 * NEDEN `knowledge` ALTINDA DEGIL
 * ============================================================================
 * `POST /knowledge/ask` -> `POST /ask` (breaking change, Product Owner onayi).
 * Uc artik hicbir modulun altinda degil: cevabi TUM kayitli katkicilarin
 * katkisindan uretiyor. `knowledge` onekinde birakmak, CRM'in gorusmelerinden
 * gelen bir cevabi "knowledge" yolundan dondurmek olurdu.
 *
 * Iki uc BIRDEN tutulmadi: ayni isi yapan iki uc, her yeni modulde "hangisini
 * cagiracagim" sorusunu dogururdu.
 * ============================================================================
 */
@ApiTags('context')
@Controller({ version: '1' })
@UseFilters(ContextDomainExceptionFilter)
export class AskController {
  constructor(private readonly askUseCase: AskUseCase) {}

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
  @RequirePermission(CONTEXT_ASK)
  @ApiOperation({ summary: 'Kurumsal hafizaya soru sorar', description: ASK_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Cevap uretildi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: FORBIDDEN_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecerli degil.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: RATE_LIMITED_DESCRIPTION })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Embedding veya completion saglayicisi cevap veremedi.',
  })
  async ask(@Body(new ZodValidationPipe(askSchema)) body: AskBody): Promise<AskResponse> {
    const principal = requireTenantPrincipal();

    const result = await this.askUseCase.execute({
      tenantId: principal.tenantId,
      userId: principal.userId,
      // Rol TOKEN'DAN DEGIL, tenant context'ten okunur (AUTH §10.3, P3):
      // token bir IDDIA tasir, YETKI degil. Katkici elemesi buna dayanir.
      role: getTenantContext()?.role ?? '',
      question: body.question,
      conversationId: body.conversationId ?? null,
    });

    return {
      answer: result.answer,
      sources: result.sources,
      conversationId: result.conversationId,
      followUps: result.followUps,
      degradedSources: result.degradedSources,
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
