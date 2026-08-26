import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UnauthorizedException,
  UseFilters,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

import { getPrincipal } from '../../../infrastructure/auth/auth-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { MarketingUseCases, type CampaignRow } from '../application/marketing.use-cases';
import { type CampaignChanges } from '../domain/campaign.entity';
import { CAMPAIGN_DELETE, CAMPAIGN_READ, CAMPAIGN_WRITE } from '../marketing.permissions';
import { MarketingDomainExceptionFilter } from './marketing-domain-exception.filter';
import {
  createCampaignSchema,
  idParamSchema,
  listCampaignsQuerySchema,
  reindexCampaignsSchema,
  updateCampaignSchema,
  type CreateCampaignBody,
  type ListCampaignsQuery,
  type UpdateCampaignBody,
} from './marketing.dto';

interface CampaignListResponse {
  readonly items: readonly CampaignRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

const REINDEX_DESCRIPTION =
  'Vektoru eksik AMA SONUC NOTU OLAN kampanyalari yeniden gomer — is listesi TURETILMISTIR ' +
  '(`embedding IS NULL AND result_note IS NOT NULL`), ayri bir "onarilacaklar" tablosu YOKTUR. ' +
  '⚠️ Ikinci yuklem SART: sonuc notu olmayan kampanyalar KALICI OLARAK vektorsuzdur ve ' +
  'suzulmeselerdi onarim yuvalarini kalici olarak isgal ederlerdi. ' +
  '⚠️ ISI IKI KATLIDIR (ADR-0047 §8): (a) ilk gomme sirasinda cokenler, ' +
  '(b) GUNCELLEME sirasinda vektoru NULL"a cekilenler (§4.2.1). ' +
  'Oran siniri yazma yoluyla AYNI kovayi PAYLASIR.';

@ApiTags('marketing')
@Controller({ path: 'campaigns', version: '1' })
@UseFilters(MarketingDomainExceptionFilter)
export class MarketingController {
  constructor(private readonly useCases: MarketingUseCases) {}

