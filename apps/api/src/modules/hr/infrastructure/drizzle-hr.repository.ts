import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, ilike, lte, sql, type SQL } from 'drizzle-orm';

import {
  hrCompensationRecords,
  hrEmployees,
  hrLeaveRequests,
} from '../../../infrastructure/database/schema';
import {
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isPgError,
} from '../../../infrastructure/database/pg-error';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { CompensationRecord, type CompensationPeriod } from '../domain/compensation-record.entity';
import {
  Employee,
  type EmploymentStatus,
  type EmploymentType,
  type WorkMode,
} from '../domain/employee.entity';
import { EmployeeHasCompensationError, EmployeeUserAlreadyLinkedError } from '../domain/hr.error';
import { LeaveRequest, type LeaveStatus, type LeaveType } from '../domain/leave-request.entity';
import {
  type EmployeeListFilter,
  type HrRepository,
  type LeaveListFilter,
  type ListPage,
} from '../application/hr.repository.port';

/**
 * ⚠️ SECILEN KOLONLAR ACIKCA SAYILIR — `select()` (yildiz) KULLANILMAZ.
 *
 * Bu tabloda maas kolonu ZATEN YOK (§4.2 katman 1), yani yildiz bugun bir sey
 * sizdirmazdi. Yine de acikca sayiliyor: bir gun bu tabloya hassas bir kolon
 * eklenirse, yildizli bir sorgu onu SESSIZCE disari tasirdi.
 */
const EMPLOYEE_COLUMNS = {
  id: hrEmployees.id,
  tenantId: hrEmployees.tenantId,
  fullName: hrEmployees.fullName,
  jobTitle: hrEmployees.jobTitle,
  workEmail: hrEmployees.workEmail,
  workPhone: hrEmployees.workPhone,
  employmentStatus: hrEmployees.employmentStatus,
  startedOn: hrEmployees.startedOn,
  endedOn: hrEmployees.endedOn,
  platformUserId: hrEmployees.platformUserId,
  department: hrEmployees.department,
  employmentType: hrEmployees.employmentType,
  workMode: hrEmployees.workMode,
  contractEndsOn: hrEmployees.contractEndsOn,
  annualLeaveDays: hrEmployees.annualLeaveDays,
  managerEmployeeId: hrEmployees.managerEmployeeId,
  createdByUserId: hrEmployees.createdByUserId,
  createdAt: hrEmployees.createdAt,
  updatedAt: hrEmployees.updatedAt,
} as const;

const COMPENSATION_COLUMNS = {
  id: hrCompensationRecords.id,
  tenantId: hrCompensationRecords.tenantId,
  employeeId: hrCompensationRecords.employeeId,
  amount: hrCompensationRecords.amount,
  currency: hrCompensationRecords.currency,
  period: hrCompensationRecords.period,
  effectiveFrom: hrCompensationRecords.effectiveFrom,
  recordedByUserId: hrCompensationRecords.recordedByUserId,
  recordedAt: hrCompensationRecords.recordedAt,
} as const;

/**
 * ⚠️ Satir tipleri ACIKCA yazilir ve TIP DONUSUMU (`as`) KULLANILMAZ.
 *
 * Drizzle, `select(EMPLOYEE_COLUMNS)` ciktisinin tipini kolon tanimlarindan
 * TURETIR; bu arayuzler o turetilmis sekli aynen karsilar. Bir kolonun tipi
 * degistiginde (ornegin `date` -> `timestamptz`) derleyici BURADA durur —
 * `as` yazilsaydi donusum hatayi SESSIZCE yutardi.
 */
