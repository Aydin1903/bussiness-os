import { TARGET_CHUNK_CHARS } from '../../../shared/chunking';
import { EMBEDDING_DIMENSIONS } from '../../../shared/embedding.port';
import {
  CampaignChannelTooLongError,
  CampaignDatesOutOfOrderError,
  CampaignNameTooLongError,
  CampaignResultNoteTooLongError,
  InvalidCampaignDateError,
  InvalidCampaignEmbeddingDimensionsError,
  InvalidCampaignNameError,
  InvalidCampaignStatusError,
} from './marketing.error';

/**
 * ⚠️ SABIT ENUM — ve `campaign.channel`in TAM TERSI (ADR-0047 §1.6).
 *
 * `channel` serbest metindir cunku degerleri TENANT'A GORE degisir; `status`
 * sabittir cunku degerleri IS MANTIGINI SURER (hangi kampanya "aktif"
 * sayilir). Serbest birakmak kodu SORGULANAMAZ kilardi.
 *
 * ⚠️ `cancelled` YOKTUR: iptal edilen bir kampanya YAPILMAMIS bir kampanyadir
 * ve kaydi SILINIR. Dorduncu bir durum "bitti" ile "hic olmadi"yi ayni listede
 * tutar ve ileride bir sayim SESSIZCE yanlis olurdu.
 *
 * ⚠️ Bu liste veritabanindaki `campaigns_status_valid` CHECK'i ile SENKRON
 * kalmak zorundadir.
 */
export const CAMPAIGN_STATUSES = ['draft', 'active', 'done'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const MAX_CAMPAIGN_NAME_CHARS = 160;
export const MAX_CAMPAIGN_CHANNEL_CHARS = 80;

/**
 * ⚠️ YENI BIR SAYI ICAT EDILMEZ — `TARGET_CHUNK_CHARS`ten TURETILIR.
 *
 * Ayri bir sabit yazilsaydi ve chunking bir gun degisseydi, "chunk tablosu
 * gerekmez" karari SESSIZCE gecersizlesir ve tek-parca varsayimi bozulurdu
 * (ADR-0047 §1.3 — `MAX_SERVICE_NOTE_CHARS`, `MAX_INTERACTION_BODY_CHARS`,
 * `MAX_FEEDBACK_COMMENT_CHARS` ile birebir ayni desen).
 */
export const MAX_CAMPAIGN_RESULT_NOTE_CHARS = TARGET_CHUNK_CHARS;

/** `YYYY-AA-GG` — takvim gunu; ⚠️ bir AN degil (ADR-0047 §1.5). */
const CALENDAR_DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vektore giden metnin SABIT ETIKETLI basligi (ADR-0035 §6.1'in deseni).
 *
 * ============================================================================
 * ⚠️ `status` BASLIGA GIRMEZ (ADR-0047 §4.1)
 * ============================================================================
 * Baslik, kampanyanin NE OLDUGUNU tasir; NEREDE OLDUGUNU degil. Uc gerekce:
 *
 *   a) durum satirin EN SIK DEGISEN alanidir ve her gecis bir saglayici
 *      cagrisi ve bir bayatlama penceresi acardi;
 *   b) "hangi kampanyalar bitti" sorusu YAPISAL BIR FILTREDIR (ekranda, tek
 *      tikla), anlamsal bir arama degil;
 *   c) ADR-0045 puani basliga KOYMUSTU ama o puan DEGISTIRILEMEZDI — burada
 *      durum degisir, yani ayni karar ayni sonucu vermez.
 *
 * ⚠️ Bitisi olmayan kampanyada `→ suruyor` yazilir; kanal yoksa alan HIC
 * YAZILMAZ — bos bir `·` ayraci modele ANLAMSIZ BIR ISARET verirdi.
 */
