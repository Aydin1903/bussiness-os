import { type TenantAccessQuery } from '../../tenant/tenant.public';
import { type AuditRecorder } from '../../../shared/audit.port';
import { type Clock } from '../../../shared/clock.port';
import { type IdGenerator } from '../../../shared/id-generator.port';
import { type TransactionManager } from '../../../shared/transaction-manager.port';
import {
  CompensationRecord,
  type CompensationRecordFields,
  type CompensationRecordState,
} from '../domain/compensation-record.entity';
import { toHrCalendarDay } from '../domain/compensation-money';
import {
  Employee,
  type EmployeeFields,
  type EmployeePatch,
  type EmployeeState,
} from '../domain/employee.entity';
import {
  EmployeeNotFoundError,
  EmployeeUserAlreadyLinkedError,
  EmployeeUserNotMemberError,
} from '../domain/hr.error';
import { type EmployeeListFilter, type HrRepository, type ListPage } from './hr.repository.port';

/** ⚠️ Denetim kaydinda bu modulun kaynak adi. `<modul>.<kaynak>` bicimi. */
export const EMPLOYEE_RESOURCE_TYPE = 'hr.employee';

export interface HrDependencies {
  readonly repository: HrRepository;
  /**
   * ⚠️ Tenant modulunun PUBLIC yuzeyi (`tenant.public.ts`).
   *
   * ADR-0033'un `task.use-cases.ts`te yazdigi ayrim burada da gecerlidir: CRM
   * bir IS modulu, Tenant ise PLATFORM ZINCIRININ ILK HALKASI. Yani bu bir
   * cross-modul kenari degildir ve is-modulu DAG'i YEDIDE kalir.
   *
   * ⚠️ `tenant.public.ts` BU ISTE TEK SATIR DEGISMEDI — ADR-0037 §4.1'in
   * kurali ("yeni TALIP -> dosya degismez") UCUNCU kez talip tarafindan
   * dogrulandi.
   */
  readonly tenantAccess: TenantAccessQuery;
  /** ⚠️ ADR-0043 §6 — Slice 1'de acilan platform mekanizmasi. */
  readonly auditRecorder: AuditRecorder;
  readonly transactionManager: TransactionManager;
  readonly idGenerator: IdGenerator;
  readonly clock: Clock;
}

/**
 * IK yasam dongusu (ADR-0043 §1, §2, §6).
 *
 * ============================================================================
 * ⚠️ BU MODULUN `POST /ask`E HICBIR KATKISI YOKTUR (§5)
 * ============================================================================
 * `RetrievalContributor` YOKTUR — ne anlamsal ne yapisal. Burada bir
 * `summarize*` / `findStale*` metodu ARANMASIN. Uc gerekce ayni yere cikar:
 *
 *   1. Anlatisal icerik YOK: serbest not alani bilincli olarak acilmadi
 *      (§1.1), yani embed edilecek metin yok. `fullName` + `jobTitle` bir
 *      KAYITTIR, bir anlati degil.
 *   2. Bir ekip listesi KATALOGDUR, olgu degil (ADR-0040 §3'un olcutu):
 *      "12 aktif calisan" bir SAYIMDIR, haber degil ve her cevapta bir taban
 *      yuvasi ISGAL EDERDI.
 *   3. ⚠️ Ve bu bir GUVENLIK katmanidir (§4.2 katman 3): maasin `/ask` yoluna
 *      sizmasi icin once BIR KATKICI YAZILMASI gerekir — hata SESSIZ OLAMAZ.
 *
 * ⚠️ ADR-0042 bunu ISMEN ongormustu ("9. modul IK bir yapisal katkici eklerse
 * T2 hemen atesler") ve ongoru TERS YONDE gerceklesti: eklenmedi, T2 kapali
 * kaldi.
 *
 * ============================================================================
 * ⚠️ MAAS BU SINIFTA `EmployeeState` ILE HIC BULUSMAZ (§4.2 katman 1)
 * ============================================================================
 * `getEmployee` ve `listEmployees` ucret DONDURMEZ ve donduremez —
 * `EmployeeFields`ta boyle bir alan YOKTUR. Ucret yalnizca `listCompensation`
 * ve `getCurrentCompensation` uzerinden, KENDI izniyle (`compensation:read`,
 * owner + admin) okunur.
 */
export class HrUseCases {
  constructor(private readonly deps: HrDependencies) {}

  // ==========================================================================
  // Calisan
  // ==========================================================================

