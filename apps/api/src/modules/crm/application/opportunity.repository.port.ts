import {
  type Opportunity,
  type OpportunityStage,
  type OpportunityState,
} from '../domain/opportunity.entity';
import { type ListPage } from './company.repository.port';

export const OPPORTUNITY_REPOSITORY = Symbol('OPPORTUNITY_REPOSITORY');

/**
 * ============================================================================
 * OKUMA YOLU PROJEKSIYON DONER, ENTITY DEGIL
 * ============================================================================
 * Uc satir tipi de (`FollowUpRow`, `PipelineRow`, `OpportunityListRow`) ayni
 * kurala uyar: bir LISTE bir sorgudur, komut degil. Entity'nin degismezlikleri
 * (asama gecisi, `stageChangedAt` ilerlemesi) yalnizca YAZMA yolunda anlam
 * tasir; okuma yolunda entity kurmak, satiri gereksizce bir nesneye sarip yine
 * duz veriye acmaktan ibaret olurdu.
 *
 * Bunun somut sonucu `companyName`dir: `Opportunity` entity'sine sirket adi
 * KONULAMAZ — o alan `Company` aggregate'ine aittir ve firsatin degismezligiyle
 * ilgisi yoktur. Projeksiyon ise iki tabloyu birlestirip okumakta serbesttir.
 */

/** Takipler gorunumunun tek satiri — firsat ENTITY'si DEGIL, bir projeksiyon. */
export interface FollowUpRow {
  readonly opportunityId: string;
  readonly title: string;
  readonly stage: OpportunityStage;
  readonly companyId: string;
  /**
   * Sirket ADI — `companyId` ile BIRLIKTE tasinir, onun yerine degil.
   *
   * Id BAGLANTI icindir (istemci `/app/crm/<id>`e gider), ad GOSTERIM icin.
   * Yalnizca id donmek, istemciyi her takip satiri icin ayri bir sirket
   * cagrisina ya da tum sirketleri cekip haritaya koymaya zorlardi; ikincisi
   * 100 sirketi asan tenant'ta satirin sirketini GOSTEREMEZDI.
   */
  readonly companyName: string;
  readonly nextFollowUpOn: string;
}

/**
 * Liste siralamasi.
 *
 * ============================================================================
 * NEDEN SUNUCUDA — istemcide siralamak YALAN SOYLERDI
 * ============================================================================
 * `priority` "once gecikmis takipler, sonra en son guncellenen" demektir ve
 * hattin (pipeline) sutun basina yalnizca birkac kart gostermesi buna dayanir.
 *
 * Bu siralamayi istemcide yapmak iki yerde bozulurdu:
 *   1. Sutun 4 kart gosterip 20 satir cekseydi, 20'nin DISINDA kalan gecikmis
 *      bir firsat hic gorunmezdi — "gecikmis once" iddiasi sessizce yanlis olurdu.
 *   2. Sayfali listede her sayfa KENDI ICINDE siralanirdi; sayfa 2'nin ilk
 *      satiri sayfa 1'in sonuncusundan daha oncelikli cikabilirdi.
 *
 * `recent` VARSAYILANDIR ve mevcut yuzeylerin davranisini DEGISTIRMEZ
 * (musteri detayindaki firsat bolumu onu kullanmaya devam eder).
 *
 * ⚠️ `priority`nin "gecikmis" esigi SUNUCUNUN takvim gunudur (`CURRENT_DATE`).
 * Ekrandaki "N gun gecikti" ROZETI ise istemcinin yerel gununden hesaplanir
 * (bkz. `follow-up-mark.tsx`). Ikisi ayri olmak zorunda: rozet kullanicinin
 * takvimine ait bir IDDIA, siralama ise yalnizca bir anahtardir — bir gunluk
 * kayma yalnizca komsu iki satirin yerini degistirir, yanlis bir sey yazdirmaz.
 */
export type OpportunityOrder = 'recent' | 'priority';

/**
 * Firsat listesinin tek satiri — `OpportunityState` + sirket adi.
 *
 * `companyName` hattin (pipeline) her kartinda gorunur: hat SIRKETLER ARASI bir
 * gorunumdur ve "hangi anlasma kimin" sorusu orada temel sorudur.
 */
export interface OpportunityListRow extends OpportunityState {
  readonly companyName: string;
}

/**
 * Yapisal katkinin tek satiri (ADR-0031 §5.4).
 *
 * Bir firsatin AI'a anlatilacak hali; entity DEGIL, bir PROJEKSIYON.
 */
export interface PipelineRow {
  readonly opportunityId: string;
  readonly companyName: string;
  readonly title: string;
  readonly stage: OpportunityStage;
  readonly estimatedValue: string | null;
  readonly currency: string | null;
  readonly stageChangedAt: Date;
  readonly nextFollowUpOn: string | null;
}

/**
 * `crm.opportunities` kaliciligi. Tenant daraltmasi RLS'in isidir
 * (bkz. `CompanyRepository`).
 */
export interface OpportunityRepository {
  save(opportunity: Opportunity): Promise<void>;
  findById(id: string): Promise<Opportunity | null>;
  /**
   * Sayfali liste — SIRKET ADIYLA birlikte (projeksiyon).
   *
   * `findById` entity doner (yazma yolu onu kullanir); burasi donmez. Ayrim
   * yukaridaki "okuma yolu projeksiyon doner" notunda.
   */
  list(input: {
    limit: number;
    offset: number;
    companyId: string | null;
    stage: OpportunityStage | null;
    orderBy: OpportunityOrder;
  }): Promise<ListPage<OpportunityListRow>>;
  deleteById(id: string): Promise<number>;

  /**
   * TAKIPLER GORUNUMU — TURETILMIS, ayri bir tablo YOKTUR (ADR-0031 §3).
   *
   * Turetilebilir bir bilgiyi kaliciya yazmak ikinci bir dogruluk kaynagi
   * yaratir ve iki kaynak zamanla birbirini yalanlar (`daily_report_runs`ta
   * `status` kolonunun reddi, ADR-0030 §2.1 — ayni karar).
   *
   * GECIKMIS takipler DAHILDIR: en onemlileri onlardir. "Gecikmis" isaretini
   * istemci koyar; sunucu yalnizca kronolojik siralar.
   *
   * KAPANAN firsat listeden KENDILIGINDEN duser — elle silme isi yoktur.
   */
  listFollowUps(input: { limit: number; offset: number }): Promise<ListPage<FollowUpRow>>;

  /**
   * YAPISAL katki icin acik firsat anlik goruntusu (ADR-0031 §5.4).
   *
   * ============================================================================
   * SIRALAMA: ONCE GECIKMIS TAKIPLER, SONRA DEGER
   * ============================================================================
   * "Hangi anlasmalar takipte gecikti" sorusunun cevabi bir gorusme notunda
   * YAZMAZ; `next_follow_up_on` kolonunda yazar. Yalnizca anlatisal veriyi
   * gomseydik model bu soruyu bayat toplanti notlarindan TAHMIN EDEREK
   * cevaplardi — ve kendinden emin sekilde yanilirdi.
   *
   * KAPANMIS firsatlar (`won`/`lost`) DISLANIR: kapanmis bir anlasma
   * "yapilacak is" degildir.
   * ============================================================================
   */
  listOpenPipeline(input: { limit: number }): Promise<PipelineRow[]>;
}
