import { Injectable } from '@nestjs/common';
import { and, asc, cosineDistance, desc, eq, gte, isNotNull, isNull, lte, sql } from 'drizzle-orm';

import { feedbackResponses } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type FeedbackRepository,
  type FeedbackSummaryRow,
  type ListPage,
  type SatisfactionSnapshot,
  type SimilarResponse,
  type UnindexedResponse,
} from '../application/feedback.repository.port';
import { FeedbackResponse } from '../domain/feedback-response.entity';

/**
 * ⚠️ ACIK KOLON PROJEKSIYONU — `select()` (yani `SELECT *`) KULLANILMIYOR
 * ============================================================================
 * `feedback.responses` VEKTOR TASIR (§1.2 — chunk tablosu yok). `SELECT *` her
 * satirda 1536 `float`i (~6 KB) agdan cekerdi ve HICBIRI KULLANILMAZDI:
 * `embedding` yalnizca anlamsal katkicinin `<=>` operatoruyle SQL ICINDE
 * kullandigi bir alandir, entity'de karsiligi yoktur.
 *
 * `DrizzleAppointmentRepository` ve `DrizzleSupplierRepository`nin ayni karari,
 * ucuncu kez.
 */
const RESPONSE_COLUMNS = {
  id: feedbackResponses.id,
  tenantId: feedbackResponses.tenantId,
  rating: feedbackResponses.rating,
  comment: feedbackResponses.comment,
  channel: feedbackResponses.channel,
  crmContactId: feedbackResponses.crmContactId,
  receivedAt: feedbackResponses.receivedAt,
  createdByUserId: feedbackResponses.createdByUserId,
  createdAt: feedbackResponses.createdAt,
};

/**
 * `FeedbackRepository`nin Drizzle implementasyonu (ADR-0045 §1, §2).
 *
 * ============================================================================
 * ⚠️ BIR `update` METODU ARANMASIN — DEGISTIRILEMEZLIGIN IKINCI KATMANI
 * ============================================================================
 * `setResponseEmbedding` DISINDA hicbir `UPDATE` deyimi yoktur ve o da TEK BIR
 * KOLONA yazar. Ucuncu katman (migration `0037`in `GRANT UPDATE (embedding)`i)
 * bunu veritabani seviyesinde de zorlar — yani buraya bir `update` yazilsa
 * bile `permission denied` alirdi.
 *
 * ⚠️ Ama o zaman hata 500 olarak gorunurdu; katmanlarin SIRASI bu yuzden
 * onemlidir: izin (403) -> kod (yol yok) -> veritabani (son savunma).
 */
@Injectable()
export class DrizzleFeedbackRepository implements FeedbackRepository {
  async insertResponse(response: FeedbackResponse): Promise<void> {
    const { db } = requireTransaction();

    // ⚠️ `onConflictDoUpdate` YOK — ve bu bir eksik degil, degistirilemezligin
    // tasiyicisidir (`insertMovement` / `insertInteraction`in ayni karari).
    // UPSERT yazilsaydi id cakismasi durumunda SESSIZCE bir gecmis satirini
    // degistirirdi.
    //
    // ⚠️ `embedding` VALUES'TA YOK ve bu KASITLIDIR: vektorun uretimi bir AG
    // CAGRISI gerektirir ve o cagri transaction'in disinda kalir.
    await db.insert(feedbackResponses).values(response.toState());
  }

  async findResponseById(id: string): Promise<FeedbackResponse | null> {
    const { db } = requireTransaction();

    const [row] = await db
      .select(RESPONSE_COLUMNS)
      .from(feedbackResponses)
      .where(eq(feedbackResponses.id, id))
      .limit(1);

    return row === undefined ? null : FeedbackResponse.fromPersistence(row);
  }

