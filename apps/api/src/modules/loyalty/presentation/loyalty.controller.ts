import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import {
  LoyaltyUseCases,
  type LoyaltyAccountRow,
  type LoyaltySummary,
} from '../application/loyalty.use-cases';
import { type PointEntryState } from '../domain/point-entry.entity';
import {
  LOYALTY_ACCOUNT_CREATE,
  LOYALTY_ACCOUNT_DELETE,
  LOYALTY_ACCOUNT_READ,
  LOYALTY_POINT_CREATE,
  LOYALTY_POINT_READ,
} from '../loyalty.permissions';
import { LoyaltyDomainExceptionFilter } from './loyalty-domain-exception.filter';
import {
  createAccountSchema,
  createEntrySchema,
  idParamSchema,
  listQuerySchema,
  type CreateAccountBody,
  type CreateEntryBody,
  type ListQuery,
} from './loyalty.dto';

interface Paged<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

/**
 * ⚠️ `PATCH` UCU YOKTUR — ve bu, degistirilemezligin HTTP YUZEYINDEKI
 * gorunumudur (ADR-0051 §2.2).
 *
 * Hesabin guncellenebilir alani yoktur (`crm_contact_id`yi degistirmek BIR
 * BAKIYEYI BASKA BIR INSANA DEVRETMEKTIR) ve defter ekleme-yalnizdir. Bir
 * `PATCH` ucu yazmak, OLMAYAN BIR YOLUN VAR OLDUGUNU ima ederdi —
 * `feedback`in ayni karari, ikinci kez.
 */
@ApiTags('loyalty')
@Controller({ path: 'loyalty', version: '1' })
@UseFilters(LoyaltyDomainExceptionFilter)
export class LoyaltyController {
  constructor(private readonly useCases: LoyaltyUseCases) {}

  /**
   * ⚠️ SABIT YOL — ve burada bir ROTA GOLGELEME riski YOKTUR (ADR-0040'in
   * dersi yine de uygulaniyor).
   *
   * `summary` `/loyalty/` altindadir, `/loyalty/accounts/` altinda DEGIL —
   * yani `:id` ile hicbir kosulda carpismaz. Sira yine de sabit-once
   * yazilmistir ve kapanis denetiminde GERCEK ISTEKLERLE sinanir: bir
   * golgelenme olsaydi `summary` bir UUID sanilir, **422** donerdi ve HICBIR
   * TEST KIRMIZI YANMAZDI.
   */
  @Get('summary')
  @RequirePermission(LOYALTY_ACCOUNT_READ)
  @ApiOperation({
    summary: 'Duvarin ozeti — dolasimdaki toplam puan, hesap sayisi, son 30 gun',
    description:
      'Toplama SQL"de yapilir; istemci satirlari toplamaz. ⚠️ `windowDays` SUNUCUDAN doner — ' +
      'arayuz "son 30 gunde" metnini kendi yazmaz. ⚠️ `outstandingPoints` PROJEDE ILK KEZ ' +
      'ANLAMLI BIR TOPLAMDIR: ADR-0034"un para birimi ve ADR-0039"un birim kurali burada ' +
      'TETIKLENMEZ (puanin para birimi yoktur, tek bir birim vardir). ⚠️ Yine de bir PARA ' +
      'rakami DEGILDIR — puanin karsiligi girilmedigi surece bir TL degeri ifade etmez.',
  })
  async summary(): Promise<LoyaltySummary> {
    requireTenantPrincipal();
    return this.useCases.getSummary();
  }

