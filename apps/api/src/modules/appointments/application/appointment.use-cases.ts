import { type Clock } from '../../../shared/clock.port';
import { EmbeddingFailedError, type EmbeddingPort } from '../../../shared/embedding.port';
import { enforceRateLimit } from '../../../shared/enforce-rate-limit';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type RateLimitRepository } from '../../../shared/rate-limit.repository.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import { APPOINTMENT_EMBEDDING_ACTION } from '../appointments.rate-limits';
import {
  Appointment,
  assertEmbeddingDimensions,
  withAppointmentHeader,
  type AppointmentFields,
  type AppointmentPatch,
  type AppointmentState,
  type AppointmentStatus,
} from '../domain/appointment.entity';
import { type ContactDirectory } from '../../crm/crm.public';
import {
  AppointmentContactNotFoundError,
  AppointmentNotFoundError,
} from '../domain/appointments.error';
import {
  type AppointmentRepository,
  type AppointmentRow,
  type ListPage,
} from './appointment.repository.port';

/**
 * Randevu yasam dongusu (ADR-0035 §2, §5).
 *
 * ============================================================================
 * BES USE CASE TEK DOSYADA — `CategoryUseCases` / `ProjectUseCases` ile ayni
 * ============================================================================
 * Besi de AYNI kaynagin CRUD'udur: ayni repository, ayni transaction sinirlari,
 * ayni "bulunamadi -> 404" kurali.
 *
 * ============================================================================
 * ⚠️ SLICE 2: MODUL ILK KEZ BASKA BIR IS MODULUNU OKUYOR
 * ============================================================================
 * `ContactDirectory` ALINIYOR — `crm.public.ts`in TEK yeni kalemi. CRM'in
 * `domain/`, `application/`, `infrastructure/` katmanlari bu module KAPALIDIR
 * (`import/no-restricted-paths`, makine tarafindan zorlanir).
 *
 * ⚠️ IZIN KAPISI (`contact:read`) DIZININ ICINDEDIR, BURADA DEGIL — unutan tek
 * modul bir sizinti kapisi acardi ve unutmak SESSIZ olurdu. Buradan gorunen tek
 * sey sudur: ad gelmediyse `null`, ve SEBEBI SORULMAZ.
 *
 * ⚠️ YON TEK: CRM Randevu'yu BILMEZ ve import ETMEZ. Tersi bir modul dongusu
 * kurardi — projede bir kez yasandi (Tenant <-> Identity) ve cozumu `forwardRef`
 * degil UCUNCU BIR MODUL oldu (`platform/session`). Grafik dorduncu kenarla da
 * DAG kaliyor:
 *
 *     Projeler ──► CRM
 *     Finans   ──► CRM
 *     Finans   ──► Projeler
 *     Randevu  ──► CRM          (bu slice)
 *
 * ============================================================================
 * ⚠️ CAKISMA KONTROLU YOK — ve bu bir unutma degil karardir
 * ============================================================================
 * Iki randevu ayni saate yazilabilir (ADR-0035 §2e). Burada bir
 * `#assertNoOverlap` OLSAYDI, coklu personel takvimi geldigi gun (9. modul, IK)
 * KALDIRILMASI gereken bir kural olurdu — ve kaldirilan bir kural, konmamis bir
 * kuraldan daha pahalidir.
 */
export interface AppointmentDependencies {
  readonly repository: AppointmentRepository;
  /**
   * CROSS-MODUL okuma yuzeyi (ADR-0035 §4).
   *
   * ⚠️ PUBLIC INTERFACE'tir ve izin kapisi ONUN icindedir. Bu bagimlilik,
   * `TransactionUseCases`in `companyDirectory`/`projectDirectory`siyle ayni
   * sinifta — tek farki hedef kaynagin TURU (sirket degil KISI).
   */
  readonly contactDirectory: ContactDirectory;
  readonly rateLimitRepository: RateLimitRepository;
  readonly embeddingPort: EmbeddingPort;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
  /** Saatlik EMBEDDING payi — randevu payi DEGIL. Config'ten gelir. */
  readonly rateLimit: number;
  /** Tek onarim cagrisinda islenecek EN FAZLA randevu. */
  readonly reindexBatchSize: number;
}