export function withCampaignHeader(input: {
  name: string;
  channel: string | null;
  startsOn: string;
  endsOn: string | null;
  resultNote: string;
}): string {
  const range = `${input.startsOn} → ${input.endsOn ?? 'suruyor'}`;
  const where = input.channel === null ? '' : ` · ${input.channel}`;
  return `[Kampanya · ${range}${where}] ${input.name} — ${input.resultNote}`;
}

export function assertEmbeddingDimensions(embedding: readonly number[]): void {
  if (embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new InvalidCampaignEmbeddingDimensionsError(EMBEDDING_DIMENSIONS, embedding.length);
  }
}

export interface CampaignState {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly channel: string | null;
  readonly startsOn: string;
  readonly endsOn: string | null;
  readonly status: CampaignStatus;
  readonly resultNote: string | null;
  readonly crmCompanyId: string | null;
  readonly createdByUserId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** `update`in hangi alanlari degistirdigi — ⚠️ yeniden gomme kararinin girdisi. */
export interface CampaignChanges {
  readonly name?: string;
  readonly channel?: string | null;
  readonly startsOn?: string;
  readonly endsOn?: string | null;
  readonly status?: CampaignStatus;
  readonly resultNote?: string | null;
  readonly crmCompanyId?: string | null;
}

export class Campaign {
  private constructor(private readonly state: CampaignState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    name: string;
    channel: string | null;
    startsOn: string;
    endsOn: string | null;
    status: string;
    resultNote: string | null;
    crmCompanyId: string | null;
    now: Date;
  }): Campaign {
    const startsOn = normalizeDay(input.startsOn);
    const endsOn = input.endsOn === null ? null : normalizeDay(input.endsOn);
    assertDateOrder(startsOn, endsOn);

    return new Campaign({
      id: input.id,
      tenantId: input.tenantId,
      name: normalizeName(input.name),
      channel: normalizeChannel(input.channel),
      startsOn,
      endsOn,
      status: normalizeStatus(input.status),
      resultNote: normalizeResultNote(input.resultNote),
      crmCompanyId: input.crmCompanyId,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static fromPersistence(state: CampaignState): Campaign {
    return new Campaign(state);
  }

  /**
   * ⚠️ HER DURUMDA GUNCELLENEBILIR — `done` DAHIL (ADR-0047 §2.2).
   *
   * ⚠️ Burada bir `assertEditable()` YOKTUR ve bu bir unutkanlik degildir:
   * `invoicing.sales_documents`ta oyle bir kontrol VAR (belge sirketten
   * cikti), burada YOK (cikmadi). Bir kontrol koymak, olmayan bir kurali
   * VAR SAYMAK olurdu.
   */
  update(changes: CampaignChanges, now: Date): Campaign {
    const startsOn =
      changes.startsOn === undefined ? this.state.startsOn : normalizeDay(changes.startsOn);
    const endsOn =
      changes.endsOn === undefined
        ? this.state.endsOn
        : changes.endsOn === null
          ? null
          : normalizeDay(changes.endsOn);

    assertDateOrder(startsOn, endsOn);

    return new Campaign({
      ...this.state,
      name: changes.name === undefined ? this.state.name : normalizeName(changes.name),
      channel:
        changes.channel === undefined ? this.state.channel : normalizeChannel(changes.channel),
      startsOn,
      endsOn,
      status: changes.status === undefined ? this.state.status : normalizeStatus(changes.status),
      resultNote:
        changes.resultNote === undefined
          ? this.state.resultNote
          : normalizeResultNote(changes.resultNote),
      crmCompanyId:
        changes.crmCompanyId === undefined ? this.state.crmCompanyId : changes.crmCompanyId,
      updatedAt: now,
    });
  }

  toState(): CampaignState {
    return this.state;
  }

  /**
   * Vektore girecek metin — ⚠️ `resultNote` YOKSA `null`.
   *
   * ⚠️ Adi ve tarihi olan ama sonucu yazilmamis on kampanya, "Eylul
   * kampanyasi / Ekim kampanyasi" gibi NEREDEYSE OZDES kisa vektorler
   * uretirdi: ADR-0034 §6.1'in `Ocak kirasi / Subat kirasi` havuz
   * kirlenmesinin birebir ayni sekli, UCUNCU kez.
   *
   * ⚠️ Durust bedeli: sonucu yazilmamis bir kampanyanin `POST /ask`
   * havuzunda HICBIR SESI YOKTUR — yani SUREN bir kampanya AI'a gorunmez.
   * Tam olarak bu kume, `campaign-gap`in bahsettigi kumedir.
   */
  embeddableContent(): string | null {
    if (this.state.resultNote === null) {
      return null;
    }

    return withCampaignHeader({
      name: this.state.name,
      channel: this.state.channel,
      startsOn: this.state.startsOn,
      endsOn: this.state.endsOn,
      resultNote: this.state.resultNote,
    });
  }
}

/**
 * ⚠️ Gomulen bir alan degisti mi? — YENIDEN GOMME KARARININ TEK YERI
 * (ADR-0047 §4.2).
 *
 * ⚠️ KOSULSUZ yeniden gomme REDDEDILDI: durum gecisi (`draft→active→done`)
 * her kampanyada en az iki `PATCH` demektir ve HICBIRI METNI DEGISTIRMEZ —
 * para harcayan ama hicbir sey degistirmeyen cagrilar olurdu.
 *
 * ⚠️ `status` ve `crmCompanyId` listede YOK cunku ikisi de basliga girmiyor
 * (§4.1). Bu fonksiyon `withCampaignHeader`in girdileriyle SENKRON kalmak
 * zorundadir; ayrisirsa vektor SESSIZCE bayatlar.
 */
export function touchesEmbeddedFields(changes: CampaignChanges): boolean {
  return (
    changes.name !== undefined ||
    changes.channel !== undefined ||
    changes.startsOn !== undefined ||
    changes.endsOn !== undefined ||
    changes.resultNote !== undefined
  );
}

function normalizeName(value: string): string {
  const name = value.trim();
  if (name === '') {
    throw new InvalidCampaignNameError();
  }
  if (name.length > MAX_CAMPAIGN_NAME_CHARS) {
    throw new CampaignNameTooLongError(name.length, MAX_CAMPAIGN_NAME_CHARS);
  }
  return name;
}

function normalizeChannel(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const channel = value.trim();
  if (channel === '') {
    return null;
  }
  if (channel.length > MAX_CAMPAIGN_CHANNEL_CHARS) {
    throw new CampaignChannelTooLongError(channel.length, MAX_CAMPAIGN_CHANNEL_CHARS);
  }
  return channel;
}

function normalizeResultNote(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const note = value.trim();
  if (note === '') {
    return null;
  }
  if (note.length > MAX_CAMPAIGN_RESULT_NOTE_CHARS) {
    // ⚠️ SESSIZ KIRPMA YASAK: kirpsaydik kullanici yazdiginin yarisini
    // kaybettigini FARK ETMEZDI (ADR-0035 §3, altinci kez).
    throw new CampaignResultNoteTooLongError(note.length, MAX_CAMPAIGN_RESULT_NOTE_CHARS);
  }
  return note;
}

function normalizeStatus(value: string): CampaignStatus {
  const found = CAMPAIGN_STATUSES.find((status) => status === value);
  if (found === undefined) {
    throw new InvalidCampaignStatusError(value);
  }
  return found;
}

function normalizeDay(value: string): string {
  if (!CALENDAR_DAY.test(value)) {
    throw new InvalidCampaignDateError(value);
  }
  // ⚠️ Takvimde OLMAYAN bir gun (2026-02-31) formati gecer ama gercek degildir.
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new InvalidCampaignDateError(value);
  }
  return value;
}

function assertDateOrder(startsOn: string, endsOn: string | null): void {
  if (endsOn !== null && endsOn < startsOn) {
    throw new CampaignDatesOutOfOrderError(startsOn, endsOn);
  }
}
