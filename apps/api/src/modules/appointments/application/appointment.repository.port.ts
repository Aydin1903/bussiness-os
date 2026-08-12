import {
  type Appointment,
  type AppointmentState,
  type AppointmentStatus,
} from '../domain/appointment.entity';

export const APPOINTMENT_REPOSITORY = Symbol('APPOINTMENT_REPOSITORY');

export interface ListPage<T> {
  readonly items: readonly T[];
  readonly total: number;
}

/**
 * Kullaniciya donen satir — `AppointmentState` + COZULMUS kisi adi.
 *
 * ============================================================================
 * NEDEN AYRI BIR TIP: repository `contactName` URETEMEZ
 * ============================================================================
 * Ad `crm.contacts`tadir; `appointments` semasindan okunamaz (Mutlak Kural 5).
 * Repository kendi semasinin bildigi kadarini dondurur (`Appointment`); adi use
 * case, `ContactDirectory` uzerinden EKLER.
 *
 * Tek tip olsaydi repository imzasi dolduramayacagi bir alan vaat ederdi —
 * `TransactionListRow`/`TransactionEnrichedRow` ayriminin birebir aynisi.
 *
 * ⚠️ `null` UC anlama gelir ve UCU AYIRT EDILMEZ: randevu bir kisiye bagli
 * degil, kisi silinmis (sarkan isaretci), ya da cagiran `contact:read`
 * tasimiyor. Arayuz ucunde de HICBIR SEY yazmaz — "silinmis" bile yazmaz,
 * cunku o kelime silinmis bir kaydin BIR ZAMANLAR VAR OLDUGUNU sizdirirdi.
 */
export interface AppointmentRow extends AppointmentState {
  readonly contactName: string | null;
}

/**
 * `appointments.appointments` kaliciligi.
 *
 * ============================================================================
 * HICBIR METOT `tenantId` ALMAZ — ve bu bilincli
 * ============================================================================
 * Daraltmayi RLS yapar (`ENABLE` + `FORCE`, migration `0026`) ve cagiran zaten
 * tenant transaction'i icindedir. `CategoryRepository` / `ProjectRepository` ile
 * ayni gerekce: elle bir `WHERE tenant_id` eklemek (a) korumanin RLS'te oldugu
 * gercegini bulaniklastirir, (b) filtre bir gun unutulursa RLS'in hala koruyor
 * oldugu FARK EDILMEZ ve yanlis bir guven duygusu olusur.
 *
 * `null` DONUSU BIR HATA DEGILDIR: "bulunamadi" gecerli bir sonuctur
 * (`shared/README.md` — exception yalnizca BEKLENMEYEN durumlar icin).
 * ============================================================================
 */
export interface AppointmentRepository {
  /** Ekler ya da gunceller (tek deyimlik UPSERT). */
  save(appointment: Appointment): Promise<void>;

  findById(id: string): Promise<Appointment | null>;

  /**
   * Sayfali liste — TAKVIM PENCERESI sorgusu.
   *
   * ============================================================================
   * ⚠️ `from`/`to` YARI ACIK BIR ARALIKTIR: `>= from` VE `< to`
   * ============================================================================
   * Onceki uc modulden BILINCLI SAPMA. Orada sinirlar `date` uzerindeydi ve
   * IKISI DE DAHILDI (`<= to`), cunku kullanici "1-31 Mart" dediginde 31
   * Mart'in tamamini kastediyordu.
   *
   * Burada sinir bir ANDIR. Haftalik grid "pazartesi 00:00'dan gelecek
   * pazartesi 00:00'a" diye sorar; `<=` olsaydi gelecek haftanin ILK ANINDAKI
   * bir randevu IKI HAFTADA DA gorunurdu — sessiz bir cift sayim.
   *
   * ⚠️ "Filtre yok" `null` ile ifade edilir, `undefined` ile DEGIL
   * (`exactOptionalPropertyTypes` altinda ikisi ayri tiptir ve Zod'un
   * `.optional()` ciktisi ikincisidir).
   */
  list(input: {
    limit: number;
    offset: number;
    from: Date | null;
    to: Date | null;
    status: AppointmentStatus | null;
  }): Promise<ListPage<Appointment>>;

  /** Silinen satir sayisi; `0` = kayit yok (ya da baska tenant'in). */
  deleteById(id: string): Promise<number>;
}
