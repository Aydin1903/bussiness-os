import { randomUUID } from 'node:crypto';

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool, type PoolClient } from 'pg';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  APP_ROLE,
  APP_PASSWORD,
  OUTBOX_RELAY_ROLE,
  REPORT_WORKER_ROLE,
  RLS_READER_ROLE,
  createApplicationRole,
} from './support/database-roles';
import { POSTGRES_IMAGE } from './support/test-database';

/**
 * `appointments` semasi — MT §12.6 ZORUNLU izolasyon testi (ADR-0035 Slice 1).
 *
 * Dort onceki modulun dersi burada da BASTAN uygulaniyor: yeni bir tablo,
 * dogrudan A<->B izolasyon testi yazilmadan merge EDILMEZ.
 *
 * ⚠️ Bu dosya ayrica HAFIF kapanis denetiminin bir maddesini OTOMATIKLESTIRIR
 * ("dar rollerin yeni semaya gorunmedigi kontrolu"). Uc dar rol her yeni semada
 * yeniden sorulmasi gereken ayni soruyu soruyor ve elle sorulan bir soru bir
 * gun sorulmaz.
 */

const TENANT_A = '018f3a2b-7c4d-7e1f-8a2b-0000000000c1';
const TENANT_B = '018f3a2b-7c4d-7e1f-8a2b-0000000000c2';
const USER_A = '018f3a2b-7c4d-7e1f-9b3c-0000000000c1';
const USER_B = '018f3a2b-7c4d-7e1f-9b3c-0000000000c2';

const SCHEDULED_AT = '2026-08-20T14:30:00Z';