interface EmployeeRow {
  readonly id: string;
  readonly tenantId: string;
  readonly fullName: string;
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
  readonly annualLeaveDays: number;
  readonly managerEmployeeId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

interface CompensationRow {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  /** ⚠️ `numeric` Drizzle'da `string` doner ve OYLE KALIR (ADR-0034 §2c). */
  readonly amount: string;
  readonly currency: string;
  readonly period: string;
  readonly effectiveFrom: string;
  readonly recordedByUserId: string;
  readonly recordedAt: Date;
}

/** Kolon `text`; CHECK kisiti iki degerden birini garanti eder. */
function toStatus(value: string): EmploymentStatus {
  return value === 'ended' ? 'ended' : 'active';
}

/** Kolon `text`; CHECK kisiti uc degerden birini garanti eder. */
function toPeriod(value: string): CompensationPeriod {
  return value === 'hourly' || value === 'annual' ? value : 'monthly';
}

/** Kolon `text`; CHECK kisiti dort degerden birini garanti eder. */
function toEmploymentType(value: string): EmploymentType {
  return value === 'part_time' || value === 'contract' || value === 'intern' ? value : 'full_time';
}

/** Kolon `text`; CHECK kisiti uc degerden birini garanti eder. */
function toWorkMode(value: string): WorkMode {
  return value === 'remote' || value === 'hybrid' ? value : 'office';
}

function toEmployee(row: EmployeeRow): Employee {
  return Employee.fromPersistence({
    ...row,
    employmentStatus: toStatus(row.employmentStatus),
    employmentType: toEmploymentType(row.employmentType),
    workMode: toWorkMode(row.workMode),
  });
}

function toCompensation(row: CompensationRow): CompensationRecord {
  return CompensationRecord.fromPersistence({
    ...row,
    // ⚠️ `char(3)` sabit genislikte doner; kanonik bicim icin kirpiliyor.
    currency: row.currency.trim(),
    period: toPeriod(row.period),
  });
}

const LEAVE_COLUMNS = {
  id: hrLeaveRequests.id,
  tenantId: hrLeaveRequests.tenantId,
  employeeId: hrLeaveRequests.employeeId,
  type: hrLeaveRequests.type,
  startsOn: hrLeaveRequests.startsOn,
  endsOn: hrLeaveRequests.endsOn,
  status: hrLeaveRequests.status,
  requestedByUserId: hrLeaveRequests.requestedByUserId,
  requestedAt: hrLeaveRequests.requestedAt,
  decidedByUserId: hrLeaveRequests.decidedByUserId,
  decidedAt: hrLeaveRequests.decidedAt,
} as const;

interface LeaveRow {
  readonly id: string;
  readonly tenantId: string;
  readonly employeeId: string;
  readonly type: string;
  readonly startsOn: string;
  readonly endsOn: string;
  readonly status: string;
  readonly requestedByUserId: string;
  readonly requestedAt: Date;
  readonly decidedByUserId: string | null;
  readonly decidedAt: Date | null;
}

/** Kolon `text`; CHECK kisiti dort degerden birini garanti eder. ⚠️ `sick` YOK. */
function toLeaveType(value: string): LeaveType {
  return value === 'unpaid' || value === 'excuse' || value === 'administrative' ? value : 'annual';
}

/** Kolon `text`; CHECK kisiti uc degerden birini garanti eder. */
function toLeaveStatus(value: string): LeaveStatus {
  return value === 'approved' || value === 'rejected' ? value : 'pending';
}

function toLeaveRequest(row: LeaveRow): LeaveRequest {
  return LeaveRequest.fromPersistence({
    ...row,
    type: toLeaveType(row.type),
    status: toLeaveStatus(row.status),
  });
}

/**
 * `HrRepository`nin Drizzle implementasyonu (ADR-0043 §1).
 *
 * Kendi transaction'ini ACMAZ: sinir use case'tedir (MT §13.3 kural 2).
 * Tenant daraltmasi RLS'tedir — sorgularda `tenant_id` filtresi YOKTUR ve
 * OLMAMALIDIR (MT §13.1: iki daraltma mekanizmasi birbirini gizler).
 *
 * ⚠️ `updateCompensation` / `deleteCompensation` METOTLARI YOKTUR (§1.2).
 * Yazilsalardi zaten CALISMAZLARDI: `businessos_app` bu tabloda yalnizca
 * `SELECT, INSERT` tasir (migration `0035`). Ama yine de yazilmiyorlar —
 * var olmayan bir yetenegi IMA ETMEK, sozlesmeyi yalanci yapardi.
 */
@Injectable()
export class DrizzleHrRepository implements HrRepository {
  // ==========================================================================
  // Calisan
  // ==========================================================================