  async listResponses(input: {
    limit: number;
    offset: number;
    minRating: number | null;
    maxRating: number | null;
  }): Promise<ListPage<FeedbackResponse>> {
    const { db } = requireTransaction();

    const conditions = [
      input.minRating === null ? undefined : gte(feedbackResponses.rating, input.minRating),
      input.maxRating === null ? undefined : lte(feedbackResponses.rating, input.maxRating),
    ].filter((condition) => condition !== undefined);

    const filter = conditions.length === 0 ? undefined : and(...conditions);

    // ⚠️ Siralama AZALAN (`desc`) — `appointments`in takvim `asc`inden bilincli
    // sapma. Geri bildirim akisi bir GECMIS AKISIDIR ("en son ne geldi"),
    // `finance.transactions` ve `suppliers.interactions` ile ayni sinifta.
    //
    // ⚠️ Ikincil anahtar `id`: `received_at` esitliginde siralama KARARLI olmak
    // zorundadir, yoksa sayfalama satir ATLAR ya da TEKRARLAR (ayni an iki
    // kayit gelmesi bu modulde COK OLASI — toplu bir anket dokumu).
    const rows = await db
      .select(RESPONSE_COLUMNS)
      .from(feedbackResponses)
      .where(filter)
      .orderBy(desc(feedbackResponses.receivedAt), asc(feedbackResponses.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(feedbackResponses)
      .where(filter);

    return {
      items: rows.map((row) => FeedbackResponse.fromPersistence(row)),
      total: counted?.total ?? 0,
    };
  }

  async deleteResponseById(id: string): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ GERCEK `DELETE` — "soft-delete" DEGIL (§2.2). Bir `deleted_at`
    // isareti, silinmesi ISTENEN kisisel veriyi tabloda TUTMAYA devam ederdi.
    //
    // ⚠️ Vektor de gider: `embedding` AYNI SATIRDA yasar, yani ikinci bir
    // temizlik yolu GEREKMEZ (chunk tablosu olsaydi gerekirdi).
    const deleted = await db
      .delete(feedbackResponses)
      .where(eq(feedbackResponses.id, id))
      .returning({ id: feedbackResponses.id });

    return deleted.length;
  }

  async setResponseEmbedding(input: { id: string; embedding: readonly number[] }): Promise<number> {
    const { db } = requireTransaction();

    // ⚠️ BU, BU TABLODAKI TEK MESRU `UPDATE`TIR ve migration `0037` bunu
    // veritabani seviyesinde de boyle tanimlar (`GRANT UPDATE (embedding)`).
    // Ayni deyimde ikinci bir kolona yazilsaydi PostgreSQL `permission denied`
    // verirdi — yani vektor yazimi, icerik degistirmenin ARKA KAPISI olamaz.
    const updated = await db
      .update(feedbackResponses)
      // Drizzle `vector` kolonu `number[]` ister; port `readonly` sozu veriyor
      // (cagiran diziyi degistirmesin diye) ve burada kopyalanarak aciliyor.
      .set({ embedding: [...input.embedding] })
      .where(eq(feedbackResponses.id, input.id))
      .returning({ id: feedbackResponses.id });

    return updated.length;
  }

  async findUnindexedResponses(limit: number): Promise<UnindexedResponse[]> {
    const { db } = requireTransaction();

    // ⚠️ IKI YUKLEM SART — ve ikincisi bu modulde YENIDIR.
    //
    // `embedding IS NULL` TEK BASINA, yorumsuz kayitlari da secerdi: onlar
    // KALICI OLARAK vektorsuzdur (§1.4, gomulecek metin yok). Sonucu bir
    // SESSIZ KILITLENME olurdu — onarim her cagrida ayni yorumsuz satirlari
    // secer, `repaired: 0` doner ve gercekten onarilmasi gereken kayitlara
    // HIC SIRA GELMEZDI.
    //
    // ⚠️ `embedding` SECILMEZ, yalnizca suzulur: onarilacak satirlarin vektoru
    // zaten yoktur.
    return (
      db
        .select({
          id: feedbackResponses.id,
          rating: feedbackResponses.rating,
          channel: feedbackResponses.channel,
          receivedAt: feedbackResponses.receivedAt,
          // `comment` bu sorguda NOT NULL'dur (yuklem garanti eder) ama Drizzle
          // tipi nullable kalir; port `string` sozu verdigi icin burada
          // daraltiliyor.
          comment: sql<string>`${feedbackResponses.comment}`,
        })
        .from(feedbackResponses)
        .where(and(isNull(feedbackResponses.embedding), isNotNull(feedbackResponses.comment)))
        // En eski once: onarim kuyrugu FIFO'dur, yoksa buyuk bir birikimde ayni
        // satirlar tekrar tekrar secilebilirdi.
        .orderBy(asc(feedbackResponses.receivedAt), asc(feedbackResponses.id))
        .limit(limit)
    );
  }

  async summarize(input: { since: Date; lowRatingMax: number }): Promise<FeedbackSummaryRow> {
    const { db } = requireTransaction();

    // ⚠️ TEK SORGU, DORT SAYI — ve toplama TAMAMEN SQL'DE.
    //
    // Satirlari cekip JS'te toplamak sayfa sinirina takilirdi: kullanici 20
    // kayitlik sayfayi gorur, ortalama 200 kaydin degil O 20'NIN ortalamasi
    // olurdu ve hata SESSIZ kalirdi (`cashflow` ve `inventory` miktarinin ayni
    // disiplini, besinci kez).
    //
    // ⚠️ `round(avg(rating), 1)::text` — YUVARLAMA SUNUCUDA. `avg` bir
    // `numeric` doner; onu JS `number`ina cevirip istemcide bicimlendirmek IKI
    // YERDE IKI FARKLI yuvarlama demekti. Kanonik dize tek yerde uretilir.
    //
    // ⚠️ `count(*) = 0` iken `avg` zaten `NULL` doner — yani "N=0'da ortalama
    // YOKTUR" kurali (§9.1) BURADA DA dogal olarak saglanir; ek bir dal
    // yazmak gerekmiyor.
    //
    // ⚠️ `FILTER (WHERE ...)` kullaniliyor, `CASE WHEN` toplami DEGIL: ikisi de
    // ayni sonucu verir ama `FILTER` NIYETI okunur kilar — "bu kosulu saglayan
    // satirlari say", "1 ve 0 topla" degil.
    const [row] = await db
      .select({
        average: sql<string | null>`round(avg(${feedbackResponses.rating}), 1)::text`,
        count: sql<number>`count(*)::int`,
        lowRatingCount: sql<number>`count(*) FILTER (WHERE ${feedbackResponses.rating} <= ${input.lowRatingMax})::int`,
        withoutCommentCount: sql<number>`count(*) FILTER (WHERE ${feedbackResponses.comment} IS NULL)::int`,
      })
      .from(feedbackResponses)
      .where(gte(feedbackResponses.receivedAt, input.since));

    // ⚠️ Toplama sorgusu HER ZAMAN tek satir doner (gruplama yok), ama tip
    // `undefined` ihtimalini tasir. Savunma katmani: bos pencerenin dogru
    // cevabi `average: null`dir — `'0'` DEGIL (§9.1).
    return row ?? { average: null, count: 0, lowRatingCount: 0, withoutCommentCount: 0 };
  }

  /**
   * Yapisal katkicinin iki pencereli anlik goruntusu (ADR-0045 §3.2).
   *
   * ⚠️ TEK SORGU: iki pencere de `FILTER` ile ayni taramadan cikarilir. Iki
   * ayri sorgu, ayni tabloyu iki kez tarar ve ikisinin ARASINDA yazilan bir
   * satir yuzunden tutarsiz bir cift uretebilirdi (`finance-cashflow` iki ayri
   * ozet cagirir cunku orada pencereler AYRI TABLOLARDAN degil ayri
   * TARIHLERDEN gelir; burada tek tablo var, tek tarama yeter).
   */
  async satisfactionSnapshot(input: {
    from: Date;
    to: Date;
    previousFrom: Date;
    lowRatingMax: number;
  }): Promise<SatisfactionSnapshot> {
    const { db } = requireTransaction();

    const current = sql`${feedbackResponses.receivedAt} >= ${input.from}`;
    const previous = sql`${feedbackResponses.receivedAt} >= ${input.previousFrom} AND ${feedbackResponses.receivedAt} < ${input.from}`;
    const low = sql`${current} AND ${feedbackResponses.rating} <= ${input.lowRatingMax}`;

    const [row] = await db
      .select({
        average: sql<
          string | null
        >`round(avg(${feedbackResponses.rating}) FILTER (WHERE ${current}), 1)::text`,
        count: sql<number>`count(*) FILTER (WHERE ${current})::int`,
        lowRatingCount: sql<number>`count(*) FILTER (WHERE ${low})::int`,
        // ⚠️ `sql<...>` BIR IDDIADIR, BIR DONUSUM DEGIL: drizzle yalnizca
        // TANIMLI KOLONLARI esler; ham bir toplama ifadesi surucuden NE
        // GELIYORSA o gelir — `timestamptz` icin bir DIZE. Tip parametresini
        // `Date` yazmak derleyiciyi susturur ama calisma zamaninda
        // `moment.getTime is not a function` verir.
        // ⚠️ Bu yuzden asagida ACIKCA `Date`e cevriliyor (§ toDate).
        lastLowRatingAt: sql<
          string | null
        >`max(${feedbackResponses.receivedAt}) FILTER (WHERE ${low})`,
        previousAverage: sql<
          string | null
        >`round(avg(${feedbackResponses.rating}) FILTER (WHERE ${previous}), 1)::text`,
      })
      .from(feedbackResponses)
      .where(gte(feedbackResponses.receivedAt, input.previousFrom));

    if (row === undefined) {
      return {
        average: null,
        count: 0,
        lowRatingCount: 0,
        lastLowRatingAt: null,
        previousAverage: null,
      };
    }

    return { ...row, lastLowRatingAt: toDate(row.lastLowRatingAt) };
  }

  async findSimilarResponses(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarResponse[]> {
    const { db } = requireTransaction();

    // ⚠️ `embedding` SECILMEZ (1536 float agdan gecmesin) ama `IS NOT NULL`
    // SUZULUR — ve burada IKI satir sinifini birden eler: yorumsuz kayitlar
    // (kalici olarak vektorsuz) ve henuz onarilmamis olanlar.
    //
    // ⚠️ `JOIN` YOKTUR ve bu, TEDARIKCI'DEN AYRILDIGIMIZ YER: orada tedarikci
    // adi AYNI SEMADAYDI ve basliga JOIN ile ekleniyordu. Burada kisi adi
    // `crm.contacts`tadir — CROSS-SCHEMA JOIN YASAK (Mutlak Kural 5) ve
    // okumanin tek mesru yolu IZIN KAPILI `ContactDirectory`dir;
    // `ContributeInput` ise ROL TASIMAZ. Yani ad ne vektore ne fragment'e
    // girer (§4).
    //
    // Siralama `cosineDistance` ARTAN — en YAKIN once. Operator migration
    // `0037`nin `vector_cosine_ops` HNSW index'iyle eslesmek ZORUNDA; aksi
    // halde index devre disi kalir ve sorgu tam tarama yapar (sessiz bir
    // performans coku).
    return db
      .select({
        id: feedbackResponses.id,
        rating: feedbackResponses.rating,
        channel: feedbackResponses.channel,
        receivedAt: feedbackResponses.receivedAt,
        comment: sql<string>`${feedbackResponses.comment}`,
      })
      .from(feedbackResponses)
      .where(isNotNull(feedbackResponses.embedding))
      .orderBy(asc(cosineDistance(feedbackResponses.embedding, [...input.embedding])))
      .limit(input.limit);
  }
}

/**
 * Ham SQL toplamasindan gelen zaman degerini `Date`e cevirir.
 *
 * ⚠️ Drizzle yalnizca TANIMLI KOLONLARI esler; `max(...)` gibi bir ifade
 * surucunun dondurdugu sekilde gelir (`timestamptz` -> dize). `sql<Date>`
 * yazmak yalnizca DERLEYICIYE bir iddiadir ve calisma zamaninda hicbir sey
 * yapmaz — bu fonksiyon o bosluu kapatir.
 */
function toDate(value: string | Date | null): Date | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}
