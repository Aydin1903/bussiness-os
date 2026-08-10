import {
  BlankProjectNameError,
  InvalidProjectStatusError,
  InvalidProjectsTimestampError,
  ProjectDueBeforeStartError,
} from './projects.error';

/**
 * Proje (ADR-0033 §1).
 *
 * ZAMAN VE KIMLIK DISARIDAN GELIR (DEVELOPMENT_RULES 3.2): entity `new Date()`
 * veya id uretmez — `Company`, `Note` ve `Tenant` ile ayni disiplin.
 *
 * ============================================================================
 * DURUM GECISLERI SERBEST — kisitlayici bir durum makinesi YOK
 * ============================================================================
 * Projede `Tenant`, `Membership` ve `User` durum makineleri var; proje durumu
 * onlardan FARKLIDIR ve `OpportunityStage` ile ayni sinifa girer.
 * `completed` -> `in_progress` (tamamlandi denen isin geri acilmasi) gercek
 * isde OLAGANDIR: musteri revizyon ister, teslim geri doner, iptal edilen is
 * yeniden canlanir.
 *
 * Engellemek kullaniciyi yazilima YALAN SOYLEMEYE iter: durumu hic
 * guncellemez, veri bayatlar ve Slice 4'te AI bayat veriyle cevap verir.
 * Modulun var olma sebebi dogru baglam uretmektir; disiplin adina yanlis baglam
 * uretmek kendi amacini baltalar.
 *
 * ⚠️ BILINEN SINIR: durum GECMISI tablosu kapsam disidir (ADR-0033 §5). Iptal
 * edilen bir proje yeniden acilinca "bir zamanlar iptal edilmisti" bilgisi
 * KAYBOLUR. Bugun o bilgiyi soran kimse yok.
 *
 * ============================================================================
 * `statusChangedAt` YALNIZCA GERCEK DEGISIMDE ILERLER
 * ============================================================================
 * Ayni durumu tekrar gonderen bir `PATCH` sayaci SIFIRLAMAZ. Aksi halde
 * "bu proje 40 gundur 'Devam Ediyor'" sinyali bir no-op guncellemeyle SESSIZCE
 * silinebilirdi — ve Slice 4'un yapisal katkicisi tam olarak o sinyali
 * okuyacak. AI'a yanlis bir "her sey yolunda" tablosu gosterirdi.
 *
 * ============================================================================
 * IYIMSER ESZAMANLILIK YOK — SON YAZAN KAZANIR
 * ============================================================================
 * `Company` ile ayni bilinen sinir: iki kullanici ayni projeyi ayni anda
 * duzenlerse ikincisi birincinin degisikligini SESSIZCE ezer. `updatedAt`
 * tutuluyor ama bir VERSIYON alani ya da `If-Match` kontrolu YOKTUR.
 * ============================================================================
 */
export const PROJECT_STATUSES = ['planning', 'in_progress', 'completed', 'cancelled'] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export function isProjectStatus(value: string): value is ProjectStatus {
  return PROJECT_STATUSES.some((status) => status === value);
}

/**
 * KAPANMIS proje durumlari — yapisal katkici bunlari DISLAR (ADR-0033 §6.1).
 *
 * `CLOSED_STAGES` / `CLOSED_TASK_STATUSES` ile ayni is: yuklem iki yerde ayri
 * yazilsaydi biri degistiginde digeri sessizce ayrisirdi. "Su an neyin
 * uzerinde calisiyoruz" sorusu tamamlanmis ve iptal edilmis projeleri
 * ICERMEZ.
 */
export const CLOSED_PROJECT_STATUSES: readonly ProjectStatus[] = ['completed', 'cancelled'];

export interface ProjectFields {
  readonly name: string;
  readonly status: ProjectStatus;
  readonly description: string | null;
  /** `YYYY-MM-DD`. Takvim gunu, an DEGIL. */
  readonly startedOn: string | null;
  readonly dueOn: string | null;
  /**
   * Cross-modul YUMUSAK referans: `crm.companies.id` — ama FK DEGIL
   * (ADR-0033 §2).
   *
   * ⚠️ SLICE 4'TE `ProjectFields`E GIRDI. Slice 1'de bilerek disaridaydi:
   * dogrulamasi ve adin cozulmesi icin gereken `crm.public.ts` o gun yoktu ve
   * dogrulanamayan bir isaretciyi kabul etmek ILK GUNDEN sarkan satir uretmek
   * olurdu. Artik `CompanyDirectory` var; yazma aninda GORUNURLUK dogrulanir.
   *
   * ⚠️ VARLIK KONTROLU BURADA DEGIL: bir veritabani sorgusu gerektirir ve
   * `domain` katmani framework'suzdur. Kontrol use case'tedir.
   *
   * `null` = ic proje (musteriye bagli degil) ve bu MESRU bir durumdur.
   */
  readonly companyId: string | null;
}

