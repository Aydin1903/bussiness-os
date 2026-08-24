import { type CompensationRecord } from '../domain/compensation-record.entity';
import { type Employee, type EmploymentStatus } from '../domain/employee.entity';
import { type LeaveRequest, type LeaveStatus } from '../domain/leave-request.entity';

/** DI token'i. */
export const HR_REPOSITORY = Symbol('HR_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Calisan listesi filtresi.
 *
 * ============================================================================
 * ⚠️ BURADA BIR `sort` ALANI YOKTUR VE OLMAYACAKTIR (ADR-0043 §4.2)
 * ============================================================================
 * Ozellikle MAASA GORE siralama/filtreleme KAPALIDIR ve gerekce inceydi:
 * bir deger DONMESE BILE siralamanin kendisi bilgi sizdirir — iki istekle
 * butun ekibin ucret siralamasi cikarilirdi. Hata SESSIZ olurdu: hicbir alan
 * gorunmez, bilgi yine de akar.
 *
 * ⚠️ Siralama SUNUCUDA SABITTIR (ad, alfabetik). Bir gun siralama secenegi
 * eklenirse, izin verilen kolonlarin BEYAZ LISTESI burada yazilmali ve
 * `amount` o listeye GIRMEMELIDIR.
 */
export interface EmployeeListFilter {
  readonly status: EmploymentStatus | null;
  /** IK v2 (ADR-0044 §3) — ekip bazli filtre. */
  readonly department: string | null;
  readonly search: string | null;
  readonly limit: number;
  readonly offset: number;
}

export interface LeaveListFilter {
  readonly status: LeaveStatus | null;
  readonly employeeId: string | null;
  readonly limit: number;
  readonly offset: number;
}

/**
 * IK modulunun kalicilik sozlesmesi (ADR-0043 §1).
 *
 * ⚠️ Metotlar `tenantId` ALMAZ (MT §13.1): daraltmayi RLS yapar. Bir IK
 * tablosunda bu ozellikle onemlidir — yanlis tenant'in ekip listesi, kisisel
 * veri sizintisidir.
 */
export interface HrRepository {
  // ==========================================================================
  // Calisan
  // ==========================================================================
  saveEmployee(employee: Employee): Promise<void>;
  findEmployeeById(id: string): Promise<Employee | null>;
  listEmployees(filter: EmployeeListFilter): Promise<ListPage<Employee>>;

  /**
   * Siler ve silinen satir sayisini doner.
   *
   * ⚠️ Ucret kaydi olan bir calisanda VERITABANI reddeder (`ON DELETE
   * RESTRICT`); adapter o hatayi `EmployeeHasCompensationError`e cevirir —
   * ham bir PostgreSQL hatasi 500 olurdu.
   */
  deleteEmployeeById(id: string): Promise<number>;

  /**
   * ⚠️ Bir platform kullanicisinin BASKA bir calisana bagli olup olmadigi.
   *
   * Kismi unique index bunu veritabaninda da zorlar; bu metot HATA MESAJINI
   * anlamli kilmak icindir (409 + acik cumle, ham kisit adi degil).
   */
  findEmployeeIdByPlatformUserId(platformUserId: string): Promise<string | null>;

  // ==========================================================================
  // Ucret defteri — EKLEME-YALNIZ
  // ==========================================================================
  //
  // ⚠️ `updateCompensation` ve `deleteCompensation` METOTLARI YOKTUR ve
  // eklenmeyecektir (ADR-0043 §1.2). Sozlesmede var olmayan bir yetenek, o
  // yetenegin yokluguna dair EN GORUNUR ifadedir.

  appendCompensation(record: CompensationRecord): Promise<void>;

  /** Bir calisanin TUM ucret gecmisi — en yeni yururluk tarihi once. */
  listCompensation(employeeId: string): Promise<CompensationRecord[]>;

  /**
   * ⚠️ GUNCEL ucret — TURETILIR, kolondan okunmaz (§1.5, projede ONUNCU kez).
   *
   * `today` disaridan gelir (`Clock`), `CURRENT_DATE` DEGIL: sabit bir saat
   * altinda test edilebilmesi icin (DEVELOPMENT_RULES 3.2).
   *
   * ⚠️ Sorgu `effective_from <= today` kisitini TASIMAK ZORUNDADIR: gelecek
   * tarihli bir zam MESRUDUR ve kisit unutulursa BUGUN yururlukteymis gibi
   * okunur — hata SESSIZDIR.
   */
  findCurrentCompensation(input: {
    readonly employeeId: string;
    readonly today: string;
  }): Promise<CompensationRecord | null>;

  // ==========================================================================
  // IK v2 — izin takibi (ADR-0044 §2)
  // ==========================================================================

  saveLeaveRequest(request: LeaveRequest): Promise<void>;
  findLeaveRequestById(id: string): Promise<LeaveRequest | null>;
  listLeaveRequests(filter: LeaveListFilter): Promise<ListPage<LeaveRequest>>;

  /**
   * Bir calisanin TUM izin kayitlari — bakiye hesabinin girdisi.
   *
   * ⚠️ BAKIYE BURADA HESAPLANMAZ: repository VERI dondurur, KURAL uygulamaz
   * (`ConversationRepository.findOwnerUserId` ile ayni disiplin). Hak edisten
   * yalnizca ONAYLANMIS `annual` izinlerin dusecegi kurali domain'dedir
   * (`LeaveRequest.consumesEntitlement`).
   */
  listLeaveRequestsForEmployee(employeeId: string): Promise<LeaveRequest[]>;

  /**
   * ⚠️ BUGUN IZINDE OLANLAR — patronun ve IK'nin gunluk sorusu.
   *
   * `today` disaridan gelir (`Clock`), `CURRENT_DATE` DEGIL: sabit bir saat
   * altinda test edilebilmesi icin (DEVELOPMENT_RULES 3.2).
   */
  countOnLeave(today: string): Promise<number>;

  /** ⚠️ Yaklasan sozlesme bitisleri — patronun alarm kalemi (§3). */
  countContractsEndingBefore(day: string): Promise<number>;
}
