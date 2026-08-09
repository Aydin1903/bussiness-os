import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import {
  CompanySummaryUseCases,
  type CompanySummaryView,
  type GenerateSummaryResult,
} from '../application/company-summary.use-cases';
import { COMPANY_SUMMARIZE, INTERACTION_READ } from '../crm.permissions';
import { companyIdParamSchema } from './crm.dto';
import { CrmDomainExceptionFilter } from './crm-domain-exception.filter';

const GET_DESCRIPTION =
  'Onbellekten okur. MODEL CAGRILMAZ ve oran sinirina TABI DEGILDIR — sayfa her ' +
  'acildiginda calisir; ucretli olsaydi musteri sayfasina bakmak para harcamak ' +
  'olurdu. `stale` alani, ozetin uretildiginden bu yana kaynaklarin degisip ' +
  'degismedigini soyler.';

const POST_DESCRIPTION =
  'Ozeti uretir. UC FREN sirayla calisir: (1) oran siniri, (2) ISRAF FRENI — ' +
  'kaynaklarin imzasi degismediyse model HIC cagrilmaz ve `regenerated: false` ' +
  'doner, (3) baglam tavani. Es zamanli ikinci istek claim alamaz ve 409 alir.';

/**
 * Musteri ozeti uclari (ADR-0032).
 *
 * ============================================================================
 * ⚠️ GET'IN IZNI `interaction:read` — `company:read` DEGIL
 * ============================================================================
 * Ozet metni GORUSME ICERIGINDEN turer. Sizdirabilecegi sey sirket kartindaki
 * telefon numarasi degil, gorusme notlarinin ozetidir — dolayisiyla korunmasi
 * gereken izin de odur. ADR-0031 §3'un guvenlik ekseninin aynisi: birlesik bir
 * metin, kullanicinin goremedigi bir kaydin icerigini ozet uzerinden sizdiran
 * bir yan kapi olmamali.
 *
 * BILINEN TEORIK BOSLUK (ADR-0032 §6): `@RequirePermission` TEK bir izin alir,
 * yani "company:read VE interaction:read" ifade EDILEMEZ. Bugun bu bir sorun
 * degil — dort rolun dordu de ikisini birden tasiyor, yani kumeler ozdes.
 * Iki kume ilk kez ayrildiginda coklu-izin decorator'u gerekecek ve o
 * `platform/authz`'a ait bir karardir; CRM'de tek tarafli cozulmedi.
 * ============================================================================
 */
@ApiTags('crm')
@Controller({ path: 'crm/companies', version: '1' })
@UseFilters(CrmDomainExceptionFilter)
export class CompanySummaryController {
  constructor(private readonly useCases: CompanySummaryUseCases) {}

  @Get(':companyId/summary')
  @RequirePermission(INTERACTION_READ)
  @ApiOperation({ summary: 'Musteri ozetini onbellekten okur', description: GET_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ozet (uretilmemisse `summary: null`).' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sirket bulunamadi.' })
  async get(
    @Param('companyId', new ZodValidationPipe(companyIdParamSchema)) companyId: string,
  ): Promise<CompanySummaryView> {
    return this.useCases.get(companyId);
  }

  @Post(':companyId/summary')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(COMPANY_SUMMARIZE)
  @ApiOperation({ summary: 'Musteri ozetini uretir', description: POST_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ozet uretildi ya da zaten gunceldi.' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Sirket bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'Bu musterinin ozeti SU AN baska bir istek tarafindan uretiliyor.',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Ozetlenecek gorusme yok — model cagrilmaz.',
  })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik ozet payi tukendi.' })
  @ApiResponse({ status: HttpStatus.BAD_GATEWAY, description: 'Saglayici cevap veremedi.' })
  async generate(
    @Param('companyId', new ZodValidationPipe(companyIdParamSchema)) companyId: string,
  ): Promise<GenerateSummaryResult> {
    const principal = requireTenantPrincipal();

    return this.useCases.generate({
      tenantId: principal.tenantId,
      userId: principal.userId,
      companyId,
    });
  }
}

/**
 * Savunma katmani; guard zaten handler'dan once keser.
 *
 * `interaction.controller.ts`'teki ile AYNI yardimci. Kopyalandi cunku o
 * dosyada modul-ozel bir yerel fonksiyondur ve disari acilmamistir; ortak bir
 * yere cikarmak istenmeyen bir refactor olurdu (CLAUDE.md kural 2). Ucuncu
 * tekrarda cikarilmali.
 */
function requireTenantPrincipal(): AuthenticatedPrincipal & { tenantId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { ...principal, tenantId: principal.tenantId };
}
