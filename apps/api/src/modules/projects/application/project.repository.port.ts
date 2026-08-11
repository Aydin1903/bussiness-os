import { type Project, type ProjectState, type ProjectStatus } from '../domain/project.entity';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Proje listesinin tek satiri — `ProjectState` + GOREV SAYACLARI.
 *
 * ============================================================================
 * SAYACLAR TURETILIR, KOPYALANMAZ
 * ============================================================================
 * `projects.projects` uzerinde "gorev sayisi" diye bir kolon YOKTUR ve
 * olmayacaktir. Degerler her sorguda `projects.tasks`tan turetilir —
 * `CompanyListRow`un `contactCount` / `openOpportunityCount` sayaclariyla
 * birebir ayni karar (ve projede besinci kez).
 *
 * Somut bedeli: bir gorev silindiginde ya da durumu degistiginde sayac
 * KENDILIGINDEN duzelir. Kopyalanmis bir kolonda bunu elle guncellemek gerekir
 * ve biri unutuldugunda kart yalan soylerdi.
 */
export interface ProjectCountsRow extends ProjectState {
  /**
   * ACIK gorev sayisi — kapanmislar (`done`) HARIC.
   *
   * Kapanmislari saymak sayaci "bu projede toplam kac is vardi"ya cevirirdi;
   * sorulan soru ise "su an kac isim var". Ayni ayrim `overdueTaskCount`ta ve
   * Slice 4'un yapisal katkicisinda da yapilir.
   */
  readonly openTaskCount: number;

  /**
   * GECIKMIS gorev sayisi — `due_on < bugun AND status <> 'done'`.
   *
   * Projenin "basi dertte mi" sorusunun tek sayilik cevabi. `openTaskCount`in
   * ALT KUMESIDIR; ikisi toplanmaz.
   */
  readonly overdueTaskCount: number;
}

/**
 * Kullaniciya donen satir — sayaclar + SIRKET ADI.
 *
 * ============================================================================
 * NEDEN IKI TIP: repository `companyName` URETEMEZ
 * ============================================================================
 * Ad `crm.companies`tadir ve `projects` semasindan okunamaz (Mutlak Kural 5).
 * Repository kendi semasinin bildigi kadarini dondurur (`ProjectCountsRow`);
 * adi use case, `CompanyDirectory` uzerinden EKLER.
 *
 * Tek tip olsaydi repository imzasi dolduramayacagi bir alan vaat ederdi —
 * tip sistemi bu sinirin nerede oldugunu artik kendisi soyluyor.
 */
export interface ProjectListRow extends ProjectCountsRow {
  /**
   * Sirket ADI — `companyId` ile BIRLIKTE tasinir, onun yerine degil.
   *
   * `null` UC anlama gelir ve UCU AYIRT EDILMEZ: proje ic projedir
   * (`companyId === null`), sirket silinmistir (ADR-0033 §2d), ya da cagiran
   * `company:read` tasimiyordur (§2c). Arayuz ucunde de ayni seyi gosterir ve
   * bu KASITLIDIR — ayirmak, bir sirketin VAR OLDUGUNU sizdirirdi.
   *
   * ⚠️ Kolonda SAKLANMAZ: her okumada cozulur. Kopyalansaydi sirket yeniden
   * adlandirildiginda bayatlardi.
   */
  readonly companyName: string | null;
}

/**
 * `projects.projects` kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0020`) ve cagiran zaten
 * tenant transaction'i icindedir. `CompanyRepository` ile ayni gerekce: elle bir
 * `WHERE tenant_id` eklemek (a) korumanin RLS'te oldugu gercegini
 * bulaniklastirir, (b) filtre bir gun unutulursa RLS'in hala koruyor oldugu
 * FARK EDILMEZ ve yanlis bir guven duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur
 * (`shared/README.md` — exception yalnizca BEKLENMEYEN durumlar icin).
 * ============================================================================
 */
export interface ProjectRepository {
  save(project: Project): Promise<void>;
  findById(id: string): Promise<Project | null>;

