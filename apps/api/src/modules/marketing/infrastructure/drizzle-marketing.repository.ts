import { Injectable } from '@nestjs/common';
import { and, cosineDistance, desc, eq, isNotNull, isNull, sql, type SQL } from 'drizzle-orm';

import { marketingCampaigns } from '../../../infrastructure/database/schema';
import { requireTransaction } from '../../../infrastructure/database/transaction-context';
import {
  type CampaignGapRow,
  type CampaignGapSnapshot,
  type CampaignRecord,
  type CampaignSummaryRow,
  type ListPage,
  type MarketingRepository,
  type SimilarCampaign,
  type UnindexedCampaign,
} from '../application/marketing.repository.port';
import { Campaign, type CampaignStatus } from '../domain/campaign.entity';

/** Satirin okunan alanlari — `embedding` BILEREK yok (1536 sayi tasinmaz). */
/**
 * ⚠️ "BOSLUK"UN TEK TANIMI — UC TUKETICI, BIR YUKLEM.
 *
 * ============================================================================
 * ⚠️ NEDEN BURADA VE NEDEN TEK
 * ============================================================================
 * Bu yuklem UC yerde kullanilir ve UCUNUN DE AYNI SEYI soylemesi zorunludur:
 *
 *   1. `gapSnapshot`  -> `campaign-gap` katkicisi (`POST /ask` havuzu)
 *   2. `summarize`    -> duvarin `missingResultCount` uydusu
 *   3. ⚠️ satir projeksiyonu -> her kampanyanin `resultGap` bayragi (ekrandaki
 *      "Sonucu yazilmadi" rozeti)
 *
 * ⚠️ ONCE arayuz bunu KENDI hesapliyordu (`hasResultGap`) ve ADR-0047'nin
 * kapanis denetimi bunu bir SINIR olarak kaydetmisti: "ikisi senkron kalmak
 * zorundadir; ayrisirsa ekran bir sey der, `/ask` baska bir sey sayar ve fark
 * SESSIZ olur." O risk bir testle degil, **tanimi tekillestirerek** kapatildi.
 *
 * ⚠️ IKINCI DAL BILINCLI: `done` olanlar VE takvimde suresi dolmus ama hala
 * `active` gorunenler. Kullanici kampanyayi kapatmayi da unutmus olabilir ve
 * o da bir bosluktur.
 */
function resultGapExpression(today: string): SQL<boolean> {
  return sql<boolean>`(
    (${marketingCampaigns.status} = 'done'
      OR (${marketingCampaigns.status} = 'active'
          AND ${marketingCampaigns.endsOn} IS NOT NULL
          AND ${marketingCampaigns.endsOn} < ${today}))
    AND ${marketingCampaigns.resultNote} IS NULL
  )`;
}

const CAMPAIGN_COLUMNS = {
  id: marketingCampaigns.id,
  tenantId: marketingCampaigns.tenantId,
  name: marketingCampaigns.name,
  channel: marketingCampaigns.channel,
  startsOn: marketingCampaigns.startsOn,
  endsOn: marketingCampaigns.endsOn,
  status: marketingCampaigns.status,
  resultNote: marketingCampaigns.resultNote,
  crmCompanyId: marketingCampaigns.crmCompanyId,
  createdByUserId: marketingCampaigns.createdByUserId,
  createdAt: marketingCampaigns.createdAt,
  updatedAt: marketingCampaigns.updatedAt,
};

@Injectable()
export class DrizzleMarketingRepository implements MarketingRepository {
  async insertCampaign(campaign: Campaign, today: string): Promise<CampaignRecord> {
    const { db } = requireTransaction();
    const state = campaign.toState();

    // ⚠️ `RETURNING` ile bayrak AYNI ISLEMDE geliyor — ikinci bir SELECT yok
    // ve bayrak ISTEMCI TARAFINDA hesaplanmiyor.
    const [row] = await db
      .insert(marketingCampaigns)
      .values({
        id: state.id,
        tenantId: state.tenantId,
        name: state.name,
        channel: state.channel,
        startsOn: state.startsOn,
        endsOn: state.endsOn,
        status: state.status,
        resultNote: state.resultNote,
        crmCompanyId: state.crmCompanyId,
        createdByUserId: state.createdByUserId,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
      })
      .returning({ ...CAMPAIGN_COLUMNS, resultGap: resultGapExpression(today) });

    if (row === undefined) {
      throw new Error('Kampanya eklenemedi.');
    }
    return toRecord(row);
  }

