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
import { RequirePermission } from '../../../platform/authz/authz.public';
import { HrUseCases } from '../application/hr.use-cases';
import { type CompensationRecordState } from '../domain/compensation-record.entity';
import { type LeaveRequestState } from '../domain/leave-request.entity';
import { type EmployeePatch, type EmployeeState } from '../domain/employee.entity';
import {
  COMPENSATION_READ,
  COMPENSATION_WRITE,
  EMPLOYEE_DELETE,
  EMPLOYEE_READ,
  EMPLOYEE_WRITE,
  LEAVE_DECIDE,
  LEAVE_READ,
  LEAVE_REQUEST,
} from '../hr.permissions';
import { HrDomainExceptionFilter } from './hr-domain-exception.filter';
import {
  addCompensationSchema,
  createEmployeeSchema,
  createLeaveRequestSchema,
  decideLeaveRequestSchema,
  employeeIdParamSchema,
  leaveIdParamSchema,
  listEmployeesSchema,
  listLeaveSchema,
  updateEmployeeSchema,
  type AddCompensationDto,
  type CreateEmployeeDto,
  type CreateLeaveRequestDto,
  type DecideLeaveRequestDto,
  type ListEmployeesQueryDto,
  type ListLeaveQueryDto,
  type UpdateEmployeeDto,
} from './hr.dto';

/**
 * ⚠️ CALISAN CEVABINDA UCRET ALANI YOKTUR — VE OLMAYACAKTIR.
 *
 * Bu tip, ADR-0043 §4.2'nin BIRINCI izolasyon katmaninin API sozlesmesindeki
 * aynasidir. Ucret yalnizca `/compensation` ucundan, KENDI izniyle
 * (`compensation:read`, owner + admin) doner.
 *
 * Bir birim testi bu tipin anahtar kumesini SABITLER: bir gun buraya
 * `currentSalary` eklenirse test KIRMIZI yanar.
 */
