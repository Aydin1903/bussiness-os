import {
  BlankOpportunityTitleError,
  CurrencyRequiredError,
  InvalidCrmTimestampError,
  InvalidOpportunityStageError,
} from './crm.error';

/**
 * Satis hattindaki firsat (ADR-0031 §2).
 *
 * ============================================================================
 * ASAMA GECISLERI SERBEST — kisitlayici bir durum makinesi YOK
 * ============================================================================
 * Projede `Tenant`, `Membership` ve `User` durum makineleri var; firsat asamasi
 * onlardan FARKLIDIR. `lost` -> `in_discussion` (kaybedilen anlasmanin yeniden
 * acilmasi) B2B satista en sik eylemlerden biridir: butce gelecek ceyrekte
 * acilir, rakip teslim edemez, karar verici degisir. `won` -> geri donus de
 * mumkundur (sozlesme imzalanmadan iptal).
 *
 * Engellemek kullaniciyi yazilima YALAN SOYLEMEYE iter: asamayi hic
 * guncellemez, veri bayatlar ve Slice 7'de AI bayat veriyle cevap verir.
 * Modulun var olma sebebi dogru baglam uretmektir.
 *
 * ⚠️ BILINEN SINIR: asama GECMISI tablosu kapsam disidir (ADR-0031 §2). Yani
 * kaybedilen bir firsat yeniden acilinca "bir zamanlar kaybedilmisti" bilgisi
 * KAYBOLUR. Bugun o bilgiyi soran kimse yok.
 *
 * ============================================================================
 * `stageChangedAt` YALNIZCA GERCEK DEGISIMDE ILERLER
 * ============================================================================
 * Ayni asamayi tekrar gonderen bir `PATCH` sayaci SIFIRLAMAZ. Aksi halde
 * "bu firsat 40 gundur ayni asamada" sinyali bir no-op guncellemeyle
 * SESSIZCE silinebilirdi — ve Slice 7'nin yapisal katkicisi tam olarak o
 * sinyali okuyacak. AI'a yanlis bir "her sey yolunda" tablosu gosterirdi.
 * ============================================================================
 *
 * `Company` ile ayni iyimser-eszamanlilik sinirini tasir (son yazan kazanir).
 */
export const OPPORTUNITY_STAGES = [
  'potential',
  'in_discussion',
  'proposal_sent',
  'won',
  'lost',
] as const;

export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

/** Kapanmis asamalar — takipler gorunumu bunlari DISLAR (ADR-0031 §3). */
export const CLOSED_STAGES: readonly OpportunityStage[] = ['won', 'lost'];

export function isOpportunityStage(value: string): value is OpportunityStage {
  return OPPORTUNITY_STAGES.some((stage) => stage === value);
}

export interface OpportunityFields {
  readonly title: string;
  readonly stage: OpportunityStage;
  /** `numeric` — string olarak tasinir; kayan noktali sayida para tutulmaz. */
  readonly estimatedValue: string | null;
  readonly currency: string | null;
  /** `YYYY-MM-DD`. Takvim gunu, an DEGIL. */
  readonly nextFollowUpOn: string | null;
  readonly contactId: string | null;
}

export type OpportunityPatch = {
  readonly [K in keyof OpportunityFields]?: OpportunityFields[K] | undefined;
};

export interface OpportunityState extends OpportunityFields {
  readonly id: string;
  readonly tenantId: string;
  readonly companyId: string;
  readonly stageChangedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Opportunity {
  private constructor(private readonly state: OpportunityState) {}

  static create(input: {
    id: string;
    tenantId: string;
    companyId: string;
    fields: OpportunityFields;
    now: Date;
  }): Opportunity {
    const title = input.fields.title.trim();
    if (title === '') {
      throw new BlankOpportunityTitleError();
    }
    assertStage(input.fields.stage);
    assertCurrency(input.fields.estimatedValue, input.fields.currency);

    return new Opportunity({
      id: input.id,
      tenantId: input.tenantId,
      companyId: input.companyId,
      ...input.fields,
      title,
      currency: blankToNull(input.fields.currency),
      stageChangedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  static fromPersistence(state: OpportunityState): Opportunity {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidCrmTimestampError();
    }
    return new Opportunity(state);
  }

  update(changes: OpportunityPatch, now: Date): Opportunity {
    const current = this.state;

    const title = (changes.title ?? current.title).trim();
    if (title === '') {
      throw new BlankOpportunityTitleError();
    }

    const stage = changes.stage ?? current.stage;
    assertStage(stage);

    const estimatedValue =
      changes.estimatedValue === undefined ? current.estimatedValue : changes.estimatedValue;
    const currency =
      changes.currency === undefined ? current.currency : blankToNull(changes.currency);
    assertCurrency(estimatedValue, currency);

    return new Opportunity({
      ...current,
      title,
      stage,
      estimatedValue,
      currency,
      nextFollowUpOn:
        changes.nextFollowUpOn === undefined ? current.nextFollowUpOn : changes.nextFollowUpOn,
      contactId: changes.contactId === undefined ? current.contactId : changes.contactId,
      // GERCEK degisim yoksa DOKUNULMAZ — bkz. sinif yorumu.
      stageChangedAt: stage === current.stage ? current.stageChangedAt : now,
      updatedAt: now,
    });
  }

  toState(): OpportunityState {
    return this.state;
  }
}

function assertStage(stage: string): void {
  if (!isOpportunityStage(stage)) {
    throw new InvalidOpportunityStageError(stage);
  }
}

/**
 * Tutar varsa para birimi ZORUNLU (Product Owner onayi, ADR-0031 Slice 5).
 *
 * Birimsiz bir tutar gercek bir veri hatasidir ve toplamlari sessizce yanlis
 * yapar. Veritabaninda da ayni kisit var (`0017`); burada yakalanmasi
 * istemciye 500 yerine anlamli bir 422 dondurur.
 */
function assertCurrency(value: string | null, currency: string | null): void {
  if (value !== null && blankToNull(currency) === null) {
    throw new CurrencyRequiredError();
  }
}

function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
