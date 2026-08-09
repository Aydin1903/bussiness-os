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
export interface ProjectListRow extends ProjectState {
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
  }): Promise<ListPage<ProjectListRow>>;

  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;
}