  /**
   * ⚠️ SABIT YOL `:id`DEN ONCE — ADR-0040'in ROTA GOLGELEME dersi.
   *
   * `reindex` bir UUID sanilsaydi 422 donerdi ve HICBIR TEST KIRMIZI YANMAZDI.
   */
  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(CAMPAIGN_WRITE)
  @ApiOperation({ summary: 'Kampanya vektorlerini onarir', description: REINDEX_DESCRIPTION })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim tamamlandi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async reindex(
    @Body(new ZodValidationPipe(reindexCampaignsSchema)) _body: unknown,
  ): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();
    return this.useCases.reindex({ tenantId: principal.tenantId, userId: principal.userId });
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(CAMPAIGN_WRITE)
  @ApiOperation({ summary: 'Kampanya kaydeder (sonuc notu varsa gomer)' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Kampanya kaydedildi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'Ad bos, tarih gecersiz/ters, durum tanimsiz ya da sonuc notu sinir disi ' +
      '(SESSIZ KIRPMA YOK).',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Bagli musteri sirketi bulunamadi (ya da company:read yok).',
  })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description:
      'Kayit KAYDEDILDI ancak indekslenemedi; govde acikca soyler ve /campaigns/reindex onarir.',
  })
  async create(
    @Body(new ZodValidationPipe(createCampaignSchema)) body: CreateCampaignBody,
  ): Promise<CampaignRow> {
    const principal = requireTenantPrincipal();
    return this.useCases.createCampaign({
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: principal.role,
      name: body.name,
      channel: body.channel ?? null,
      startsOn: body.startsOn,
      endsOn: body.endsOn ?? null,
      status: body.status,
      resultNote: body.resultNote ?? null,
      crmCompanyId: body.crmCompanyId ?? null,
    });
  }

  @Get()
  @RequirePermission(CAMPAIGN_READ)
  @ApiOperation({ summary: 'Kampanyalari listeler (en yeni once, durum filtresi)' })
  async list(
    @Query(new ZodValidationPipe(listCampaignsQuerySchema)) query: ListCampaignsQuery,
  ): Promise<CampaignListResponse> {
    const principal = requireTenantPrincipal();
    const page = await this.useCases.listCampaigns({
      limit: query.limit,
      offset: query.offset,
      status: query.status ?? null,
      role: principal.role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get(':id')
  @RequirePermission(CAMPAIGN_READ)
  @ApiOperation({ summary: 'Tek kampanya' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kampanya bulunamadi.' })
  async get(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<CampaignRow> {
    const principal = requireTenantPrincipal();
    return this.useCases.getCampaign({ id: params.id, role: principal.role });
  }

  /**
   * ⚠️ HER DURUMDA GUNCELLENEBILIR — `done` DAHIL (ADR-0047 §2.2).
   *
   * ⚠️ Burada bir "gonderildikten sonra 409" YOKTUR ve bu, Teklif/Fatura'dan
   * bilincli sapmadir: sonuc notu tanimi geregi kampanya BITTIKTEN SONRA
   * yazilir. Kilit olsaydi kullanici kampanyayi yapay olarak `active` tutardi
   * — yani DURUM YALAN SOYLERDI.
   */
  @Patch(':id')
  @RequirePermission(CAMPAIGN_WRITE)
  @ApiOperation({
    summary: 'Kampanyayi gunceller',
    description:
      '⚠️ Yeniden gomme KOSULLUDUR (ADR-0047 §4.2): yalnizca gomulen bir alan ' +
      '(`name`, `channel`, tarihler, `resultNote`) degistiginde saglayici cagrilir ve ' +
      'oran siniri TUKETILIR. Yalnizca `status` / `crmCompanyId` degistiren bir istek ' +
      'SAYAC TUKETMEZ. ⚠️ Gomme cokerse kayit DURUR ama vektor NULL"a CEKILIR — bayat bir ' +
      'vektor DOLU gorunur, `reindex` onu bulamaz ve /ask ESKI ICERIKLE cevap verirdi.',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kampanya bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.BAD_GATEWAY,
    description: 'Kayit GUNCELLENDI ancak yeniden indekslenemedi; vektor NULL"a cekildi.',
  })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateCampaignSchema)) body: UpdateCampaignBody,
  ): Promise<CampaignRow> {
    const principal = requireTenantPrincipal();
    return this.useCases.updateCampaign({
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: principal.role,
      id: params.id,
      changes: toChanges(body),
    });
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(CAMPAIGN_DELETE)
  @ApiOperation({
    summary: 'Kampanyayi siler',
    description:
      '⚠️ GERI ALINAMAZ ve kampanyanin gecmisini TUMUYLE kaldirir; bu yuzden izin DARDIR ' +
      '(owner/admin). ⚠️ Iptal edilen bir kampanyanin yolu da budur — `cancelled` diye bir ' +
      'durum YOKTUR, cunku iptal edilen kampanya YAPILMAMIS kampanyadir.',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Kampanya bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'campaign:delete yalnizca owner/admin.',
  })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.deleteCampaign(params.id);
  }
}

/**
 * Zod govdesini domain'in `CampaignChanges` sekline cevirir.
 *
 * ============================================================================
 * ⚠️ NEDEN BIR YAYMA (`...body`) YETMIYOR — VE BU AYRIM ANLAM TASIYOR
 * ============================================================================
 * `exactOptionalPropertyTypes` acik oldugu icin TypeScript "alan YOK" ile
 * "alan var ama `undefined`" arasindaki farki KORUR — ve bu modulde o fark
 * GERCEK BIR ANLAMDIR:
 *
 *   alan YOK        -> ⚠️ DEGISTIRME  (mevcut deger korunur)
 *   alan `null`     -> ⚠️ TEMIZLE     (`endsOn: null` = acik uclu kampanya,
 *                                      `resultNote: null` = notu sil)
 *
 * Duz bir yayma ikisini `undefined`da birlestirirdi ve `entity.update` "bu
 * alan gonderilmedi" diye okurdu: ⚠️ kullanici bir sonuc notunu SILEMEZDI ve
 * hata SESSIZ olurdu — istek 200 doner, alan degismezdi.
 */
function toChanges(body: UpdateCampaignBody): CampaignChanges {
  const changes: {
    -readonly [K in keyof CampaignChanges]: CampaignChanges[K];
  } = {};

  if (body.name !== undefined) changes.name = body.name;
  if (body.channel !== undefined) changes.channel = body.channel;
  if (body.startsOn !== undefined) changes.startsOn = body.startsOn;
  if (body.endsOn !== undefined) changes.endsOn = body.endsOn;
  if (body.status !== undefined) changes.status = body.status;
  if (body.resultNote !== undefined) changes.resultNote = body.resultNote;
  if (body.crmCompanyId !== undefined) changes.crmCompanyId = body.crmCompanyId;

  return changes;
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir. Savunma
 * katmani.
 *
 * ⚠️ ROL DE OKUNUYOR: rol bir CROSS-MODUL DIZINE (`CompanyDirectory`)
 * gecirilir ve izin kapisi o dizinin ICINDE calisir (Projeler, Finans, Belge
 * ve Geri Bildirim'in ayni deseni).
 */
function requireTenantPrincipal(): { tenantId: string; userId: string; role: string } {
  const principal = getPrincipal();
  const role = getTenantContext()?.role;

  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId, role };
}
