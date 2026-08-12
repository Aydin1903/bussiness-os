import { Injectable } from '@nestjs/common';
import {
  and,
  asc,
  cosineDistance,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  sql,
  type SQL,
} from 'drizzle-orm';

import { appointments } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type AppointmentRepository,
  type ListPage,
  type PeriodSummary,
  type SimilarAppointmentNote,
  type UnindexedAppointment,
  type UpcomingAppointment,
} from '../application/appointment.repository.port';
import {
  Appointment,
  isAppointmentStatus,
  type AppointmentStatus,
} from '../domain/appointment.entity';
import { InvalidAppointmentStatusError } from '../domain/appointments.error';

/**
 * ⚠️ ACIK KOLON PROJEKSIYONU — `select()` (yani `SELECT *`) KULLANILMIYOR
 * ============================================================================
 * Dort onceki repository `db.select()` yaziyor ve bu orada dogruydu: tablolarin
 * hicbiri VEKTOR TASIMIYORDU (vektorler ayri `*_chunks` tablolarindaydi).
 *
 * Burada tasiyor (ADR-0035 §3 — chunk tablosu yok). `SELECT *` her satirda
 * 1536 `float`i (~6 KB) agdan cekerdi ve HICBIRI KULLANILMAZDI: `embedding`
 * yalnizca anlamsal katkicinin `<=>` operatoruyle SQL ICINDE kullandigi bir
 * alandir, entity'de karsiligi yoktur.
 *
 * ⚠️ Bugun maliyeti SIFIR (kolon her satirda `NULL`) — yani bu satirlar bir
 * optimizasyon degil, Slice 3'te SESSIZCE olusacak bir regresyonun onlenmesi.
 * `service_note` de ayni sebeple disarida: entity onu tasimiyor.
 */
const COLUMNS = {
  id: appointments.id,
  tenantId: appointments.tenantId,
  /** SLICE 2'de eklendi: entity artik bu isaretciyi tasiyor (ADR-0035 §4). */
  crmContactId: appointments.crmContactId,
  /**
   * SLICE 3'te eklendi. ⚠️ `embedding` HALA DISARIDA ve oyle kalmali: entity
   * onu tasimiyor ve hicbir okuma yolu ona ihtiyac duymuyor.
   */
  serviceNote: appointments.serviceNote,
  scheduledAt: appointments.scheduledAt,
  durationMinutes: appointments.durationMinutes,
  status: appointments.status,
  createdByUserId: appointments.createdByUserId,
  createdAt: appointments.createdAt,
  updatedAt: appointments.updatedAt,
};

/**
 * `AppointmentRepository`'nin Drizzle implementasyonu.
 *
 * SORGULARDA `WHERE tenant_id` YOK — daraltmayi RLS yapar (migration `0026`).
 * Gerekce port dosyasindadir; burada tekrarlanmaz. Bunun gercekten calistigi
 * entegrasyon testiyle KANITLANIR.
 */
@Injectable()
export class DrizzleAppointmentRepository implements AppointmentRepository {
  async save(appointment: Appointment): Promise<void> {
    const { db } = requireTransaction();
    const state = appointment.toState();

    // Tek deyimlik UPSERT: `create` ve `update` ayni yolu kullanir.
    //
    // ⚠️ `crmContactId` SLICE 2'DE SET LISTESINE GIRDI. Slice 1 boyunca disarida
    // durmustu cunku API onu kabul etmiyordu; `crm.public.ts`in kisi dizini
    // geldigi icin artik yaziliyor. `undefined` = dokunma / `null` = temizle
    // ayrimi entity'de cozulur, buraya gelen deger ZATEN nihai durumdur.
    //
    // ⚠️ `serviceNote` SLICE 3'TE GIRDI. `embedding` HALA DISARIDA ve bu
    // KASITLIDIR: vektorun uretimi bir AG CAGRISI gerektirir ve o cagri
    // transaction'in disinda kalir. Vektor `setEmbedding` ile yazilir.
    await db
      .insert(appointments)
      .values(state)
      .onConflictDoUpdate({
        target: appointments.id,
        set: {
          crmContactId: state.crmContactId,
          serviceNote: state.serviceNote,
          scheduledAt: state.scheduledAt,
          durationMinutes: state.durationMinutes,
          status: state.status,
          updatedAt: state.updatedAt,
        },
      });
  }

  async setEmbedding(input: { id: string; embedding: readonly number[] | null }): Promise<number> {
    const { db } = requireTransaction();

    const updated = await db
      .update(appointments)
      // Drizzle `vector` kolonu `number[]` ister; port `readonly` sozu veriyor
      // (cagiran diziyi degistirmesin diye) ve burada kopyalanarak aciliyor.
      .set({ embedding: input.embedding === null ? null : [...input.embedding] })
      .where(eq(appointments.id, input.id))
      .returning({ id: appointments.id });

    return updated.length;
  }