/**
 * ⚠️ `get(id)` DIYE BIR USE CASE YOK — ve bu bir eksik degil.
 *
 * ADR-0035 §9 dort uc tanimliyor ve `GET :id` ONLARDAN BIRI DEGIL. Sebep
 * modulun okuma sekli: birincil tuketici HAFTALIK TAKVIM GRIDIDIR ve o, tek bir
 * kaydi degil BIR PENCEREYI ister. Liste zaten tam `AppointmentState`
 * donduruyor (bu modulde "liste satiri" ile "detay" arasinda bir fark yok —
 * `TransactionListRow`/`TransactionEnrichedRow` ayrimini doguran cross-modul
 * adlar Slice 2'ye kadar YOK), yani bir detay ucu ayni veriyi ikinci kez
 * getiren bir yol olurdu.
 *
 * ⚠️ Slice 2 bunu DEGISTIREBILIR: kisi adi cozulmeye baslayinca "tek kaydi
 * getir" anlamli bir istek haline gelir.
 */
export class AppointmentUseCases {
  constructor(private readonly deps: AppointmentDependencies) {}

  async create(input: {
    tenantId: string;
    userId: string;
    role: string;
    fields: AppointmentFields;
  }): Promise<AppointmentState> {
    // Entity ONCE kurulur: sure/durum/zaman dogrulamasi bir veritabani sorgusu
    // ACMADAN once patlar (`TransactionUseCases.create` ile ayni sira).
    const appointment = Appointment.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    const state = appointment.toState();

    // ⚠️ CROSS-MODUL kontrol transaction'in DISINDA ve ONCESINDE: dizin KENDI
    // transaction'ini acar (`TransactionUseCases.create`te verilen ayni karar —
    // ic ice transaction kismi commit riski uretir).
    await this.#assertContactVisible(state.crmContactId, input.role);

    // --- T0: oran siniri — YALNIZCA NOT VARSA -------------------------------
    // ⚠️ NOTSUZ RANDEVU HICBIR SEY HARCAMAZ, dolayisiyla SAYILMAZ. Bu satirin
    // kosulsuz olmasi, sayaci "randevu sayaci"na cevirirdi ve kullanici hic
    // embedding uretmeden kotasini tuketirdi (gerekce
    // `appointments.rate-limits.ts`te).
    if (state.serviceNote !== null) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    // --- T1: randevu --------------------------------------------------------
    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(appointment),
    );

    // --- Ag + T2: vektor ----------------------------------------------------
    await this.#reembed({ ...state, role: input.role });