/**
 * KISMI guncelleme govdesi.
 *
 * `Partial<ProjectFields>` YETMEZ: `exactOptionalPropertyTypes` altinda o tip
 * "alan YOK" der, "alan var ama `undefined`" DEMEZ. Zod'un `.partial()` ciktisi
 * ikincisidir. Ayrim anlamlidir: `undefined` = dokunma, `null` = temizle.
 */
export type ProjectPatch = {
  readonly [K in keyof ProjectFields]?: ProjectFields[K] | undefined;
};

export interface ProjectState extends ProjectFields {
  readonly id: string;
  readonly tenantId: string;
  readonly statusChangedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Project {
  private constructor(private readonly state: ProjectState) {}

  static create(input: {
    id: string;
    tenantId: string;
    fields: ProjectFields;
    now: Date;
  }): Project {
    const name = input.fields.name.trim();
    if (name === '') {
      throw new BlankProjectNameError();
    }
    assertStatus(input.fields.status);
    assertDateOrder(input.fields.startedOn, input.fields.dueOn);

    return new Project({
      id: input.id,
      tenantId: input.tenantId,
      ...input.fields,
      name,
      description: blankToNull(input.fields.description),
      statusChangedAt: input.now,
      createdAt: input.now,
      updatedAt: input.now,
    });
  }

  /** Kaliciliktan geri yukler; DOGRULAMA YAPMAZ (veri zaten gecerliydi). */
  static fromPersistence(state: ProjectState): Project {
    if (state.updatedAt < state.createdAt) {
      throw new InvalidProjectsTimestampError();
    }
    return new Project(state);
  }

  /**
   * KISMI guncelleme (PATCH).
   *
   * `undefined` = "dokunma", `null` = "temizle". Ikisi ayirt edilir; `PUT`
   * secilseydi unutulan her alan sessizce `null`'lanirdi.
   */
  update(changes: ProjectPatch, now: Date): Project {
    const current = this.state;

    const name = (changes.name ?? current.name).trim();
    if (name === '') {
      throw new BlankProjectNameError();
    }

    const status = changes.status ?? current.status;
    assertStatus(status);

    const startedOn = changes.startedOn === undefined ? current.startedOn : changes.startedOn;
    const dueOn = changes.dueOn === undefined ? current.dueOn : changes.dueOn;
    assertDateOrder(startedOn, dueOn);

    return new Project({
      ...current,
      name,
      status,
      description:
        changes.description === undefined ? current.description : blankToNull(changes.description),
      startedOn,
      dueOn,
      // `null` = musteri baglantisini KALDIR; mesru bir islem (ic projeye
      // donusturmek). `undefined` = dokunma.
      companyId: changes.companyId === undefined ? current.companyId : changes.companyId,
      // GERCEK degisim yoksa DOKUNULMAZ — bkz. sinif yorumu.
      statusChangedAt: status === current.status ? current.statusChangedAt : now,
      updatedAt: now,
    });
  }

  toState(): ProjectState {
    return this.state;
  }
}

function assertStatus(status: string): void {
  if (!isProjectStatus(status)) {
    throw new InvalidProjectStatusError(status);
  }
}

/**
 * Bitis, baslangictan once olamaz.
 *
 * Karsilastirma DIZE uzerinde yapilir ve bu dogrudur: `YYYY-MM-DD` biciminde
 * sozluk sirasi takvim sirasiyla AYNIDIR. `Date`'e cevirmek, tam olarak
 * kacinilmak istenen saat dilimi sorusunu geri getirirdi.
 */
function assertDateOrder(startedOn: string | null, dueOn: string | null): void {
  if (startedOn !== null && dueOn !== null && dueOn < startedOn) {
    throw new ProjectDueBeforeStartError();
  }
}

/** Bos dizeler `null`'a cevrilir: "girilmedi" ile "bos girildi" ayni seydir. */
function blankToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}