interface EmployeeResponse {
  readonly id: string;
  readonly fullName: string;
  /** ⚠️ `role` DEGIL — bu projede `role` owner/admin/member/viewer demektir. */
  readonly jobTitle: string | null;
  readonly workEmail: string | null;
  readonly workPhone: string | null;
  readonly employmentStatus: string;
  readonly startedOn: string | null;
  readonly endedOn: string | null;
  readonly platformUserId: string | null;
  readonly department: string | null;
  readonly employmentType: string;
  readonly workMode: string;
  readonly contractEndsOn: string | null;
  /** ⚠️ Hak edis — IK tarafindan GIRILIR, sistem hesaplamaz (ADR-0044 §2.2). */
  readonly annualLeaveDays: number;
  readonly managerEmployeeId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

interface CompensationResponse {
  readonly id: string;
  readonly employeeId: string;
  /** ⚠️ Sunucunun KANONIK dizesi oldugu gibi yazilir — binlik ayraci YOK. */
  readonly amount: string;
  readonly currency: string;
  readonly period: string;
  readonly effectiveFrom: string;
  readonly recordedByUserId: string;
  readonly recordedAt: string;
}

function toEmployeeResponse(state: EmployeeState): EmployeeResponse {
  return {
    id: state.id,
    fullName: state.fullName,
    jobTitle: state.jobTitle,
    workEmail: state.workEmail,
    workPhone: state.workPhone,
    employmentStatus: state.employmentStatus,
    startedOn: state.startedOn,
    endedOn: state.endedOn,
    platformUserId: state.platformUserId,
    department: state.department,
    employmentType: state.employmentType,
    workMode: state.workMode,
    contractEndsOn: state.contractEndsOn,
    annualLeaveDays: state.annualLeaveDays,
    managerEmployeeId: state.managerEmployeeId,
    // Domain nesnesi ASLA serilestirilmez; Date -> ISO string sinirda cevrilir.
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
  };
}

/**
 * ⚠️ Duzeltilmis satirin damgasi (ADR-0044 §1.4).
 *
 * `supersededAt` bir KOLON DEGILDIR, use case'te turetilir — bkz. oradaki
 * gerekce. Sinirda `Date -> ISO string` cevrimi burada yapilir.
 */
function toSupersedableResponse(
  state: CompensationRecordState & { readonly supersededAt: Date | null },
): CompensationResponse & { readonly supersededAt: string | null } {
  return {
    ...toCompensationResponse(state),
    supersededAt: state.supersededAt === null ? null : state.supersededAt.toISOString(),
  };
}

function toCompensationResponse(state: CompensationRecordState): CompensationResponse {
  return {
    id: state.id,
    employeeId: state.employeeId,
    amount: state.amount,
    currency: state.currency,
    period: state.period,
    effectiveFrom: state.effectiveFrom,
    recordedByUserId: state.recordedByUserId,
    recordedAt: state.recordedAt.toISOString(),
  };
}

interface LeaveResponse {
  readonly id: string;
  readonly employeeId: string;
  /** ⚠️ `sick`/`raporlu` YOK — ADR-0043 §3'un sinirinin tasiyicisi. */
  readonly type: string;
  readonly startsOn: string;
  readonly endsOn: string;
  /** ⚠️ TURETILMIS takvim gunu — IS GUNU DEGIL (ADR-0044 §2.5). */
  readonly days: number;
  readonly status: string;
  readonly requestedByUserId: string;
  readonly requestedAt: string;
  /** ⚠️ Satir ici aktor damgasi — bir denetim izi DEGILDIR (§2.4). */
  readonly decidedByUserId: string | null;
  readonly decidedAt: string | null;
}

function toLeaveResponse(state: LeaveRequestState): LeaveResponse {
  const start = Date.parse(`${state.startsOn}T00:00:00.000Z`);
  const end = Date.parse(`${state.endsOn}T00:00:00.000Z`);

  return {
    id: state.id,
    employeeId: state.employeeId,
    type: state.type,
    startsOn: state.startsOn,
    endsOn: state.endsOn,
    // ⚠️ Gun sayisi KOLON DEGILDIR (§2.5): resmi tatiller ULKEYE OZEL
    // MEVZUATTIR ve hafta sonu tanimi bile evrensel degildir. Sistem TAKVIM
    // GUNU sayar; isletme "5 gun izin" derken ne kastettigini kendi bilir.
    days: Math.round((end - start) / 86_400_000) + 1,
    status: state.status,
    requestedByUserId: state.requestedByUserId,
    requestedAt: state.requestedAt.toISOString(),
    decidedByUserId: state.decidedByUserId,
    decidedAt: state.decidedAt === null ? null : state.decidedAt.toISOString(),
  };
}

/**
 * IK / Personel uclari (ADR-0043).
 *
 * ============================================================================
 * ⚠️ IKI KAYNAK, IKI FARKLI IZIN GENISLIGI — ILK KEZ AYNI MODULDE (§7.1)
 * ============================================================================
 *     `employee:*`     -> okuma GENIS (dort rol), yazma DAR (owner/admin)
 *     `compensation:*` -> ⚠️ TAM DAR, `read` bile owner/admin
 *
 * Ucret uclarinin AYRI olmasi bir duzen tercihi degil, §4.2'nin IKINCI
 * izolasyon katmanidir: calisan listesini gorebilen herkes maasi GOREMEZ.
 *
 * ⚠️ ROTA GOLGELEMESI: `/hr/employees/:employeeId/compensation` sabit son ek
 * tasir, yani `:employeeId` ile cakisan bir statik yol YOKTUR. ADR-0040'in
 * dersi (bir sabit yolun UUID sanilmasi) burada tetiklenmiyor ama kayit,
 * okuyanin soruyu bir kez sorup gecmesi icin.
 */
@ApiTags('HR')
@Controller({ path: 'hr', version: '1' })
@UseFilters(HrDomainExceptionFilter)
export class HrController {
  constructor(private readonly useCases: HrUseCases) {}

  // ==========================================================================
  // Calisan
  // ==========================================================================

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(EMPLOYEE_WRITE)
  @ApiOperation({
    summary: 'Calisan kaydi olusturur',
    description:
      'YETKI: `employee:write` (owner + admin). ⚠️ member/viewer 403 alir — ' +
      'bir meslektasin kaydini degistirmek kimsenin gunluk isi degildir (§7.1). ' +
      'Govdede UCRET ALANI YOKTUR; ucret ayri bir uctan yazilir.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Calisan olusturuldu.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Kullanici zaten bagli.' })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecersiz.' })
  async createEmployee(
    @Body(new ZodValidationPipe(createEmployeeSchema)) body: CreateEmployeeDto,
  ): Promise<EmployeeResponse> {
    const { tenantId, userId } = requireTenantPrincipal();

    const state = await this.useCases.createEmployee({
      tenantId,
      userId,
      fields: {
        fullName: body.fullName,
        jobTitle: body.jobTitle ?? null,
        workEmail: body.workEmail ?? null,
        workPhone: body.workPhone ?? null,
        employmentStatus: body.employmentStatus,
        startedOn: body.startedOn ?? null,
        endedOn: body.endedOn ?? null,
        platformUserId: body.platformUserId ?? null,
        department: body.department ?? null,
        employmentType: body.employmentType,
        workMode: body.workMode,
        contractEndsOn: body.contractEndsOn ?? null,
        annualLeaveDays: body.annualLeaveDays,
        managerEmployeeId: body.managerEmployeeId ?? null,
      },
    });

    return toEmployeeResponse(state);
  }

