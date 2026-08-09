import { type Project, type ProjectStatus } from '../domain/project.entity';

export const PROJECT_REPOSITORY = Symbol('PROJECT_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
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
   * ⚠️ GOREV SAYACLARI BURADA YOK. `crm.companies` listesi `contactCount` /
   * `openOpportunityCount` tasiyor ama onlar Slice 5 ve 6'da EKLENDI, ilk
   * slice'ta degil. Ayni sira burada da korunuyor: `tasks` tablosu Slice 2'de
   * aciliyor, sayaclar da o zaman.
   */
  list(input: {
    limit: number;
    offset: number;
    status: ProjectStatus | null;
  }): Promise<ListPage<Project>>;

  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;
}