  /**
   * ⚠️ `embedding` BURADA YAZILMAZ.
   *
   * Guncelleme ile yeniden gomme AYRI adimlardir: metin once kaydedilir
   * (kullanicinin yazdigi kaybolmaz), vektor SONRA denenir. Saglayici
   * cokerse `clearCampaignEmbedding` devreye girer (§4.2.1) — tek bir
   * `UPDATE`e sikistirilsaydi, cokme durumunda METIN DE kaybolurdu.
   */
  async updateCampaign(campaign: Campaign, today: string): Promise<CampaignRecord | null> {
    const { db } = requireTransaction();
    const state = campaign.toState();

    const [row] = await db
      .update(marketingCampaigns)
      .set({
        name: state.name,
        channel: state.channel,
        startsOn: state.startsOn,
        endsOn: state.endsOn,
        status: state.status,
        resultNote: state.resultNote,
        crmCompanyId: state.crmCompanyId,
        updatedAt: state.updatedAt,
      })
      .where(eq(marketingCampaigns.id, state.id))
      .returning({ ...CAMPAIGN_COLUMNS, resultGap: resultGapExpression(today) });

    return row === undefined ? null : toRecord(row);
  }

  async findCampaignById(id: string, today: string): Promise<CampaignRecord | null> {
    const { db } = requireTransaction();

    const [row] = await db
      .select({ ...CAMPAIGN_COLUMNS, resultGap: resultGapExpression(today) })
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.id, id))
      .limit(1);

    return row === undefined ? null : toRecord(row);
  }

  async listCampaigns(input: {
    limit: number;
    offset: number;
    status: CampaignStatus | null;
    today: string;
  }): Promise<ListPage<CampaignRecord>> {
    const { db } = requireTransaction();

    const where = input.status === null ? undefined : eq(marketingCampaigns.status, input.status);

    const rows = await db
      .select({ ...CAMPAIGN_COLUMNS, resultGap: resultGapExpression(input.today) })
      .from(marketingCampaigns)
      .where(where)
      .orderBy(desc(marketingCampaigns.startsOn), desc(marketingCampaigns.id))
      .limit(input.limit)
      .offset(input.offset);

    const [counted] = await db
      .select({ total: sql<number>`count(*)::int` })
      .from(marketingCampaigns)
      .where(where);

    return { items: rows.map(toRecord), total: counted?.total ?? 0 };
  }

  async deleteCampaignById(id: string): Promise<number> {
    const { db } = requireTransaction();

    const result = await db.delete(marketingCampaigns).where(eq(marketingCampaigns.id, id));

    return result.rowCount ?? 0;
  }

  async setCampaignEmbedding(input: { id: string; embedding: readonly number[] }): Promise<number> {
    const { db } = requireTransaction();

    const result = await db
      .update(marketingCampaigns)
      .set({ embedding: [...input.embedding] })
      .where(eq(marketingCampaigns.id, input.id));

    return result.rowCount ?? 0;
  }

  async clearCampaignEmbedding(id: string): Promise<number> {
    const { db } = requireTransaction();

    const result = await db
      .update(marketingCampaigns)
      .set({ embedding: null })
      .where(eq(marketingCampaigns.id, id));

    return result.rowCount ?? 0;
  }

  /**
   * ⚠️ SONUC NOTU OLAN ama vektoru OLMAYAN kayitlar.
   *
   * Iki kosul da sart: notu olmayan bir kampanyanin vektoru ZATEN olmamalidir
   * (§3.1), yani onu "onarilacak" saymak `reindex`i sonsuz bir dongude
   * tutardi — her kosumda ayni satirlari bulur, hicbirini duzeltemezdi.
   */
  async findUnindexedCampaigns(limit: number): Promise<UnindexedCampaign[]> {
    const { db } = requireTransaction();

    const rows = await db
      .select({
        id: marketingCampaigns.id,
        name: marketingCampaigns.name,
        channel: marketingCampaigns.channel,
        startsOn: marketingCampaigns.startsOn,
        endsOn: marketingCampaigns.endsOn,
        resultNote: marketingCampaigns.resultNote,
      })
      .from(marketingCampaigns)
      .where(and(isNull(marketingCampaigns.embedding), isNotNull(marketingCampaigns.resultNote)))
      .orderBy(desc(marketingCampaigns.startsOn))
      .limit(limit);

    return rows.map((row) => ({ ...row, resultNote: row.resultNote ?? '' }));
  }

  async findSimilarCampaigns(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarCampaign[]> {
    const { db } = requireTransaction();

    const distance = cosineDistance(marketingCampaigns.embedding, [...input.embedding]);

    const rows = await db
      .select({
        id: marketingCampaigns.id,
        name: marketingCampaigns.name,
        channel: marketingCampaigns.channel,
        startsOn: marketingCampaigns.startsOn,
        endsOn: marketingCampaigns.endsOn,
        resultNote: marketingCampaigns.resultNote,
      })
      .from(marketingCampaigns)
      .where(isNotNull(marketingCampaigns.embedding))
      .orderBy(distance)
      .limit(input.limit);

    return rows.map((row) => ({ ...row, resultNote: row.resultNote ?? '' }));
  }

  /**
   * `campaign-gap`in anlik goruntusu — ⚠️ TEK TARAMA.
   *
   * Bosluk satirlari ve sayimlar iki ayri sorgu olsaydi, ikisinin ARASINDA
   * yazilan bir kampanya tutarsiz bir cift uretirdi ("3 bosluk" der, 2 satir
   * gosterir). Sayimlar `FILTER` ile ayni taramadan cikarilir.
   */
  async gapSnapshot(input: { today: string; limit: number }): Promise<CampaignGapSnapshot> {
    const { db } = requireTransaction();

    // ⚠️ BOSLUGUN TANIMI: bitmis (`done`) ya da takvimde suresi DOLMUS ama
    // hala `active` gorunen — ve sonuc notu YAZILMAMIS kampanya.
    //
    // ⚠️ Ikinci dal (`active` ama tarihi gecmis) bilerek dahil: kullanici
    // kampanyayi kapatmayi da unutmus olabilir ve o da tam olarak bu
    // katkicinin bahsetmesi gereken sey — "kapatilmadan birakildi".
    // ⚠️ PAYLASILAN YUKLEM — ekranin `resultGap` bayragiyla AYNI ifade.
    const gap = resultGapExpression(input.today);

    const rows = await db
      .select({
        id: marketingCampaigns.id,
        name: marketingCampaigns.name,
        channel: marketingCampaigns.channel,
        endsOn: marketingCampaigns.endsOn,
        status: marketingCampaigns.status,
      })
      .from(marketingCampaigns)
      .where(gap)
      .orderBy(desc(marketingCampaigns.endsOn), desc(marketingCampaigns.id))
      .limit(input.limit);

    const [counted] = await db
      .select({
        gapCount: sql<number>`count(*) FILTER (WHERE ${gap})::int`,
        openCount: sql<number>`count(*) FILTER (WHERE ${marketingCampaigns.status} = 'active')::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(marketingCampaigns);

    return {
      gaps: rows.map(toGapRow),
      gapCount: counted?.gapCount ?? 0,
      openCount: counted?.openCount ?? 0,
      totalCount: counted?.totalCount ?? 0,
    };
  }

  /**
   * Duvarin dort sayisi — ⚠️ TEK TARAMA, `FILTER` ile.
   *
   * ⚠️ `gapSnapshot`tan AYRI bir metottur (port'un yorumu): ayni kumeyi
   * sayiyor gorunur ama BASKA BIR YERE gider. Birlestirmek, "ozet bir katkici
   * degildir" ayrimini kodda gorunmez kilardi.
   */
  async summarize(input: { today: string; since: string }): Promise<CampaignSummaryRow> {
    const { db } = requireTransaction();

    const finished = sql`(${marketingCampaigns.status} = 'done'
      OR (${marketingCampaigns.status} = 'active'
          AND ${marketingCampaigns.endsOn} IS NOT NULL
          AND ${marketingCampaigns.endsOn} < ${input.today}))`;
    // ⚠️ PAYLASILAN YUKLEM — katkicinin ve ekranin saydigi AYNI kume.
    const gap = resultGapExpression(input.today);

    const [row] = await db
      .select({
        activeCount: sql<number>`count(*) FILTER (WHERE ${marketingCampaigns.status} = 'active')::int`,
        endedInWindow: sql<number>`count(*) FILTER (WHERE ${finished} AND ${marketingCampaigns.endsOn} >= ${input.since})::int`,
        missingResultCount: sql<number>`count(*) FILTER (WHERE ${gap})::int`,
        unsearchableCount: sql<number>`count(*) FILTER (WHERE ${marketingCampaigns.resultNote} IS NULL)::int`,
        totalCount: sql<number>`count(*)::int`,
      })
      .from(marketingCampaigns);

    return (
      row ?? {
        activeCount: 0,
        endedInWindow: 0,
        missingResultCount: 0,
        unsearchableCount: 0,
        totalCount: 0,
      }
    );
  }
}

function toRecord(row: {
  resultGap: boolean;
  id: string;
  tenantId: string;
  name: string;
  channel: string | null;
  startsOn: string;
  endsOn: string | null;
  status: string;
  resultNote: string | null;
  crmCompanyId: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): CampaignRecord {
  const { resultGap, ...state } = row;
  return {
    campaign: Campaign.fromPersistence({ ...state, status: toStatus(state.status) }),
    resultGap,
  };
}

function toGapRow(row: {
  id: string;
  name: string;
  channel: string | null;
  endsOn: string | null;
  status: string;
}): CampaignGapRow {
  return { ...row, status: toStatus(row.status) };
}

/**
 * ⚠️ Veritabanindaki `text`i domain turune cevirir.
 *
 * CHECK kisiti gecersiz bir degeri zaten engeller; buradaki kontrol o kisitin
 * bir gun DUSURULMESI ihtimaline karsidir — sessizce gecersiz bir durum
 * tasimaktansa PATLAMAK dogrudur.
 */
function toStatus(value: string): CampaignStatus {
  if (value === 'draft' || value === 'active' || value === 'done') {
    return value;
  }
  throw new Error(`Beklenmeyen kampanya durumu: ${value}`);
}