  @Get('employees')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(EMPLOYEE_READ)
  @ApiOperation({
    summary: 'Calisan listesi (sayfali)',
    description:
      'YETKI: `employee:read` (dort rol de) — bir ekip rehberi PAYLASILAN bir ' +
      'is gercegidir. ⚠️ Cevap UCRET TASIMAZ ve maasa gore siralama/filtreleme ' +
      'YOKTUR: bir deger donmese bile siralamanin kendisi bilgi sizdirir (§4.2).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Calisan listesi.' })
  async listEmployees(
    @Query(new ZodValidationPipe(listEmployeesSchema)) query: ListEmployeesQueryDto,
  ): Promise<{
    readonly items: readonly EmployeeResponse[];
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  }> {
    const page = await this.useCases.listEmployees({
      status: query.status ?? null,
      department: query.department ?? null,
      search: query.search ?? null,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: page.items.map(toEmployeeResponse),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  @Get('employees/:employeeId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(EMPLOYEE_READ)
  @ApiOperation({
    summary: 'Tek calisan',
    description: 'YETKI: `employee:read`. ⚠️ Cevap UCRET TASIMAZ (§4.2 katman 1).',
  })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: 'Calisan bulunamadi.' })
  async getEmployee(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
  ): Promise<EmployeeResponse> {
    return toEmployeeResponse(await this.useCases.getEmployee(params.employeeId));
  }

  @Patch('employees/:employeeId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(EMPLOYEE_WRITE)
  @ApiOperation({
    summary: 'Calisan kaydini kismen gunceller',
    description:
      'YETKI: `employee:write` (owner + admin). ⚠️ Her degisiklik AYNI ' +
      'TRANSACTION icinde `platform.audit_log`a bir satir yazar — yalnizca ' +
      'HANGI ALANIN degistigi, DEGERI DEGIL (ADR-0043 §6.5).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Guncellendi.' })
  async updateEmployee(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
    @Body(new ZodValidationPipe(updateEmployeeSchema)) body: UpdateEmployeeDto,
  ): Promise<EmployeeResponse> {
    const { tenantId } = requireTenantPrincipal();

    // ⚠️ `undefined` = dokunma, `null` = temizle. Zod'un `.partial()` ciktisi
    // ikisini de tasiyabilir; donusum bu ayrimi KORUMALIDIR.
    const changes: EmployeePatch = {
      ...(body.fullName === undefined ? {} : { fullName: body.fullName }),
      ...(body.jobTitle === undefined ? {} : { jobTitle: body.jobTitle }),
      ...(body.workEmail === undefined ? {} : { workEmail: body.workEmail }),
      ...(body.workPhone === undefined ? {} : { workPhone: body.workPhone }),
      ...(body.employmentStatus === undefined ? {} : { employmentStatus: body.employmentStatus }),
      ...(body.startedOn === undefined ? {} : { startedOn: body.startedOn }),
      ...(body.endedOn === undefined ? {} : { endedOn: body.endedOn }),
      ...(body.platformUserId === undefined ? {} : { platformUserId: body.platformUserId }),
      ...(body.department === undefined ? {} : { department: body.department }),
      ...(body.employmentType === undefined ? {} : { employmentType: body.employmentType }),
      ...(body.workMode === undefined ? {} : { workMode: body.workMode }),
      ...(body.contractEndsOn === undefined ? {} : { contractEndsOn: body.contractEndsOn }),
      ...(body.annualLeaveDays === undefined ? {} : { annualLeaveDays: body.annualLeaveDays }),
      ...(body.managerEmployeeId === undefined
        ? {}
        : { managerEmployeeId: body.managerEmployeeId }),
    };

    return toEmployeeResponse(
      await this.useCases.updateEmployee({ tenantId, id: params.employeeId, changes }),
    );
  }

  @Delete('employees/:employeeId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission(EMPLOYEE_DELETE)
  @ApiOperation({
    summary: 'Calisan kaydini siler — ⚠️ YALNIZCA HATA DUZELTMESI ICIN',
    description:
      'YETKI: `employee:delete` (owner + admin). ⚠️ Isten ayrilan calisan ' +
      'SILINMEZ, durumu "ended" yapilir (§1.4). Ucret kaydi olan bir calisan ' +
      'silinemez -> 409.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Silindi.' })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Ucret kaydi var.' })
  async deleteEmployee(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
  ): Promise<void> {
    await this.useCases.deleteEmployee(params.employeeId);
  }

  // ==========================================================================
  // Ucret defteri — ⚠️ AYRI UC, AYRI IZIN (§4.2 katman 2)
  // ==========================================================================

  @Get('employees/:employeeId/compensation')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(COMPENSATION_READ)
  @ApiOperation({
    summary: 'Ucret gecmisi + guncel ucret',
    description:
      'YETKI: `compensation:read` — ⚠️ YALNIZCA owner + admin. member ve ' +
      'viewer 403 alir. Guncel ucret TURETILIR (`effectiveFrom <= bugun` ' +
      'olanlarin en yenisi); gelecek tarihli bir zam listede GORUNUR ama ' +
      'guncel olarak DONMEZ (§1.5).',
  })
  @ApiResponse({ status: HttpStatus.OK, description: 'Ucret gecmisi.' })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'Yetki yok.' })
  async getCompensation(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
  ): Promise<{
    readonly items: readonly (CompensationResponse & { readonly supersededAt: string | null })[];
    readonly current: CompensationResponse | null;
  }> {
    const result = await this.useCases.getCompensation(params.employeeId);

    return {
      items: result.items.map(toSupersedableResponse),
      current: result.current === null ? null : toCompensationResponse(result.current),
    };
  }

  @Post('employees/:employeeId/compensation')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(COMPENSATION_WRITE)
  @ApiOperation({
    summary: 'Ucret kaydi ekler — ⚠️ EKLEME-YALNIZ DEFTER',
    description:
      'YETKI: `compensation:write` (owner + admin). ⚠️ Kayitlar GUNCELLENEMEZ ' +
      've SILINEMEZ: degistirilemezlik, "maasi kim ne zaman degistirdi" ' +
      'sorusunun CEVABIDIR (§6.2). ⚠️ ADR-0044 §1: ayni yururluk tarihine ' +
      'ikinci kayit ARTIK SERBESTTIR ve bir DUZELTMEDIR — eski satir SILINMEZ, ' +
      'listede `supersededAt` ile isaretli kalir. En son yazilan gecerlidir.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: 'Ucret kaydi eklendi.' })
  async addCompensation(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
    @Body(new ZodValidationPipe(addCompensationSchema)) body: AddCompensationDto,
  ): Promise<CompensationResponse> {
    const { tenantId, userId } = requireTenantPrincipal();

    const state = await this.useCases.addCompensation({
      tenantId,
      userId,
      employeeId: params.employeeId,
      fields: {
        // ⚠️ `number` de kabul edilir (JSON'da ondalik tip yok) ama domain onu
        // KANONIK BIR DIZEYE cevirir; hicbir noktada `number` SAKLANMAZ.
        amount: typeof body.amount === 'number' ? String(body.amount) : body.amount,
        currency: body.currency,
        period: body.period,
        effectiveFrom: body.effectiveFrom,
      },
    });

    return toCompensationResponse(state);
  }

  // ==========================================================================
  // IK v2 — izin takibi (ADR-0044 §2, §6)
  // ==========================================================================

  @Get('overview')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(EMPLOYEE_READ)
  @ApiOperation({
    summary: 'Odanin duvari — bugun izinde olanlar + yaklasan sozlesme bitisleri',
    description:
      'YETKI: `employee:read`. ⚠️ Bu sayilar EKRANA gider, `POST /ask` havuzuna ' +
      'GITMEZ: IK modulunun hicbir katkicisi yoktur (ADR-0044 §4.3) ve bu, maas ' +
      'izolasyonunun UCUNCU katmanidir.',
  })
  async overview(): Promise<{
    readonly onLeaveToday: number;
    readonly contractsEndingSoon: number;
  }> {
    return this.useCases.getOverview();
  }

  @Get('leave')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(LEAVE_READ)
  @ApiOperation({
    summary: 'Izin talepleri (sayfali)',
    description: 'YETKI: `leave:read` (dort rol de).',
  })
  async listLeave(
    @Query(new ZodValidationPipe(listLeaveSchema)) query: ListLeaveQueryDto,
  ): Promise<{
    readonly items: readonly LeaveResponse[];
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
  }> {
    const page = await this.useCases.listLeave({
      status: query.status ?? null,
      employeeId: query.employeeId ?? null,
      limit: query.limit,
      offset: query.offset,
    });

    return {
      items: page.items.map(toLeaveResponse),
      total: page.total,
      limit: query.limit,
      offset: query.offset,
    };
  }

  @Get('employees/:employeeId/leave')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(LEAVE_READ)
  @ApiOperation({
    summary: 'Bir calisanin izin gecmisi + BAKIYESI',
    description:
      'YETKI: `leave:read`. ⚠️ Bakiye TURETILIR (ADR-0044 §2.3): hak edis eksi ' +
      'ONAYLANMIS `annual` izinlerin gun toplami. Ucretsiz ve mazeret izni hak ' +
      'edis TUKETMEZ. ⚠️ Kalan NEGATIF olabilir ve bu dogrudur.',
  })
  async employeeLeave(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
  ): Promise<{
    readonly items: readonly LeaveResponse[];
    readonly entitlementDays: number;
    readonly usedDays: number;
    readonly remainingDays: number;
  }> {
    const result = await this.useCases.getEmployeeLeave(params.employeeId);

    return {
      items: result.items.map(toLeaveResponse),
      entitlementDays: result.entitlementDays,
      usedDays: result.usedDays,
      remainingDays: result.remainingDays,
    };
  }

  @Post('employees/:employeeId/leave')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermission(LEAVE_REQUEST)
  @ApiOperation({
    summary: 'Izin talebi olusturur',
    description:
      'YETKI: `leave:request` (owner + admin + member) — ⚠️ `employee:write`ten ' +
      'BILINCLI olarak GENIS: bir meslektasin kaydini degistirmek kimsenin gunluk ' +
      'isi degildir ama KENDI IZININI ISTEMEK herkesin isidir. ' +
      '⚠️ Govdede SEBEP ALANI YOKTUR ve `sick`/`raporlu` turu YOKTUR — ikisi de ' +
      'ADR-0043 §3 saglik verisi sinirinin TASIYICISIDIR.',
  })
  @ApiResponse({ status: HttpStatus.UNPROCESSABLE_ENTITY, description: 'Govde gecersiz.' })
  async requestLeave(
    @Param(new ZodValidationPipe(employeeIdParamSchema)) params: { employeeId: string },
    @Body(new ZodValidationPipe(createLeaveRequestSchema)) body: CreateLeaveRequestDto,
  ): Promise<LeaveResponse> {
    const { tenantId, userId } = requireTenantPrincipal();

    return toLeaveResponse(
      await this.useCases.requestLeave({
        tenantId,
        userId,
        employeeId: params.employeeId,
        fields: { type: body.type, startsOn: body.startsOn, endsOn: body.endsOn },
      }),
    );
  }

  @Patch('leave/:leaveId')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(LEAVE_DECIDE)
  @ApiOperation({
    summary: 'Izin talebini onaylar ya da reddeder',
    description:
      'YETKI: `leave:decide` (owner + admin) — onaylamak bir YONETIM islemidir. ' +
      '⚠️ Karara baglanmis bir izin YENIDEN karara baglanamaz (409): bir onayin ' +
      'sessizce geri alinmasi (kim onayladi) sorusunun cevabini DEGISTIRIRDI. ' +
      'Fikir degisirse dogru yol YENI BIR TALEPTIR.',
  })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'Zaten karara baglanmis.' })
  async decideLeave(
    @Param(new ZodValidationPipe(leaveIdParamSchema)) params: { leaveId: string },
    @Body(new ZodValidationPipe(decideLeaveRequestSchema)) body: DecideLeaveRequestDto,
  ): Promise<LeaveResponse> {
    const { userId } = requireTenantPrincipal();

    return toLeaveResponse(
      await this.useCases.decideLeave({
        leaveId: params.leaveId,
        userId,
        status: body.status,
      }),
    );
  }
}

/**
 * Tenant-scoped principal — yoksa 401.
 *
 * ⚠️ YALNIZCA `tenantId` kontrol ediliyor: `userId` principal tipinde ZATEN
 * zorunludur (bir principal varsa kimligi de vardir). Onu da kontrol etmek
 * lint tarafindan "types have no overlap" ile reddedilir — ve hakli: olmayan
 * bir durumu savunmak, okuyana o durumun MUMKUN oldugunu soyler.
 */
function requireTenantPrincipal(): { tenantId: string; userId: string } {
  const principal = getPrincipal();

  if (principal?.tenantId == null) {
    throw new UnauthorizedException('Bu islem icin tenant secilmis bir oturum gerekiyor.');
  }

  return { tenantId: principal.tenantId, userId: principal.userId };
}
