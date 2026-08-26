/**
 * Kampanya modulunun domain hatalari (ADR-0047).
 *
 * ⚠️ `CampaignAlreadyExistsError` DIYE BIR HATA YOKTUR ve bu bir eksiklik
 * degil §1.2'nin dogrudan sonucudur: tabloda TEKILLIK KISITI yok, cunku
 * "Instagram kampanyasi" her ay tekrarlanabilir ve ikisi de GERCEKTIR.
 * ⚠️ Dolayisiyla bu modulde **409 diye bir cevap da yoktur**.
 */
export abstract class MarketingDomainError extends Error {
  abstract readonly code: string;
}

export class InvalidCampaignNameError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_NAME_INVALID';

  constructor() {
    super('Kampanya adi bos olamaz.');
  }
}

export class CampaignNameTooLongError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_NAME_TOO_LONG';

  constructor(actual: number, max: number) {
    super(
      `Kampanya adi cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir.`,
    );
  }
}

export class CampaignChannelTooLongError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_CHANNEL_TOO_LONG';

  constructor(actual: number, max: number) {
    super(
      `Kanal etiketi cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir. Kanal bir ETIKETTIR, bir aciklama degil.`,
    );
  }
}

export class CampaignResultNoteTooLongError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_RESULT_NOTE_TOO_LONG';

  constructor(actual: number, max: number) {
    super(
      `Sonuc notu cok uzun: ${String(actual)} karakter. ` +
        `En fazla ${String(max)} karakter olabilir. ` +
        'Uzun bir rapor icin Belge modulu daha dogrudur.',
    );
  }
}

export class InvalidCampaignStatusError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_STATUS_INVALID';

  constructor(value: string) {
    super(`Gecersiz kampanya durumu: ${value}. Beklenen: draft, active, done.`);
  }
}

export class InvalidCampaignDateError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_DATE_INVALID';

  constructor(value: string) {
    super(`Gecersiz tarih: ${value}. Takvim gunu bekleniyor (YYYY-AA-GG).`);
  }
}

/**
 * ⚠️ Bitis tarihi baslangictan ONCE olamaz — ama `null` OLABILIR.
 *
 * `null`, "acik uclu kampanya"dir ve gercek bir durumdur (surekli yayindaki
 * bir Google Ads kampanyasi). Zorunlu kilmak kullaniciyi UYDURMA BIR TARIH
 * yazmaya iterdi.
 */
export class CampaignDatesOutOfOrderError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_DATES_OUT_OF_ORDER';

  constructor(startsOn: string, endsOn: string) {
    super(`Bitis tarihi (${endsOn}) baslangictan (${startsOn}) once olamaz.`);
  }
}

export class CampaignNotFoundError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_NOT_FOUND';

  constructor() {
    super('Kampanya bulunamadi.');
  }
}

export class InvalidCampaignEmbeddingDimensionsError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_EMBEDDING_DIMENSIONS_INVALID';

  constructor(expected: number, actual: number) {
    super(`Embedding boyutu ${String(expected)} olmali, ${String(actual)} geldi.`);
  }
}

export class CampaignCompanyNotFoundError extends MarketingDomainError {
  readonly code = 'CAMPAIGN_COMPANY_NOT_FOUND';

  constructor() {
    super('Bagli musteri sirketi bulunamadi.');
  }
}
