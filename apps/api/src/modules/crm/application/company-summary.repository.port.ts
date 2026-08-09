import { type SummarySourceFacts } from '../domain/company-summary.entity';

export const COMPANY_SUMMARY_REPOSITORY = Symbol('COMPANY_SUMMARY_REPOSITORY');

/** Saklanan onbellek satiri. Satir hic yoksa `null`. */
export interface StoredCompanySummary {
  readonly summary: string | null;
  readonly sourceWatermark: string | null;
  readonly generatedAt: Date | null;
  readonly generatingAt: Date | null;
}

/**
 * `crm.company_summaries` kaliciligi (ADR-0032).
 *
 * RLS notu: butun sorgular cagiranin tenant baglamindaki transaction'da
 * calisir. Bu portta tenant parametresi YOKTUR ve olmamalidir — `tenant_id`
 * yazarken `TenantContext`ten gelir, okurken RLS filtreler.
 */
export interface CompanySummaryRepository {
  /** Sirket bu tenant'ta var mi; adi ve sektoru ne? Yoksa `null`. */
  findCompanyIdentity(companyId: string): Promise<{ name: string; industry: string | null } | null>;

  find(companyId: string): Promise<StoredCompanySummary | null>;

  /**
   * Kaynaklarin bugunku hali — watermark BUNDAN turer.
   *
   * Tek sorguda toplanir: alt sorgulu tek bir `SELECT`. Dort ayri sorgu
   * yapmak ayni cevabi dort gidis-donusle verirdi ve arada veri degisirse
   * TUTARSIZ bir imza uretirdi.
   */
  collectSourceFacts(companyId: string): Promise<SummarySourceFacts>;

  /**
   * En son N gorusmenin metni — ozetin ham girdisi.
   *
   * ⚠️ EMBEDDING KULLANILMAZ. Bu bir ARAMA degil, "her seyin ozeti"dir;
   * benzerlik siralamasi burada yanlis aractir (ADR-0032 §4). Getirme olcutu
   * alaka degil GUNCELLIKTIR.
   */
  recentInteractions(input: {
    companyId: string;
    limit: number;
  }): Promise<readonly { occurredOn: string; body: string }[]>;

  /** Acik firsatlar — kapanmislar (`won`/`lost`) HARIC. */
  openOpportunities(
    companyId: string,
  ): Promise<readonly { title: string; stage: string; estimatedValue: string | null }[]>;

  /**
   * Uretim hakkini ALIR. Satir yoksa acar.
   *
   * `true` -> hak alindi, LLM cagrilabilir.
   * `false` -> baska bir istek uretiyor (claim taze).
   *
   * TEK deyimde yapilir (upsert + kosullu update): "once oku sonra yaz" iki
   * es zamanli istegin ikisine birden hak verebilirdi.
   */
  claim(input: {
    companyId: string;
    tenantId: string;
    staleBefore: Date;
    now: Date;
  }): Promise<boolean>;

  /** Ozeti yazar ve claim'i BIRAKIR. */
  complete(input: {
    companyId: string;
    summary: string;
    sourceWatermark: string;
    now: Date;
  }): Promise<void>;

  /**
   * Claim'i birakir ama ozeti YAZMAZ — uretim coktugunde cagrilir.
   *
   * Olmasaydi coken bir istek satiri iki dakika kilitli birakirdi ve kullanici
   * "tekrar dene" dedigunde 409 alirdi: hatanin ustune ikinci bir hata.
   */
  releaseClaim(companyId: string): Promise<void>;
}
