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
import { AppointmentNotFoundError } from '../domain/appointments.error';
import { type AppointmentRepository, type ListPage } from './appointment.repository.port';

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
 * ⚠️ BURADA CROSS-MODUL OKUMA YOK — VE BU SLICE 1'IN SINIRIDIR
 * ============================================================================
 * `TransactionUseCases` iki dizin (`CompanyDirectory`, `ProjectDirectory`)
 * tasiyor; bu dosya HICBIR modulu bilmiyor. Randevu'nun cross-modul referansi
 * (`crmContactId`) Slice 2'de acilir ve o gun buraya bir `ContactDirectory` +
 * `#assertContactVisible` girer — `ProjectUseCases`in Slice 4'te aldigi seklin
 * aynisi.
 *
 * Bugun kabul edilmemesinin sebebi hatirlatma degil MIMARIDIR: `crm.public.ts`
 * bir KISI dizini tasimiyor (yalnizca `CompanyDirectory`), yani bir
 * `crmContactId` bugun GORUNURLUK acisindan DOGRULANAMAZ. Dogrulanamayan bir
 * isaretciyi kabul etmek, ilk gunden sarkan satir uretmek olurdu.
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

    await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.save(appointment),
    );

    return appointment.toState();
  }

  /** Sayfali liste — takvim penceresi + durum filtresi (ADR-0035 §9). */
  async list(input: {
    limit: number;
    offset: number;
    from: Date | null;
    to: Date | null;
    status: AppointmentStatus | null;
  }): Promise<ListPage<AppointmentState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.list(input),
    );

    return { items: page.items.map((appointment) => appointment.toState()), total: page.total };
  }

  /**
   * KISMI guncelleme — DURUM GECISI DE BURADAN gecer.
   *
   * Okuma ve yazma AYNI transaction'dadir. ⚠️ Bu bir KILIT DEGILDIR — es
   * zamanli iki `PATCH`'te son yazan kazanir (bilinen sinir, dorduncu modulde
   * de ayni).
   */
  async update(input: { id: string; changes: AppointmentPatch }): Promise<AppointmentState> {
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
}