describe('appointments semasi (gercek PostgreSQL)', () => {
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
    });

    await ownerPool.query(
      `INSERT INTO platform.tenants (id, slug, name, status, owner_user_id)
       VALUES ($1, 'tenant-ap-a', 'Tenant A', 'active', $3),
              ($2, 'tenant-ap-b', 'Tenant B', 'active', $4)`,
      [TENANT_A, TENANT_B, USER_A, USER_B],
    );
  }, 180_000);

  afterAll(async () => {
    await appPool.end();
    await ownerPool.end();
    await container.stop();
  });

  beforeEach(async () => {
    await ownerPool.query('TRUNCATE appointments.appointments CASCADE');
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

  async function insertAppointment(
    tenantId: string,
    overrides: {
      scheduledAt?: string;
      durationMinutes?: number;
      status?: string;
      serviceNote?: string | null;
      crmContactId?: string | null;
    } = {},
  ): Promise<string> {
    const id = randomUUID();
    await asTenant(tenantId, (client) =>
      client.query(
        `INSERT INTO appointments.appointments
           (id, tenant_id, scheduled_at, duration_minutes, status, service_note, crm_contact_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          id,
          tenantId,
          overrides.scheduledAt ?? SCHEDULED_AT,
          overrides.durationMinutes ?? 30,
          overrides.status ?? 'scheduled',
          overrides.serviceNote ?? null,
          overrides.crmContactId ?? null,
          USER_A,
        ],
      ),
    );
    return id;
  }

  describe('sema ve kisitlar', () => {
    it('TEK tablo appointments semasinda olusturuldu', () => {
      // ⚠️ BU IDDIA BIR SEYIN YOKLUGUNU DA KORUYOR. Dort onceki anlamsal
      // kaynagin dordu de bir `*_chunks` tablosu tasiyordu; burada YOK
      // (ADR-0035 §3 — vektor ayni satirda). Biri "desen boyleydi" diye
      // besincisini acarsa bu satir kirmizi yanar.
      return ownerPool
        .query<{ table_name: string }>(
          "SELECT table_name FROM information_schema.tables WHERE table_schema = 'appointments' ORDER BY table_name",
        )
        .then((rows) => {
          expect(rows.rows.map((row) => row.table_name)).toEqual(['appointments']);
        });
    });

    it.each([0, -30])('sure %s reddedilir — daima POZITIF', async (durationMinutes) => {
      await expect(insertAppointment(TENANT_A, { durationMinutes })).rejects.toThrow(
        /appointments_duration_positive/,
      );
    });

    it('GECERSIZ durum veritabaninda REDDEDILIR', async () => {
      // Sozluk hem kodda (`APPOINTMENT_STATUSES`) hem CHECK'te yazili; buradaki
      // kisit uygulamayi ATLAYAN her yolu da baglar.
      await expect(insertAppointment(TENANT_A, { status: 'postponed' })).rejects.toThrow(
        /appointments_status_valid/,
      );
    });

    it.each(['scheduled', 'completed', 'cancelled', 'no_show'])(
      'durum %s kabul edilir',
      async (status) => {
        await expect(insertAppointment(TENANT_A, { status })).resolves.toBeDefined();
      },
    );

    it('durum varsayilani `scheduled`', async () => {
      const id = randomUUID();
      await asTenant(TENANT_A, (client) =>
        client.query(
          `INSERT INTO appointments.appointments
             (id, tenant_id, scheduled_at, duration_minutes, created_by_user_id)
           VALUES ($1, $2, $3, 30, $4)`,
          [id, TENANT_A, SCHEDULED_AT, USER_A],
        ),
      );

      const rows = await asTenant(TENANT_A, (client) =>
        client.query<{ status: string }>(
          'SELECT status FROM appointments.appointments WHERE id = $1',
          [id],
        ),
      );

      expect(rows.rows[0]?.status).toBe('scheduled');
    });

    it('BOS servis notu reddedilir (null serbest)', async () => {
      // Bos bir dize Slice 3'te BOS BIR EMBEDDING CAGRISI demek olurdu: para
      // harcayan, hicbir sey aramayan bir vektor.
      await expect(insertAppointment(TENANT_A, { serviceNote: '   ' })).rejects.toThrow(
        /appointments_service_note_not_blank/,
      );
      await expect(insertAppointment(TENANT_A, { serviceNote: null })).resolves.toBeDefined();
    });

    it('⚠️ CAKISAN IKI RANDEVU YAZILABILIR — kisit YOK ve bu bilincli', async () => {
      // ADR-0035 §2e: engellemek COKLU PERSONEL TAKVIMI demektir (kapsam disi).
      // Tek takvimde cakisma bir hatadir, iki personelli bir isletmede
      // NORMALDIR. Yanlis tarafa karar vermek yerine v1 kayit tutar, kural
      // koymaz.
      await insertAppointment(TENANT_A, { scheduledAt: SCHEDULED_AT, durationMinutes: 60 });

      await expect(
        insertAppointment(TENANT_A, { scheduledAt: SCHEDULED_AT, durationMinutes: 60 }),
      ).resolves.toBeDefined();
    });

    it('SEMA DISINA FOREIGN KEY YOKTUR', async () => {
      // ⚠️ Bir seyin YOKLUGUNU kanitliyor. `crm_contact_id`nin hedefi
      // `crm.contacts`, yani baska bir sema; biri iyi niyetle `.references()`
      // eklerse migration calisir ama modul ayrilabilirligi SESSIZCE kaybolur.
      const rows = await ownerPool.query<{ target: string }>(
        `SELECT confrelid::regclass::text AS target FROM pg_constraint
         WHERE conrelid = 'appointments.appointments'::regclass AND contype = 'f'`,
      );

      // Tek mesru FK `tenant_id -> platform.tenants` (MT §12.3 istisnasi).
      expect(rows.rows.map((row) => row.target)).toEqual(['platform.tenants']);
    });

    it('VAR OLMAYAN kisi id si YAZILABILIR — sarkan isaretci mesrudur', async () => {
      // ADR-0035 §4: cascade baska semaya uzanamaz; okuyan yol dayanikli olmak
      // zorundadir. Veritabani burada bir sey dayatmaz — dayatamaz da.
      await expect(
        insertAppointment(TENANT_A, { crmContactId: randomUUID() }),
      ).resolves.toBeDefined();
    });

    it('HNSW index i vector_cosine_ops ile kurulmus', async () => {
      // ⚠️ Operator sorgudaki `<=>` ile eslesmezse index DEVRE DISI kalir ve
      // sorgu tam tarama yapar — sessiz bir performans coku. Index bugun BOS
      // bir kolonun uzerinde; simdi kurulmasinin sebebi Slice 3'te hatirlamaya
      // GUVENMEMEKTIR.
      const rows = await ownerPool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'appointments' AND indexname = 'appointments_embedding_idx'`,
      );

      expect(rows.rows[0]?.indexdef).toMatch(/USING hnsw .*vector_cosine_ops/);
    });

    it('takvim penceresi index i (tenant_id, scheduled_at) uzerinde', async () => {
      // Modulun BIRINCIL okuma yolu. MT §12.3: bilesik index'te `tenant_id`
      // DAIMA ilk kolon — ters sirada olsaydi tenant filtresi index'i
      // kullanamazdi.
      const rows = await ownerPool.query<{ indexdef: string }>(
        `SELECT indexdef FROM pg_indexes
         WHERE schemaname = 'appointments' AND indexname = 'appointments_tenant_scheduled_idx'`,
      );

      expect(rows.rows[0]?.indexdef).toMatch(/\(tenant_id, scheduled_at\)/);
    });

    it('`embedding` kolonu vector(1536)', async () => {
      const rows = await ownerPool.query<{ format: string }>(
        `SELECT format_type(a.atttypid, a.atttypmod) AS format
         FROM pg_attribute a
         WHERE a.attrelid = 'appointments.appointments'::regclass AND a.attname = 'embedding'`,
      );

      expect(rows.rows[0]?.format).toBe('vector(1536)');
    });
  });

  describe('RLS izolasyonu (MT §12.6)', () => {
    it('tenant A, B nin randevusunu GOREMEZ', async () => {
      await insertAppointment(TENANT_A, { durationMinutes: 15 });
      await insertAppointment(TENANT_B, { durationMinutes: 45 });

      const rows = await asTenant(TENANT_A, async (client) => {
        // Filtre YAZILMADI; daraltmayi RLS yapti.
        const result = await client.query<{ duration_minutes: number }>(
          'SELECT duration_minutes FROM appointments.appointments',
        );
        return result.rows;
      });

      expect(rows.map((row) => row.duration_minutes)).toEqual([15]);
    });

    it('BASKA tenant adina yazmak WITH CHECK ile reddedilir', async () => {
      await expect(
        asTenant(TENANT_A, (client) =>
          client.query(
            `INSERT INTO appointments.appointments
               (id, tenant_id, scheduled_at, duration_minutes, created_by_user_id)
             VALUES ($1, $2, $3, 30, $4)`,
            [randomUUID(), TENANT_B, SCHEDULED_AT, USER_A],
          ),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, kendi kaydinin tenant_id sini TASIYAMAZ', async () => {
      await insertAppointment(TENANT_A);

      await expect(
        asTenant(TENANT_A, (client) =>
          client.query('UPDATE appointments.appointments SET tenant_id = $1', [TENANT_B]),
        ),
      ).rejects.toThrow(/row-level security/i);
    });

    it('tenant A, B nin randevusunu SILEMEZ', async () => {
      await insertAppointment(TENANT_B);

      const deleted = await asTenant(TENANT_A, async (client) => {
        const result = await client.query('DELETE FROM appointments.appointments');
        return result.rowCount;
      });

      // Sifir satir: RLS silmeyi sessizce KAPSAM DISI birakti, hata vermedi.
      // Use case bunu `AppointmentNotFoundError`e cevirir.
      expect(deleted).toBe(0);
    });

    it('TENANT CONTEXT YOKKEN sorgu SESSIZCE BOS DONMEZ, HATA VERIR', async () => {
      // MT §12.6 madde 4 — `missing_ok` kullanilmamasinin kaniti.
      //
      // ⚠️ Bedeli bu modulde OZELLIKLE agirdir: sessiz bos sonuc "bugun hic
      // randevu yok" gibi gorunur ve kullanici gunu bos sanip evine gider.
      //
      // IKI mesaj da kabul edilir (dort onceki sema testiyle ayni konvansiyon):
      // PostgreSQL, oturumda parametre HIC gorulmediyse "unrecognized
      // configuration parameter", bir kez `SET LOCAL` ile gorulduyse bos dize
      // dondurur ve `::uuid` cast'i "invalid input syntax" ile patlar. Havuzdan
      // gelen baglantinin GECMISI hangisinin gorunecegini belirler — ikisi de
      // FAIL-CLOSED'dir ve testin iddiasi tam olarak budur.
      const client = await appPool.connect();
      try {
        await expect(client.query('SELECT * FROM appointments.appointments')).rejects.toThrow(
          /unrecognized configuration parameter|invalid input syntax/i,
        );
      } finally {
        client.release();
      }
    });
  });

  describe('uygulama rolu ve DAR ROLLER (Constraint 2 esdegeri)', () => {
    it('uygulama rolu semayi GORUR ama icinde nesne OLUSTURAMAZ', async () => {
      const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
        `SELECT has_schema_privilege($1, 'appointments', 'USAGE')  AS usage,
                has_schema_privilege($1, 'appointments', 'CREATE') AS create`,
        [APP_ROLE],
      );

      expect(rows.rows[0]).toEqual({ usage: true, create: false });
    });

    /**
     * ⚠️ HAFIF KAPANIS DENETIMININ MADDESI, OTOMATIKLESTIRILDI.
     *
     * Uc dar `BYPASSRLS` rolu de `appointments` semasina KOR olmalidir. Onlarin
     * tek yetenegi RLS'i asmaktir; yeni bir semaya erisim kazanirlarsa o
     * semanin tenant izolasyonu SESSIZCE delinir — RLS'i zaten atliyorlar,
     * geriye yalnizca GRANT kaliyor.
     */
    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolu appointments semasini HIC GORMEZ',
      async (role) => {
        const rows = await ownerPool.query<{ usage: boolean; create: boolean }>(
          `SELECT has_schema_privilege($1, 'appointments', 'USAGE')  AS usage,
                  has_schema_privilege($1, 'appointments', 'CREATE') AS create`,
          [role],
        );

        expect(rows.rows[0]).toEqual({ usage: false, create: false });
      },
    );

    it.each([RLS_READER_ROLE, OUTBOX_RELAY_ROLE, REPORT_WORKER_ROLE])(
      '%s dar rolunun appointments tablosu uzerinde HICBIR grant i yok',
      async (role) => {
        const rows = await ownerPool.query<{ n: number }>(
          `SELECT count(*)::int AS n FROM information_schema.role_table_grants
           WHERE table_schema = 'appointments' AND grantee = $1`,
          [role],
        );

        expect(rows.rows[0]?.n).toBe(0);
      },
    );
  });
});