    return state;
  }

  /**
   * Sayfali liste — takvim penceresi + durum filtresi (ADR-0035 §9).
   *
   * ⚠️ SLICE 2'DE DONUS TIPI DEGISTI: `AppointmentState` -> `AppointmentRow`
   * (kisi adi eklendi). Adlar TEK TOPLU sorguyla cozulur; satir basina cagri
   * N+1 olurdu.
   */
  async list(input: {
    limit: number;
    offset: number;
    from: Date | null;
    to: Date | null;
    status: AppointmentStatus | null;
    role: string;
  }): Promise<ListPage<AppointmentRow>> {
    // ⚠️ `role` AYRILIYOR ve porta GECMIYOR. Repository yetki BILMEZ, yalnizca
    // veri dondurur (`RateLimitRepository` ile ayni disiplin); rol yalnizca
    // cross-modul dizinin izin kapisi icindir. Nesneyi oldugu gibi gecirmek
    // TypeScript'te derlenirdi (fazladan alan kontrolu yalnizca TAZE nesne
    // literallerinde calisir) ve porta sessizce yetki bilgisi sizardi.
    const { role, ...query } = input;

    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(query),
    );

    const rows = page.items.map((appointment) => appointment.toState());
    return { items: await this.#withContactNames(rows, role), total: page.total };
  }

  /**
   * KISMI guncelleme — DURUM GECISI DE BURADAN gecer.
   *
   * Okuma ve yazma AYNI transaction'dadir. ⚠️ Bu bir KILIT DEGILDIR — es
   * zamanli iki `PATCH`'te son yazan kazanir (bilinen sinir, dorduncu modulde
   * de ayni).
   */
  async update(input: {
    id: string;
    tenantId: string;
    userId: string;
    role: string;
    changes: AppointmentPatch;
  }): Promise<AppointmentState> {
    // ⚠️ Cross-modul kontrol transaction'in DISINDA, ONCESINDE ve YALNIZCA
    // gonderilen alan icin. Mevcut (belki sarkan) bir isaretciyi HER
    // guncellemede yeniden dogrulamak, silinmis bir kisiye bagli bir randevunun
    // SAATINI degistirmeyi imkansiz kilardi — `TransactionUseCases.update`in
    // ayni karari.
    if (input.changes.crmContactId !== undefined) {
      await this.#assertContactVisible(input.changes.crmContactId, input.role);
    }

    // ⚠️ Oran siniri, NOT GERCEKTEN DEGISECEKSE odenir — ve bunu bilmek icin
    // mevcut kaydi OKUMAK gerekir. Okuma ucuzdur; embedding degildir.
    const before = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findById(input.id),
    );

    if (before === null) {
      throw new AppointmentNotFoundError();
    }

    const updated = before.update(input.changes, this.deps.clock.now());
    const next = updated.toState();

    // ⚠️ UC AYRI DURUM ve ucu de FARKLI davranir:
    //   not degismedi          -> vektore DOKUNULMAZ, pay odenmez
    //   not degisti (dolu)     -> pay odenir, vektor YENIDEN URETILIR
    //   not silindi (`null`)   -> pay ODENMEZ (ag cagrisi yok), vektor SILINIR
    //
    // ⚠️ Ikinci durumu unutmak SESSIZ bir hatadir (ADR-0035 §5): arama ESKI
    // metni bulmaya devam eder. Birim ve entegrasyon testleri bunu kilitler.
    const noteChanged = next.serviceNote !== before.toState().serviceNote;

    if (noteChanged && next.serviceNote !== null) {
      await this.#enforceEmbeddingBudget(input.tenantId, input.userId);
    }

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.deps.repository.save(updated);

      // Not SILINDIYSE vektor AYNI transaction'da temizlenir — ag cagrisi
      // gerekmedigi icin burada atomiklik BEDAVA. Aksi halde silinen bir notun
      // vektoru satirda kalir ve arama ARTIK VAR OLMAYAN metni bulur.
      if (noteChanged && next.serviceNote === null) {
        await this.deps.repository.setEmbedding({ id: next.id, embedding: null });
      }
    });

    if (noteChanged && next.serviceNote !== null) {
      await this.#reembed({ ...next, role: input.role });
    }

    return next;
  }

  /**
   * Vektoru eksik NOTLU randevulari onarir (ADR-0035 §9).
   *
   * Is listesi TURETILMISTIR (`service_note IS NOT NULL AND embedding IS
   * NULL`); ayri bir "onarilacaklar" tablosu ve deneme sayaci YOKTUR.
   *
   * Oran siniri yazma yoluyla AYNI kovayi paylasir: ayri bir kova, onarimi
   * BUTCESIZ BIR YAN KAPIYA cevirirdi (ADR-0029'un gerekcesi, besinci kez).
   *
   * ⚠️ BU MODULDE ONARIMIN IKI ISI VAR: eksik vektoru uretmek VE baslikta
   * denormalize edilmis BAYAT KISI ADINI tazelemek (§6.1). Finans'ta ikincisi
   * yoktu (baslikta ad yoktu); CRM ve Projeler'de vardi.
   */
  async reindex(input: {
    tenantId: string;
    userId: string;
    role: string;
  }): Promise<{ repaired: number; failed: number }> {
    await this.#enforceEmbeddingBudget(input.tenantId, input.userId);

    const pending = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findUnindexed(this.deps.reindexBatchSize),
    );

    let repaired = 0;
    let failed = 0;

    for (const item of pending) {
      try {
        // Her randevu AYRI ele alinir: birinin cokmesi digerlerini engellemez.
        // Toplu bir transaction, tek bir bozuk kayit yuzunden onarilan her seyi
        // geri alirdi.
        await this.#reembed({
          id: item.id,
          scheduledAt: item.scheduledAt,
          crmContactId: item.crmContactId,
          serviceNote: item.serviceNote,
          role: input.role,
        });
        repaired += 1;
      } catch {
        failed += 1;
      }
    }

    return { repaired, failed };
  }

  /**
   * SERT silme.
   *
   * ⚠️ Cascade YOKTUR ve olmayacaktir: bu modulde parca tablosu yok, vektor
   * AYNI SATIRDA yasiyor (ADR-0035 §3). Randevu silmek yalnizca kendi satirini
   * goturur — retention kolunun tek olmasinin sebebi de budur.
   *
   * ⚠️ Silme GERI ALINAMAZ ve DENETIM IZI YOKTUR (ADR-0035 §5);
   * `appointment:delete`in ayri bir izin olmasinin sebebi budur.
   */
  async delete(id: string): Promise<void> {
    const deleted = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.deleteById(id),
    );

    if (deleted === 0) {
      throw new AppointmentNotFoundError();
    }
  }

  /**
   * T0 — pahali is BASLAMADAN once payi oder, gerekirse reddeder.
   *
   * ⚠️ CAGRILDIGI YERLER SECICIDIR: yalnizca GERCEKTEN embedding uretilecek
   * yollarda. Notsuz randevu, not degistirmeyen bir `PATCH` ve notu SILEN bir
   * `PATCH` (ag cagrisi yok) paydan DUSMEZ.
   */
  async #enforceEmbeddingBudget(tenantId: string, userId: string): Promise<void> {
    await enforceRateLimit(this.deps, {
      tenantId,
      userId,
      action: APPOINTMENT_EMBEDDING_ACTION,
      limit: this.deps.rateLimit,
    });
  }

  /**
   * Baglam basligini kurar, gomer ve vektoru YAZAR.
   *
   * ============================================================================
   * ⚠️ AG CAGRISI TRANSACTION'IN DISINDA — ve bu ADR §5'in okunusudur
   * ============================================================================
   * ADR-0035 §5 "yeniden uretim ... AYNI TRANSACTION SIRASINDA yapilir" der.
   * Burada "ayni ISLEM sirasinda" olarak uygulaniyor, "tek bir veritabani
   * transaction'i icinde" olarak DEGIL. Uc gerekce:
   *
   * 1. ⚠️ Projede BES KEZ yazilmis kural: pahali cagrilar transaction DISINDA
   *    kalir (`enforce-rate-limit.ts`, ADR-0029 §4). Bir OpenAI cagrisi
   *    boyunca havuzdan baglanti tutmak, yuk altinda havuzu tuketir.
   * 2. ⚠️ `reindex` ucunun VAR OLMASI zaten iki asamali akisi ONGORUR: is
   *    listesi "notu olan ama vektoru olmayan" satirlardir. Tek transaction
   *    olsaydi bu durum HIC OLUSAMAZDI ve onarim ucunun isi kalmazdi.
   * 3. Randevunun KENDISI (saat, sure) birincil veridir; not ikincildir.
   *    Embedding cokerse randevu KAYBOLMAMALIDIR — kullaniciyi yeniden
   *    girmeye zorlamak, Finans'in "kaydedildi ancak indekslenemedi"
   *    kararinin reddettigi seydir.
   *
   * §5'in KORUDUGU SEY yine korunuyor: not degistiginde vektor YENIDEN
   * URETILIR ve bu unutulamaz — `update` icindeki `noteChanged` dali ve iki
   * test onu kilitliyor.
   *
   * ⚠️ BEDELI ACIKCA: T1 ile T2 arasinda kisa bir pencere vardir; embedding
   * cokerse ortaya NOTU OLAN ama VEKTORU OLMAYAN bir kayit cikar. Hata YUZEYE
   * CIKAR (502) ve randevu SILINMEZ; onarim ucu ILK GUNDEN vardir.
   *
   * ⚠️ KISI ADI CAGIRANIN ROLUYLE COZULUR (izin kapisi dizinin icinde). Yani
   * `contact:read` tasimayan biri not yazarsa BASLIKTA AD OLMAZ. Bugun dort
   * rolun dordu de o izni tasidigi icin bu yol tetiklenmiyor; tenant-
   * configurable roller geldiginde `reindex` basligi TAZELER.
   */
  async #reembed(input: {
    id: string;
    scheduledAt: Date;
    crmContactId: string | null;
    serviceNote: string | null;
    role: string;
  }): Promise<void> {
    if (input.serviceNote === null) {
      return;
    }

    // Ad, HTTP cevabindan BAGIMSIZ olarak ayrica cozulur: cevap `contactName`i
    // zaten tasiyor ama gomulen metin farkli bir seydir ve `reindex` yolunda
    // ortada bir HTTP cevabi YOKTUR.
    const contactName = await this.#resolveContactName(input.crmContactId, input.role);

    const content = withAppointmentHeader({
      scheduledAt: input.scheduledAt,
      contactName,
      serviceNote: input.serviceNote,
    });

    const embedding = await this.#embed(content);
    // Boyut SINIRDA dogrulanir: yanlis yapilandirilmis bir model VERI
    // YAZILMADAN yakalanir.
    assertEmbeddingDimensions(embedding);

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.setEmbedding({ id: input.id, embedding }),
    );
  }

  /** Baslik icin tek ad; bulunamazsa `null` ve baslik onsuz kurulur. */
  async #resolveContactName(crmContactId: string | null, role: string): Promise<string | null> {
    if (crmContactId === null) {
      return null;
    }

    const names = await this.deps.contactDirectory.findNames({ ids: [crmContactId], role });
    return names.get(crmContactId) ?? null;
  }

  /** Adapter'in firlattigi her hatayi TEK bir domain hatasina cevirir. */
  async #embed(text: string): Promise<number[]> {
    try {
      return await this.deps.embeddingPort.embed(text);
    } catch (error) {
      throw new EmbeddingFailedError(error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * Verilen `crmContactId` cagiran icin GORUNUR mu (ADR-0035 §4).
   *
   * `null` gecerlidir ve kontrol edilmez: bir randevu bir CRM kisisine bagli
   * olmak ZORUNDA degildir (ic toplanti, ilk kez gelen musteri).
   *
   * ⚠️ "Kisi yok", "baska tenant'in" ve "`contact:read` tasimiyorsun" AYNI
   * hatayi verir — dizin ucunu ayirt etmez. Sonucu: goremedigi bir kisiye
   * randevu baglayamaz, ve reddin sebebinden o kisinin VAR OLDUGUNU cikaramaz.
   */
  async #assertContactVisible(crmContactId: string | null, role: string): Promise<void> {
    if (crmContactId === null) {
      return;
    }

    const names = await this.deps.contactDirectory.findNames({ ids: [crmContactId], role });
    if (!names.has(crmContactId)) {
      throw new AppointmentContactNotFoundError();
    }
  }

  /**
   * Satirlara kisi adini ekler — TEK toplu sorgu.
   *
   * Ad bulunamayanlar `null` alir ve satir listeden DUSMEZ: sarkan bir isaretci
   * (silinmis kisi) tolere edilen normal bir durumdur (ADR-0035 §4), ilgili
   * iznin yoklugu da oyle.
   *
   * ⚠️ IZINSIZ CAGIRAN ICIN SORGU HIC ACILMAZ: dizin kapiyi kendi icinde
   * uygular ve bos harita doner, yani her satir `contactName: null` alir.
   * Randevularin KENDISI yine gorunur (`appointment:read` dort rolde de var) —
   * gizlenen sey yalnizca CRM'e ait AD'dir.
   */
  async #withContactNames(
    rows: readonly AppointmentState[],
    role: string,
  ): Promise<AppointmentRow[]> {
    const ids = [
      ...new Set(rows.flatMap((row) => (row.crmContactId === null ? [] : [row.crmContactId]))),
    ];

    const names = await this.deps.contactDirectory.findNames({ ids, role });

    return rows.map((row) => ({
      ...row,
      contactName: row.crmContactId === null ? null : (names.get(row.crmContactId) ?? null),
    }));
  }
}