  async findUnindexed(limit: number): Promise<UnindexedAppointment[]> {
    const { db } = requireTransaction();

    // ⚠️ IS LISTESI TURETILMISTIR — ayri bir "onarilacaklar" tablosu YOK.
    //
    // ⚠️ `embedding` SECILMEZ, yalnizca `IS NULL` diye SUZULUR: onarilacak
    // satirlarin vektoru zaten yoktur, ama kolonu projeksiyona koymak bu
    // sorguyu ileride (kismen indekslenmis bir tabloda) pahalilastirirdi.
    const rows = await db
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        crmContactId: appointments.crmContactId,
        serviceNote: appointments.serviceNote,
      })
      .from(appointments)
      .where(and(isNotNull(appointments.serviceNote), isNull(appointments.embedding)))
      // En eski once: onarim kuyrugu FIFO'dur, yoksa buyuk bir birikimde ayni
      // satirlar tekrar tekrar secilebilirdi.
      .orderBy(asc(appointments.scheduledAt), asc(appointments.id))
      .limit(limit);

    // `serviceNote` sorguda `IS NOT NULL` ile suzuldu; tip daraltmasi burada
    // ACIKCA yapiliyor cunku Drizzle bunu yuklem uzerinden goremez.
    return rows.flatMap((row) =>
      row.serviceNote === null ? [] : [{ ...row, serviceNote: row.serviceNote }],
    );
  }

  async findSimilarNotes(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarAppointmentNote[]> {
    const { db } = requireTransaction();

    // ⚠️ `embedding` SECILMEZ (1536 float agdan gecmesin) ama `IS NOT NULL`
    // SUZULUR: vektoru olmayan satirlar `LIMIT` yuvalarini bosa harcamasin.
    //
    // Siralama `cosineDistance` ARTAN — yani en YAKIN once. Operator migration
    // `0026`'nin `vector_cosine_ops` HNSW index'iyle eslesmek ZORUNDA; aksi
    // halde index devre disi kalir ve sorgu tam tarama yapar (sessiz bir
    // performans coku).
    const rows = await db
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        serviceNote: appointments.serviceNote,
      })
      .from(appointments)
      .where(isNotNull(appointments.embedding))
      .orderBy(asc(cosineDistance(appointments.embedding, [...input.embedding])))
      .limit(input.limit);

    // `serviceNote` teorik olarak `null` olabilir (vektor var, not silinmis) —
    // pratikte `setEmbedding(null)` bunu onler ama tip daraltmasi ACIKCA
    // yapiliyor: savunma katmani, sessiz bir `null` sizmasindan iyidir.
    return rows.flatMap((row) =>
      row.serviceNote === null ? [] : [{ ...row, serviceNote: row.serviceNote }],
    );
  }

  async summarizePeriod(input: { from: Date; to: Date }): Promise<PeriodSummary> {
    const { db } = requireTransaction();

    // ⚠️ TOPLAMA SQL'DE: satirlari cekip JS'te saymak, bir yilin randevularini
    // (binlerce satir) HER SORUDA aga tasirdi.
    const [row] = await db
      .select({
        total: sql<number>`count(*)::int`,
        completed: sql<number>`count(*) FILTER (WHERE ${appointments.status} = 'completed')::int`,
        noShow: sql<number>`count(*) FILTER (WHERE ${appointments.status} = 'no_show')::int`,
        cancelled: sql<number>`count(*) FILTER (WHERE ${appointments.status} = 'cancelled')::int`,
      })
      .from(appointments)
      .where(
        and(gte(appointments.scheduledAt, input.from), lt(appointments.scheduledAt, input.to)),
      );

    return row ?? { total: 0, completed: 0, noShow: 0, cancelled: 0 };
  }

  async findUpcoming(input: {
    from: Date;
    to: Date;
    limit: number;
  }): Promise<UpcomingAppointment[]> {
    const { db } = requireTransaction();

    // YALNIZCA `scheduled`: tamamlanmis, iptal edilmis ya da gelinmemis bir
    // randevu "yaklasan" DEGILDIR (`CLOSED_APPOINTMENT_STATUSES` ile ayni
    // yuklem — sozluk orada TEK yerde yasiyor).
    return db
      .select({
        id: appointments.id,
        scheduledAt: appointments.scheduledAt,
        durationMinutes: appointments.durationMinutes,
        crmContactId: appointments.crmContactId,
      })
      .from(appointments)
      .where(
        and(
          gte(appointments.scheduledAt, input.from),
          lt(appointments.scheduledAt, input.to),
          eq(appointments.status, 'scheduled'),
        ),
      )
      .orderBy(asc(appointments.scheduledAt), asc(appointments.id))
      .limit(input.limit);
  }

  async findById(id: string): Promise<Appointment | null> {
    const { db } = requireTransaction();
    const rows = await db
      .select(COLUMNS)
      .from(appointments)
      .where(eq(appointments.id, id))
      .limit(1);

    const row = rows[0];
    return row === undefined ? null : toAppointment(row);
  }

  async list(input: {
    limit: number;
    offset: number;
    from: Date | null;
    to: Date | null;
    status: AppointmentStatus | null;
  }): Promise<ListPage<Appointment>> {
    const { db } = requireTransaction();

    // ⚠️ Filtre HEM sayfaya HEM sayaca uygulanir. Yalnizca sayfaya
    // uygulansaydi `total` filtrelenmemis toplami dondururdu ve arayuzun
    // sayfalayicisi var olmayan sayfalar gosterirdi — sessiz ve fark edilmesi
    // zor bir hata (`DrizzleProjectRepository.list`te ogrenilen ayni ders).
    const conditions: SQL[] = [];
    if (input.from !== null) {
      conditions.push(gte(appointments.scheduledAt, input.from));
    }
    if (input.to !== null) {
      // ⚠️ `lt`, `lte` DEGIL — YARI ACIK aralik (gerekce port dosyasinda).
      // `lte` olsaydi gelecek haftanin ilk anindaki bir randevu IKI HAFTADA DA
      // gorunurdu ve cift sayim SESSIZ olurdu.
      conditions.push(lt(appointments.scheduledAt, input.to));
    }
    if (input.status !== null) {
      conditions.push(eq(appointments.status, input.status));
    }
    const filter = conditions.length === 0 ? undefined : and(...conditions);

    // ⚠️ Siralama ARTAN (`asc`) — `finance.transactions`in `desc`inden bilincli
    // sapma. Islem listesi bir GECMIS akisidir ("en son ne oldu"); randevu
    // listesi bir TAKVIMDIR ve gun icinde erken olan once gelir. `desc`
    // olsaydi haftalik grid satirlari ters sirada alirdi.
    //
    // `id` TIE-BREAKER: ayni ana dusen iki randevu MESRUDUR (cakisma kontrolu
    // yok, ADR-0035 §2e) ve kararsiz siralama, sayfalamada bir kaydin iki kez
    // ya da HIC gorunmesi demektir.
    const rows = await db
      .select(COLUMNS)
      .from(appointments)
      .where(filter)
      .orderBy(asc(appointments.scheduledAt), asc(appointments.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(appointments)
      .where(filter);

    return { items: rows.map(toAppointment), total: counted?.total ?? 0 };
  }

  async deleteById(id: string): Promise<number> {
    const { db } = requireTransaction();
    const deleted = await db
      .delete(appointments)
      .where(eq(appointments.id, id))
      .returning({ id: appointments.id });

    return deleted.length;
  }
}

/** Satiri entity'ye cevirir; `status` daraltmasi tek yerde yapilir. */
function toAppointment(row: {
  id: string;
  tenantId: string;
  crmContactId: string | null;
  serviceNote: string | null;
  scheduledAt: Date;
  durationMinutes: number;
  status: string;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Appointment {
  return Appointment.fromPersistence({
    ...row,
    status: toStatus(row.status),
    // ⚠️ Kolon NULLABLE ama entity zorunlu tutuyor. Ayrim kasitli: yazma yolu
    // kimligi HER ZAMAN doldurur (controller onu tenant principal'inden alir),
    // ama kolon `platform.users`a FK VEREMEZ (Mutlak Kural 5) ve ileride bir
    // ithalat betigi bos birakabilir. Bos dize, "kim olusturdu" sorusuna
    // "bilinmiyor" cevabidir — uydurulmus bir kullanici id'si degil.
    createdByUserId: row.createdByUserId ?? '',
  });
}

/**
 * Veritabani `text` doner; birlesim tipine daraltilir.
 *
 * Tip ZORLAMASI (`as`) kullanilmaz (DEVELOPMENT_RULES 2.3): zorlamak, CHECK
 * kisiti bir gun degisirse bozuk bir degeri gecerli gosterirdi.
 *
 * Pratikte ULASILMAZ: satir migration `0026`'nin `appointments_status_valid`
 * CHECK kisitindan gecmistir. Savunma katmani — `toStatus` / `toDirection` ile
 * birebir ayni desen.
 */
function toStatus(value: string): AppointmentStatus {
  if (!isAppointmentStatus(value)) {
    throw new InvalidAppointmentStatusError(value);
  }
  return value;
}