  async saveEmployee(employee: Employee): Promise<void> {
    const { db } = requireTransaction();
    const state = employee.toState();

    try {
      await db
        .insert(hrEmployees)
        .values(state)
        .onConflictDoUpdate({
          target: hrEmployees.id,
          set: {
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
            updatedAt: state.updatedAt,
          },
        });
    } catch (error) {
      // ⚠️ Kismi unique index'in uygulama katmanindaki karsiligi. Use case
      // bunu ZATEN kontrol ediyor; burasi YARIS DURUMU icin: iki es zamanli
      // istek ayni kullaniciyi baglamaya calisirsa biri veritabaninda duser.
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'employees_platform_user_unique')) {
        throw new EmployeeUserAlreadyLinkedError();
      }
      throw error;
    }
  }

  async findEmployeeById(id: string): Promise<Employee | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select(EMPLOYEE_COLUMNS)
      .from(hrEmployees)
      .where(eq(hrEmployees.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toEmployee(row);
  }

  async listEmployees(filter: EmployeeListFilter): Promise<ListPage<Employee>> {
    const { db } = requireTransaction();

    const conditions: SQL[] = [];

    if (filter.status !== null) {
      conditions.push(eq(hrEmployees.employmentStatus, filter.status));
    }

    if (filter.department !== null) {
      conditions.push(eq(hrEmployees.department, filter.department));
    }

    if (filter.search !== null) {
      conditions.push(ilike(hrEmployees.fullName, `%${filter.search}%`));
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);

    const rows = await db
      .select(EMPLOYEE_COLUMNS)
      .from(hrEmployees)
      .where(where)
      // ⚠️ SIRALAMA SUNUCUDA SABITTIR (ad, alfabetik) ve istemciden bir `sort`
      // parametresi KABUL EDILMEZ. Ozellikle MAASA gore siralama kapalidir:
      // bir deger donmese bile siralamanin kendisi bilgi sizdirir (§4.2).
      .orderBy(asc(hrEmployees.fullName), asc(hrEmployees.id))
      .limit(filter.limit)
      .offset(filter.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(hrEmployees)
      .where(where);

    return { items: rows.map(toEmployee), total: counted?.total ?? 0 };
  }

  async deleteEmployeeById(id: string): Promise<number> {
    const { db } = requireTransaction();

    try {
      const deleted = await db
        .delete(hrEmployees)
        .where(eq(hrEmployees.id, id))
        .returning({ id: hrEmployees.id });

      return deleted.length;
    } catch (error) {
      // ⚠️ `ON DELETE RESTRICT`in uygulama katmanindaki karsiligi (§1.4).
      // Cevrilmeseydi kullanici HAM BIR 500 alirdi — ADR-0039'un kapanis
      // denetiminin buldugu kusurun tam aynisi ("kisit calisiyordu, MESAJ
      // calismiyordu").
      if (isPgError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new EmployeeHasCompensationError();
      }
      throw error;
    }
  }

  async findEmployeeIdByPlatformUserId(platformUserId: string): Promise<string | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select({ id: hrEmployees.id })
      .from(hrEmployees)
      .where(eq(hrEmployees.platformUserId, platformUserId))
      .limit(1);

    return rows[0]?.id ?? null;
  }

  // ==========================================================================
  // Ucret defteri — EKLEME-YALNIZ
  // ==========================================================================

  async appendCompensation(record: CompensationRecord): Promise<void> {
    const { db } = requireTransaction();

    // ⚠️ `onConflictDoUpdate` YOK — ve bu bir eksik degil, ekleme-yalnizligin
    // TASIYICISIDIR (`insertMovement` ve `saveInteraction`in ayni karari).
    // UPSERT yazilsaydi bir DUZELTME, SESSIZCE bir GECMIS SATIRINI degistirirdi
    // — yani §6.2'nin denetim cevabini bozardi.
    //
    // ⚠️ AYNI YURURLUK TARIHINE IKINCI KAYIT ARTIK SERBESTTIR (ADR-0044 §1):
    // `compensation_effective_unique` migration `0036`da DUSURULDU. Yanlis
    // girilen bir maasi duzeltmenin baska yolu yoktu — kullanici ya yanlis
    // rakamla yasar ya da UYDURMA BIR TARIH yazardi; ikincisi gecmisi bozardi.
    // Hangi satirin gecerli oldugunu `recordedAt` sirasi soyler ve duzeltilen
    // satir `supersededAt` ile ISARETLI kalir (§1.4).
    await db.insert(hrCompensationRecords).values(record.toState());
  }

  async listCompensation(employeeId: string): Promise<CompensationRecord[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select(COMPENSATION_COLUMNS)
      .from(hrCompensationRecords)
      .where(eq(hrCompensationRecords.employeeId, employeeId))
      // En yeni yururluk tarihi once. ⚠️ GELECEK TARIHLI kayitlar da GORUNUR —
      // liste gecmisin tamamidir; "bugunku" ayrimi `findCurrentCompensation`
      // yapar.
      .orderBy(
        desc(hrCompensationRecords.effectiveFrom),
        desc(hrCompensationRecords.recordedAt),
        desc(hrCompensationRecords.id),
      );

    return rows.map(toCompensation);
  }

  async findCurrentCompensation(input: {
    employeeId: string;
    today: string;
  }): Promise<CompensationRecord | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select(COMPENSATION_COLUMNS)
      .from(hrCompensationRecords)
      .where(
        and(
          eq(hrCompensationRecords.employeeId, input.employeeId),
          // ⚠️ BU KISIT ZORUNLUDUR (§1.5): gelecek tarihli bir zam MESRUDUR ve
          // kisit unutulursa BUGUN yururlukteymis gibi okunur — hata SESSIZ.
          lte(hrCompensationRecords.effectiveFrom, input.today),
        ),
      )
      // ⚠️ `recordedAt` IKINCI anahtar (ADR-0044 §1.3): tekillik kisiti
      // kalktigi icin ayni yururluk tarihine bir DUZELTME yazilmis olabilir ve
      // EN SON YAZILAN kazanir. Siralama artik kararli degil ANLAMLI.
      .orderBy(
        desc(hrCompensationRecords.effectiveFrom),
        desc(hrCompensationRecords.recordedAt),
        desc(hrCompensationRecords.id),
      )
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toCompensation(row);
  }

  // ==========================================================================
  // IK v2 — izin takibi (ADR-0044 §2)
  // ==========================================================================

  async saveLeaveRequest(request: LeaveRequest): Promise<void> {
    const { db } = requireTransaction();
    const state = request.toState();

    // ⚠️ UPSERT MESRUDUR ve ucret defterinden BILINCLI SAPMADIR: bir izin
    // talebi GUNCELLENIR (onaylanir/reddedilir), bir ucret kaydi GUNCELLENMEZ
    // (ADR-0043 §6.2 — degistirilemezligi denetim izinin ta kendisidir).
    await db
      .insert(hrLeaveRequests)
      .values(state)
      .onConflictDoUpdate({
        target: hrLeaveRequests.id,
        set: {
          status: state.status,
          decidedByUserId: state.decidedByUserId,
          decidedAt: state.decidedAt,
        },
      });
  }

  async findLeaveRequestById(id: string): Promise<LeaveRequest | null> {
    const { db } = requireTransaction();

    const rows = await db
      .select(LEAVE_COLUMNS)
      .from(hrLeaveRequests)
      .where(eq(hrLeaveRequests.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toLeaveRequest(row);
  }

  async listLeaveRequests(filter: LeaveListFilter): Promise<ListPage<LeaveRequest>> {
    const { db } = requireTransaction();

    const conditions: SQL[] = [];

    if (filter.status !== null) {
      conditions.push(eq(hrLeaveRequests.status, filter.status));
    }

    if (filter.employeeId !== null) {
      conditions.push(eq(hrLeaveRequests.employeeId, filter.employeeId));
    }

    const where = conditions.length === 0 ? undefined : and(...conditions);

    const rows = await db
      .select(LEAVE_COLUMNS)
      .from(hrLeaveRequests)
      .where(where)
      .orderBy(desc(hrLeaveRequests.startsOn), desc(hrLeaveRequests.id))
      .limit(filter.limit)
      .offset(filter.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(hrLeaveRequests)
      .where(where);

    return { items: rows.map(toLeaveRequest), total: counted?.total ?? 0 };
  }

  async listLeaveRequestsForEmployee(employeeId: string): Promise<LeaveRequest[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select(LEAVE_COLUMNS)
      .from(hrLeaveRequests)
      .where(eq(hrLeaveRequests.employeeId, employeeId))
      .orderBy(desc(hrLeaveRequests.startsOn), desc(hrLeaveRequests.id));

    return rows.map(toLeaveRequest);
  }

  async countOnLeave(today: string): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ Yalnizca ONAYLANMIS izinler sayilir: bekleyen bir talep bir izin
    // DEGILDIR ve "bugun kim yok" sorusunu yanlis cevaplardi.
    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(hrLeaveRequests)
      .where(
        and(
          eq(hrLeaveRequests.status, 'approved'),
          lte(hrLeaveRequests.startsOn, today),
          gte(hrLeaveRequests.endsOn, today),
        ),
      );

    return counted?.total ?? 0;
  }

  async countContractsEndingBefore(day: string): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ Yalnizca AKTIF calisanlar: ayrilmis birinin sozlesme bitisi bir
    // alarm degildir.
    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(hrEmployees)
      .where(and(eq(hrEmployees.employmentStatus, 'active'), lte(hrEmployees.contractEndsOn, day)));

    return counted?.total ?? 0;
  }
}