  @Post('accounts')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(LOYALTY_ACCOUNT_CREATE)
  @ApiOperation({
    summary: 'Musteriye sadakat hesabi acar',
    description:
      '⚠️ `crmContactId` ZORUNLUDUR (ADR-0051 §6.1) — projede ILK zorunlu cross-modul ' +
      'isaretcisi. Bes modulde "zorunluluk sahte kayit uretir" dersi burada TERS ISLER: bir ' +
      'isletme puan verdigi kisiyi ZATEN tanimak zorundadir. ⚠️ Kisi gorunmuyorsa 422 ve ' +
      'uc durum AYIRT EDILMEZ (silinmis / baska tenant / contact:read yok). ' +
      '⚠️ Hesap ILK PUANDA OTOMATIK ACILMAZ: yanlis bir contactId hayalet hesap yaratirdi.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Hesap acildi.' })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      '⚠️ Bu musterinin zaten bir hesabi var. Bu modulde 409 VARDIR (Kampanya ve Geri ' +
      'Bildirim"den ayrildigimiz nokta): ikinci bir hesap bakiyeyi IKIYE BOLER ve hata ' +
      'SESSIZ olurdu.',
  })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Musteri bulunamadi.' })
  async createAccount(
    @Body(new ZodValidationPipe(createAccountSchema)) body: CreateAccountBody,
  ): Promise<LoyaltyAccountRow> {
    const principal = requireTenantPrincipal();
    return this.useCases.createAccount({
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: principal.role,
      crmContactId: body.crmContactId,
    });
  }

  @Get('accounts')
  @RequirePermission(LOYALTY_ACCOUNT_READ)
  @ApiOperation({
    summary: 'Sadakat hesaplarini listeler (bakiyeleriyle)',
    description:
      '⚠️ Bakiye SAKLANMAZ, TURETILIR (`balance` kolonu YOKTUR — ADR-0051 §4.1) ve TEK bir ' +
      '`LEFT JOIN` + `GROUP BY` ile hesaplanir: hesap basina ayri sorgu (N+1) YOK, ' +
      '⚠️ projeksiyona gomulu korelasyonlu alt sorgu da YOK — ADR-0037"nin kapanis denetimi ' +
      'oyle bir alt sorgunun HATA VERMEDIGINI ve HER ZAMAN 0 dondurdugunu bulmustu.',
  })
  async listAccounts(
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Paged<LoyaltyAccountRow>> {
    const principal = requireTenantPrincipal();
    const page = await this.useCases.listAccounts({
      limit: query.limit,
      offset: query.offset,
      role: principal.role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  @Get('accounts/:id')
  @RequirePermission(LOYALTY_ACCOUNT_READ)
  @ApiOperation({ summary: 'Tek hesap (bakiyesiyle)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Hesap bulunamadi.' })
  async getAccount(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<LoyaltyAccountRow> {
    const principal = requireTenantPrincipal();
    return this.useCases.getAccount({ id: params.id, role: principal.role });
  }

  @Delete('accounts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(LOYALTY_ACCOUNT_DELETE)
  @ApiOperation({
    summary: 'Hesabi siler — DEFTER DE GIDER',
    description:
      '⚠️ GERI ALINAMAZ; bu yuzden izin DARDIR (owner/admin). ⚠️ Tek bir puan satirini silmek ' +
      'MUMKUN DEGILDIR (`loyalty_point:delete` diye bir izin yoktur) cunku o, bugunku ' +
      'bakiyeyi SESSIZCE YENIDEN YAZARDI. Hesabin tamamini silmek ise bakiyeyi yeniden ' +
      'yazmaz, YOK EDER. ⚠️ Ve silme yolunun VAR OLMASI bir kolaylik degil bir ' +
      'YUKUMLULUKTUR: hesap bir KISIYE baglidir (KVKK m.7/m.11).',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Hesap bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'loyalty_account:delete yalnizca owner/admin.',
  })
  async deleteAccount(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
  ): Promise<void> {
    await this.useCases.deleteAccount(params.id);
  }

  /**
   * ⚠️ MODULUN TEK KRITIK YAZMA YOLU (ADR-0051 §4.3).
   *
   * Kilit -> turet -> kontrol et -> yaz, TEK TRANSACTION'da. Bakiyenin negatife
   * dusememesinin BASKA HICBIR GARANTISI YOKTUR: bir `CHECK` satirlar arasi bir
   * kosulu goremez (§4.4).
   */
  @Post('accounts/:id/entries')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(LOYALTY_POINT_CREATE)
  @ApiOperation({
    summary: 'Puan kazandirir ya da kullandirir',
    description:
      '⚠️ ISTEMCI HESAPLAMAZ: kullanici KAC PUAN harcanacagini yazar, yeterli olup olmadigina ' +
      'SUNUCU karar verir (`SELECT ... FOR UPDATE` altinda). Istemciye hesaplatmak, ' +
      'ADR-0039"un fiziksel sayim tuzagini geri getirirdi — istemcinin okudugu bakiye ile ' +
      'istegin vardigi an arasinda bir satir girerse kontrol YANLIS olur ve hata SESSIZDIR. ' +
      '⚠️ `earn` DE kilidi alir: bir yol atlarsa kilit DEKORATIF hale gelir. ' +
      '⚠️ DUZELTME TERS YONDE BIR SATIRDIR — `isCorrection` diye bir alan YOKTUR.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Hareket yazildi; yeni bakiye doner.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      '⚠️ Yetersiz bakiye (govde MEVCUT BAKIYEYI soyler), gelecege tarihli hareket, ' +
      'gecersiz yon/miktar ya da sinir asan aciklama.',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Hesap bulunamadi.' })
  async createEntry(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(createEntrySchema)) body: CreateEntryBody,
  ): Promise<{ entry: PointEntryState; balance: number }> {
    const principal = requireTenantPrincipal();
    return this.useCases.recordEntry({
      tenantId: principal.tenantId,
      userId: principal.userId,
      accountId: params.id,
      direction: body.direction,
      points: body.points,
      note: body.note ?? null,
      occurredAt: body.occurredAt == null ? null : new Date(body.occurredAt),
    });
  }

  @Get('accounts/:id/entries')
  @RequirePermission(LOYALTY_POINT_READ)
  @ApiOperation({
    summary: 'Hesabin defteri (en yeni once)',
    description:
      '⚠️ Defter DEGISTIRILEMEZ: satir guncelleme ve tekil silme YOKTUR — ne ucu, ne izni, ' +
      'ne de veritabani yetkisi (uc katman, ADR-0051 §2.3).',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Hesap bulunamadi.' })
  async listEntries(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
  ): Promise<Paged<PointEntryState>> {
    requireTenantPrincipal();
    const page = await this.useCases.listEntries({
      accountId: params.id,
      limit: query.limit,
      offset: query.offset,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir. Savunma
 * katmani.
 *
 * ⚠️ ROL DE OKUNUYOR: rol bir CROSS-MODUL DIZINE (`ContactDirectory`)
 * gecirilir ve izin kapisi o dizinin ICINDE calisir (Projeler, Finans, Belge,
 * Geri Bildirim ve Kampanya'nin ayni deseni, ALTINCI kez).
 */
function requireTenantPrincipal(): { tenantId: string; userId: string; role: string } {
  const principal = getPrincipal();
  const role = getTenantContext()?.role;

  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId, role };
}
