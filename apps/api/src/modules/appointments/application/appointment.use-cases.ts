import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  Appointment,
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
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
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

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(appointment),
    );

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

    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const existing = await this.deps.repository.findById(input.id);
      if (existing === null) {
        throw new AppointmentNotFoundError();
      }

      const updated = existing.update(input.changes, this.deps.clock.now());
      await this.deps.repository.save(updated);
      return updated.toState();
    });
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
