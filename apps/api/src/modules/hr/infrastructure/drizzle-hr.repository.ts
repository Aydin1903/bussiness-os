import { Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, lte, sql, type SQL } from 'drizzle-orm';

import { hrCompensationRecords, hrEmployees } from '../../../infrastructure/database/schema';
import {
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
  isPgError,
} from '../../../infrastructure/database/pg-error';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import { CompensationRecord, type CompensationPeriod } from '../domain/compensation-record.entity';
import { Employee, type EmploymentStatus } from '../domain/employee.entity';
import {
  DuplicateCompensationDateError,
  EmployeeHasCompensationError,
  EmployeeUserAlreadyLinkedError,
} from '../domain/hr.error';
import {
  type EmployeeListFilter,
  type HrRepository,
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

function toEmployee(row: EmployeeRow): Employee {
  return Employee.fromPersistence({
    ...row,
    employmentStatus: toStatus(row.employmentStatus),
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

    try {
      // ⚠️ `onConflictDoUpdate` YOK — ve bu bir eksik degil, ekleme-yalnizligin
      // TASIYICISIDIR (`insertMovement` ve `saveInteraction`in ayni karari).
      // UPSERT yazilsaydi ayni yururluk tarihine ikinci bir kayit SESSIZCE bir
      // GECMIS SATIRINI degistirirdi — yani §6.2'nin denetim cevabini bozardi.
      await db.insert(hrCompensationRecords).values(record.toState());
    } catch (error) {
      if (isPgError(error, PG_UNIQUE_VIOLATION, 'compensation_effective_unique')) {
        throw new DuplicateCompensationDateError();
      }
      throw error;
    }
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
      .orderBy(desc(hrCompensationRecords.effectiveFrom), desc(hrCompensationRecords.id));

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
      .orderBy(desc(hrCompensationRecords.effectiveFrom), desc(hrCompensationRecords.id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toCompensation(row);
  }
}