  async createEmployee(input: {
    tenantId: string;
    userId: string;
    fields: EmployeeFields;
  }): Promise<EmployeeState> {
    // ⚠️ Uyelik kontrolu transaction'in DISINDA ve ONCESINDE — Projeler'in
    // `TaskUseCases.create`iyle ayni gerekce: `resolveMemberAccess` KENDI
    // `runInTenantTransaction`ini acar ve ic ice transaction YASAKTIR
    // (MT §13.3 kural 2).
    await this.#assertLinkedUserIsMember(input.tenantId, input.fields.platformUserId);

    // Entity ONCE kurulur: ad/unvan/tarih dogrulamasi bir veritabani sorgusu
    // ACMADAN once patlar.
    const employee = Employee.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      createdByUserId: input.userId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      await this.#assertUserNotAlreadyLinked(input.fields.platformUserId, null);
      await this.deps.repository.saveEmployee(employee);

      // ⚠️ AYNI TRANSACTION (ADR-0043 §6.4): denetim kaydi yazilamazsa calisan
      // da yazilmaz. Kuyruk reddedildi — kaybolabilen bir denetim kaydi, hic
      // olmayandan KOTUDUR cunku yanlis bir guven uretir.
      await this.deps.auditRecorder.record({
        resourceType: EMPLOYEE_RESOURCE_TYPE,
        resourceId: employee.toState().id,
        action: 'created',
        // ⚠️ `created` alan adi TASIMAZ: bir kaydin olusturulmasi "tek bir
        // alanin" olayi degildir (Slice 1'in veritabani kisiti da zorlar).
        fieldNames: [],
      });
    });

    return employee.toState();
  }

  async listEmployees(filter: EmployeeListFilter): Promise<ListPage<EmployeeState>> {
    const page = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.listEmployees(filter),
    );

    return { items: page.items.map((employee) => employee.toState()), total: page.total };
  }

  async getEmployee(id: string): Promise<EmployeeState> {
    const employee = await this.deps.transactionManager.runInCurrentTenantTransaction(() =>
      this.deps.repository.findEmployeeById(id),
    );

    if (employee === null) {
      throw new EmployeeNotFoundError();
    }

    return employee.toState();
  }

  /**
   * KISMI guncelleme — ⚠️ VE DENETIM IZININ TETIKLENDIGI YER (§6.3).
   *
   * ==========================================================================
   * ⚠️ NEDEN SATIR ICI BIR `updated_by` DAMGASI YETMEZDI
   * ==========================================================================
   * ADR-0041 §8.2'nin cozumu (satir ici aktor damgasi) burada YETMEZ ve o ADR
   * kendi sinirini zaten yazmisti: _"bir olay gunlugu 'ne oldu'yu SIRASIYLA
   * anlatir; damga yalnizca SON DURUMU soyler."_
   *
   * IK'da gereken tam olarak "ne oldu"dur: _"Bu calisanin unvani 3 Mart'ta kim
   * tarafindan degistirildi?"_ Bir `updated_by` kolonu yalnizca EN SON
   * degistireni soyler; onceki uc degisiklik GORUNMEZ ve hata SESSIZDIR —
   * kolon dolu, cevap eksik.
   *
   * ⚠️ HICBIR ALAN DEGISMEDIYSE denetim kaydi YAZILMAZ (`changedFields` bos ->
   * `AuditRecorder` sifir satir yazar). ADR-0039'un fiziksel sayim karariyla
   * ayni sekil: fark sifirsa satir yazilmaz.
   */
  async updateEmployee(input: {
    tenantId: string;
    id: string;
    changes: EmployeePatch;
  }): Promise<EmployeeState> {
    // ⚠️ Uyelik kontrolu yine transaction DISINDA (ic ice transaction yasak).
    if (input.changes.platformUserId !== undefined) {
      await this.#assertLinkedUserIsMember(input.tenantId, input.changes.platformUserId);
    }

    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const before = await this.deps.repository.findEmployeeById(input.id);

      if (before === null) {
        throw new EmployeeNotFoundError();
      }

      if (input.changes.platformUserId !== undefined) {
        await this.#assertUserNotAlreadyLinked(input.changes.platformUserId, input.id);
      }

      const updated = before.update(input.changes, this.deps.clock.now());
      await this.deps.repository.saveEmployee(updated);

      // ⚠️ Karsilastirma NORMALIZE EDILMIS degerler uzerinde: `"  Ayse "`
      // gonderen bir istek adi DEGISTIRMEZ ve sahte bir denetim satiri
      // uretmemelidir.
      await this.deps.auditRecorder.record({
        resourceType: EMPLOYEE_RESOURCE_TYPE,
        resourceId: input.id,
        action: 'updated',
        // ⚠️ YALNIZCA ALAN ADLARI — DEGERLER DEGIL (§6.5). Eski degeri
        // tasimak, kisisel veriyi ikinci bir tabloya kopyalamak olurdu.
        fieldNames: updated.changedFieldsFrom(before),
      });

      return updated.toState();
    });
  }

  /**
   * SERT silme — ⚠️ YALNIZCA HATA DUZELTMESI ICIN (§1.4).
   *
   * Isten ayrilan calisan SILINMEZ, `employment_status = 'ended'` olur: gecmis
   * ekip bilgisi kurumsal hafizadir ve bir kismi YASAL SAKLAMA kapsamindadir.
   *
   * ⚠️ Ucret kaydi olan bir calisan SILINEMEZ — `ON DELETE RESTRICT`
   * veritabani seviyesinde reddeder ve adapter onu
   * `EmployeeHasCompensationError`e (409) cevirir. `CASCADE` olsaydi ucret
   * gecmisi de giderdi ve §6.2'nin denetim cevabi SESSIZCE yok olurdu.
   */
  async deleteEmployee(id: string): Promise<void> {
    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const deleted = await this.deps.repository.deleteEmployeeById(id);

      if (deleted === 0) {
        throw new EmployeeNotFoundError();
      }

      await this.deps.auditRecorder.record({
        resourceType: EMPLOYEE_RESOURCE_TYPE,
        resourceId: id,
        action: 'deleted',
        fieldNames: [],
      });
    });
  }

  // ==========================================================================
  // Ucret defteri — EKLEME-YALNIZ
  // ==========================================================================

  /**
   * Ucret kaydi ekler.
   *
   * ⚠️ BURADA `AuditRecorder` CAGRILMAZ VE BU BIR ATLAMA DEGILDIR (§6.2).
   * _"Maasi kim, ne zaman degistirdi"_ sorusunun cevabi DEFTERIN KENDISIDIR:
   * her degisiklik yeni bir satirdir ve satir `recorded_by_user_id` +
   * `recorded_at` tasir. Bir de denetim kaydi yazmak, ayni olguyu IKI YERDE
   * tutmak olurdu — ve ikisi ayrisirsa hangisinin dogru oldugu bilinemezdi.
   *
   * ⚠️ Bu, ADR-0039'un dersinin dogrudan uygulanmasidir: bir seyi
   * DEGISTIRILEMEZ yapmak, "kim degistirdi"yi CEVAPLAMAKTAN ucuzdur ve daha
   * gucludur.
   */
  async addCompensation(input: {
    tenantId: string;
    userId: string;
    employeeId: string;
    fields: CompensationRecordFields;
  }): Promise<CompensationRecordState> {
    const record = CompensationRecord.create({
      id: this.deps.idGenerator.nextId(),
      tenantId: input.tenantId,
      employeeId: input.employeeId,
      recordedByUserId: input.userId,
      fields: input.fields,
      now: this.deps.clock.now(),
    });

    await this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      // ⚠️ Calisanin VARLIGI once dogrulanir: FK ihlali ham bir 500 olurdu ve
      // "baska tenant'in calisani" ile "olmayan calisan" ayirt edilemezdi.
      const employee = await this.deps.repository.findEmployeeById(input.employeeId);

      if (employee === null) {
        throw new EmployeeNotFoundError();
      }

      await this.deps.repository.appendCompensation(record);
    });

    return record.toState();
  }

  /**
   * Bir calisanin ucret gecmisi + GUNCEL ucreti.
   *
   * ⚠️ Guncel ucret TURETILIR (§1.5): `effective_from <= bugun` olanlar
   * arasinda en yenisi. Gelecek tarihli bir zam listede GORUNUR ama guncel
   * ucret olarak DONMEZ — ikisini karistirmak, bugunku maasi yanlis
   * gostermek olurdu.
   */
  async getCompensation(employeeId: string): Promise<{
    readonly items: readonly CompensationRecordState[];
    readonly current: CompensationRecordState | null;
  }> {
    const today = toHrCalendarDay(this.deps.clock.now());

    return this.deps.transactionManager.runInCurrentTenantTransaction(async () => {
      const employee = await this.deps.repository.findEmployeeById(employeeId);

      if (employee === null) {
        throw new EmployeeNotFoundError();
      }

      const [items, current] = await Promise.all([
        this.deps.repository.listCompensation(employeeId),
        this.deps.repository.findCurrentCompensation({ employeeId, today }),
      ]);

      return {
        items: items.map((record) => record.toState()),
        current: current === null ? null : current.toState(),
      };
    });
  }

  // ==========================================================================
  // Ic yardimcilar
  // ==========================================================================

  /**
   * ⚠️ Baglanan kullanici mevcut tenant'in AKTIF uyesi mi?
   *
   * Projeler'in `#assertAssigneeIsMember`inin birebir karsiligi (ADR-0033) ve
   * ayni yuzeyi tuketir. ⚠️ IZIN KAPISI GEREKMEZ ve bu bir istisna degil,
   * kuralin dogru okunmasidir: ADR-0033'un izin kapisi (`company:read`)
   * ADLARI sizdirmamak icindi. `resolveMemberAccess` HICBIR AD DONDURMEZ —
   * elinizde zaten olan bir uuid icin evet/hayir doner. Sizacak bilgi yoktur.
   */
  async #assertLinkedUserIsMember(tenantId: string, userId: string | null): Promise<void> {
    if (userId === null) {
      return;
    }

    const access = await this.deps.tenantAccess.resolveMemberAccess({ tenantId, userId });

    if (!access.granted) {
      throw new EmployeeUserNotMemberError();
    }
  }

  /** Bir platform kullanicisi EN FAZLA BIR calisan kaydina baglanabilir. */
  async #assertUserNotAlreadyLinked(
    platformUserId: string | null | undefined,
    selfId: string | null,
  ): Promise<void> {
    if (platformUserId === null || platformUserId === undefined) {
      return;
    }

    const existing = await this.deps.repository.findEmployeeIdByPlatformUserId(platformUserId);

    if (existing !== null && existing !== selfId) {
      throw new EmployeeUserAlreadyLinkedError();
    }
  }
}
