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
import { getTenantContext } from '../../../infrastructure/tenant/tenant-context';
import { ZodValidationPipe } from '../../../infrastructure/http/zod-validation.pipe';
import { RequirePermission } from '../../../platform/authz/authz.public';
import { type AppointmentRow } from '../application/appointment.repository.port';
import { AppointmentUseCases } from '../application/appointment.use-cases';
import { type AppointmentPatch, type AppointmentState } from '../domain/appointment.entity';
import {
  APPOINTMENT_DELETE,
  APPOINTMENT_READ,
  APPOINTMENT_WRITE,
} from '../appointments.permissions';
import { AppointmentsDomainExceptionFilter } from './appointments-domain-exception.filter';
import {
  createAppointmentSchema,
  idParamSchema,
  listAppointmentsQuerySchema,
  updateAppointmentSchema,
  type CreateAppointmentBody,
  type ListAppointmentsQuery,
  type UpdateAppointmentBody,
} from './appointments.dto';

/**
 * Randevu uclari (ADR-0035 §9).
 *
 * `CategoryController` / `TransactionController` ile ayni sekil — eksi
 * `GET :id` (gerekce `appointment.use-cases.ts`'te).
 *
 * ⚠️ Rota `appointments`, yani modul TEK BIR KOK ROTA tasiyor. Kardes bir
 * controller olmadigi icin `finance/categories` ile `finance/transactions`
 * arasindaki gibi bir onek ayrimi GEREKMEZ. Slice 3'un `POST
 * /appointments/reindex` ucu geldiginde ise DIKKAT EDILMELI: bu controller
 * `PATCH :id` / `DELETE :id` tasiyor ama `GET :id` TASIMIYOR, dolayisiyla
 * `POST /appointments/reindex` bir `:id` rotasiyla CATISIR (`reindex` bir UUID
 * olmadigi icin 422 donerdi). O gun ya `ReindexController` bu listede ONCE
 * yazilir, ya da uc buraya eklenir — gerekce `projects.module.ts`'te.
 */
const REINDEX_DESCRIPTION =
  'Is listesi TURETILMISTIR (`service_note IS NOT NULL AND embedding IS NULL`); ayri bir ' +
  '"onarilacaklar" tablosu ve deneme sayaci YOKTUR. Oran siniri yazma yoluyla AYNI kovayi ' +
  'PAYLASIR — ayri bir kova, onarimi butcesiz bir yan kapiya cevirirdi. ' +
  '⚠️ Onarim ayrica BAGLAM BASLIGINDAKI BAYAT KISI ADINI tazeler: kisi yeniden ' +
  'adlandirildiginda eski vektor eski adi tasir ve bu ucun ikinci isi odur.';

