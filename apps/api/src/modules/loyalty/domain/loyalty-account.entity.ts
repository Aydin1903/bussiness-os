/**
 * Sadakat hesabi (ADR-0051 §1.2).
 *
 * ============================================================================
 * ⚠️ `update` METODU YOKTUR — VE BU BIR UNUTKANLIK DEGILDIR
 * ============================================================================
 * `Campaign`de `update` VAR (satirin her alani degisir), `FeedbackResponse`te
 * YOK (ucuncu kisinin beyani). Burada da YOK, ama gerekce UCUNCU bir sekildir:
 * bu satirin GUNCELLENEBILIR BIR ALANI YOKTUR.
 *
 * `crmContactId` degistirilemez cunku onu degistirmek BIR BAKIYEYI BASKA BIR
 * INSANA DEVRETMEKTIR. Yanlis kisiye acilmis bir hesabin dogru cozumu SILIP
 * YENIDEN ACMAKTIR — gorunur, iz birakan ve niyeti belli bir islem.
 *
 * ⚠️ Bu, izin adinda da gorunur: `loyalty_account:create` (yalnizca olustur),
 * `loyalty_account:write` DEGIL (olustur VE guncelle) — ADR-0047 §5'in kurali.
 *
 * ============================================================================
 * ⚠️ `balance` BU ENTITY'DE DE YOKTUR
 * ============================================================================
 * Bakiye SAKLANAN degil TURETILEN bir degerdir (§4.1) ve `AccountState`e
 * koymak, entity'nin onu TASIDIGINI ve `LoyaltyAccount.create` ile
 * uretilebilecegini IMA ederdi — ADR-0047'nin `resultGap` icin verdigi ayni
 * karar (`companyName` ile ayni sinif).
 */
export interface LoyaltyAccountState {
  readonly id: string;
  readonly tenantId: string;
  readonly crmContactId: string;
  readonly createdByUserId: string;
  readonly createdAt: Date;
}

export class LoyaltyAccount {
  private constructor(private readonly state: LoyaltyAccountState) {}

  static create(input: {
    id: string;
    tenantId: string;
    createdByUserId: string;
    crmContactId: string;
    now: Date;
  }): LoyaltyAccount {
    return new LoyaltyAccount({
      id: input.id,
      tenantId: input.tenantId,
      crmContactId: input.crmContactId,
      createdByUserId: input.createdByUserId,
      createdAt: input.now,
    });
  }

  static fromPersistence(state: LoyaltyAccountState): LoyaltyAccount {
    return new LoyaltyAccount(state);
  }

  toState(): LoyaltyAccountState {
    return this.state;
  }
}
