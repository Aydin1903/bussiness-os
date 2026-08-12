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
/**
 * Vektoru eksik, NOTU OLAN randevu — `reindex`in is listesi (ADR-0035 §9).
 *
 * ⚠️ IS LISTESI TURETILMISTIR: `WHERE service_note IS NOT NULL AND embedding IS
 * NULL`. Ayri bir "onarilacaklar" tablosu ve deneme sayaci YOKTUR — projede
 * besinci kez ayni karar. Bir is tablosu, ikinci bir dogruluk kaynagi ve
 * senkron kalmasi gereken ikinci bir yazma yolu demekti.
 */
export interface UnindexedAppointment {
  readonly id: string;
  /** Baglam basligina giren AN (§6.1). */
  readonly scheduledAt: Date;
  /** Baslikta ad cozulebilmesi icin gerekir; `null` = kisiye bagli degil. */
  readonly crmContactId: string | null;
  readonly serviceNote: string;
}

export interface AppointmentRepository {
  /**
   * Ekler ya da gunceller (tek deyimlik UPSERT).
   *
   * ⚠️ `embedding` KOLONUNA DOKUNMAZ. Vektor ayri bir metotla yazilir
   * (`setEmbedding`) cunku uretimi bir AG CAGRISI gerektirir ve o cagri
   * transaction'in DISINDA kalmak zorundadir.
   */
  save(appointment: Appointment): Promise<void>;

  /**
   * Vektoru YAZAR ya da TEMIZLER.
   *
   * `null` = notu silinmis bir randevunun vektorunu de sil. Aksi halde silinen
   * bir notun vektoru satirda kalir ve anlamsal arama ARTIK VAR OLMAYAN bir
   * metni bulmaya devam ederdi — sessiz ve fark edilmesi zor.
   *
   * @returns yazilan satir sayisi; `0` = kayit yok (ya da baska tenant'in).
   */
  setEmbedding(input: { id: string; embedding: readonly number[] | null }): Promise<number>;

  /** Vektoru eksik NOTLU randevular — en fazla `limit` tane. */
  findUnindexed(limit: number): Promise<UnindexedAppointment[]>;

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

  /**
   * ANLAMSAL arama (ADR-0035 §6 — `appointment-notes` katkicisi).
   *
   * ⚠️ `embedding IS NOT NULL` SUZULUR: vektoru olmayan satirlar (notsuz
   * randevular ve henuz onarilmamis kayitlar) sonuca GIREMEZ. Suzulmeseydi
   * pgvector `NULL` satirlari mesafe hesabina sokmaz ama `LIMIT` yuvalarini
   * bosa harcayabilirdi.
   *
   * TENANT FILTRESI YOK ve bu BILINCLI: daraltmayi RLS yapar (migration `0026`)
   * ve cagiran zaten tenant transaction'i icindedir.
   */
  findSimilarNotes(input: {
    embedding: readonly number[];
    limit: number;
  }): Promise<SimilarAppointmentNote[]>;

  /**
   * Bir donemin DURUM DAGILIMI — yapisal katkicinin risk sinyali (§6.2).
   *
   * ⚠️ Toplama SQL'de yapilir, satirlar cekilip JS'te sayilmaz: bir yilin
   * randevulari binlerce satir olabilir ve katki HER SORUDA uretilir.
   */
  summarizePeriod(input: { from: Date; to: Date }): Promise<PeriodSummary>;

  /** YAKLASAN randevular — en yakindan baslayarak en fazla `limit` tane. */
  findUpcoming(input: { from: Date; to: Date; limit: number }): Promise<UpcomingAppointment[]>;
}

/**
 * Anlamsal arama sonucu.
 *
 * ⚠️ `content` DEGIL `serviceNote` DONER — ve bu, chunk tablosu tasiyan dort
 * modulden AYRILDIGI yerdir. Onlarda gomulen metin (`content`, baslik DAHIL)
 * tabloda SAKLANIR; burada saklanmaz, cunku saklamak `service_note`u ikinci kez
 * (baslikli haliyle) yazmak demekti.
 *
 * Sonucu: baslik OKUMA ANINDA yeniden kurulur. Bunun bir YAN FAYDASI var —
 * gosterilen tarih DAIMA TAZEDIR, bayat bir kopya degil.
 */
export interface SimilarAppointmentNote {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly serviceNote: string;
}

/** Durum dagilimi; alanlar KESISMEZ (her randevu tek bir durumdadir). */
export interface PeriodSummary {
  readonly total: number;
  readonly completed: number;
  readonly noShow: number;
  readonly cancelled: number;
}

export interface UpcomingAppointment {
  readonly id: string;
  readonly scheduledAt: Date;
  readonly durationMinutes: number;
  /** Baslik icin degil, LISTE icin: "kiminle" sorusu (`null` = bagli degil). */
  readonly crmContactId: string | null;
}