interface AppointmentListResponse {
  /** ⚠️ SLICE 2: `AppointmentState` -> `AppointmentRow` (kisi adi eklendi). */
  readonly items: readonly AppointmentRow[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

@ApiTags('appointments')
@Controller({ path: 'appointments', version: '1' })
@UseFilters(AppointmentsDomainExceptionFilter)
export class AppointmentController {
  constructor(private readonly useCases: AppointmentUseCases) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(APPOINTMENT_WRITE)
  @ApiOperation({ summary: 'Randevu olusturur' })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Randevu kaydedildi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Zaman/sure/durum gecersiz ya da govdede taninmayan alan var.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'appointment:write yalnizca owner/admin/member.',
  })
  async create(
    @Body(new ZodValidationPipe(createAppointmentSchema)) body: CreateAppointmentBody,
  ): Promise<AppointmentState> {
    const principal = requireTenantPrincipal();

    return this.useCases.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      // ROL cross-modul dizine gecirilir: izin kapisi ONUN icinde
      // (ADR-0035 §4). Controller hangi izne bakildigini BILMEZ.
      role: principal.role,
      fields: {
        // ⚠️ Dize -> `Date` cevrimi BURADA, domain'de degil: `domain` katmani
        // HTTP'nin tasima bicimini bilmez. Gecersiz bir an `Invalid Date`
        // uretir ve entity onu REDDEDER (`InvalidScheduledAtError`) —
        // sessizce veritabanina gitmez.
        scheduledAt: new Date(body.scheduledAt),
        durationMinutes: body.durationMinutes,
        status: body.status,
        // `nullish()` -> `null | undefined`; domain "bagli degil"i `null` ile
        // ifade eder.
        crmContactId: body.contactId ?? null,
        serviceNote: body.serviceNote ?? null,
      },
    });
  }

  /**
   * Vektoru eksik NOTLU randevulari onarir (ADR-0035 §9).
   *
   * ============================================================================
   * ⚠️ ROTA SIRASI: `POST reindex` `POST /` ILE CATISMAZ ama `:id` ILE
   * CATISABILIRDI
   * ============================================================================
   * Bu controller `PATCH :id` ve `DELETE :id` tasiyor — ikisi de FARKLI HTTP
   * metotlari, dolayisiyla `POST appointments/reindex` bugun hicbir seyi
   * golgelemiyor. ⚠️ Bir gun `POST :id` (ornegin "randevuyu tekrarla") eklenirse
   * bu metot ondan ONCE durmak ZORUNDA: aksi halde `reindex` bir UUID olmadigi
   * icin 422 donerdi. `projects.module.ts`in ogrettigi ayni ders.
   *
   * ⚠️ IZIN `appointment:write` — YENI BIR IZIN ISTENMEDI. Yaptigi is var olan
   * kayitlarin ARAMA INDEKSINI onarmaktir, yeni bir kaynak turu degil.
   * `member` de calistirabilir ve bu dogrudur: kendi yazdigi notun
   * indekslenmemis olmasi onun sorunudur.
   */
  @Post('reindex')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(APPOINTMENT_WRITE)
  @ApiOperation({
    summary: 'Vektoru eksik notlu randevulari onarir',
    description: REINDEX_DESCRIPTION,
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Onarim tamamlandi.' })
  @ApiResponse({ status: HttpStatus.TOO_MANY_REQUESTS, description: 'Saatlik pay tukendi.' })
  async reindex(): Promise<{ repaired: number; failed: number }> {
    const principal = requireTenantPrincipal();

    return this.useCases.reindex({
      tenantId: principal.tenantId,
      userId: principal.userId,
      // ROL baslikta cozulecek KISI ADI icin gerekir (§6.1).
      role: principal.role,
    });
  }

  @Get()
  @RequirePermission(APPOINTMENT_READ)
  @ApiOperation({ summary: 'Randevulari listeler (takvim penceresi + durum)' })
  async list(
    @Query(new ZodValidationPipe(listAppointmentsQuerySchema)) query: ListAppointmentsQuery,
  ): Promise<AppointmentListResponse> {
    // `?? null`: Zod'un `.optional()` ciktisi "anahtar var, degeri `undefined`"
    // demektir; port "filtre yok"u `null` ile ifade eder (gerekce port
    // dosyasinda).
    //
    // ⚠️ `to` HARIC bir sinirdir (`< to`); `from` DAHIL. Gerekce
    // `appointments.dto.ts`'te — yari acik aralik olmasaydi sinirdaki bir
    // randevu iki haftada da gorunurdu.
    const page = await this.useCases.list({
      limit: query.limit,
      offset: query.offset,
      from: query.from === undefined ? null : new Date(query.from),
      to: query.to === undefined ? null : new Date(query.to),
      status: query.status ?? null,
      // ROL dizine gecirilir; `contact:read` tasimayan cagiran icin her satir
      // `contactName: null` alir ve RANDEVULARI YINE GORUR — gizlenen sey
      // yalnizca CRM'e ait AD'dir (ADR-0035 §4).
      role: requireTenantPrincipal().role,
    });

    return { ...page, limit: query.limit, offset: query.offset };
  }

  /**
   * KISMI guncelleme; gonderilmeyen alana DOKUNULMAZ (`PUT` degil).
   *
   * ⚠️ DURUM GECISI DE BURADAN gecer ve KISITLANMAZ: `no_show` -> `completed`
   * mesrudur (kisi bir saat gec geldi). Gerekce `Appointment` sinif yorumunda.
   */
  @Patch(':id')
  @RequirePermission(APPOINTMENT_WRITE)
  @ApiOperation({ summary: 'Randevuyu kismi gunceller (zaman / sure / durum)' })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Randevu bulunamadi.' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'Zaman/sure/durum gecersiz ya da govde bos.',
  })
  async update(
    @Param(new ZodValidationPipe(idParamSchema)) params: { id: string },
    @Body(new ZodValidationPipe(updateAppointmentSchema)) body: UpdateAppointmentBody,
  ): Promise<AppointmentState> {
    // ⚠️ `scheduledAt` AYRILIYOR, kosullu bir spread ile uzerine YAZILMIYOR:
    // govde tipi `string` tasiyor, port `Date` istiyor ve kosullu spread'de
    // TypeScript sonucun artik yalnizca `Date` oldugunu goremez
    // (`TransactionController.update`in `amount` icin verdigi ayni karar).
    //
    // ⚠️ `undefined` = "dokunma"; `new Date(undefined)` onu `Invalid Date`e
    // cevirip dogrulamayi patlatirdi.
    //
    // ⚠️ `contactId` -> `crmContactId` ADI DEGISIYOR ve `null` KORUNUYOR:
    // `?? null` yazilsaydi `undefined` ("dokunma") sessizce `null`a
    // ("baglantiyi kaldir") donerdi — kullanici yalnizca saati guncellerken
    // kisi baglantisini KAYBEDERDI ve hata sessiz olurdu.
    const { scheduledAt, contactId, ...rest } = body;

    const changes: AppointmentPatch = {
      ...rest,
      ...(scheduledAt === undefined ? {} : { scheduledAt: new Date(scheduledAt) }),
      ...(contactId === undefined ? {} : { crmContactId: contactId }),
    };

    const principal = requireTenantPrincipal();

    return this.useCases.update({
      id: params.id,
      // ⚠️ SLICE 3: kimlik de gerekiyor — not degistiginde oran siniri payi
      // ODENIR ve pay TENANT + KULLANICI basinadir.
      tenantId: principal.tenantId,
      userId: principal.userId,
      role: principal.role,
      changes,
    });
  }

  /**
   * `204`: silme bir govde dondurmez.
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR (ADR-0035 §5): kaydin
   * silindigi bilgisi hicbir yerde kalmaz. `appointment:delete`in ayri bir izin
   * olmasinin ve `member`a VERILMEMESININ sebebi budur.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(APPOINTMENT_DELETE)
  @ApiOperation({ summary: 'Randevuyu siler' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'appointment:delete yalnizca owner/admin.',
  })
  async remove(@Param(new ZodValidationPipe(idParamSchema)) params: { id: string }): Promise<void> {
    await this.useCases.delete(params.id);
  }
}

/**
 * ⚠️ PRATIKTE ULASILMAZ — `PermissionGuard` handler'dan ONCE calisir ve hem
 * kimliksiz istegi hem tenant secilmemis token'i keser. Savunma katmani.
 *
 * ⚠️ `CategoryController`in yardimcisindan FARKLI: burada KULLANICI KIMLIGI de
 * okunuyor cunku `created_by_user_id` yaziliyor (randevuyu kim girdi).
 *
 * ⚠️ ROL SLICE 2'DE EKLENDI: `ContactDirectory` onu ISTIYOR (cross-modul izin
 * kapisi dizinin icinde calisir ve rolu imzasinda ACIKCA ister). Artik
 * `TransactionController`in yardimcisiyla ayni sekilde.
 *
 * ⚠️ ROL principal'da DEGIL, TENANT CONTEXT'tedir: principal "kimsin"
 * sorusunu, tenant context "bu sirkette nesin" sorusunu cevaplar.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string; role: string } {
  const principal = getPrincipal();
  const role = getTenantContext()?.role;

  // ⚠️ YALNIZCA `tenantId` kontrol ediliyor: `userId` principal tipinde ZATEN
  // zorunludur (bir principal varsa kimligi de vardir). Onu da kontrol etmek
  // lint tarafindan "types have no overlap" ile reddedilir — ve hakli: olmayan
  // bir durumu savunmak, okuyana o durumun MUMKUN oldugunu soyler.
  if (principal?.tenantId == null || role == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId, role };
}