  /**
   * Sayfali liste.
   *
   * `status` verilirse YALNIZCA o durumdakiler doner; `null` ise hepsi.
   * Coklu durum filtresi ("acik olanlar") v1'de YOK: bugun tek bir durum
   * secmek yetiyor ve `IN (...)` yuzeyini simdiden acmak, kullanicisi
   * olmayan bir sorgu bicimi demekti.
   *
   * ⚠️ "Filtre yok" `null` ile ifade edilir, `undefined` ile DEGIL:
   * `exactOptionalPropertyTypes` altinda opsiyonel bir ANAHTAR ile "anahtar var,
   * degeri `undefined`" ayri tiplerdir ve Zod'un `.optional()` ciktisi
   * ikincisidir. `ListContactsQuery` ile ayni cevrim (controller'da `?? null`).
   *
   * PROJEKSIYON doner, entity DEGIL: `openTaskCount` / `overdueTaskCount`
   * `Project` aggregate'ine ait alanlar DEGILDIR, baska bir tablodan turer.
   * `CompanyRepository.list` ile birebir ayni ayrim — yazma yolu `findById`in
   * dondurdugu entity'yi kullanir, liste kullanmaz.
   *
   * `today` sayaclar icindir (`YYYY-MM-DD`); `Clock`tan gelir, `CURRENT_DATE`
   * kullanilmaz.
   */
  list(input: {
    limit: number;
    offset: number;
    status: ProjectStatus | null;
    today: string;
  }): Promise<ListPage<ProjectCountsRow>>;

  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;

  /**
   * `id -> ad` haritasi — `projects.public.ts`in TEK veri ihtiyaci.
   *
   * ⚠️ BULUNAMAYAN id HARITAYA GIRMEZ (hata degil): silinmis proje ya da baska
   * tenant'in projesi. `CompanyRepository.findNamesByIds` ile birebir ayni
   * sozlesme.
   *
   * Bos dizide sorgu ACILMAZ.
   */
  findNamesByIds(ids: readonly string[]): Promise<ReadonlyMap<string, string>>;

  /**
   * YAPISAL katkinin birinci sorgusu (ADR-0033 §6.1).
   *
   * ACIK projeler, RISK sirasinda: once gecikmis gorevi cok olan, sonra en
   * uzun suredir ayni durumda olan. `limit` ile SIKI sinirlidir — katki her
   * soruda gonderilir.
   */
  findRiskyOpenProjects(input: { limit: number; today: string }): Promise<RiskyProjectRow[]>;

  /**
   * YAPISAL katkinin ikinci sorgusu: verilen projelerin SON NOT hareketi.
   *
   * ============================================================================
   * ⚠️ BIRINCI SORGUYLA BIRLESTIRILEMEZ — kartezyen carpim
   * ============================================================================
   * `tasks` ve `progress_notes` IKISI DE bire-coktur. Ayni sorguda ikisini de
   * JOIN'lemek satirlari carpar ve `count(tasks)` SESSIZCE SISER: 3 gorevi ve
   * 2 notu olan bir proje 6 gorev sayar. Iki sorgu, tek dogru cevap.
   */
  findLastNoteActivity(projectIds: readonly string[]): Promise<ReadonlyMap<string, Date>>;
}

/**
 * Yapisal katkinin proje satiri (ADR-0033 §6.1).
 *
 * Entity DEGIL, bir PROJEKSIYON — `PipelineRow` ile ayni disiplin: bir liste
 * bir sorgudur, komut degil.
 *
 * ⚠️ `companyName` YOKTUR ve bu bilincli (ADR-0033 §6, bilinen sinir):
 * `RetrievalContributor` port'u katkici basina TEK `permission` tasir; sirket
 * adi IKINCI bir kapi (`company:read`) isterdi. Sirket adi proje OKUMA
 * yolunda cozulur (`CompanyDirectory`), yapisal katkida degil.
 */
export interface RiskyProjectRow {
  readonly projectId: string;
  readonly name: string;
  readonly status: ProjectStatus;
  readonly statusChangedAt: Date;
  readonly createdAt: Date;
  readonly openTaskCount: number;
  readonly overdueTaskCount: number;
  /** Projenin gorevlerindeki son hareket; hic gorev yoksa `null`. */
  readonly lastTaskActivityAt: Date | null;
}
