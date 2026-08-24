import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_PASSWORD,
  APP_ROLE,
  OUTBOX_RELAY_ROLE,
  REPORT_WORKER_ROLE,
  RLS_READER_ROLE,
  createApplicationRole,
} from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `hr` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0043 Slice 2).
 *
 * ⚠️ Maas izolasyonunun UC KATMANI ayri bir dosyadadir
 * (`hr-isolation.integration.spec.ts`) — orada TEK BIR YERDEN sorulabilsin
 * diye. Burasi semanin kendi kurallarini kanitlar.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000f1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000f2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000f1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000f2';

describe('hr semasi (gercek PostgreSQL)', () => {
  let container: StartedPostgreSqlContainer;
  let ownerPool: Pool;
  let appPool: Pool;

  beforeAll(async () => {
    container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
    ownerPool = new Pool({ connectionString: container.getConnectionUri() });
    await createApplicationRole(ownerPool, container.getDatabase());
    await migrate(drizzle(ownerPool), { migrationsFolder: 'drizzle', migrationsSchema: 'drizzle' });

    appPool = new Pool({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      user: APP_ROLE,
      password: APP_PASSWORD,
      max: 5,
    });

    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-hr-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-hr-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    // ⚠️ SIRA: `compensation_records` ONCE — `employees`e `ON DELETE RESTRICT`
    // ile bagli. `CASCADE` zaten zinciri cozer ama sira niyeti gosterir.
    await ownerPool.query(
      'TRUNCATE hr.leave_requests, hr.compensation_records, hr.employees CASCADE',
    );
  });

  async function asTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT set_config($1, $2, true)', ['app.current_tenant_id', tenantId]);
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async function insertEmployee(
    tenantId: string,
    overrides: {
      fullName?: string;
      status?: string;
      endedOn?: string | null;
      platformUserId?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO hr.employees
           (id, tenant_id, full_name, job_title, employment_status, ended_on,
            platform_user_id, created_by_user_id, created_at, updated_at)
         VALUES ($1, $2, $3, 'Muhasebe Uzmani', $4, $5, $6, $7, now(), now())`,
        [
          id,
          tenantId,
          overrides.fullName ?? 'Ayse Yilmaz',
          overrides.status ?? 'active',
          overrides.endedOn === undefined ? null : overrides.endedOn,
          overrides.platformUserId === undefined ? null : overrides.platformUserId,
          USER_A,
        ],
      ),
    );
    return id;
  }

  async function insertCompensation(
    tenantId: string,
    employeeId: string,
    overrides: { amount?: string; effectiveFrom?: string; currency?: string } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO hr.compensation_records
           (id, tenant_id, employee_id, amount, currency, period, effective_from,
            recorded_by_user_id, recorded_at)
         VALUES ($1, $2, $3, $4, $5, 'monthly', $6, $7, now())`,
        [
          id,
          tenantId,
          employeeId,
          overrides.amount ?? '75000.00',
          overrides.currency ?? 'TRY',
          overrides.effectiveFrom ?? '2026-01-01',
          USER_A,
        ],
      ),
    );
    return id;
  }

  // ==========================================================================
  // ⚠️ EKLEME-YALNIZ DEFTER — VERITABANI SEVIYESINDE
  // ==========================================================================
  describe('⚠️ ucret defteri EKLEME-YALNIZ', () => {
    it('⚠️ ucret kaydi GUNCELLENEMEZ — yetki reddediyor', async () => {
      const employeeId = await insertEmployee(TENANT_A);
      await insertCompensation(TENANT_A, employeeId);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query("UPDATE hr.compensation_records SET amount = '1.00'"),
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('⚠️ ucret kaydi SILINEMEZ — yetki reddediyor', async () => {
      // ⚠️ Bu, §6.2'nin dogrudan sonucudur: defterin degistirilemezligi
      // DENETIM IZININ TA KENDISIDIR. Silinebilseydi "maasi kim degistirdi"
      // sorusunun cevabi da silinirdi.
      const employeeId = await insertEmployee(TENANT_A);
      await insertCompensation(TENANT_A, employeeId);

      await expect(
        asTenant(TENANT_A, (client) => client.query('DELETE FROM hr.compensation_records')),
      ).rejects.toThrow(/permission denied/i);
    });

    /**
     * ⚠️ ADR-0044 §1 — `compensation_effective_unique` KISITI DUSURULDU.
     *
     * v1'de ayni yururluk tarihine ikinci kayit veritabani seviyesinde
     * reddediliyordu. Gerekce dogruydu ("bugunku maasin iki cevabi olmasin")
     * ama bedeli agirdi: yanlis girilen bir maasi duzeltmenin hicbir yolu
     * yoktu.
     *
     * ⚠️ Kisit kalkti, GARANTI KALKMADI: kazanan artik "kararli siralama"
     * degil ANLAMLI siralamadir (`recorded_at DESC`) — yani EN SON YAZILAN.
     * Bu, `movements`taki gibi bir DEFTER cozumudur, bir gevsetme degil.
     */
    it('⚠️ ayni yururluk tarihine IKINCI kayit ARTIK MESRUDUR (duzeltme)', async () => {
      const employeeId = await insertEmployee(TENANT_A);
      await insertCompensation(TENANT_A, employeeId, { effectiveFrom: '2026-01-01' });

      await expect(
        insertCompensation(TENANT_A, employeeId, {
          effectiveFrom: '2026-01-01',
          amount: '82000.00',
        }),
      ).resolves.toBeTypeOf('string');
    });

    it('⚠️ `compensation_effective_unique` kisiti ARTIK YOKTUR', async () => {
      // ⚠️ Bu iddia dogrudan `0036`yi kilitler: kisit bir gun geri gelirse
      // duzeltme yolu SESSIZCE kapanir ve kullanici yine uydurma tarih yazar.
      const rows = await ownerPool.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM pg_constraint
          WHERE conname = 'compensation_effective_unique'`,
      );

      expect(rows.rows[0]?.n).toBe(0);
    });

    it('FARKLI yururluk tarihi mesrudur (zam)', async () => {
      const employeeId = await insertEmployee(TENANT_A);
      await insertCompensation(TENANT_A, employeeId, { effectiveFrom: '2026-01-01' });

      await expect(
        insertCompensation(TENANT_A, employeeId, {
          effectiveFrom: '2026-07-01',
          amount: '85000.00',
        }),
      ).resolves.toBeTypeOf('string');
    });

    it('sifir ve negatif ucret REDDEDILIR', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      await expect(insertCompensation(TENANT_A, employeeId, { amount: '0.00' })).rejects.toThrow(
        /compensation_amount_positive/,
      );
    });

    it('gecersiz para birimi bicimi REDDEDILIR', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      await expect(insertCompensation(TENANT_A, employeeId, { currency: 'try' })).rejects.toThrow(
        /compensation_currency_format/,
      );
    });
  });

  // ==========================================================================
  // ⚠️ GUNCEL UCRET TURETILIR — kolonda saklanmaz (§1.5)
  // ==========================================================================
  describe('⚠️ guncel ucret TURETILIR', () => {
    it('⚠️ GELECEK TARIHLI zam BUGUNKU ucreti DEGISTIRMEZ', async () => {
      // ⚠️ Kisit (`effective_from <= bugun`) unutulursa gelecek tarihli bir zam
      // BUGUN YURURLUKTEYMIS GIBI okunur ve hata SESSIZDIR.
      const employeeId = await insertEmployee(TENANT_A);
      await insertCompensation(TENANT_A, employeeId, {
        effectiveFrom: '2026-01-01',
        amount: '75000.00',
      });
      await insertCompensation(TENANT_A, employeeId, {
        effectiveFrom: '2099-01-01',
        amount: '999999.00',
      });

      const current = await asTenant(TENANT_A, (client) =>
        client
          .query<{ amount: string }>(
            `SELECT amount FROM hr.compensation_records
              WHERE employee_id = $1 AND effective_from <= CURRENT_DATE
              ORDER BY effective_from DESC, id DESC LIMIT 1`,
            [employeeId],
          )
          .then((result) => result.rows[0]?.amount),
      );

      expect(current).toBe('75000.00');
    });
  });

  // ==========================================================================
  // ⚠️ SILME KURALLARI (§1.4)
  // ==========================================================================
  describe('⚠️ silme', () => {
    it('⚠️ ucret kaydi olan calisan SILINEMEZ (`ON DELETE RESTRICT`)', async () => {
      // `CASCADE` olsaydi ucret gecmisi de giderdi ve §6.2'nin denetim cevabi
      // SESSIZCE yok olurdu.
      const employeeId = await insertEmployee(TENANT_A);
      await insertCompensation(TENANT_A, employeeId);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('DELETE FROM hr.employees WHERE id = $1', [employeeId]),
        ),
      ).rejects.toThrow(/violates foreign key constraint/i);
    });

    it('ucret kaydi OLMAYAN calisan silinebilir (hata duzeltmesi)', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      const deleted = await asTenant(TENANT_A, (client) =>
        client
          .query('DELETE FROM hr.employees WHERE id = $1', [employeeId])
          .then((result) => result.rowCount),
      );

      expect(deleted).toBe(1);
    });
  });

  // ==========================================================================
  // KISITLAR
  // ==========================================================================
  describe('kisitlar', () => {
    it('⚠️ `ended` durumunda ayrilma tarihi ZORUNLU', async () => {
      await expect(insertEmployee(TENANT_A, { status: 'ended', endedOn: null })).rejects.toThrow(
        /employees_ended_on_consistency/,
      );
    });

    it('⚠️ `active` durumunda ayrilma tarihi BULUNAMAZ', async () => {
      await expect(
        insertEmployee(TENANT_A, { status: 'active', endedOn: '2026-06-01' }),
      ).rejects.toThrow(/employees_ended_on_consistency/);
    });

    it('bos ad REDDEDILIR', async () => {
      await expect(insertEmployee(TENANT_A, { fullName: '   ' })).rejects.toThrow(
        /employees_full_name_not_blank/,
      );
    });

    it('⚠️ ayni platform kullanicisi IKI calisana baglanamaz', async () => {
      await insertEmployee(TENANT_A, { platformUserId: USER_B });

      await expect(insertEmployee(TENANT_A, { platformUserId: USER_B })).rejects.toThrow(
        /employees_platform_user_unique/,
      );
    });

    it('⚠️ AMA `null` bag sinirsizdir — hesabi olmayan calisan YAYGINDIR', async () => {
      // Kismi index (`WHERE platform_user_id IS NOT NULL`) bunu saglar.
      await insertEmployee(TENANT_A, { platformUserId: null });
      await insertEmployee(TENANT_A, { platformUserId: null });

      const count = await asTenant(TENANT_A, (client) =>
        client
          .query<{ n: string }>('SELECT count(*) AS n FROM hr.employees')
          .then((result) => result.rows[0]?.n),
      );

      expect(count).toBe('2');
    });

    it('⚠️ ayni kullanici FARKLI tenant larda baglanabilir', async () => {
      // Tekillik `(tenant_id, platform_user_id)` uzerindedir: bir kisi iki
      // sirkette birden calisabilir.
      await insertEmployee(TENANT_A, { platformUserId: USER_B });

      await expect(insertEmployee(TENANT_B, { platformUserId: USER_B })).resolves.toBeTypeOf(
        'string',
      );
    });
  });

  // ==========================================================================
  // RLS (MT §12.6)
  // ==========================================================================
  describe('tenant izolasyonu', () => {
    it('baska tenant in calisani GORUNMEZ', async () => {
      await insertEmployee(TENANT_A);
      await insertEmployee(TENANT_B);

      const seen = await asTenant(TENANT_A, (client) =>
        client
          .query<{ tenant_id: string }>('SELECT tenant_id FROM hr.employees')
          .then((result) => result.rows),
      );

      expect(seen).toHaveLength(1);
      expect(seen[0]?.tenant_id).toBe(TENANT_A);
    });

    it('baska tenant in UCRET KAYDI GORUNMEZ', async () => {
      const employeeB = await insertEmployee(TENANT_B);
      await insertCompensation(TENANT_B, employeeB);

      const seen = await asTenant(TENANT_A, (client) =>
        client
          .query<{ n: string }>('SELECT count(*) AS n FROM hr.compensation_records')
          .then((result) => result.rows[0]?.n),
      );

      expect(seen).toBe('0');
    });

    it('baska tenant adina calisan YAZILAMAZ (WITH CHECK)', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO hr.employees
               (id, tenant_id, full_name, employment_status, created_by_user_id, created_at, updated_at)
             VALUES ($1, $2, 'Sizinti', 'active', $3, now(), now())`,
            [randomUUID(), TENANT_B, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('⚠️ TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4. ⚠️ Bir IK tablosunda sessiz bos sonuc ozellikle
      // tehlikelidir: ekip listesi BOS gorunur ve okuyan "kayit yok" diye
      // okur — oysa kayitlar durmaktadir.
      await insertEmployee(TENANT_A);

      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT id FROM hr.employees')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });

  // ==========================================================================
  // Constraint 2 esdegeri — DAR ROLLER
  // ==========================================================================
  describe('uygulama rolu ve DAR ROLLER (Constraint 2 esdegeri)', () => {
    it('uygulama rolu semayi GORUR ama icinde nesne OLUSTURAMAZ', async () => {
      const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege($1, 'hr', 'USAGE')  AS usage,
                has_schema_privilege($1, 'hr', 'CREATE') AS create`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({ usage: true, create: false });
    });

    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '⚠️ %s dar rolu `hr` semasini HIC GORMEZ',
      async (role) => {
        // ⚠️ Bir dar rolun tek yetenegi RLS'i ASMAKTIR. `hr` semasina erisim
        // kazanmasi, TUM TENANTLARIN maas verisini gormesi demektir.
        const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
          `SELECT has_schema_privilege($1, 'hr', 'USAGE')  AS usage,
                  has_schema_privilege($1, 'hr', 'CREATE') AS create`,
          [role],
        );

        expect(rows.rows[0]).toEqual({ usage: false, create: false });
      },
    );

    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolunun `hr` tablolari uzerinde HICBIR grant i yok',
      async (role) => {
        const rows = await ownerPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM information_schema.role_table_grants
            WHERE table_schema = 'hr' AND grantee = $1`,
          [role],
        );

        expect(rows.rows[0]?.n).toBe(0);
      },
    );
  });

  // ==========================================================================
  // ⚠️ IK v2 — IZIN TABLOSU (ADR-0044 §2)
  // ==========================================================================
  describe('⚠️ izin tablosu', () => {
    async function insertLeave(
      tenantId: string,
      employeeId: string,
      overrides: {
        type?: string;
        startsOn?: string;
        endsOn?: string;
        status?: string;
        decidedByUserId?: string | null;
        decidedAt?: string | null;
      } = {},
    ): Promise<string> {
      const id = randomUUID();
      await asTenant(tenantId, (client) =>
        client.query(
          `INSERT INTO hr.leave_requests
             (id, tenant_id, employee_id, type, starts_on, ends_on, status,
              requested_by_user_id, requested_at, decided_by_user_id, decided_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9, $10)`,
          [
            id,
            tenantId,
            employeeId,
            overrides.type ?? 'annual',
            overrides.startsOn ?? '2026-09-01',
            overrides.endsOn ?? '2026-09-05',
            overrides.status ?? 'pending',
            USER_A,
            overrides.decidedByUserId ?? null,
            overrides.decidedAt ?? null,
          ],
        ),
      );
      return id;
    }

    it('tablo GERCEKTEN olusturuldu ve RLS + FORCE tasiyor', async () => {
      // ⚠️ "Migration uygulandi" iddiasi SAYIYLA degil VARLIKLA kilitlenir —
      // `_journal.json` atlanirsa sayac da ayni yalani soyler.
      const rows = await ownerPool.query<{ relrowsecurity: boolean; relforcerowsecurity: boolean }>(
        `SELECT relrowsecurity, relforcerowsecurity
           FROM pg_class WHERE oid = 'hr.leave_requests'::regclass`,
      );

      expect(rows.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    });

    // ========================================================================
    // ⚠️ SAGLIK VERISI SINIRI — VERITABANI SEVIYESINDE (ADR-0043 §3)
    // ========================================================================

    it('⚠️ `sick` izin turu VERITABANI SEVIYESINDE reddedilir', async () => {
      // ⚠️ Uc katmanin UCUNCUSU: arayuz listesi ve Zod `.strict()` uygulama
      // katmanindadir; bu, uygulama HIC DEVREDE DEGILKEN de durur.
      const employeeId = await insertEmployee(TENANT_A);

      await expect(insertLeave(TENANT_A, employeeId, { type: 'sick' })).rejects.toThrow(
        /leave_type_valid/,
      );
    });

    it('⚠️ tabloda SERBEST METIN bir sebep kolonu YOKTUR', async () => {
      const rows = await ownerPool.query<{ column_name: string }>(
        `SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'hr' AND table_name = 'leave_requests'`,
      );
      const names = rows.rows.map((row) => row.column_name);

      // ⚠️ Bir "sebep" alani, saglik verisi sinirinin ARKA KAPISIDIR: oraya
      // ILK YAZILACAK SEY "raporlu"dur.
      expect(names).not.toContain('reason');
      expect(names).not.toContain('note');
      expect(names).not.toContain('description');
    });

    it('bitis baslangictan onceyse REDDEDILIR', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      await expect(
        insertLeave(TENANT_A, employeeId, { startsOn: '2026-09-05', endsOn: '2026-09-01' }),
      ).rejects.toThrow(/leave_dates_ordered/);
    });

    /**
     * ⚠️ KARAR TUTARLILIGI: `pending` bir satirda aktor damgasi BULUNAMAZ,
     * karara baglanmis bir satirda damga ZORUNLUDUR. Ikisi ayrisirsa "kim
     * onayladi" sorusunun cevabi SESSIZCE kaybolur.
     */
    it('⚠️ `pending` satirda karar damgasi BULUNAMAZ', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      await expect(
        insertLeave(TENANT_A, employeeId, { status: 'pending', decidedByUserId: USER_A }),
      ).rejects.toThrow(/leave_decision_consistency/);
    });

    it('⚠️ `approved` satirda karar damgasi ZORUNLUDUR', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      await expect(insertLeave(TENANT_A, employeeId, { status: 'approved' })).rejects.toThrow(
        /leave_decision_consistency/,
      );
    });

    it('karara baglanmis satir damgasiyla birlikte mesrudur', async () => {
      const employeeId = await insertEmployee(TENANT_A);

      await expect(
        insertLeave(TENANT_A, employeeId, {
          status: 'approved',
          decidedByUserId: USER_A,
          decidedAt: '2026-08-24T09:00:00.000Z',
        }),
      ).resolves.toBeTypeOf('string');
    });

    it('baska tenant in izin kaydi GORUNMEZ', async () => {
      const employeeId = await insertEmployee(TENANT_A);
      await insertLeave(TENANT_A, employeeId);

      const rows = await asTenant(TENANT_B, (client) =>
        client.query('SELECT id FROM hr.leave_requests'),
      );

      expect(rows.rows).toHaveLength(0);
    });

    /**
     * ⚠️ UCRET DEFTERINDEN FARK: izin kaydi GUNCELLENEBILIR.
     *
     * Onaylamak tanimi geregi bir GUNCELLEMEDIR (`pending -> approved`).
     * Degistirilemezlik burada VERITABANINDA degil DOMAIN'de durur
     * (`decide` ikinci kez cagrilamaz) — cunku maasin aksine burada
     * turetilen bir "bugunku deger" yoktur, yalnizca bir DURUM vardir.
     */
    it('⚠️ izin kaydi GUNCELLENEBILIR (onay bir guncellemedir)', async () => {
      const employeeId = await insertEmployee(TENANT_A);
      const leaveId = await insertLeave(TENANT_A, employeeId);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `UPDATE hr.leave_requests
                SET status = 'approved', decided_by_user_id = $2, decided_at = now()
              WHERE id = $1`,
            [leaveId, USER_A],
          ),
        ),
      ).resolves.toBeDefined();
    });

    /**
     * ⚠️ `ON DELETE CASCADE` — UCRET DEFTERINDEN BILINCLI SAPMA.
     *
     * Ucret gecmisi `RESTRICT`tir cunku silinmesi ADR-0043 §6.2'nin denetim
     * cevabini yok eder. Bir izin kaydinin silinen bir calisandan sonra
     * yasamasi ise ANLAMSIZDIR — kime ait oldugu sorulamaz.
     *
     * ⚠️ Pratikte izinler yine korunur: ucret kaydi olan calisan zaten
     * silinemez.
     */
    it('⚠️ calisan silinince izin kayitlari da SILINIR (CASCADE)', async () => {
      const employeeId = await insertEmployee(TENANT_A);
      await insertLeave(TENANT_A, employeeId);

      await asTenant(TENANT_A, (client) =>
        client.query('DELETE FROM hr.employees WHERE id = $1', [employeeId]),
      );

      const rows = await asTenant(TENANT_A, (client) =>
        client.query('SELECT id FROM hr.leave_requests'),
      );

      expect(rows.rows).toHaveLength(0);
    });
  });
});
